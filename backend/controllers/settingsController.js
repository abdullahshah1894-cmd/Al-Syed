const supabase = require("../config/supabase");

const ALLOWED = ["shopName", "address", "phone", "taxRate", "currencySymbol"];

// Get shop settings (single row, id = 1)
exports.getSettings = async (req, res) => {
  try {
    const { data, error } = await supabase.from("shop_settings").select("data").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    res.json(data ? data.data : {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Save shop settings
exports.updateSettings = async (req, res) => {
  try {
    const settings = {};
    ALLOWED.forEach((k) => { if (req.body[k] !== undefined) settings[k] = req.body[k]; });
    if (settings.taxRate !== undefined) settings.taxRate = Number(settings.taxRate) || 0;

    const { data, error } = await supabase
      .from("shop_settings")
      .upsert([{ id: 1, data: settings, updated_at: new Date().toISOString() }], { onConflict: "id" })
      .select("data")
      .single();

    if (error) throw new Error(error.message);
    res.json(data.data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
