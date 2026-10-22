const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");

// Signing secret: JWT_SECRET in backend/.env, else the (already secret) Supabase service key
const SECRET = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SECRET) {
  throw new Error("Set JWT_SECRET (or SUPABASE_SERVICE_ROLE_KEY) in backend/.env");
}

const TOKEN_HOURS = 12;
const RENEW_WHEN_LEFT_MS = 4 * 60 * 60 * 1000; // renew while working, so nobody is thrown out mid-sale

// tv = the user's token_version; bumping it (password change) ends every older login
const signToken = (user) =>
  jwt.sign(
    { id: user.id, name: user.name, username: user.username, role: user.role, tv: user.token_version || 0 },
    SECRET,
    { expiresIn: `${TOKEN_HOURS}h` }
  );

// The user's current role / token version, cached briefly so every request is not a DB call
const CACHE_MS = 30 * 1000;
const userCache = new Map();
const loadUser = async (id) => {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.user;
  const { data, error } = await supabase
    .from("users")
    .select("id, name, username, role, is_deleted, token_version")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  userCache.set(id, { user: data, at: Date.now() });
  return data;
};
const forgetUser = (id) => userCache.delete(id);

// Every /api route except login and health needs "Authorization: Bearer <token>"
const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please log in." });

  let claims;
  try {
    claims = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }

  try {
    // Role and access come from the database, not from the token: a deleted or demoted user,
    // or a login from before a password change, stops working within 30 seconds
    const user = await loadUser(claims.id);
    if (!user || user.is_deleted || (user.token_version || 0) !== (claims.tv || 0)) {
      return res.status(401).json({ error: "Your login is no longer valid. Please log in again." });
    }
    req.user = { id: user.id, name: user.name, username: user.username, role: user.role };

    // Sliding session: hand out a fresh token when this one is close to expiring
    if (claims.exp * 1000 - Date.now() < RENEW_WHEN_LEFT_MS) {
      res.setHeader("X-New-Token", signToken(user));
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Only the admin (owner) can do this." });
  next();
};

module.exports = { signToken, requireAuth, requireAdmin, forgetUser };
