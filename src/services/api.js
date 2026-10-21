// Frontend API Service — talks to Express backend at localhost:5000
// All data is persisted in Supabase PostgreSQL via the backend

const API_BASE = "http://localhost:5000/api";

// Throws on any failure (network down, 4xx/5xx) with the server's error message.
const request = async (url, options = {}) => {
  let res;
  try {
    res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (e) {
    throw new Error("Cannot reach the server. Check that the backend is running and you are online.", { cause: e });
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.message || err.error || res.statusText);
  }
  return await res.json();
};

// Reads: return null on failure so pages can still render
const fetchJson = async (url, options = {}) => {
  try {
    return await request(url, options);
  } catch (e) {
    console.warn(`[API] ${options.method || "GET"} ${url} →`, e.message);
    return null;
  }
};

// Writes: throw on failure so nothing is shown as saved unless the database has it
const send = (method, url, data) =>
  request(url, { method, ...(data !== undefined && { body: JSON.stringify(data) }) });

export const api = {
  // ── Products ──────────────────────────────────────
  getProducts: () => fetchJson(`${API_BASE}/products`),
  searchImei: (imei) => fetchJson(`${API_BASE}/products/search/${imei}`),
  createProduct: (data) => send("POST", `${API_BASE}/products`, data),
  updateProduct: (id, data) => send("PUT", `${API_BASE}/products/${id}`, data),
  deleteProduct: (id) => send("DELETE", `${API_BASE}/products/${id}`),

  // ── Sales ─────────────────────────────────────────
  getSales: () => fetchJson(`${API_BASE}/sales`),
  createSale: (data) => send("POST", `${API_BASE}/sales`, data),
  getAnalytics: () => fetchJson(`${API_BASE}/sales/analytics`),

  // ── Ledger ────────────────────────────────────────
  getLedger: (from, to) => request(`${API_BASE}/ledger?from=${from}&to=${to}`),
  addLedgerEntry: (data) => send("POST", `${API_BASE}/ledger`, data),
  updateLedgerEntry: (id, data) => send("PUT", `${API_BASE}/ledger/${id}`, data),
  deleteLedgerEntry: (id) => send("DELETE", `${API_BASE}/ledger/${id}`),
  setOpeningBalance: (date, amount) => send("POST", `${API_BASE}/ledger/opening`, { date, amount }),

  // ── Customers ─────────────────────────────────────
  getCustomers: () => fetchJson(`${API_BASE}/customers`),
  createCustomer: (data) => send("POST", `${API_BASE}/customers`, data),
  updateCustomer: (id, data) => send("PUT", `${API_BASE}/customers/${id}`, data),
  deleteCustomer: (id) => send("DELETE", `${API_BASE}/customers/${id}`),

  // ── Warranties ────────────────────────────────────
  getWarranties: () => fetchJson(`${API_BASE}/warranties`),
  getWarrantyByImei: (imei) => fetchJson(`${API_BASE}/warranties/${imei}`),
  addWarrantyClaim: (imei, data) => send("POST", `${API_BASE}/warranties/${imei}/claims`, data),

  // ── Auth ──────────────────────────────────────────
  login: (data) => fetchJson(`${API_BASE}/auth/login`, { method: "POST", body: JSON.stringify(data) }),
  getUsers: () => fetchJson(`${API_BASE}/auth/users`),

  // ── Mobile Issues ─────────────────────────────────
  getMobileIssues: () => fetchJson(`${API_BASE}/issues`),
  addMobileIssue: (data) => send("POST", `${API_BASE}/issues`, data),
  updateMobileIssueStatus: (id, status) => send("PUT", `${API_BASE}/issues/${id}/status`, { status }),
  deleteMobileIssue: (id) => send("DELETE", `${API_BASE}/issues/${id}`),

  // ── Expenses ──────────────────────────────────────
  getExpenses: () => fetchJson(`${API_BASE}/expenses`),
  createExpense: (data) => send("POST", `${API_BASE}/expenses`, data),
  updateExpense: (id, data) => send("PUT", `${API_BASE}/expenses/${id}`, data),
  deleteExpense: (id) => send("DELETE", `${API_BASE}/expenses/${id}`),

  // ── Shop Settings ─────────────────────────────────
  getSettings: () => fetchJson(`${API_BASE}/settings`),
  updateSettings: (data) => send("PUT", `${API_BASE}/settings`, data),
};
