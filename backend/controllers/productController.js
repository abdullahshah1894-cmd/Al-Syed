const supabase = require("../config/supabase");
const { hideProductCost } = require("../lib/fetchAll");
const lists = require("../lib/lists");

// Get all products (not deleted)
exports.getProducts = async (req, res) => {
  try {
    const data = await lists.products();
    res.json(data.map((p) => hideProductCost(req, p)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Search product by IMEI or barcode
exports.searchByImei = async (req, res) => {
  try {
    const query = String(req.params.query || "").trim();
    if (!query) return res.status(400).json({ error: "Enter an IMEI or barcode." });

    // Oldest first, so the first product that ever had this IMEI wins (as before)
    const all = [...(await lists.products())].reverse();

    const byBarcode = all.find((p) => p.barcode && p.barcode === query);
    if (byBarcode) return res.json({ product: hideProductCost(req, byBarcode), matchedImei: null });

    // A phone sold from one product and later bought back into another has two entries:
    // prefer the unit that is in stock now, and fall back to a sold one only if none is
    let soldMatch = null;
    for (const product of all) {
      for (const unit of product.imeis || []) {
        if (![unit.imei, unit.imei1, unit.imei2].includes(query)) continue;
        if (unit.status === "in_stock") return res.json({ product: hideProductCost(req, product), matchedImei: unit });
        if (!soldMatch) soldMatch = { product, unit };
      }
    }
    if (soldMatch) return res.json({ product: hideProductCost(req, soldMatch.product), matchedImei: soldMatch.unit });

    res.status(404).json({ message: "Product not found for scanned code" });
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
      // Ask the database about just these IMEIs (instead of downloading every product)
      const { data: found, error: findError } = await supabase.rpc("find_in_stock_imeis", { p_keys: keys });
      if (findError) throw new Error(findError.message);
      const inStock = new Map((found || []).map((r) => [r.imei, r.product_name]));
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
      // 0 (no low-stock alert) is a real choice; default to 2 only when nothing was sent
      min_stock_alert: Math.max(0, parseInt(body.minStockAlert ?? body.min_stock_alert ?? 2, 10) || 0),
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
