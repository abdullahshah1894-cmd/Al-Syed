const supabase = require("../config/supabase");

// Helper to handle Supabase errors
const handleDbError = (error, res, message) => {
  console.error(`[DB Error] ${message}:`, error.message);
  res.status(500).json({ error: message, details: error.message });
};

// @desc    Get all mobile issues
// @route   GET /api/issues
const getIssues = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("mobile_issues")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return handleDbError(error, res, "Failed to fetch issues");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// @desc    Create a new mobile issue
// @route   POST /api/issues
const createIssue = async (req, res) => {
  try {
    const { customerName, imei, phoneIssue, companyName } = req.body;

    if (!customerName || !imei || !phoneIssue || !companyName) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Generate Ticket Number (e.g., MI-260915-XXXX)
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, ""); // YYMMDD
    const randomHex = Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, "0");
    const ticketNumber = `MI-${dateStr}-${randomHex}`;

    const newIssue = {
      ticket_number: ticketNumber,
      customer_name: customerName,
      imei,
      phone_issue: phoneIssue,
      company_name: companyName,
      status: "Pending",
    };

    const { data, error } = await supabase
      .from("mobile_issues")
      .insert([newIssue])
      .select();

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

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
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
