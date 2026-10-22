const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { createClient } = require("@supabase/supabase-js");

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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;
