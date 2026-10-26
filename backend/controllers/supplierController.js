const supabase = require("../config/supabase");
const lists = require("../lib/lists");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPPLIER_FIELDS = ["name", "phone", "company", "address", "notes", "opening_balance"];
// Accept openingBalance (camelCase) as well as opening_balance
const pickFields = (body) => {
  const payload = {};
  SUPPLIER_FIELDS.forEach((k) => { if (body[k] !== undefined) payload[k] = body[k]; });
  if (payload.opening_balance === undefined && body.openingBalance !== undefined) payload.opening_balance = body.openingBalance;
  return payload;
};

// What the shop owes a supplier: opening balance + purchases - everything paid
const withBalances = (suppliers, txs) =>
  suppliers.map((s) => {
    const mine = txs.filter((t) => t.supplier_id === s.id);
    const purchased = mine.filter((t) => t.type === "purchase").reduce((a, t) => a + Number(t.total || 0), 0);
    const paid = mine.reduce((a, t) => a + Number(t.paid || 0), 0);
    return {
      ...s,
      total_purchased: purchased,
      total_paid: paid,
      balance: Number(s.opening_balance || 0) + purchased - paid,
      last_activity: mine.reduce((d, t) => (t.date > d ? t.date : d), ""),
    };
  });

// GET /api/suppliers — suppliers with totals; GET /api/suppliers?withTransactions=1 adds their transactions
exports.getSuppliers = async (req, res) => {
  try {
    const { suppliers, transactions: txs } = await lists.suppliers();
    // Only transactions of suppliers that still exist
    const ids = new Set((suppliers || []).map((x) => x.id));
    const liveTxs = (txs || []).filter((t) => ids.has(t.supplier_id));
    const list = withBalances(suppliers || [], liveTxs);
    res.json(req.query.withTransactions ? { suppliers: list, transactions: liveTxs } : list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSupplier = async (req, res) => {
  try {
    if (!String(req.body.name || "").trim()) return res.status(400).json({ error: "Supplier name is required." });
    const payload = pickFields(req.body);
    payload.name = String(payload.name).trim();
    payload.opening_balance = Number(payload.opening_balance) || 0;
    const { data, error } = await supabase.from("suppliers").insert([payload]).select().single();
    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    if (!UUID_REGEX.test(req.params.id)) return res.status(400).json({ error: "Invalid supplier id" });
    const payload = { updated_at: new Date().toISOString(), ...pickFields(req.body) };
    if (payload.opening_balance !== undefined) payload.opening_balance = Number(payload.opening_balance) || 0;
    if (payload.name !== undefined && !String(payload.name).trim()) return res.status(400).json({ error: "Supplier name is required." });
    const { data, error } = await supabase.from("suppliers").update(payload).eq("id", req.params.id).select().single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Soft delete: the supplier and their history stay in the database
exports.deleteSupplier = async (req, res) => {
  try {
    if (!UUID_REGEX.test(req.params.id)) return res.status(400).json({ error: "Invalid supplier id" });
    const { error } = await supabase
      .from("suppliers")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) throw new Error(error.message);
    res.json({ message: "Supplier deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/suppliers/:id/purchases — purchase invoice; with items + addToStock the goods go into inventory
exports.addPurchase = async (req, res) => {
  try {
    if (!UUID_REGEX.test(req.params.id)) return res.status(400).json({ error: "Invalid supplier id" });
    const b = req.body;
    const { data, error } = await supabase.rpc("record_supplier_purchase", {
      p: {
        supplier_id: req.params.id,
        date: b.date || null,
        invoice_number: b.invoiceNumber || null,
        notes: b.notes || null,
        paid: Number(b.paid) || 0,
        total: Number(b.total) || 0,
        add_to_stock: b.addToStock !== false,
        items: Array.isArray(b.items) ? b.items : [],
      },
    });
    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/suppliers/:id/payments — money paid to the supplier
exports.addPayment = async (req, res) => {
  try {
    if (!UUID_REGEX.test(req.params.id)) return res.status(400).json({ error: "Invalid supplier id" });
    const amount = Number(req.body.amount);
    if (!(amount > 0)) return res.status(400).json({ error: "Enter an amount above 0." });
    const { data, error } = await supabase
      .from("supplier_transactions")
      .insert([{
        supplier_id: req.params.id,
        type: "payment",
        date: req.body.date || new Date().toLocaleDateString("en-CA"),
        paid: amount,
        notes: req.body.notes || null,
        invoice_number: req.body.reference || null,
      }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PUT /api/suppliers/transactions/:txId — edit date, invoice no, notes, paid; total only when no items were stocked
exports.updateTransaction = async (req, res) => {
  try {
    const { txId } = req.params;
    if (!UUID_REGEX.test(txId)) return res.status(400).json({ error: "Invalid transaction id" });
    const { data: tx, error: getErr } = await supabase.from("supplier_transactions").select("*").eq("id", txId).single();
    if (getErr) throw new Error(getErr.message);

    const b = req.body;
    const payload = { updated_at: new Date().toISOString() };
    if (b.date !== undefined) payload.date = b.date;
    if (b.invoiceNumber !== undefined) payload.invoice_number = b.invoiceNumber || null;
    if (b.notes !== undefined) payload.notes = b.notes || null;
    if (b.paid !== undefined) payload.paid = Math.max(0, Number(b.paid) || 0);
    if (b.total !== undefined && tx.type === "purchase") {
      if (tx.stock_added) {
        return res.status(400).json({ error: "This purchase added items to stock, so its total comes from the items and cannot be typed." });
      }
      payload.total = Math.max(0, Number(b.total) || 0);
    }
    const { data, error } = await supabase.from("supplier_transactions").update(payload).eq("id", txId).select().single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/suppliers/transactions/:txId — removes it from the account (stock already added stays in inventory)
exports.deleteTransaction = async (req, res) => {
  try {
    const { txId } = req.params;
    if (!UUID_REGEX.test(txId)) return res.status(400).json({ error: "Invalid transaction id" });
    const { error } = await supabase
      .from("supplier_transactions")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", txId);
    if (error) throw new Error(error.message);
    res.json({ message: "Transaction deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
