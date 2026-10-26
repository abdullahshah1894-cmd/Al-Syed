// Can this server read the shop's data? Used at start-up (printed in the server window) and by
// GET /api/health, so "the app shows no data" can be traced to its cause.
const supabase = require("../config/supabase");
const { PROJECT_REF } = require("../config/project");

const checkDatabase = async () => {
  try {
    const { count, error } = await supabase.from("products").select("id", { count: "exact", head: true });
    if (error) return { ok: false, project: PROJECT_REF, error: error.message };
    return { ok: true, project: PROJECT_REF, products: count };
  } catch (err) {
    return { ok: false, project: PROJECT_REF, error: `Cannot reach Supabase (${err.message}). Check the internet connection.` };
  }
};

module.exports = { checkDatabase };
