// Frontend API Service — talks to Express backend at localhost:5000
// All data is persisted in Supabase PostgreSQL via the backend

const API_BASE = "http://localhost:5000/api";

const fetchJson = async (url, options = {}) => {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.message || err.error || res.statusText);
    }
    return await res.json();
  } catch (e) {
    // Silently return null so frontend falls back to local state
    console.warn(`[API] ${options.method || "GET"} ${url} →`, e.message);
    return null;
  }
};

export const api = {
  // ── Products ──────────────────────────────────────
  getProducts: () => fetchJson(`${API_BASE}/products`),
  searchImei: (imei) => fetchJson(`${API_BASE}/products/search/${imei}`),
  createProduct: (data) => fetchJson(`${API_BASE}/products`, { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id, data) => fetchJson(`${API_BASE}/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProduct: (id) => fetchJson(`${API_BASE}/products/${id}`, { method: "DELETE" }),

  // ── Sales ─────────────────────────────────────────
  getSales: () => fetchJson(`${API_BASE}/sales`),
  createSale: (data) => fetchJson(`${API_BASE}/sales`, { method: "POST", body: JSON.stringify(data) }),
  getAnalytics: () => fetchJson(`${API_BASE}/sales/analytics`),

  // ── Ledger ────────────────────────────────────────
  getLedger: () => fetchJson(`${API_BASE}/ledger`),
  addLedgerEntry: (data) => fetchJson(`${API_BASE}/ledger`, { method: "POST", body: JSON.stringify(data) }),
  deleteLedgerEntry: (id) => fetchJson(`${API_BASE}/ledger/${id}`, { method: "DELETE" }),

  // ── Customers ─────────────────────────────────────
  getCustomers: () => fetchJson(`${API_BASE}/customers`),
  createCustomer: (data) => fetchJson(`${API_BASE}/customers`, { method: "POST", body: JSON.stringify(data) }),
  updateCustomer: (id, data) => fetchJson(`${API_BASE}/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCustomer: (id) => fetchJson(`${API_BASE}/customers/${id}`, { method: "DELETE" }),

  // ── Warranties ────────────────────────────────────
  getWarranties: () => fetchJson(`${API_BASE}/warranties`),
  getWarrantyByImei: (imei) => fetchJson(`${API_BASE}/warranties/${imei}`),
  addWarrantyClaim: (imei, data) => fetchJson(`${API_BASE}/warranties/${imei}/claims`, { method: "POST", body: JSON.stringify(data) }),

  // ── Auth ──────────────────────────────────────────
  login: (data) => fetchJson(`${API_BASE}/auth/login`, { method: "POST", body: JSON.stringify(data) }),
  getUsers: () => fetchJson(`${API_BASE}/auth/users`),

  // ── Mobile Issues ─────────────────────────────────
  getMobileIssues: () => fetchJson(`${API_BASE}/issues`),
  addMobileIssue: (data) => fetchJson(`${API_BASE}/issues`, { method: "POST", body: JSON.stringify(data) }),
  updateMobileIssueStatus: (id, status) => fetchJson(`${API_BASE}/issues/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  deleteMobileIssue: (id) => fetchJson(`${API_BASE}/issues/${id}`, { method: "DELETE" }),

  // ── Expenses ──────────────────────────────────────
  getExpenses: () => fetchJson(`${API_BASE}/expenses`),
  createExpense: (data) => fetchJson(`${API_BASE}/expenses`, { method: "POST", body: JSON.stringify(data) }),
  updateExpense: (id, data) => fetchJson(`${API_BASE}/expenses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteExpense: (id) => fetchJson(`${API_BASE}/expenses/${id}`, { method: "DELETE" }),
};

