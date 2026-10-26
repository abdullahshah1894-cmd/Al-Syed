// Re-runnable migration: database-side lookups that save the server from downloading whole tables.
//   find_in_stock_imeis(keys) — which of these IMEIs are already in stock, and in which product
//                               (used when a product is added, instead of reading every product).
// Usage (from backend/): node scripts/migrateSpeed.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const SQL = `
CREATE OR REPLACE FUNCTION public.find_in_stock_imeis(p_keys TEXT[])
RETURNS TABLE (imei TEXT, product_name TEXT)
LANGUAGE sql STABLE AS $fn$
  SELECT DISTINCT k.key, p.name
    FROM products p
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.imeis, '[]'::jsonb)) u
    JOIN unnest(p_keys) AS k(key)
      ON k.key IN (u->>'imei', u->>'imei1', u->>'imei2')
   WHERE NOT p.is_deleted
     AND u->>'status' = 'in_stock';
$fn$;

REVOKE ALL ON FUNCTION public.find_in_stock_imeis(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_in_stock_imeis(TEXT[]) TO service_role;

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
      console.log("[Migrate] Speed lookups applied.");
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
