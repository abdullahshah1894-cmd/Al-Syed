const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { createClient } = require("@supabase/supabase-js");
const { Agent, fetch: undiciFetch } = require("undici");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ejfyzkvueqxadxvateyd.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The tables use row level security, so only the service_role key can read and write them.
// With the anon key every page would load empty, which looks like lost data — refuse to start instead.
if (!SUPABASE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is missing in backend/.env. Copy the service_role (secret) key from " +
      "Supabase -> Project Settings -> API Keys. The anon key cannot read the shop's data."
  );
}

// Keep the secure connection to the database open between saves (default: closed after 4 s idle),
// so a sale after a quiet minute does not pay for a new handshake to the server first
const keepAlive = new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 10 * 60_000, connections: 16 });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { fetch: (url, options) => undiciFetch(url, { ...options, dispatcher: keepAlive }) },
});

module.exports = supabase;
