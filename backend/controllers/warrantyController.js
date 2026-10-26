const supabase = require("../config/supabase");
const lists = require("../lib/lists");

exports.getWarranties = async (req, res) => {
  try {
    const data = await lists.warranties();
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
    if (!String(issue || "").trim()) return res.status(400).json({ error: "Describe the problem for the claim." });
    const newClaim = {
      id: `cl_${Date.now()}`,
      claimDate: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }),
      issue: String(issue).trim(),
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

const CLAIM_STATUSES = ["Pending", "In Repair", "Sent to Company", "Resolved", "Rejected"];

// Move a claim along (e.g. Pending → Sent to Company → Resolved). Matches the claim by its id on
// any warranty row of this IMEI, so older rows (sold, returned, sold again) still work.
exports.updateClaim = async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (status !== undefined && !CLAIM_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${CLAIM_STATUSES.join(", ")}` });
    }
    const { data: rows, error: fetchError } = await supabase
      .from("warranties")
      .select("id, claims")
      .eq("imei", req.params.imei);
    if (fetchError) throw new Error(fetchError.message);

    const row = (rows || []).find((w) => (w.claims || []).some((c) => c.id === req.params.claimId));
    if (!row) return res.status(404).json({ error: "Claim not found" });

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
    const claims = row.claims.map((c) => {
      if (c.id !== req.params.claimId) return c;
      const next = { ...c };
      if (status !== undefined) {
        next.status = status;
        if (status === "Resolved" || status === "Rejected") next.closedDate = today;
        else delete next.closedDate;
      }
      if (notes !== undefined) next.notes = String(notes);
      return next;
    });

    const { data, error } = await supabase.from("warranties").update({ claims }).eq("id", row.id).select().single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
