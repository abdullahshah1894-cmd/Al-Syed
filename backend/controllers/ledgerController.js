const supabase = require("../config/supabase");

// Get all ledger entries
exports.getLedgerEntries = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add a ledger entry
exports.addLedgerEntry = async (req, res) => {
  try {
    const body = req.body;

    // Validate UUID fields — Supabase expects UUID or null
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const toUUID = (val) => (val && UUID_REGEX.test(String(val)) ? val : null);

    const payload = {
      type: body.type || "item",
      date: body.date || new Date().toISOString().slice(0, 10),
      description: body.description || null,
      qty: body.qty || 0,
      rate: body.rate || 0,
      discount: body.discount || 0,
      amount: body.amount || 0,
      debit: body.debit || 0,
      credit: body.credit || 0,
      balance: body.balance || 0,
      parent_invoice_id: toUUID(body.parentInvoiceId || body.parent_invoice_id),
      product_id: toUUID(body.productId || body.product_id),
      sale_id: toUUID(body.saleId || body.sale_id),
    };

    const { data, error } = await supabase
      .from("ledger_entries")
      .insert([payload])
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete a ledger entry (and its children for invoice type)
exports.deleteLedgerEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return res.json({ message: "Skipped delete: non-UUID id", id });
    }

    // Delete children (items under this invoice)
    await supabase.from("ledger_entries").delete().eq("parent_invoice_id", id);

    // Delete the entry itself
    const { error } = await supabase.from("ledger_entries").delete().eq("id", id);
    if (error) throw new Error(error.message);

    res.json({ message: "Ledger entry deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
