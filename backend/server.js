const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// A wrong or missing key in backend/.env: say so plainly in the server window instead of a stack trace
try {
  require("./config/supabase");
} catch (err) {
  console.error(`
[Backend] CANNOT START: ${err.message}
`);
  process.exit(1);
}
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const { connectCache, closeCache, invalidateOnWrite } = require("./lib/cache");
const lists = require("./lib/lists");
const { checkDatabase } = require("./lib/dbStatus");
const { PROJECT_REF } = require("./config/project");

const app = express();

// Middleware
app.use(compression()); // the product and sales lists shrink to about a tenth on the wire
app.use(cors({ exposedHeaders: ["X-New-Token"] }));
app.use(express.json({ limit: "20mb" }));

app.use((req, res, next) => {
  const oldSend = res.send;
  res.send = function (data) {
    if (res.statusCode >= 400) {
      console.error(`[API ERROR] ${req.method} ${req.url} -> Status: ${res.statusCode}, Body: ${data}`);
    }
    return oldSend.apply(res, arguments);
  };
  next();
});

// Health Check (public): is the server up, and can it read the shop's data?
// Open http://localhost:5000/api/health when the app shows no data.
app.get("/api/health", async (req, res) => {
  const database = await checkDatabase();
  res.status(database.ok ? 200 : 503).json({
    status: database.ok ? "OK" : "DATABASE PROBLEM",
    service: "Mobile Shop ERP — Supabase PostgreSQL Backend",
    database,
    timestamp: new Date().toISOString(),
  });
});

// Login is public; every other API route needs a logged-in user
const { requireAuth, requireAdmin } = require("./middleware/auth");
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api", requireAuth);

// Owner-only changes (admin): every edit, delete and return, the product catalogue, suppliers and
// settings. Cashiers can sell, take Udhaar payments, add customers / expenses / repair tickets,
// log warranty claims and use the Billing Ledger.
const ADMIN_ONLY = [
  ["post", "/api/products"],
  ["put", "/api/products/:id"],
  ["delete", "/api/products/:id"],
  ["post", "/api/products/:id/stock"],
  ["get", "/api/sales/analytics"],
  ["put", "/api/sales/:id"],
  ["delete", "/api/sales/:id"],
  ["post", "/api/sales/:id/returns"],
  ["put", "/api/customers/:id"],
  ["delete", "/api/customers/:id"],
  ["put", "/api/expenses/:id"],
  ["delete", "/api/expenses/:id"],
  ["delete", "/api/issues/:id"],
  ["put", "/api/warranties/:imei/claims/:claimId"],
  ["post", "/api/ledger/opening"],
  ["put", "/api/settings"],
];
ADMIN_ONLY.forEach(([method, route]) => app[method](route, requireAdmin));

// Lists are served from the cache; every allowed write marks the lists it changes as stale
app.use("/api", invalidateOnWrite);

// API Routes — Supabase-backed
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/sales", require("./routes/saleRoutes"));
app.use("/api/ledger", require("./routes/ledgerRoutes"));
app.use("/api/customers", require("./routes/customerRoutes"));
app.use("/api/warranties", require("./routes/warrantyRoutes"));
app.use("/api/issues", require("./routes/issueRoutes"));
app.use("/api/expenses", require("./routes/expenseRoutes"));
app.use("/api/suppliers", requireAdmin, require("./routes/supplierRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes"));

// Unknown API path: answer instead of hanging
app.use("/api", (req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` }));

// Serve the built app in production (npm run build). File names under /assets change with every
// build, so the browser may keep them for a year; index.html is always checked for a new version.
if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "../dist");
  app.use("/assets", express.static(path.join(dist, "assets"), { immutable: true, maxAge: "1y" }));
  app.use(express.static(dist, { index: false }));
  app.get("*", (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(dist, "index.html"));
  });
} else {
  app.get("/", (req, res) => res.send("Mobile Shop ERP Backend Server — Supabase Edition — Live!"));
}

// Start Server: connect the cache, start listening, then load the main lists in the background
const PORT = process.env.PORT || 5000;
connectCache().then(() => {
  app.listen(PORT, () => {
    console.log(`[Backend] Server live → http://localhost:${PORT}`);
    console.log(`[Backend] Database → Supabase project ${PROJECT_REF}`);
    console.log(`[Backend] API → http://localhost:${PORT}/api/health`);
    checkDatabase().then((db) => {
      if (!db.ok) console.error(`[Backend] CANNOT READ THE SHOP'S DATA: ${db.error}`);
      else if (db.products === 0) {
        console.warn(`[Backend] Connected, but project ${db.project} has no products. If this shop already has stock, SUPABASE_URL in backend/.env points to the wrong project.`);
      } else console.log(`[Backend] Database OK → ${db.products} products`);
    });
    lists.warmUp();
  });
});

const shutdown = () => closeCache().finally(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
