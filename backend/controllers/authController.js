const bcrypt = require("bcryptjs");
const supabase = require("../config/supabase");
const { signToken } = require("../middleware/auth");

const isHash = (value) => typeof value === "string" && value.startsWith("$2");

exports.login = async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    if (!username || !password) return res.status(400).json({ error: "Enter your username and password." });

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .eq("is_deleted", false)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const ok = !!user && (isHash(user.password) ? await bcrypt.compare(password, user.password) : password === user.password);
    if (!ok) return res.status(401).json({ error: "Invalid username or password" });

    // Older accounts store the password as plain text: replace it with a hash on first login
    if (!isHash(user.password)) {
      const hash = await bcrypt.hash(password, 10);
      const { error: hashError } = await supabase.from("users").update({ password: hash }).eq("id", user.id);
      if (hashError) console.error("[Auth] Could not hash password for", user.username, hashError.message);
    }

    const safeUser = { id: user.id, name: user.name, username: user.username, role: user.role };
    res.json({ user: safeUser, token: signToken(safeUser) });
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
    const { name, username, password, role } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: "Name, username and password are required." });
    if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    const { data, error } = await supabase
      .from("users")
      .insert([{
        name,
        username: String(username).trim(),
        password: await bcrypt.hash(String(password), 10),
        role: role === "admin" ? "admin" : "cashier",
      }])
      .select("id, name, username, role, created_at")
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Change your own password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }
    const { data: user, error } = await supabase.from("users").select("id, password").eq("id", req.user.id).single();
    if (error) throw new Error(error.message);

    const ok = isHash(user.password)
      ? await bcrypt.compare(String(currentPassword || ""), user.password)
      : String(currentPassword || "") === user.password;
    if (!ok) return res.status(400).json({ error: "Current password is wrong." });

    const { error: upError } = await supabase
      .from("users")
      .update({ password: await bcrypt.hash(String(newPassword), 10) })
      .eq("id", user.id);
    if (upError) throw new Error(upError.message);
    res.json({ message: "Password changed" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
