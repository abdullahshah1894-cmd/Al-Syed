// Re-runnable migration: login revocation and a safe opening balance.
//   users.token_version     — bumped when a password changes, so old logins stop working
//   set_opening_balance()   — one opening-balance row per day, written in one statement
// Usage (from backend/): node scripts/migrateHardening.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const SQL = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Keep only the newest opening row per day before adding the unique index
DELETE FROM ledger_entries a
 USING ledger_entries b
 WHERE a.type = 'opening' AND b.type = 'opening' AND a.date = b.date AND a.created_at < b.created_at;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_one_opening_per_day ON ledger_entries (date) WHERE type = 'opening';

CREATE OR REPLACE FUNCTION public.set_opening_balance(p_date DATE, p_amount NUMERIC)
RETURNS JSONB LANGUAGE plpgsql AS $fn$
DECLARE
  v_row ledger_entries%ROWTYPE;
BEGIN
  IF p_date IS NULL THEN RAISE EXCEPTION 'Choose the date.'; END IF;
  IF p_amount IS NULL OR p_amount < 0 OR p_amount = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Opening balance must be 0 or more.';
  END IF;
  INSERT INTO ledger_entries (type, date, description, debit)
  VALUES ('opening', p_date, 'Opening Balance', p_amount)
  ON CONFLICT (date) WHERE type = 'opening' DO UPDATE SET debit = EXCLUDED.debit
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END
$fn$;

REVOKE ALL ON FUNCTION public.set_opening_balance(DATE, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_opening_balance(DATE, NUMERIC) TO service_role;

-- Bills list is read newest first and filtered by is_deleted
CREATE INDEX IF NOT EXISTS sales_created_at_idx ON sales (created_at DESC);

NOTIFY pgrst, 'reload schema';
`;

module.exports = { SQL };

if (require.main === module) {
  const DB_URL = process.env.DATABASE_URL;
  if (!DB_URL) {
    console.error("Missing DATABASE_URL in environment");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(SQL);
      await client.query("COMMIT");
      console.log("[Migrate] Hardening applied.");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[Migrate Error]", err.message);
      process.exitCode = 1;
    } finally {
      client.release();
      await pool.end();
    }
  })();
}
