// Read cache for the list endpoints (products, sales, customers, ...).
// Every list read used to go to Supabase (a round trip to Seoul plus up to ~0.5 MB of JSON);
// now the first read is kept and later reads are answered from memory in a few milliseconds.
//
// Store: Redis when REDIS_URL is set (shared by every server that points at it, survives restarts),
// otherwise this process's memory (one shop laptop needs nothing installed).
//
// Freshness: data is grouped (products, sales, ...). Every write to the API bumps the version of the
// groups it touches (see invalidateOnWrite), so the next read loads fresh rows; cached entries carry
// the version in their key and simply stop being used. CACHE_TTL_SECONDS (default 300) is the safety
// net for writes made by another server that does not share this store.
const TTL_SECONDS = Math.max(5, Number(process.env.CACHE_TTL_SECONDS) || 300);
const PREFIX = "alsyed:";
const GROUPS = ["products", "sales", "customers", "warranties", "ledger", "suppliers", "issues", "expenses", "settings"];

// ── Stores (strings in, strings out) ─────────────────────────────────────────
class MemoryStore {
  constructor() {
    this.map = new Map();
    // Drop expired entries now and then (old versions are never read again)
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.map) if (v.exp && v.exp <= now) this.map.delete(k);
    }, 60_000).unref();
  }
  async get(key) {
    const v = this.map.get(key);
    if (!v) return null;
    if (v.exp && v.exp <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return v.val;
  }
  async set(key, val, ttlSeconds) {
    this.map.set(key, { val, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
  }
  async incr(key) {
    const next = Number((await this.get(key)) || 0) + 1;
    this.map.set(key, { val: String(next), exp: 0 });
    return next;
  }
}

class RedisStore {
  constructor(client) {
    this.client = client;
  }
  get(key) {
    return this.client.get(key);
  }
  set(key, val, ttlSeconds) {
    return this.client.set(key, val, { EX: ttlSeconds });
  }
  incr(key) {
    return this.client.incr(key);
  }
}

let store = new MemoryStore();
let storeName = "memory";
let redisClient = null;

const genKey = (group) => `${PREFIX}gen:${group}`;

// A broken cache must never break the shop: any store error means "read from the database"
let lastWarn = 0;
const warn = (msg) => {
  if (Date.now() - lastWarn > 60_000) console.warn(`[Cache] ${msg}`);
  lastWarn = Date.now();
};
const safely = async (fn, fallback) => {
  try {
    return await fn();
  } catch (err) {
    warn(`${storeName} unavailable, reading from the database (${err.message})`);
    return fallback;
  }
};

// Bump the version of these groups so their cached lists are not used again
const invalidate = (groups) => Promise.all(groups.map((g) => safely(() => store.incr(genKey(g)))));

// Return the cached value of loader() for this group/key, loading it once when missing.
// Two requests for the same missing list share one database read.
const inFlight = new Map();
const cached = async (group, key, loader) => {
  const gen = await safely(() => store.get(genKey(group)), undefined);
  if (gen === undefined) return loader(); // store down: no caching at all
  const fullKey = `${PREFIX}${group}:${gen || 0}:${key}`;
  const hit = await safely(() => store.get(fullKey), null);
  if (hit !== null) return JSON.parse(hit);

  if (inFlight.has(fullKey)) return inFlight.get(fullKey);
  const load = (async () => {
    const value = await loader();
    await safely(() => store.set(fullKey, JSON.stringify(value), TTL_SECONDS));
    return value;
  })().finally(() => inFlight.delete(fullKey));
  inFlight.set(fullKey, load);
  return load;
};

// After a write, the changed lists are loaded again in the background (lib/lists.js registers how),
// so the next screen, reload or other device finds them ready. Writes close together (scanning a bill)
// are gathered into one reload.
const warmers = new Map();
const registerWarmer = (group, warm) => warmers.set(group, warm);
let pendingWarm = new Set();
let warmTimer = null;
const warmSoon = (groups) => {
  groups.forEach((g) => warmers.has(g) && pendingWarm.add(g));
  if (warmTimer || pendingWarm.size === 0) return;
  warmTimer = setTimeout(() => {
    const due = [...pendingWarm];
    pendingWarm = new Set();
    warmTimer = null;
    due.forEach((g) => Promise.resolve(warmers.get(g)()).catch((err) => warn(`reload of ${g} failed: ${err.message}`)));
  }, 300);
};

// Which cached groups a write under this API path can change. Unknown paths clear everything.
const WRITE_GROUPS = {
  products: ["products"],
  sales: ["sales", "products", "customers", "warranties", "ledger"],
  customers: ["customers", "sales"],
  warranties: ["warranties"],
  ledger: ["ledger"],
  suppliers: ["suppliers", "products"],
  issues: ["issues"],
  expenses: ["expenses"],
  settings: ["settings"],
  auth: [],
};
const groupsForPath = (path) => {
  const area = String(path).replace(/^\/api\//, "").split("/")[0];
  return WRITE_GROUPS[area] || GROUPS;
};

// Express middleware for /api: every write bumps its groups before it runs (so nothing read during the
// write is kept as current) and again when it finishes (so the next read sees the saved rows).
const invalidateOnWrite = async (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const groups = groupsForPath(req.originalUrl.split("?")[0]);
  if (groups.length === 0) return next();
  await invalidate(groups);
  res.on("finish", () => invalidate(groups).then(() => warmSoon(groups)));
  next();
};

// Use Redis when REDIS_URL is set; stay on memory if it cannot be reached.
const connectCache = async () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("[Cache] Memory cache (set REDIS_URL to use Redis)");
    return storeName;
  }
  try {
    const { createClient } = require("redis");
    redisClient = createClient({
      url,
      // While Redis is down, commands fail at once (and the database is read) instead of waiting
      disableOfflineQueue: true,
      socket: { connectTimeout: 3000, reconnectStrategy: (tries) => Math.min(tries * 500, 5000) },
    });
    redisClient.on("error", (err) => warn(`Redis: ${err.message}`));
    // After a reconnect the versions may have missed writes: start every group fresh
    let readyOnce = false;
    redisClient.on("ready", () => {
      if (readyOnce) invalidate(GROUPS);
      readyOnce = true;
    });
    // Never hold up the server start: give Redis 5 seconds, then carry on with memory
    let timer;
    await Promise.race([
      redisClient.connect(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("no answer within 5 seconds")), 5000);
      }),
    ]).finally(() => clearTimeout(timer));
    store = new RedisStore(redisClient);
    storeName = "redis";
    await invalidate(GROUPS); // this server may have missed writes while it was down
    console.log("[Cache] Redis cache connected");
  } catch (err) {
    console.warn(`[Cache] Redis not reachable (${err.message}); using the memory cache instead`);
    if (redisClient) redisClient.destroy?.();
    redisClient = null;
  }
  return storeName;
};

// Close the Redis connection at once (a polite QUIT can wait forever when Redis is already gone)
const closeCache = async () => {
  if (redisClient) redisClient.destroy();
  redisClient = null;
};

module.exports = { cached, invalidate, invalidateOnWrite, registerWarmer, connectCache, closeCache, groupsForPath, GROUPS };
