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
    const imeis = body.imeis || [];
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
      warranty_duration: body.warrantyDuration || body.warranty_duration || 12,
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

    const body = req.body;
    let quantityToSet = body.quantity !== undefined ? body.quantity : undefined;
    if (body.imeis !== undefined && quantityToSet === undefined && Array.isArray(body.imeis)) {
      quantityToSet = body.imeis.filter((i) => i.status === "in_stock").length;
    }

    const payload = {
      ...(body.name && { name: body.name }),
      ...(body.brand && { brand: body.brand }),
      ...(body.model !== undefined && { model: body.model }),
      ...(body.category && { category: body.category }),
      ...(body.purchasePrice !== undefined && { purchase_price: body.purchasePrice }),
      ...(body.purchase_price !== undefined && { purchase_price: body.purchase_price }),
      ...(body.salePrice !== undefined && { sale_price: body.salePrice }),
      ...(body.sale_price !== undefined && { sale_price: body.sale_price }),
      ...(quantityToSet !== undefined && { quantity: quantityToSet }),
      ...(body.imeis !== undefined && { imeis: body.imeis }),
      ...(body.specs !== undefined && { specs: body.specs }),
      updated_at: new Date().toISOString(),
    };

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
