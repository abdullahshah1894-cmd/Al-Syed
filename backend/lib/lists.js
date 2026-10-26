// The full lists the app reads, each loaded from Supabase once and then served from the cache
// (lib/cache.js) until a write changes it. Callers must not modify the returned rows.
const supabase = require("../config/supabase");
const { fetchAll } = require("./fetchAll");
const { cached, registerWarmer } = require("./cache");

const products = () =>
  cached("products", "all", () =>
    fetchAll(() => supabase.from("products").select("*").eq("is_deleted", false).order("created_at", { ascending: false }))
  );

const sales = () =>
  cached("sales", "all", () =>
    fetchAll(() => supabase.from("sales").select("*").eq("is_deleted", false).order("created_at", { ascending: false }))
  );

const customers = () =>
  cached("customers", "all", () =>
    fetchAll(() => supabase.from("customers").select("*").eq("is_deleted", false).order("created_at", { ascending: false }))
  );

const warranties = () =>
  cached("warranties", "all", () =>
    fetchAll(() => supabase.from("warranties").select("*").order("created_at", { ascending: false }))
  );

const expenses = () =>
  cached("expenses", "all", () => fetchAll(() => supabase.from("expenses").select("*").order("created_at", { ascending: false })));

const issues = () =>
  cached("issues", "all", () =>
    fetchAll(() => supabase.from("mobile_issues").select("*").order("created_at", { ascending: false }))
  );

const settings = () =>
  cached("settings", "all", async () => {
    const { data, error } = await supabase.from("shop_settings").select("data").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? data.data : {};
  });

// Suppliers and their (live) transactions
const suppliers = () =>
  cached("suppliers", "all", async () => {
    const [list, txs] = await Promise.all([
      fetchAll(() => supabase.from("suppliers").select("*").eq("is_deleted", false).order("name", { ascending: true })),
      fetchAll(() => supabase.from("supplier_transactions").select("*").eq("is_deleted", false).order("date", { ascending: false })),
    ]);
    return { suppliers: list || [], transactions: txs || [] };
  });

// Ledger rows for a date range. Item rows without an invoice are left out: older builds saved one
// per scan with no link.
const ledger = (from, to) =>
  cached("ledger", `${from || ""}|${to || ""}`, () =>
    fetchAll(() => {
      let query = supabase
        .from("ledger_entries")
        .select("*")
        .or("type.neq.item,parent_invoice_id.not.is.null")
        .order("created_at", { ascending: true });
      if (from) query = query.gte("date", from);
      if (to) query = query.lte("date", to);
      return query;
    })
  );

// Today's ledger sheet (what the Ledger page opens on), in shop time
const todaysLedger = () => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  return ledger(today, today);
};

// Load the lists every screen needs, so the first person to open the app does not wait for them
const warmUp = () =>
  Promise.allSettled([products(), sales(), customers(), warranties(), settings(), expenses(), issues(), suppliers(), todaysLedger()]);

// Reload these right after a write changes them (other ledger date ranges load when asked for)
Object.entries({ products, sales, customers, warranties, settings, expenses, issues, suppliers, ledger: todaysLedger }).forEach(
  ([group, load]) => registerWarmer(group, load)
);

module.exports = { products, sales, customers, warranties, expenses, issues, settings, suppliers, ledger, warmUp };
