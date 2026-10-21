const supabase = require("../config/supabase");

// Get all sales
exports.getSales = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    res.json(data);
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
    const now = new Date();
    const billNumber =
      body.billNumber ||
      `INV-${now.toLocaleDateString("en-CA").replace(/-/g, "")}-${Date.now().toString().slice(-4)}`;

    const payload = {
      bill_number: billNumber,
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
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get analytics: top 5 products, totals
exports.getAnalytics = async (req, res) => {
  try {
    const { data: sales, error } = await supabase.from("sales").select("*");
    if (error) throw new Error(error.message);

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
