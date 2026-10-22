// Re-runnable migration: item returns, bill edit / delete, and suppliers.
// Every money-and-stock change runs inside one database function, all or nothing:
//   return_sale_items  — returned items go back to stock; the bill, its Udhaar and the customer's
//                        balance go down; warranties of returned phones are voided
//   void_sale          — deletes a bill as if it never happened (stock, balance and payment reversed)
//   update_sale        — edits a bill (customer details, seller, notes, due date, prices, discount, paid)
//   record_supplier_purchase — supplier purchase invoice, optionally adding the goods to inventory
// Usage (from backend/): node scripts/migrateReturnsSuppliers.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const SQL = `
ALTER TABLE sales ADD COLUMN IF NOT EXISTS returns JSONB DEFAULT '[]';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS balance_effect NUMERIC(14,2);

-- ── Suppliers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  address TEXT,
  notes TEXT,
  opening_balance NUMERIC(14,2) DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- purchase: goods received (total = amount of the invoice, paid = paid at the time)
-- payment:  money paid to the supplier later (paid)
CREATE TABLE IF NOT EXISTS supplier_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  type TEXT NOT NULL CHECK (type IN ('purchase', 'payment')),
  date DATE DEFAULT ((now() AT TIME ZONE 'Asia/Karachi')::date),
  invoice_number TEXT,
  items JSONB DEFAULT '[]',
  total NUMERIC(14,2) DEFAULT 0,
  paid NUMERIC(14,2) DEFAULT 0,
  notes TEXT,
  stock_added BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE supplier_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS supplier_transactions_supplier_idx ON supplier_transactions (supplier_id);

-- ── Billing Ledger day sheet: one adjustment line when a Ledger bill changes ────
-- Adds a debit (amount > 0) or credit (amount < 0) line dated today, only for bills checked out
-- from the Billing Ledger, so the sheet's totals and running balance follow returns, edits and deletes.
CREATE OR REPLACE FUNCTION public.ledger_adjust(p_sale UUID, p_amount NUMERIC, p_desc TEXT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
BEGIN
  IF COALESCE(p_amount, 0) = 0 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM ledger_entries WHERE sale_id = p_sale AND type = 'invoice') THEN RETURN; END IF;
  INSERT INTO ledger_entries (type, date, description, debit, credit, sale_id)
  VALUES ('payment', (now() AT TIME ZONE 'Asia/Karachi')::date, p_desc,
          GREATEST(0, p_amount), GREATEST(0, -p_amount), p_sale);
END
$fn$;

-- ── Return items from a bill ─────────────────────────────────────────────────
-- p_items: [{ "index": <item position on the bill>, "qty": n, "imeis": ["..."] }]
CREATE OR REPLACE FUNCTION public.return_sale_items(p_sale UUID, p_items JSONB, p_note TEXT DEFAULT NULL, p_by TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $fn$
DECLARE
  uuid_re CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_now TIMESTAMPTZ := now();
  v_today DATE := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_sale sales%ROWTYPE;
  v_items JSONB;
  v_req JSONB;
  v_idx INT;
  v_item JSONB;
  v_qty INT;
  v_sold INT;
  v_already INT;
  v_item_imeis TEXT[];
  v_done_imeis TEXT[];
  v_ret_imeis TEXT[];
  v_key TEXT;
  v_unit NUMERIC;
  v_cost_unit NUMERIC;
  v_line_refund NUMERIC;
  v_refund NUMERIC := 0;
  v_cost NUMERIC := 0;
  v_lines_value NUMERIC := 0;
  v_orig_total NUMERIC;
  v_ratio NUMERIC := 1;
  v_log JSONB := '[]';
  v_pid UUID;
  v_pimeis JSONB;
  v_pos INT;
  v_due_red NUMERIC;
  v_acct_red NUMERIC;
  v_old_ob NUMERIC;
  v_cash_back NUMERIC;
  v_new_total NUMERIC;
  v_new_due NUMERIC;
  v_has_cost BOOLEAN;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_sale.is_deleted, FALSE) THEN RAISE EXCEPTION 'Bill not found.'; END IF;
  IF v_sale.payment_method = 'Udhaar Settlement' THEN RAISE EXCEPTION 'A payment receipt has no items to return.'; END IF;
  -- Old bills saved without item cost keep profit "unknown" instead of turning into a loss
  v_has_cost := EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_sale.items, '[]'::jsonb)) e
                         WHERE COALESCE(e->>'unitPurchasePrice', '') <> '');
  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Choose at least one item to return.'; END IF;

  v_items := COALESCE(v_sale.items, '[]'::jsonb);

  PERFORM 1 FROM products
   WHERE id IN (
     SELECT COALESCE(e->>'productId', e->>'product')::uuid
       FROM jsonb_array_elements(v_items) e
      WHERE COALESCE(e->>'productId', e->>'product', '') ~* uuid_re)
   ORDER BY id FOR UPDATE;

  -- Bill-level discount / tax are shared over the lines: refund = line price x (original bill total / lines value)
  SELECT COALESCE(sum(COALESCE(NULLIF(e->>'subtotal', '')::numeric,
                               COALESCE(NULLIF(e->>'unitSalePrice', '')::numeric, NULLIF(e->>'price', '')::numeric, 0)
                               * COALESCE(NULLIF(e->>'quantity', '')::numeric, NULLIF(e->>'qty', '')::numeric, 1))), 0)
    INTO v_lines_value FROM jsonb_array_elements(v_items) e;
  SELECT COALESCE(v_sale.grand_total, 0) + COALESCE(sum(NULLIF(r->>'amount', '')::numeric), 0)
    INTO v_orig_total FROM jsonb_array_elements(COALESCE(v_sale.returns, '[]'::jsonb)) r;
  IF v_lines_value > 0 THEN v_ratio := v_orig_total / v_lines_value; END IF;

  FOR v_req IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx := (v_req->>'index')::int;
    v_item := v_items->v_idx;
    IF v_item IS NULL THEN RAISE EXCEPTION 'Item % is not on this bill.', v_idx + 1; END IF;

    v_sold := GREATEST(1, COALESCE(NULLIF(v_item->>'quantity', '')::numeric, NULLIF(v_item->>'qty', '')::numeric, 1))::int;
    v_already := COALESCE(NULLIF(v_item->>'returnedQty', '')::int, 0);
    v_item_imeis := ARRAY(SELECT jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(v_item->'imeisArray') = 'array' AND jsonb_array_length(v_item->'imeisArray') > 0 THEN v_item->'imeisArray'
           WHEN COALESCE(v_item->>'imei', '') <> '' THEN jsonb_build_array(v_item->>'imei')
           ELSE '[]'::jsonb END));
    v_done_imeis := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'returnedImeis', '[]'::jsonb)));
    v_ret_imeis := '{}';

    IF cardinality(v_item_imeis) > 0 THEN
      -- Phone line: return named IMEIs, or the next ones not returned yet
      v_ret_imeis := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_req->'imeis', '[]'::jsonb)));
      IF cardinality(v_ret_imeis) = 0 THEN
        v_ret_imeis := ARRAY(SELECT k FROM unnest(v_item_imeis) k WHERE NOT k = ANY(v_done_imeis)
                             LIMIT GREATEST(1, COALESCE(NULLIF(v_req->>'qty', '')::int, 1)));
      END IF;
      IF cardinality(v_ret_imeis) <> (SELECT count(DISTINCT k) FROM unnest(v_ret_imeis) k) THEN
        RAISE EXCEPTION 'The same IMEI was chosen twice.';
      END IF;
      FOREACH v_key IN ARRAY v_ret_imeis LOOP
        IF NOT v_key = ANY(v_item_imeis) THEN RAISE EXCEPTION 'IMEI % is not on this bill line.', v_key; END IF;
        IF v_key = ANY(v_done_imeis) THEN RAISE EXCEPTION 'IMEI % was already returned.', v_key; END IF;
      END LOOP;
      v_qty := cardinality(v_ret_imeis);
    ELSE
      v_qty := COALESCE(NULLIF(v_req->>'qty', '')::int, 0);
    END IF;

    IF v_qty <= 0 THEN RAISE EXCEPTION 'Return quantity must be at least 1.'; END IF;
    IF v_already + v_qty > v_sold THEN
      RAISE EXCEPTION 'Only % of "%" can still be returned.', v_sold - v_already, COALESCE(v_item->>'productName', v_item->>'name', 'item');
    END IF;

    v_unit := COALESCE(NULLIF(v_item->>'unitSalePrice', '')::numeric, NULLIF(v_item->>'price', '')::numeric,
                       NULLIF(v_item->>'subtotal', '')::numeric / v_sold, 0);
    v_cost_unit := COALESCE(NULLIF(v_item->>'unitPurchasePrice', '')::numeric, 0);
    v_line_refund := round(v_unit * v_qty * v_ratio, 2);
    v_refund := v_refund + v_line_refund;
    v_cost := v_cost + v_cost_unit * v_qty;

    -- Back to stock
    v_pid := CASE WHEN COALESCE(v_item->>'productId', v_item->>'product', '') ~* uuid_re
                  THEN COALESCE(v_item->>'productId', v_item->>'product')::uuid END;
    IF v_pid IS NOT NULL THEN
      SELECT imeis INTO v_pimeis FROM products WHERE id = v_pid FOR UPDATE;
      IF FOUND THEN
        v_pimeis := COALESCE(v_pimeis, '[]'::jsonb);
        IF cardinality(v_ret_imeis) > 0 THEN
          FOREACH v_key IN ARRAY v_ret_imeis LOOP
            SELECT n - 1 INTO v_pos FROM jsonb_array_elements(v_pimeis) WITH ORDINALITY AS t(e, n)
             WHERE e->>'status' <> 'in_stock' AND v_key IN (e->>'imei', e->>'imei1', e->>'imei2')
             ORDER BY (e->>'soldInSale' = p_sale::text) DESC, n LIMIT 1;
            IF v_pos IS NULL THEN
              v_pimeis := v_pimeis || jsonb_build_array(jsonb_build_object('imei', v_key, 'status', 'in_stock', 'returnedAt', v_now));
            ELSE
              v_pimeis := jsonb_set(v_pimeis, ARRAY[v_pos::text],
                ((v_pimeis->v_pos) - 'soldAt' - 'soldInSale') || jsonb_build_object('status', 'in_stock', 'returnedAt', v_now));
            END IF;
            UPDATE warranties SET status = 'Void' WHERE sale_id = p_sale AND imei = v_key;
          END LOOP;
          UPDATE products
             SET imeis = v_pimeis,
                 quantity = (SELECT count(*) FROM jsonb_array_elements(v_pimeis) e WHERE e->>'status' = 'in_stock'),
                 updated_at = v_now
           WHERE id = v_pid;
        ELSE
          UPDATE products SET quantity = COALESCE(quantity, 0) + v_qty, updated_at = v_now WHERE id = v_pid;
        END IF;
      END IF;
    END IF;

    v_items := jsonb_set(v_items, ARRAY[v_idx::text],
      v_item || jsonb_build_object('returnedQty', v_already + v_qty,
                                   'returnedImeis', to_jsonb(v_done_imeis || v_ret_imeis)));
    v_log := v_log || jsonb_build_array(jsonb_build_object(
      'index', v_idx, 'productName', COALESCE(v_item->>'productName', v_item->>'name'),
      'qty', v_qty, 'imeis', to_jsonb(v_ret_imeis), 'amount', v_line_refund));
  END LOOP;

  -- Money: the refund lowers this bill's Udhaar first, but only as far as the customer still owes it
  -- (a later payment receipt may already have cleared it); the rest is cash given back.
  v_refund := LEAST(v_refund, COALESCE(v_sale.grand_total, 0));
  v_due_red := LEAST(COALESCE(v_sale.due_amount, 0), v_refund);
  IF v_sale.customer_id IS NOT NULL THEN
    SELECT COALESCE(outstanding_balance, 0) INTO v_old_ob FROM customers WHERE id = v_sale.customer_id FOR UPDATE;
    v_acct_red := LEAST(v_due_red, v_old_ob);
    UPDATE customers
       SET outstanding_balance = v_old_ob - v_acct_red,
           total_purchases = GREATEST(0, COALESCE(total_purchases, 0) - v_refund),
           updated_at = v_now
     WHERE id = v_sale.customer_id;
  ELSE
    v_acct_red := v_due_red;
  END IF;
  v_cash_back := v_refund - v_acct_red;
  v_new_total := COALESCE(v_sale.grand_total, 0) - v_refund;
  v_new_due := COALESCE(v_sale.due_amount, 0) - v_due_red;

  -- One adjustment line on the Billing Ledger day sheet when the bill came from the Ledger
  PERFORM public.ledger_adjust(p_sale, -v_refund, 'Return ' || v_sale.bill_number);

  UPDATE sales
     SET items = v_items,
         grand_total = v_new_total,
         due_amount = v_new_due,
         paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_cash_back),
         balance_effect = CASE WHEN v_sale.customer_id IS NOT NULL AND balance_effect IS NOT NULL
                               THEN balance_effect - v_due_red ELSE balance_effect END,
         net_profit = CASE WHEN v_has_cost THEN COALESCE(net_profit, 0) - (v_refund - v_cost) ELSE net_profit END,
         payment_status = CASE WHEN v_new_total = 0 THEN 'returned'
                               WHEN v_new_due = 0 THEN 'paid'
                               WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_cash_back) > 0 THEN 'partial'
                               ELSE 'unpaid' END,
         returns = COALESCE(returns, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'id', gen_random_uuid(), 'date', v_today, 'at', v_now, 'items', v_log, 'amount', v_refund,
           'dueReduced', v_acct_red, 'cashBack', v_cash_back, 'note', p_note, 'by', p_by)),
         updated_at = v_now
   WHERE id = p_sale
   RETURNING * INTO v_sale;

  RETURN to_jsonb(v_sale);
END
$fn$;

-- ── Delete a bill (full reversal) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_sale(p_sale UUID, p_by TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $fn$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_sale sales%ROWTYPE;
  v_excess NUMERIC;
  v_all JSONB;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_sale.is_deleted, FALSE) THEN RAISE EXCEPTION 'Bill not found.'; END IF;

  IF v_sale.payment_method = 'Udhaar Settlement' THEN
    -- Deleting a payment receipt puts back exactly what it took off the Udhaar
    IF v_sale.customer_id IS NOT NULL THEN
      UPDATE customers
         SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0)
               - COALESCE(v_sale.balance_effect, -COALESCE(v_sale.paid_amount, 0))),
             updated_at = v_now
       WHERE id = v_sale.customer_id;
    END IF;
  ELSE
    IF v_sale.balance_effect IS NULL THEN
      -- Older bill (no recorded effect): money paid above the bill went against old Udhaar; restore it
      v_excess := GREATEST(0, COALESCE(v_sale.paid_amount, 0) - COALESCE(v_sale.grand_total, 0));
      IF v_excess > 0 THEN
        IF v_sale.customer_id IS NOT NULL THEN
          UPDATE customers SET outstanding_balance = COALESCE(outstanding_balance, 0) + v_excess, updated_at = v_now
           WHERE id = v_sale.customer_id;
        END IF;
        UPDATE sales SET paid_amount = paid_amount - v_excess WHERE id = p_sale;
      END IF;
    END IF;

    -- Return everything not returned yet (stock back, Udhaar off, warranties void)
    SELECT COALESCE(jsonb_agg(jsonb_build_object('index', n - 1,
             'qty', GREATEST(1, COALESCE(NULLIF(e->>'quantity', '')::numeric, NULLIF(e->>'qty', '')::numeric, 1))::int
                    - COALESCE(NULLIF(e->>'returnedQty', '')::int, 0))), '[]'::jsonb)
      INTO v_all
      FROM jsonb_array_elements(COALESCE(v_sale.items, '[]'::jsonb)) WITH ORDINALITY AS t(e, n)
     WHERE GREATEST(1, COALESCE(NULLIF(e->>'quantity', '')::numeric, NULLIF(e->>'qty', '')::numeric, 1))::int
           > COALESCE(NULLIF(e->>'returnedQty', '')::int, 0);
    IF jsonb_array_length(v_all) > 0 THEN
      PERFORM public.return_sale_items(p_sale, v_all, 'Bill deleted', p_by);
    END IF;

    SELECT * INTO v_sale FROM sales WHERE id = p_sale;
    IF v_sale.customer_id IS NOT NULL THEN
      IF v_sale.balance_effect IS NOT NULL THEN
        -- Undo whatever this bill still adds to (or took off) the Udhaar
        UPDATE customers
           SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0) - v_sale.balance_effect), updated_at = v_now
         WHERE id = v_sale.customer_id;
      ELSIF COALESCE(v_sale.due_amount, 0) > 0 THEN
        UPDATE customers
           SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0) - v_sale.due_amount), updated_at = v_now
         WHERE id = v_sale.customer_id;
      END IF;
    END IF;
    -- Anything left on the Ledger day sheet for this bill (e.g. a rounding remainder) is credited back
    IF COALESCE(v_sale.grand_total, 0) > 0 THEN
      PERFORM public.ledger_adjust(p_sale, -v_sale.grand_total, 'Deleted ' || v_sale.bill_number);
    END IF;
  END IF;

  UPDATE sales SET is_deleted = TRUE, updated_at = v_now,
         notes = trim(COALESCE(notes, '') || ' [Deleted' || COALESCE(' by ' || p_by, '') || ' ' || to_char(v_now AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') || ']')
   WHERE id = p_sale RETURNING * INTO v_sale;
  RETURN to_jsonb(v_sale);
END
$fn$;

-- ── Edit a bill ──────────────────────────────────────────────────────────────
-- p: { customer_name, customer_phone, seller_name, notes, due_date, discount_amount, paid_amount,
--      rates: [{ "index": n, "unitSalePrice": price }] }
CREATE OR REPLACE FUNCTION public.update_sale(p_sale UUID, p JSONB)
RETURNS JSONB LANGUAGE plpgsql AS $fn$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_sale sales%ROWTYPE;
  v_items JSONB;
  v_rate JSONB;
  v_idx INT;
  v_item JSONB;
  v_qty NUMERIC;
  v_subtotal NUMERIC;
  v_tax NUMERIC;
  v_discount NUMERIC;
  v_total NUMERIC;
  v_paid NUMERIC;
  v_due NUMERIC;
  v_cost NUMERIC;
  v_old_effect NUMERIC;
  v_new_effect NUMERIC;
  v_old_ob NUMERIC;
  v_new_ob NUMERIC;
  v_money_change BOOLEAN;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_sale.is_deleted, FALSE) THEN RAISE EXCEPTION 'Bill not found.'; END IF;

  v_money_change := (p ? 'rates' AND jsonb_array_length(COALESCE(p->'rates', '[]'::jsonb)) > 0)
                    OR p ? 'discount_amount' OR p ? 'paid_amount';
  IF COALESCE(p->>'discount_amount', '0') !~ '^[0-9]+(.[0-9]+)?$' OR COALESCE(p->>'paid_amount', '0') !~ '^[0-9]+(.[0-9]+)?$' THEN
    RAISE EXCEPTION 'Discount and paid amount must be numbers of 0 or more.';
  END IF;
  IF v_money_change AND jsonb_array_length(COALESCE(v_sale.returns, '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'This bill has returned items, so its amounts cannot be edited. You can still edit the customer, seller and notes.';
  END IF;

  -- Details only
  UPDATE sales SET
    customer_name = CASE WHEN p ? 'customer_name' THEN COALESCE(NULLIF(p->>'customer_name', ''), 'Walk-in Customer') ELSE customer_name END,
    customer_phone = CASE WHEN p ? 'customer_phone' THEN NULLIF(p->>'customer_phone', '') ELSE customer_phone END,
    seller_name = CASE WHEN p ? 'seller_name' THEN NULLIF(p->>'seller_name', '') ELSE seller_name END,
    notes = CASE WHEN p ? 'notes' THEN NULLIF(p->>'notes', '') ELSE notes END,
    due_date = CASE WHEN p ? 'due_date' THEN NULLIF(p->>'due_date', '')::date ELSE due_date END,
    updated_at = v_now
  WHERE id = p_sale RETURNING * INTO v_sale;

  IF NOT v_money_change THEN RETURN to_jsonb(v_sale); END IF;

  IF v_sale.payment_method = 'Udhaar Settlement' THEN
    -- A payment receipt: only its amount can change
    v_paid := GREATEST(0, COALESCE(NULLIF(p->>'paid_amount', '')::numeric, v_sale.paid_amount));
    IF v_paid <= 0 THEN RAISE EXCEPTION 'A payment receipt must be more than 0. Delete it instead.'; END IF;
    IF v_sale.customer_id IS NOT NULL THEN
      SELECT COALESCE(outstanding_balance, 0) INTO v_old_ob FROM customers WHERE id = v_sale.customer_id FOR UPDATE;
      IF v_sale.balance_effect IS NOT NULL THEN
        -- Balance as if this receipt never happened, then apply the new amount
        v_new_ob := GREATEST(0, (v_old_ob - v_sale.balance_effect) - v_paid);
        UPDATE sales SET balance_effect = v_new_ob - (v_old_ob - v_sale.balance_effect) WHERE id = p_sale;
      ELSE
        v_new_ob := GREATEST(0, v_old_ob - (v_paid - COALESCE(v_sale.paid_amount, 0)));
      END IF;
      UPDATE customers SET outstanding_balance = v_new_ob, updated_at = v_now WHERE id = v_sale.customer_id;
    END IF;
    UPDATE sales SET paid_amount = v_paid, updated_at = v_now WHERE id = p_sale RETURNING * INTO v_sale;
    RETURN to_jsonb(v_sale);
  END IF;

  v_items := COALESCE(v_sale.items, '[]'::jsonb);
  FOR v_rate IN SELECT * FROM jsonb_array_elements(COALESCE(p->'rates', '[]'::jsonb)) LOOP
    v_idx := (v_rate->>'index')::int;
    v_item := v_items->v_idx;
    IF v_item IS NULL THEN RAISE EXCEPTION 'Item % is not on this bill.', v_idx + 1; END IF;
    v_qty := GREATEST(1, COALESCE(NULLIF(v_item->>'quantity', '')::numeric, NULLIF(v_item->>'qty', '')::numeric, 1));
    IF COALESCE(v_rate->>'unitSalePrice', '') !~ '^[0-9]+(.[0-9]+)?$' THEN
      RAISE EXCEPTION 'Invalid price for item %.', v_idx + 1;
    END IF;
    v_items := jsonb_set(v_items, ARRAY[v_idx::text], v_item || jsonb_build_object(
      'unitSalePrice', GREATEST(0, (v_rate->>'unitSalePrice')::numeric),
      'price', GREATEST(0, (v_rate->>'unitSalePrice')::numeric),
      'subtotal', GREATEST(0, (v_rate->>'unitSalePrice')::numeric) * v_qty));
  END LOOP;

  SELECT COALESCE(sum(COALESCE(NULLIF(e->>'subtotal', '')::numeric,
                               COALESCE(NULLIF(e->>'unitSalePrice', '')::numeric, 0)
                               * COALESCE(NULLIF(e->>'quantity', '')::numeric, NULLIF(e->>'qty', '')::numeric, 1))), 0),
         COALESCE(sum(COALESCE(NULLIF(e->>'unitPurchasePrice', '')::numeric, 0)
                      * COALESCE(NULLIF(e->>'quantity', '')::numeric, NULLIF(e->>'qty', '')::numeric, 1)), 0)
    INTO v_subtotal, v_cost FROM jsonb_array_elements(v_items) e;
  IF jsonb_array_length(v_items) = 0 THEN v_subtotal := COALESCE(v_sale.subtotal_amount, 0); END IF;

  v_tax := round(v_subtotal * COALESCE(v_sale.tax_percent, 0) / 100);
  v_discount := LEAST(GREATEST(0, COALESCE(NULLIF(p->>'discount_amount', '')::numeric, v_sale.discount_amount, 0)), v_subtotal + v_tax);
  v_total := v_subtotal + v_tax - v_discount;
  v_paid := GREATEST(0, COALESCE(NULLIF(p->>'paid_amount', '')::numeric, v_sale.paid_amount, 0));
  v_due := GREATEST(0, v_total - v_paid);

  -- Same balance rule as create_sale: due adds Udhaar, paying above the bill removes old Udhaar
  v_old_effect := COALESCE(v_sale.due_amount, 0) - GREATEST(0, COALESCE(v_sale.paid_amount, 0) - COALESCE(v_sale.grand_total, 0));
  v_new_effect := v_due - GREATEST(0, v_paid - v_total);

  IF v_due > 0 AND v_sale.customer_id IS NULL THEN
    RAISE EXCEPTION 'This bill has no customer, so it cannot be left with Rs % to pay.', v_due;
  END IF;
  IF v_sale.customer_id IS NOT NULL THEN
    SELECT COALESCE(outstanding_balance, 0) INTO v_old_ob FROM customers WHERE id = v_sale.customer_id FOR UPDATE;
    IF v_sale.balance_effect IS NOT NULL THEN
      -- Balance without this bill, plus the bill's new effect
      v_old_effect := v_sale.balance_effect;
      v_new_ob := GREATEST(0, (v_old_ob - v_sale.balance_effect) + v_new_effect);
      v_new_effect := v_new_ob - (v_old_ob - v_sale.balance_effect);
    ELSE
      v_new_ob := GREATEST(0, v_old_ob + (v_new_effect - v_old_effect));
    END IF;
    UPDATE customers
       SET outstanding_balance = v_new_ob,
           total_purchases = GREATEST(0, COALESCE(total_purchases, 0) + (v_total - COALESCE(v_sale.grand_total, 0))),
           updated_at = v_now
     WHERE id = v_sale.customer_id;
  END IF;

  IF v_total <> COALESCE(v_sale.grand_total, 0) THEN
    PERFORM public.ledger_adjust(p_sale, v_total - COALESCE(v_sale.grand_total, 0), 'Edited ' || v_sale.bill_number);
  END IF;

  UPDATE sales SET
    items = v_items, subtotal_amount = v_subtotal, tax_amount = v_tax, discount_amount = v_discount,
    grand_total = v_total, paid_amount = v_paid, due_amount = v_due,
    balance_effect = CASE WHEN v_sale.customer_id IS NOT NULL AND balance_effect IS NOT NULL
                          THEN v_new_effect ELSE balance_effect END,
    -- Profit only when the items carry their cost; otherwise it stays "unknown"
    net_profit = CASE WHEN v_cost > 0 THEN v_total - v_cost ELSE net_profit END,
    payment_status = CASE WHEN v_due = 0 THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END,
    updated_at = v_now
  WHERE id = p_sale RETURNING * INTO v_sale;

  RETURN to_jsonb(v_sale);
END
$fn$;

-- ── Supplier purchase invoice ────────────────────────────────────────────────
-- p: { supplier_id, date, invoice_number, notes, paid, total (used when there are no items), add_to_stock,
--      items: [{ productId?, name, brand, model, category, quantity, imeis: [{imei1, imei2, ptaStatus}],
--                costPrice, salePrice, warrantyDuration, warrantyType }] }
CREATE OR REPLACE FUNCTION public.record_supplier_purchase(p JSONB)
RETURNS JSONB LANGUAGE plpgsql AS $fn$
DECLARE
  uuid_re CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_sup suppliers%ROWTYPE;
  v_tx supplier_transactions%ROWTYPE;
  v_items JSONB := COALESCE(p->'items', '[]'::jsonb);
  v_out JSONB := '[]';
  v_item JSONB;
  v_units JSONB;
  v_qty INT;
  v_pid UUID;
  v_total NUMERIC := 0;
  v_date DATE := COALESCE(NULLIF(p->>'date', '')::date, (now() AT TIME ZONE 'Asia/Karachi')::date);
  v_add BOOLEAN := COALESCE((p->>'add_to_stock')::boolean, TRUE);
BEGIN
  SELECT * INTO v_sup FROM suppliers WHERE id = (p->>'supplier_id')::uuid AND NOT is_deleted;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found.'; END IF;

  SELECT COALESCE(sum(COALESCE(NULLIF(e->>'costPrice', '')::numeric, 0)
           * GREATEST(COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(e->'imeis') = 'array' THEN e->'imeis' END), 0),
                      COALESCE(NULLIF(e->>'quantity', '')::int, 0))), 0)
    INTO v_total FROM jsonb_array_elements(v_items) e;
  IF jsonb_array_length(v_items) = 0 THEN v_total := GREATEST(0, COALESCE(NULLIF(p->>'total', '')::numeric, 0)); END IF;

  INSERT INTO supplier_transactions (supplier_id, type, date, invoice_number, items, total, paid, notes, stock_added)
  VALUES (v_sup.id, 'purchase', v_date, NULLIF(p->>'invoice_number', ''), '[]', v_total,
          GREATEST(0, COALESCE(NULLIF(p->>'paid', '')::numeric, 0)), NULLIF(p->>'notes', ''), v_add AND jsonb_array_length(v_items) > 0)
  RETURNING * INTO v_tx;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_pid := CASE WHEN COALESCE(v_item->>'productId', '') ~* uuid_re THEN (v_item->>'productId')::uuid END;
    -- Each unit remembers where it came from (shown in the IMEI checker)
    SELECT COALESCE(jsonb_agg(u || jsonb_build_object('supplierId', v_sup.id, 'supplierName', v_sup.name,
                                                       'purchaseId', v_tx.id, 'purchaseDate', v_date)), '[]'::jsonb)
      INTO v_units
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_item->'imeis') = 'array' THEN v_item->'imeis' ELSE '[]'::jsonb END) u
     WHERE COALESCE(u->>'imei', u->>'imei1', '') <> '';
    v_qty := CASE WHEN jsonb_array_length(v_units) > 0 THEN 0 ELSE GREATEST(0, COALESCE(NULLIF(v_item->>'quantity', '')::int, 0)) END;

    IF v_add THEN
      IF v_pid IS NULL THEN
        INSERT INTO products (name, brand, model, category, purchase_price, sale_price, quantity, min_stock_alert,
                              warranty_duration, warranty_type, supplier_name, supplier_phone, imeis)
        VALUES (COALESCE(NULLIF(v_item->>'name', ''), 'Unnamed product'),
                COALESCE(NULLIF(v_item->>'brand', ''), 'Other'),
                NULLIF(v_item->>'model', ''),
                COALESCE(NULLIF(v_item->>'category', ''), 'Accessories'),
                COALESCE(NULLIF(v_item->>'costPrice', '')::numeric, 0),
                COALESCE(NULLIF(v_item->>'salePrice', '')::numeric, 0),
                0, 2,
                COALESCE(NULLIF(v_item->>'warrantyDuration', '')::int, 12),
                COALESCE(NULLIF(v_item->>'warrantyType', ''), 'Official Brand Warranty'),
                v_sup.name, v_sup.phone, '[]')
        RETURNING id INTO v_pid;
      ELSE
        UPDATE products
           SET purchase_price = COALESCE(NULLIF(v_item->>'costPrice', '')::numeric, purchase_price),
               sale_price = COALESCE(NULLIF(v_item->>'salePrice', '')::numeric, sale_price),
               supplier_name = v_sup.name, supplier_phone = v_sup.phone, updated_at = now()
         WHERE id = v_pid AND NOT is_deleted;
        IF NOT FOUND THEN RAISE EXCEPTION 'Product for "%" no longer exists.', COALESCE(v_item->>'name', 'item'); END IF;
      END IF;
      IF jsonb_array_length(v_units) > 0 OR v_qty > 0 THEN
        PERFORM public.add_stock(v_pid, v_units, v_qty);
      END IF;
    END IF;

    v_out := v_out || jsonb_build_array(v_item || jsonb_build_object('productId', v_pid));
  END LOOP;

  UPDATE supplier_transactions SET items = v_out WHERE id = v_tx.id RETURNING * INTO v_tx;
  RETURN to_jsonb(v_tx);
END
$fn$;

REVOKE ALL ON FUNCTION public.ledger_adjust(UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.return_sale_items(UUID, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.void_sale(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_sale(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_supplier_purchase(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_sale_items(UUID, JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_sale(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_sale(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_supplier_purchase(JSONB) TO service_role;

-- expenses was created with row level security off, so the public anon key could read and change it
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

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
      console.log("[Migrate] Returns / bill edit / suppliers applied.");
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
