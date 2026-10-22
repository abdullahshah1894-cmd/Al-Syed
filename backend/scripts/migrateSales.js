// Re-runnable migration: sales and restocking as single database transactions.
//   create_sale(p)  — stock check, IMEIs marked sold, sale row, warranties and customer balance,
//                     all or nothing, with the product rows locked so two tills cannot sell the same unit.
//   add_stock(...)  — appends IMEIs / quantity to the current stock, rejecting IMEIs already in stock.
// Usage (from backend/): node scripts/migrateSales.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const SQL = `
ALTER TABLE sales ADD COLUMN IF NOT EXISTS due_date DATE;
-- How much this bill / receipt actually changed the customer's Udhaar (after the 0 floor);
-- returns, edits and deletes use it to reverse exactly that amount. NULL on older bills.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS balance_effect NUMERIC(14,2);

CREATE OR REPLACE FUNCTION public.create_sale(p JSONB) RETURNS JSONB
LANGUAGE plpgsql AS $fn$
DECLARE
  uuid_re CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_now TIMESTAMPTZ := now();
  v_today DATE := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_sale_id UUID := gen_random_uuid();
  v_base_bill TEXT := COALESCE(NULLIF(p->>'bill_number', ''), 'INV-' || to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYYMMDD-HH24MISS'));
  v_bill TEXT;
  v_try INT := 0;
  v_items JSONB := '[]';
  v_warranties JSONB := '[]';
  v_item JSONB;
  v_pid_text TEXT;
  v_pid UUID;
  v_qty INT;
  v_req TEXT[];
  v_picked TEXT[];
  v_key TEXT;
  v_idx INT;
  v_prod RECORD;
  v_imeis JSONB;
  v_cust UUID;
  v_total NUMERIC := COALESCE(NULLIF(p->>'grand_total', '')::numeric, 0);
  v_paid NUMERIC := COALESCE(NULLIF(p->>'paid_amount', '')::numeric, 0);
  v_due NUMERIC := COALESCE(NULLIF(p->>'due_amount', '')::numeric, 0);
  v_sale sales%ROWTYPE;
  v_w JSONB;
  v_old_ob NUMERIC;
  v_new_ob NUMERIC;
BEGIN
  v_bill := v_base_bill;
  IF COALESCE(p->>'customer_id', '') ~* uuid_re THEN v_cust := (p->>'customer_id')::uuid; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p->'items', '[]'::jsonb)) LOOP
    v_pid_text := COALESCE(v_item->>'productId', v_item->>'product', v_item->>'id', '');
    v_pid := CASE WHEN v_pid_text ~* uuid_re THEN v_pid_text::uuid END;
    v_qty := GREATEST(1, COALESCE(NULLIF(v_item->>'quantity', '')::numeric, NULLIF(v_item->>'qty', '')::numeric, 1))::int;
    v_req := ARRAY(SELECT jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(v_item->'imeisArray') = 'array' THEN v_item->'imeisArray' ELSE '[]'::jsonb END));
    IF cardinality(v_req) = 0 AND COALESCE(v_item->>'imei', '') <> '' THEN v_req := ARRAY[v_item->>'imei']; END IF;
    v_picked := '{}';

    IF v_pid IS NOT NULL THEN
      SELECT id, name, brand, model, quantity, imeis, warranty_type, warranty_duration
        INTO v_prod FROM products WHERE id = v_pid AND NOT is_deleted FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot complete invoice! "%" is no longer in inventory (deleted). Remove it from the bill.',
          COALESCE(NULLIF(v_item->>'productName', ''), NULLIF(v_item->>'name', ''), v_pid_text);
      END IF;

      IF FOUND THEN
        v_imeis := COALESCE(v_prod.imeis, '[]'::jsonb);

        IF jsonb_array_length(v_imeis) > 0 THEN
          -- IMEI-tracked product: use the IMEIs on the bill, or take the first in-stock ones
          IF cardinality(v_req) > 0 THEN
            IF cardinality(v_req) <> v_qty THEN
              RAISE EXCEPTION 'Cannot complete invoice! % has quantity % but % IMEI(s). Scan each phone.',
                v_prod.name, v_qty, cardinality(v_req);
            END IF;
            v_picked := v_req;
          ELSE
            v_picked := ARRAY(
              SELECT COALESCE(NULLIF(e->>'imei', ''), NULLIF(e->>'imei1', ''), e->>'imei2')
              FROM jsonb_array_elements(v_imeis) WITH ORDINALITY AS t(e, n)
              WHERE e->>'status' = 'in_stock' ORDER BY n LIMIT v_qty);
            IF cardinality(v_picked) < v_qty THEN
              RAISE EXCEPTION 'Cannot complete invoice! Stock limit exceeded for %. Available: %, Requested: %',
                v_prod.name, cardinality(v_picked), v_qty;
            END IF;
          END IF;

          FOREACH v_key IN ARRAY v_picked LOOP
            SELECT n - 1 INTO v_idx
              FROM jsonb_array_elements(v_imeis) WITH ORDINALITY AS t(e, n)
              WHERE e->>'status' = 'in_stock' AND v_key IN (e->>'imei', e->>'imei1', e->>'imei2')
              ORDER BY n LIMIT 1;
            IF v_idx IS NULL THEN
              RAISE EXCEPTION 'Cannot complete invoice! IMEI % is not available in stock for %.', v_key, v_prod.name;
            END IF;
            v_imeis := jsonb_set(v_imeis, ARRAY[v_idx::text],
              (v_imeis->v_idx) || jsonb_build_object('status', 'sold', 'soldAt', v_now, 'soldInSale', v_sale_id));

            IF COALESCE(v_item->>'warrantyType', v_prod.warranty_type, '') <> 'No Warranty' THEN
              v_warranties := v_warranties || jsonb_build_array(jsonb_build_object(
                'imei', v_key,
                'product_id', v_pid,
                'product_name', COALESCE(NULLIF(v_item->>'productName', ''), NULLIF(v_item->>'name', ''), v_prod.name),
                'brand', v_prod.brand,
                'model', v_prod.model,
                'warranty_type', COALESCE(NULLIF(v_item->>'warrantyType', ''), v_prod.warranty_type, 'Official Brand Warranty'),
                'duration', COALESCE(v_prod.warranty_duration, 12)));
            END IF;
          END LOOP;

          UPDATE products
             SET imeis = v_imeis,
                 quantity = (SELECT count(*) FROM jsonb_array_elements(v_imeis) e WHERE e->>'status' = 'in_stock'),
                 updated_at = v_now
           WHERE id = v_pid;
        ELSE
          -- Bulk item (no IMEIs): plain stock count
          IF COALESCE(v_prod.quantity, 0) < v_qty THEN
            RAISE EXCEPTION 'Cannot complete invoice! Stock limit exceeded for %. Available: %, Requested: %',
              v_prod.name, COALESCE(v_prod.quantity, 0), v_qty;
          END IF;
          UPDATE products SET quantity = quantity - v_qty, updated_at = v_now WHERE id = v_pid;
        END IF;
      END IF;
    END IF;

    -- Store the item with the IMEIs that were actually sold
    v_items := v_items || jsonb_build_array(
      v_item
      || CASE WHEN v_pid IS NOT NULL THEN jsonb_build_object('productId', v_pid, 'product', v_pid) ELSE '{}'::jsonb END
      || CASE WHEN cardinality(v_picked) > 0
              THEN jsonb_build_object('imeisArray', to_jsonb(v_picked), 'imei', v_picked[1]) ELSE '{}'::jsonb END);
  END LOOP;

  -- Insert the sale; a taken bill number gets a suffix instead of failing
  LOOP
    BEGIN
      INSERT INTO sales (id, bill_number, customer_id, customer_name, customer_phone, items,
                         subtotal_amount, discount_amount, tax_percent, tax_amount, grand_total,
                         paid_amount, due_amount, net_profit, payment_method, payment_status,
                         cashier_name, seller_name, notes, due_date)
      VALUES (v_sale_id, v_bill, v_cust,
              COALESCE(NULLIF(p->>'customer_name', ''), 'Walk-in Customer'),
              NULLIF(p->>'customer_phone', ''),
              v_items,
              COALESCE(NULLIF(p->>'subtotal_amount', '')::numeric, 0),
              COALESCE(NULLIF(p->>'discount_amount', '')::numeric, 0),
              COALESCE(NULLIF(p->>'tax_percent', '')::numeric, 0),
              COALESCE(NULLIF(p->>'tax_amount', '')::numeric, 0),
              v_total, v_paid, v_due,
              COALESCE(NULLIF(p->>'net_profit', '')::numeric, 0),
              COALESCE(NULLIF(p->>'payment_method', ''), 'Cash'),
              COALESCE(NULLIF(p->>'payment_status', ''), 'paid'),
              NULLIF(p->>'cashier_name', ''),
              NULLIF(p->>'seller_name', ''),
              NULLIF(p->>'notes', ''),
              NULLIF(p->>'due_date', '')::date)
      RETURNING * INTO v_sale;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1;
      IF v_try >= 5 THEN
        RAISE EXCEPTION 'Could not save bill %: bill number already exists.', v_base_bill;
      END IF;
      v_bill := v_base_bill || '-' || (v_try + 1);
    END;
  END LOOP;

  FOR v_w IN SELECT * FROM jsonb_array_elements(v_warranties) LOOP
    INSERT INTO warranties (imei, product_id, product_name, brand, model, customer_name, customer_phone,
                            purchase_date, warranty_duration, warranty_start_date, warranty_expiry_date,
                            warranty_type, status, sale_id)
    VALUES (v_w->>'imei', (v_w->>'product_id')::uuid, v_w->>'product_name', v_w->>'brand', v_w->>'model',
            v_sale.customer_name, v_sale.customer_phone,
            v_today, (v_w->>'duration')::int, v_today,
            (v_today + make_interval(months => (v_w->>'duration')::int))::date,
            v_w->>'warranty_type', 'Active', v_sale_id);
  END LOOP;

  -- Customer balance in one statement (no read-then-write race)
  IF v_cust IS NOT NULL THEN
    SELECT COALESCE(outstanding_balance, 0) INTO v_old_ob FROM customers WHERE id = v_cust FOR UPDATE;
    IF v_sale.payment_method = 'Udhaar Settlement' THEN
      v_new_ob := GREATEST(0, v_old_ob - v_paid);
      UPDATE customers SET outstanding_balance = v_new_ob, updated_at = v_now WHERE id = v_cust;
    ELSE
      -- Anything paid above this bill goes against the old Udhaar
      v_new_ob := GREATEST(0, v_old_ob + v_due - GREATEST(0, v_paid - v_total));
      UPDATE customers
         SET total_purchases = COALESCE(total_purchases, 0) + v_total,
             outstanding_balance = v_new_ob,
             updated_at = v_now
       WHERE id = v_cust;
    END IF;
    UPDATE sales SET balance_effect = v_new_ob - v_old_ob WHERE id = v_sale_id RETURNING * INTO v_sale;
  END IF;

  RETURN to_jsonb(v_sale);
END
$fn$;

CREATE OR REPLACE FUNCTION public.add_stock(p_product UUID, p_imeis JSONB, p_qty INT) RETURNS JSONB
LANGUAGE plpgsql AS $fn$
DECLARE
  v_prod products%ROWTYPE;
  v_dupes TEXT;
  v_new JSONB;
BEGIN
  SELECT * INTO v_prod FROM products WHERE id = p_product AND NOT is_deleted FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  IF jsonb_array_length(COALESCE(p_imeis, '[]'::jsonb)) > 0 THEN
    -- Reject IMEIs repeated in this request or already in stock in any product
    WITH keys AS (
      SELECT DISTINCT n, k
        FROM jsonb_array_elements(p_imeis) WITH ORDINALITY AS t(e, n),
             unnest(ARRAY[e->>'imei', e->>'imei1', e->>'imei2']) AS k
       WHERE COALESCE(k, '') <> ''
    )
    SELECT string_agg(DISTINCT k, ', ') INTO v_dupes
      FROM keys
     WHERE k IN (SELECT k FROM keys GROUP BY k HAVING count(*) > 1)
        OR EXISTS (SELECT 1 FROM products pr, jsonb_array_elements(COALESCE(pr.imeis, '[]'::jsonb)) ex
                    WHERE NOT pr.is_deleted AND ex->>'status' = 'in_stock'
                      AND keys.k IN (ex->>'imei', ex->>'imei1', ex->>'imei2'));
    IF v_dupes IS NOT NULL THEN
      RAISE EXCEPTION 'These IMEIs are already in stock or repeated: %', v_dupes;
    END IF;

    v_new := COALESCE(v_prod.imeis, '[]'::jsonb) || (
      SELECT jsonb_agg(e || jsonb_build_object('status', 'in_stock')
                       || CASE WHEN COALESCE(e->>'imei', '') = '' THEN jsonb_build_object('imei', e->>'imei1') ELSE '{}'::jsonb END)
        FROM jsonb_array_elements(p_imeis) e);
    UPDATE products
       SET imeis = v_new,
           quantity = (SELECT count(*) FROM jsonb_array_elements(v_new) e WHERE e->>'status' = 'in_stock'),
           updated_at = now()
     WHERE id = p_product RETURNING * INTO v_prod;
  ELSIF COALESCE(p_qty, 0) > 0 THEN
    IF jsonb_array_length(COALESCE(v_prod.imeis, '[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'This product is tracked by IMEI. Add IMEIs instead of a quantity.';
    END IF;
    UPDATE products SET quantity = COALESCE(quantity, 0) + p_qty, updated_at = now()
     WHERE id = p_product RETURNING * INTO v_prod;
  ELSE
    RAISE EXCEPTION 'Nothing to add: send IMEIs or a quantity above 0.';
  END IF;

  RETURN to_jsonb(v_prod);
END
$fn$;

-- Only the backend (service role) may call these
REVOKE ALL ON FUNCTION public.create_sale(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_stock(UUID, JSONB, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_stock(UUID, JSONB, INT) TO service_role;

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
      console.log("[Migrate] Sales / stock functions applied.");
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
