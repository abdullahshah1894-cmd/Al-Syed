const supabase = require("../config/supabase");
const lists = require("../lib/lists");

// Get all expenses
exports.getExpenses = async (req, res) => {
  try {
    const data = await lists.expenses();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create an expense
exports.createExpense = async (req, res) => {
  try {
    const {
      title,
      amount,
      category,
      description,
      seller_name,
      payment_method,
      expense_date,
    } = req.body;

    if (!title || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Title and valid amount are required." });
    }

    const payload = {
      title: title.trim(),
      amount: Number(amount),
      category: category || "Other",
      description: description || null,
      seller_name: seller_name || null,
      payment_method: payment_method || "Cash",
      expense_date: expense_date || new Date().toISOString().slice(0, 10),
    };

    const { data, error } = await supabase
      .from("expenses")
      .insert([payload])
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Update an expense
exports.updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["title", "amount", "category", "description", "seller_name", "payment_method", "expense_date"];
    const updateBody = {};
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) updateBody[k] = req.body[k];
    });

    const { data, error } = await supabase
      .from("expenses")
      .update(updateBody)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete an expense
exports.deleteExpense = async (req, res) => {
  try {
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", req.params.id);

    if (error) throw new Error(error.message);
    res.json({ message: "Expense deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
