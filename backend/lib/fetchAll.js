// Supabase answers at most 1000 rows per request (the project's "max rows" setting).
// fetchAll reads page after page so lists never silently stop at 1000.
// makeQuery must return a fresh query each call, e.g. () => supabase.from("sales").select("*").order("created_at")
const fetchAll = async (makeQuery, pageSize = 1000) => {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
};

// Cost price and profit are owner-only; cashiers get the same rows without them
const isAdmin = (req) => req.user?.role === "admin";

const hideProductCost = (req, product) => {
  if (!product || isAdmin(req)) return product;
  const rest = { ...product };
  delete rest.purchase_price;
  return rest;
};

const hideSaleCost = (req, sale) => {
  if (!sale || isAdmin(req)) return sale;
  const rest = { ...sale };
  delete rest.net_profit;
  rest.items = (rest.items || []).map((item) => {
    const copy = { ...(item || {}) };
    delete copy.unitPurchasePrice;
    return copy;
  });
  return rest;
};

module.exports = { fetchAll, isAdmin, hideProductCost, hideSaleCost };
