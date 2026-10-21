// Additive, re-runnable migration: everything the app shows must survive a refresh.
// Usage (from backend/): node scripts/migratePersistence.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("Missing DATABASE_URL in environment");
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

const SQL = `
-- Ledger rows keep their IMEIs and the free-form Dis / Deal / LP cells
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS imeis JSONB DEFAULT '[]';
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}';
CREATE INDEX IF NOT EXISTS ledger_entries_date_idx ON ledger_entries (date);

-- saleController updates customers.updated_at; without the column the balance update fails
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Shop settings (single row, id = 1)
CREATE TABLE IF NOT EXISTS shop_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO shop_settings (id, data) VALUES (1, '{
  "shopName": "Al-Syed Mobiles & Electronics",
  "address": "Kohat Jinah plaza",
  "phone": "03155300018",
  "taxRate": 0,
  "currencySymbol": "Rs."
}') ON CONFLICT (id) DO NOTHING;
`;

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(SQL);
    await client.query("COMMIT");
    console.log("[Migrate] Persistence migration applied.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Migrate Error]", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
