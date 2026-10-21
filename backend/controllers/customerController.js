const supabase = require("../config/supabase");

exports.getCustomers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createCustomer = async (req, res) => {
  try {
    // Only pass columns that exist in the customers table
    const { name, phone, email, address, cnic, seller_name } = req.body;
    const payload = {};
    if (name !== undefined) payload.name = name;
    if (phone !== undefined) payload.phone = phone;
    if (email !== undefined) payload.email = email;
    if (address !== undefined) payload.address = address;
    if (cnic !== undefined) payload.cnic = cnic;
    if (seller_name !== undefined) payload.seller_name = seller_name;

    const { data, error } = await supabase
      .from("customers")
      .insert([payload])
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    // Skip if the ID is not a valid UUID (e.g., optimistic local IDs like c_xxx)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return res.json({ message: "Skipped: non-UUID id", id });
    }

    // Strip unknown fields before update
    const allowed = ["name", "phone", "email", "address", "cnic", "seller_name", "total_purchases", "outstanding_balance", "is_deleted"];
    const updateBody = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updateBody[k] = req.body[k]; });

    const { data, error } = await supabase
      .from("customers")
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

exports.deleteCustomer = async (req, res) => {
  try {
    const { error } = await supabase
      .from("customers")
      .update({ is_deleted: true })
      .eq("id", req.params.id);

    if (error) throw new Error(error.message);
    res.json({ message: "Customer deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
