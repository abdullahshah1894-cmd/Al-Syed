const supabase = require("../config/supabase");
const lists = require("../lib/lists");

const ISSUE_STATUSES = ["Pending", "Under Inspection", "Repaired", "Delivered", "Rejected"];

// Helper to handle Supabase errors
const handleDbError = (error, res, message) => {
  console.error(`[DB Error] ${message}:`, error.message);
  res.status(500).json({ error: message, details: error.message });
};

// @desc    Get all mobile issues
// @route   GET /api/issues
const getIssues = async (req, res) => {
  try {
    res.json(await lists.issues());
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// @desc    Create a new mobile issue
// @route   POST /api/issues
const createIssue = async (req, res) => {
  try {
    const { customerName, imei, phoneIssue, companyName } = req.body;

    if (![customerName, imei, phoneIssue, companyName].every((v) => String(v ?? "").trim())) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Ticket number MI-YYMMDD-XXXX, dated in shop time (Pakistan). ticket_number is unique in the
    // database, so on the rare clash pick another suffix instead of failing.
    const dateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }).slice(2).replace(/-/g, "");
    let data, error;
    for (let attempt = 0; attempt < 5; attempt++) {
      const randomHex = Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, "0");
      ({ data, error } = await supabase
        .from("mobile_issues")
        .insert([{
          ticket_number: `MI-${dateStr}-${randomHex}`,
          customer_name: customerName,
          imei,
          phone_issue: phoneIssue,
          company_name: companyName,
          status: "Pending",
        }])
        .select());
      if (!error || error.code !== "23505") break;
    }

    if (error) return handleDbError(error, res, "Failed to create issue");
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// @desc    Update an issue's status
// @route   PUT /api/issues/:id/status
const updateIssueStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ISSUE_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${ISSUE_STATUSES.join(", ")}` });
    }

    const { data, error } = await supabase
      .from("mobile_issues")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select();

    if (error) return handleDbError(error, res, "Failed to update issue status");
    if (!data || data.length === 0) return res.status(404).json({ error: "Issue not found" });

    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// @desc    Delete an issue
// @route   DELETE /api/issues/:id
const deleteIssue = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from("mobile_issues").delete().eq("id", id).select();

    if (error) return handleDbError(error, res, "Failed to delete issue");
    if (!data || data.length === 0) return res.status(404).json({ error: "Issue not found" });

    res.json({ message: "Issue deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

module.exports = {
  getIssues,
  createIssue,
  updateIssueStatus,
  deleteIssue,
};
