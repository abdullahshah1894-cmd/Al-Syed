const supabase = require("../config/supabase");
const lists = require("../lib/lists");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUUID = (val) => (val && UUID_REGEX.test(String(val)) ? val : null);
const num = (val) => (val === "" || val === null || val === undefined || isNaN(Number(val)) ? 0 : Number(val));

// Map a frontend ledger row (camelCase) onto ledger_entries columns
const toRow = (body) => ({
  type: body.type || "item",
  date: body.date || new Date().toISOString().slice(0, 10),
  description: body.description || null,
  qty: num(body.qty),
  rate: num(body.rate),
  discount: num(body.discount),
  amount: num(body.amount),
  debit: num(body.debit),
  credit: num(body.credit),
  balance: num(body.balance),
  parent_invoice_id: toUUID(body.parentInvoiceId || body.parent_invoice_id),
  product_id: toUUID(body.productId || body.product_id),
  sale_id: toUUID(body.saleId || body.sale_id),
  imeis: Array.isArray(body.imeis) ? body.imeis : [],
  extra: body.extra && typeof body.extra === "object" ? body.extra : {},
});

// Get ledger entries, optionally limited to a date range (?from=YYYY-MM-DD&to=YYYY-MM-DD)
exports.getLedgerEntries = async (req, res) => {
  try {
    res.json(await lists.ledger(req.query.from, req.query.to));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add a ledger entry. The client may send its own UUID so the row keeps the same id it has on screen.
exports.addLedgerEntry = async (req, res) => {
  try {
    const payload = toRow(req.body);
    const id = toUUID(req.body.id);
    if (id) payload.id = id;

    const { data, error } = await supabase
      .from("ledger_entries")
      .upsert([payload], { onConflict: "id" })
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Update a ledger entry
exports.updateLedgerEntry = async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) return res.status(400).json({ error: "Invalid ledger entry id" });

    const { data, error } = await supabase
      .from("ledger_entries")
      .update(toRow(req.body))
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Set the opening balance for a date (one 'opening' row per date)
exports.setOpeningBalance = async (req, res) => {
  try {
    const { date, amount } = req.body;
    if (!date) return res.status(400).json({ error: "date is required" });

    // One row per day, written in a single statement (public.set_opening_balance)
    const { data, error } = await supabase.rpc("set_opening_balance", { p_date: date, p_amount: num(amount) });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete a ledger entry (and its children for invoice type)
exports.deleteLedgerEntry = async (req, res) => {
  try {
    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
      return res.json({ message: "Skipped delete: non-UUID id", id });
    }

    // The entry and the items under it, in one statement (id is a checked UUID)
    const { error } = await supabase.from("ledger_entries").delete().or(`id.eq.${id},parent_invoice_id.eq.${id}`);
    if (error) throw new Error(error.message);

    res.json({ message: "Ledger entry deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
