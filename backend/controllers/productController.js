const supabase = require("../config/supabase");

// Get all products (not deleted)
exports.getProducts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Search product by IMEI or barcode
exports.searchByImei = async (req, res) => {
  try {
    const { query } = req.params;

    // Search by barcode first
    const { data: byBarcode } = await supabase
      .from("products")
      .select("*")
      .eq("barcode", query)
      .eq("is_deleted", false)
      .single();

    if (byBarcode) {
      return res.json({ product: byBarcode, matchedImei: null });
    }

    // Search all products with IMEI arrays
    const { data: allProducts, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_deleted", false);

    if (error) throw new Error(error.message);

    let matchedProduct = null;
    let matchedImei = null;

    for (const product of allProducts) {
      const imeis = product.imeis || [];
      const found = imeis.find((i) => i.imei === query || i.imei1 === query || i.imei2 === query);
      if (found) {
        matchedProduct = product;
        matchedImei = found;
        break;
      }
    }

    if (!matchedProduct) {
      return res.status(404).json({ message: "Product not found for scanned code" });
    }

    res.json({ product: matchedProduct, matchedImei });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create product
exports.createProduct = async (req, res) => {
  try {
    const body = req.body;
    const imeis = (body.imeis || []).map((i) => ({ ...i, imei: i.imei || i.imei1, status: i.status || "in_stock" }));

    // Refuse IMEIs repeated in the form or already in stock in another product
    const keys = imeis.flatMap((i) => [...new Set([i.imei, i.imei1, i.imei2].filter(Boolean))]);
    if (keys.length > 0) {
      const repeated = keys.filter((k, idx) => keys.indexOf(k) !== idx);
      const { data: existing, error: exError } = await supabase.from("products").select("name, imeis").eq("is_deleted", false);
      if (exError) throw new Error(exError.message);
      const inStock = new Map();
      (existing || []).forEach((p) =>
        (p.imeis || []).forEach((i) => {
          if (i.status === "in_stock") [i.imei, i.imei1, i.imei2].filter(Boolean).forEach((k) => inStock.set(k, p.name));
        })
      );
      const clashes = [...new Set([...repeated, ...keys.filter((k) => inStock.has(k))])];
      if (clashes.length > 0) {
        return res.status(409).json({
          error: `These IMEIs are already in stock or repeated: ${clashes
            .map((k) => (inStock.has(k) ? `${k} (${inStock.get(k)})` : k))
            .join(", ")}`,
        });
      }
    }
    const derivedQuantity =
      Array.isArray(imeis) && imeis.length > 0
        ? imeis.filter((i) => i.status === "in_stock").length
        : body.quantity !== undefined
        ? Number(body.quantity)
        : 0;

    const payload = {
      name: body.name,
      brand: body.brand,
      model: body.model,
      category: body.category,
      purchase_price: body.purchasePrice || body.purchase_price || 0,
      sale_price: body.salePrice || body.sale_price || 0,
      quantity: derivedQuantity,
      min_stock_alert: body.minStockAlert || body.min_stock_alert || 2,
      barcode: body.barcode || null,
      // 0 months ("No Warranty") is a real value, so only fall back when nothing was sent
      warranty_duration: Number(body.warrantyDuration ?? body.warranty_duration ?? 12) || 0,
      warranty_type: body.warrantyType || body.warranty_type || "Official Brand Warranty",
      supplier_name: body.supplier?.name || body.supplier_name || null,
      supplier_phone: body.supplier?.phone || body.supplier_phone || null,
      specs: body.specs || {},
      imeis: imeis,
    };

    const { data, error } = await supabase.from("products").insert([payload]).select().single();
    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return res.json({ message: "Skipped: non-UUID product id", id });
    }

    // Stock (imeis / quantity) is not editable here: it changes only through sales and POST /:id/stock,
    // so a stale screen can never put sold units back in stock.
    const body = req.body;
    const pick = (...keys) => keys.map((k) => body[k]).find((v) => v !== undefined);
    const fields = {
      name: pick("name"),
      brand: pick("brand"),
      model: pick("model"),
      category: pick("category"),
      purchase_price: pick("purchasePrice", "purchase_price"),
      sale_price: pick("salePrice", "sale_price"),
      min_stock_alert: pick("minStockAlert", "min_stock_alert"),
      barcode: pick("barcode"),
      warranty_duration: pick("warrantyDuration", "warranty_duration"),
      warranty_type: pick("warrantyType", "warranty_type"),
      supplier_name: body.supplier?.name ?? pick("supplierName", "supplier_name"),
      supplier_phone: body.supplier?.phone ?? pick("supplierPhone", "supplier_phone"),
      specs: pick("specs"),
    };
    // Cost price is admin-only, as on screen
    if (req.user?.role !== "admin") delete fields.purchase_price;
    const payload = { updated_at: new Date().toISOString() };
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined) payload[k] = v === "" && k === "barcode" ? null : v;
    });

    const { data, error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Restock: append IMEI units or add a quantity, atomically on the server (public.add_stock)
exports.addStock = async (req, res) => {
  try {
    const { id } = req.params;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) return res.status(400).json({ error: "Invalid product id" });

    const imeis = Array.isArray(req.body.imeis) ? req.body.imeis : [];
    const quantity = Math.max(0, parseInt(req.body.quantity, 10) || 0);

    const { data, error } = await supabase.rpc("add_stock", { p_product: id, p_imeis: imeis, p_qty: quantity });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Soft delete
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return res.json({ message: "Skipped: non-UUID product id", id });
    }
    const { error } = await supabase
      .from("products")
      .update({ is_deleted: true })
      .eq("id", id);

    if (error) throw new Error(error.message);
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
