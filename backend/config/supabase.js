const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { createClient } = require("@supabase/supabase-js");
const { Agent, fetch: undiciFetch } = require("undici");
const { SUPABASE_URL, PROJECT_REF } = require("./project");

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WHERE_TO_FIND =
  "Copy the service_role (secret) key from Supabase -> Project Settings -> API Keys into " +
  "SUPABASE_SERVICE_ROLE_KEY in backend/.env (or copy backend/.env from the shop laptop).";

// The tables use row level security, so only the service_role key can read and write them.
// With the anon / publishable key login still works but every list comes back empty, which looks
// like lost data. Refuse to start instead, and say what is wrong.
const checkKey = (key) => {
  if (!key) return "SUPABASE_SERVICE_ROLE_KEY is missing in backend/.env.";
  if (key.startsWith("sb_publishable_")) return "SUPABASE_SERVICE_ROLE_KEY holds the publishable (public) key.";
  if (key.startsWith("sb_secret_")) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  } catch {
    return "SUPABASE_SERVICE_ROLE_KEY is not a Supabase key (check for a missing or extra character).";
  }
  if (claims.role !== "service_role") {
    return `SUPABASE_SERVICE_ROLE_KEY holds the "${claims.role}" key, which cannot read the shop's data.`;
  }
  if (claims.ref && claims.ref !== PROJECT_REF) {
    return `SUPABASE_SERVICE_ROLE_KEY belongs to project "${claims.ref}" but SUPABASE_URL points to "${PROJECT_REF}".`;
  }
  return null;
};
const keyProblem = checkKey(SUPABASE_KEY);
if (keyProblem) throw new Error(`${keyProblem} ${WHERE_TO_FIND}`);

// Keep the secure connection to the database open between saves (default: closed after 4 s idle),
// so a sale after a quiet minute does not pay for a new handshake to the server first
const keepAlive = new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 10 * 60_000, connections: 16 });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { fetch: (url, options) => undiciFetch(url, { ...options, dispatcher: keepAlive }) },
});

module.exports = supabase;
