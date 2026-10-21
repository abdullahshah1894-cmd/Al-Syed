const supabase = require("../config/supabase");

exports.getWarranties = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("warranties")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getWarrantyByImei = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("warranties")
      .select("*")
      .eq("imei", req.params.imei)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return res.status(404).json({ message: "Warranty not found" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addClaim = async (req, res) => {
  try {
    // An IMEI can have several warranty rows (sold, returned, sold again): claim on the latest one
    const { data: warranty, error: fetchError } = await supabase
      .from("warranties")
      .select("id, claims")
      .eq("imei", req.params.imei)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!warranty) return res.status(404).json({ message: "Warranty not found" });

    const { issue, claimType, status, notes } = req.body;
    const newClaim = {
      id: `cl_${Date.now()}`,
      claimDate: new Date().toLocaleDateString("en-CA"),
      issue: issue || "",
      claimType: claimType || "Shop Warranty",
      status: status || "Pending",
      notes: notes || "",
    };

    const updatedClaims = [...(warranty.claims || []), newClaim];
    const { data, error } = await supabase
      .from("warranties")
      .update({ claims: updatedClaims })
      .eq("id", warranty.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
