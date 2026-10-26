// Which Supabase project this server uses (from backend/.env)
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ejfyzkvueqxadxvateyd.supabase.co";
const PROJECT_REF = (SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i) || [])[1] || SUPABASE_URL;

module.exports = { SUPABASE_URL, PROJECT_REF };
