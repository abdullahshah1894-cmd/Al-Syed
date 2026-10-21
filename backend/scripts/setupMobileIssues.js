const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("Missing DATABASE_URL in environment");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
});

const SQL = `
CREATE TABLE IF NOT EXISTS mobile_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  imei TEXT NOT NULL,
  phone_issue TEXT NOT NULL,
  company_name TEXT NOT NULL,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Under Inspection', 'Repaired', 'Delivered', 'Rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function setupSchema() {
  console.log("[Setup] Connecting to Supabase PostgreSQL...");
  const client = await pool.connect();
  try {
    console.log("[Setup] Creating mobile_issues table...");
    await client.query(SQL);
    console.log("[Setup] ✅ mobile_issues table created successfully!");
  } catch (err) {
    console.error("[Setup Error]", err.message);
  } finally {
    client.release();
    await pool.end();
    console.log("[Setup] Done. Database ready.");
  }
}

setupSchema();
