const jwt = require("jsonwebtoken");

// Signing secret: JWT_SECRET in backend/.env, else the (already secret) Supabase service key
const SECRET = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SECRET) {
  throw new Error("Set JWT_SECRET (or SUPABASE_SERVICE_ROLE_KEY) in backend/.env");
}

const signToken = (user) =>
  jwt.sign({ id: user.id, name: user.name, username: user.username, role: user.role }, SECRET, { expiresIn: "12h" });

// Every /api route except login and health needs "Authorization: Bearer <token>"
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please log in." });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Only the admin (owner) can do this." });
  next();
};

module.exports = { signToken, requireAuth, requireAdmin };
