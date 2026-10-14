const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const express = require("express");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
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

// API Routes — Supabase-backed
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/sales", require("./routes/saleRoutes"));
app.use("/api/ledger", require("./routes/ledgerRoutes"));
app.use("/api/customers", require("./routes/customerRoutes"));
app.use("/api/warranties", require("./routes/warrantyRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/issues", require("./routes/issueRoutes"));
app.use("/api/upload", require("./routes/uploadRoutes"));
app.use("/api/expenses", require("./routes/expenseRoutes"));

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Mobile Shop ERP — Supabase PostgreSQL Backend",
    database: "Supabase (ejfyzkvueqxadxvateyd)",
    endpoints: ["/api/products", "/api/sales", "/api/ledger", "/api/customers", "/api/warranties", "/api/auth", "/api/issues", "/api/upload"],
    timestamp: new Date().toISOString(),
  });
});

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../dist")));
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(__dirname, "../dist", "index.html"));
    }
  });
} else {
  app.get("/", (req, res) => res.send("Mobile Shop ERP Backend Server — Supabase Edition — Live!"));
}

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Backend] Server live → http://localhost:${PORT}`);
  console.log(`[Backend] Database → Supabase PostgreSQL (ejfyzkvueqxadxvateyd)`);
  console.log(`[Backend] API → http://localhost:${PORT}/api/health`);
});
