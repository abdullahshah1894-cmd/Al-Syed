// Re-runnable migration: every new product gets a unique scannable barcode.
//   A product saved without a barcode (from Inventory or a supplier purchase) gets the next number
//   from one counter, skipping any number already in use, so two products never share a barcode.
// Usage (from backend/): node scripts/migrateBarcodes.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const SQL = `
CREATE SEQUENCE IF NOT EXISTS public.product_barcode_seq START 100001;

CREATE OR REPLACE FUNCTION public.fill_product_barcode() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_code TEXT;
BEGIN
  NEW.barcode := NULLIF(btrim(COALESCE(NEW.barcode, '')), '');
  IF NEW.barcode IS NULL THEN
    LOOP
      v_code := '888462' || lpad(nextval('public.product_barcode_seq')::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM products WHERE barcode = v_code);
    END LOOP;
    NEW.barcode := v_code;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS products_fill_barcode ON public.products;
CREATE TRIGGER products_fill_barcode BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fill_product_barcode();
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
      console.log("[Migrate] Product barcode counter applied.");
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
