const supabase = require("../config/supabase");

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .eq("password", password)
      .eq("is_deleted", false)
      .single();

    if (error || !user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    res.json({
      user: { id: user.id, name: user.name, username: user.username, role: user.role },
      token: `token_${user.id}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, username, role, created_at")
      .eq("is_deleted", false);

    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .insert([req.body])
      .select("id, name, username, role, created_at")
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
