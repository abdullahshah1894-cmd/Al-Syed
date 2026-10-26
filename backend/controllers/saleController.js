const supabase = require("../config/supabase");
const { hideSaleCost } = require("../lib/fetchAll");
const lists = require("../lib/lists");

// Get all sales
exports.getSales = async (req, res) => {
  try {
    const data = await lists.sales();
    res.json(data.map((s) => hideSaleCost(req, s)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create a sale bill.
// The whole sale runs in one database transaction (public.create_sale, see scripts/migrateSales.js):
// stock check, IMEIs marked sold, the sale row, warranties and the customer balance — all or nothing.
exports.createSale = async (req, res) => {
  try {
    const body = req.body;
    const payload = {
      // Empty = the database numbers the bill (INV-YYYYMMDD-NNNN, Pakistan date)
      bill_number: body.billNumber || null,
      customer_id: body.customerId || body.customer_id || body.customer || null,
      customer_name: body.customerName || body.customer_name || "Walk-in Customer",
      customer_phone: body.customerPhone || body.customer_phone || null,
      items: (body.items || []).map((item) => {
        const pid = item.productId || item.product || item.id || null;
        return { ...item, productId: pid, product: pid };
      }),
      subtotal_amount: body.subtotalAmount || body.subtotal_amount || 0,
      discount_amount: body.discountAmount || body.discount_amount || 0,
      tax_percent: body.taxPercent || body.tax_percent || 0,
      tax_amount: body.taxAmount || body.tax_amount || 0,
      grand_total: body.grandTotal || body.grand_total || 0,
      paid_amount: body.paidAmount || body.paid_amount || 0,
      due_amount: body.dueAmount || body.due_amount || 0,
      net_profit: body.netProfit || body.net_profit || 0,
      payment_method: body.paymentMethod || body.payment_method || "Cash",
      payment_status: body.paymentStatus || body.payment_status || "paid",
      cashier_name: body.cashierName || body.cashier_name || null,
      seller_name: body.sellerName || body.seller_name || body.cashierName || body.cashier_name || null,
      notes: body.notes || null,
      due_date: body.dueDate || body.due_date || null,
    };

    const { data, error } = await supabase.rpc("create_sale", { p: payload });
    if (error) throw new Error(error.message);
    res.status(201).json(hideSaleCost(req, data));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const byName = (req) => req.user?.name || req.user?.username || null;

// Return items from a bill: body { items: [{ index, qty, imeis }], note }
// (public.return_sale_items: stock back, bill and Udhaar reduced, warranties voided — one transaction)
exports.returnItems = async (req, res) => {
  try {
    if (!UUID_REGEX.test(req.params.id)) return res.status(400).json({ error: "Invalid bill id" });
    const { data, error } = await supabase.rpc("return_sale_items", {
      p_sale: req.params.id,
      p_items: req.body.items || [],
      p_note: req.body.note || null,
      p_by: byName(req),
    });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Edit a bill: body { customerName, customerPhone, sellerName, notes, dueDate, discountAmount, paidAmount, rates }
exports.updateSale = async (req, res) => {
  try {
    if (!UUID_REGEX.test(req.params.id)) return res.status(400).json({ error: "Invalid bill id" });
    const b = req.body;
    const map = {
      customer_name: b.customerName, customer_phone: b.customerPhone, seller_name: b.sellerName,
      notes: b.notes, due_date: b.dueDate, discount_amount: b.discountAmount, paid_amount: b.paidAmount,
    };
    const p = {};
    Object.entries(map).forEach(([k, v]) => { if (v !== undefined) p[k] = v === null ? "" : v; });
    if (Array.isArray(b.rates) && b.rates.length > 0) p.rates = b.rates;

    const { data, error } = await supabase.rpc("update_sale", { p_sale: req.params.id, p });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete a bill: reverses stock, Udhaar and payment (public.void_sale), keeps the record as deleted
exports.deleteSale = async (req, res) => {
  try {
    if (!UUID_REGEX.test(req.params.id)) return res.status(400).json({ error: "Invalid bill id" });
    const { data, error } = await supabase.rpc("void_sale", { p_sale: req.params.id, p_by: byName(req) });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get analytics: top 5 products, totals
exports.getAnalytics = async (req, res) => {
  try {
    const sales = await lists.sales();

    let totalRevenue = 0;
    let totalProfit = 0;
    let totalItemsSold = 0;
    const productMap = {};

    (sales || []).forEach((sale) => {
      totalRevenue += Number(sale.grand_total || 0);
      totalProfit += Number(sale.net_profit || 0);
      (sale.items || []).forEach((item) => {
        const qty = item.qty || item.quantity || 1;
        totalItemsSold += qty;
        const name = item.productName || item.name || "Unknown";
        if (!productMap[name]) productMap[name] = { name, qty: 0, revenue: 0 };
        productMap[name].qty += qty;
        productMap[name].revenue += Number(item.subtotal || 0);
      });
    });

    const topProducts = Object.values(productMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    res.json({ totalRevenue, totalProfit, totalItemsSold, totalBills: sales.length, topProducts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
