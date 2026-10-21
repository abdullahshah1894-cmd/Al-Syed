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

// Create a sale bill
exports.createSale = async (req, res) => {
  try {
    const body = req.body;
    const now = new Date();
    const billNumber =
      body.billNumber ||
      `INV-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-4)}`;

    // Validate UUID fields — Supabase expects UUID or null
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const toUUID = (val) => (val && UUID_REGEX.test(String(val)) ? val : null);

    const rawCustomerId = body.customerId || body.customer_id || body.customer || null;

    // Ensure all items in payload have uniform productId and product references
    const sanitizedItems = (body.items || []).map((item) => {
      const pid = item.productId || item.product || item.id || null;
      return {
        ...item,
        productId: pid,
        product: pid,
      };
    });

    const payload = {
      bill_number: billNumber,
      customer_id: toUUID(rawCustomerId),
      customer_name: body.customerName || body.customer_name || "Walk-in Customer",
      customer_phone: body.customerPhone || body.customer_phone || null,
      items: sanitizedItems,
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
    };

    // 1. First, rigidly validate stock before creating the sale
    for (const item of body.items || []) {
      const productId = item.productId || item.product || item.id;
      if (!productId) continue;
      // Skip non-UUID (local/optimistic) product IDs
      if (!UUID_REGEX.test(String(productId))) continue;

      const imeiList = item.imeisArray && item.imeisArray.length > 0 ? item.imeisArray : (item.imei ? [item.imei] : []);
      const qtyRequested = Number(item.quantity || item.qty || 1);

      const { data: prod } = await supabase
        .from("products")
        .select("id, quantity, imeis, name")
        .eq("id", productId)
        .single();

      if (!prod) continue;
      const prodImeis = prod.imeis || [];

      if (imeiList.length > 0) {
        // Explicit IMEIs requested
        for (const imeiStr of imeiList) {
          const imeiObj = prodImeis.find((i) => i.imei === imeiStr || i.imei1 === imeiStr || i.imei2 === imeiStr);
          if (!imeiObj || imeiObj.status !== "in_stock") {
            throw new Error(`Cannot complete invoice! IMEI ${imeiStr} is not available in stock for ${prod.name}.`);
          }
        }
      } else if (prodImeis.length > 0) {
        // Product has IMEIs but none explicitly passed (e.g. from general bill)
        const inStockCount = prodImeis.filter((i) => i.status === "in_stock").length;
        if (inStockCount < qtyRequested) {
          throw new Error(`Cannot complete invoice! Stock limit exceeded for ${prod.name}. Available: ${inStockCount}, Requested: ${qtyRequested}`);
        }
      } else {
        // Bulk items without IMEIs
        const currentQty = Number(prod.quantity || 0);
        if (currentQty < qtyRequested) {
          throw new Error(`Cannot complete invoice! Stock limit exceeded for ${prod.name}. Available: ${currentQty}, Requested: ${qtyRequested}`);
        }
      }
    }

    // Insert the sale; if the bill number is already taken, add a suffix instead of losing the sale
    let saleData = null;
    for (let attempt = 0; attempt < 5 && !saleData; attempt++) {
      if (attempt > 0) payload.bill_number = `${billNumber}-${attempt + 1}`;
      const { data, error: saleError } = await supabase.from("sales").insert([payload]).select().single();
      if (!saleError) saleData = data;
      else if (saleError.code !== "23505") throw new Error(saleError.message);
    }
    if (!saleData) throw new Error(`Could not save bill ${billNumber}: bill number already exists.`);

    // 2. Update IMEI status to sold AND deduct quantity in products table
    for (const item of body.items || []) {
      const productId = item.productId || item.product || item.id;
      if (!productId) continue;
      // Skip non-UUID (local/optimistic) product IDs
      if (!UUID_REGEX.test(String(productId))) continue;

      let imeiList = item.imeisArray && item.imeisArray.length > 0 ? [...item.imeisArray] : (item.imei ? [item.imei] : []);
      const qtySold = Number(item.quantity || item.qty || 1);

      const { data: prod } = await supabase
        .from("products")
        .select("id, imeis, quantity, name, brand, model, warranty_type, warranty_duration")
        .eq("id", productId)
        .single();

      if (!prod) continue;
      const prodImeis = prod.imeis || [];

      // If product has IMEIs but none provided in the sale item, auto-pick first N in-stock IMEIs
      if (imeiList.length === 0 && prodImeis.length > 0) {
        const available = prodImeis.filter((i) => i.status === "in_stock");
        const take = available.slice(0, qtySold);
        imeiList = take.map((i) => i.imei || i.imei1 || i.imei2).filter(Boolean);
      }

      if (prodImeis.length > 0 && imeiList.length > 0) {
        // Mark selected IMEIs as sold
        const updatedImeis = prodImeis.map((i) => {
          const isSold = imeiList.some((im) => im === i.imei || im === i.imei1 || im === i.imei2);
          return isSold
            ? { ...i, status: "sold", soldAt: new Date().toISOString(), soldInSale: saleData.id }
            : i;
        });

        const newRemainingStock = updatedImeis.filter((i) => i.status === "in_stock").length;

        // Update BOTH imeis and quantity in database
        await supabase
          .from("products")
          .update({
            imeis: updatedImeis,
            quantity: newRemainingStock,
            updated_at: new Date().toISOString(),
          })
          .eq("id", productId);

        // Create warranty records for each sold IMEI
        const warrantyDurationMonths = prod.warranty_duration || 12;
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + warrantyDurationMonths);

        for (const imeiStr of imeiList) {
          await supabase.from("warranties").insert([{
            imei: imeiStr,
            product_id: productId,
            product_name: item.productName || item.name || prod.name,
            brand: prod.brand || item.brand || null,
            model: prod.model || item.model || null,
            customer_name: payload.customer_name,
            customer_phone: payload.customer_phone,
            purchase_date: now.toISOString().slice(0, 10),
            warranty_start_date: now.toISOString().slice(0, 10),
            warranty_expiry_date: expiryDate.toISOString().slice(0, 10),
            warranty_type: item.warrantyType || prod.warranty_type || "Official Brand Warranty",
            status: "Active",
            sale_id: saleData.id,
          }]);
        }
      } else {
        // Bulk items without IMEIs: decrement stock count
        const currentQty = Number(prod.quantity || 0);
        const newQty = Math.max(0, currentQty - qtySold);
        await supabase
          .from("products")
          .update({
            quantity: newQty,
            updated_at: new Date().toISOString(),
          })
          .eq("id", productId);
      }
    }

    // 3. Update Customer Balance if applicable
    if (payload.customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("total_purchases, outstanding_balance")
        .eq("id", payload.customer_id)
        .single();
        
      if (customer) {
        const currentPurchases = Number(customer.total_purchases || 0);
        const currentOutstanding = Number(customer.outstanding_balance || 0);
        const saleGrandTotal = Number(payload.grand_total || 0);
        const saleDueAmount = Number(payload.due_amount || 0);

        // An Udhaar settlement is a payment against the balance, not a purchase
        const newOutstanding =
          payload.payment_method === "Udhaar Settlement"
            ? Math.max(0, currentOutstanding - Number(payload.paid_amount || 0))
            : currentOutstanding + saleDueAmount;

        const { error: custError } = await supabase
          .from("customers")
          .update({
            total_purchases: currentPurchases + saleGrandTotal,
            outstanding_balance: newOutstanding,
            updated_at: new Date().toISOString()
          })
          .eq("id", payload.customer_id);

        if (custError) {
          console.error(`[Sale ${saleData.bill_number}] Customer balance update failed:`, custError.message);
        }
      }
    }

    res.status(201).json(saleData);
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
