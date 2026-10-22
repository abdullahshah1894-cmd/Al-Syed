// Frontend API Service — talks to the Express backend.
// All data is persisted in Supabase PostgreSQL via the backend.
// Same origin by default (Vite proxies /api in dev, Express serves the app in production);
// set VITE_API_URL to point at a backend on another machine.

const API_BASE = `${import.meta.env.VITE_API_URL || ""}/api`;

export const TOKEN_KEY = "pos_token";
export const USER_KEY = "pos_user";

// The token is kept in memory too, so login still works when browser storage is blocked
let memoryToken = null;
export const setSessionToken = (token) => {
  memoryToken = token || null;
};

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || memoryToken;
  } catch {
    return memoryToken;
  }
};

// Throws on any failure (network down, 4xx/5xx) with the server's error message.
const request = async (url, options = {}) => {
  const token = readToken();
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });
  } catch (e) {
    throw new Error("Cannot reach the server. Check that the backend is running and you are online.", { cause: e });
  }
  // Session expired or missing: back to the login screen (not for the login call itself)
  if (res.status === 401 && !url.endsWith("/auth/login")) {
    memoryToken = null;
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // storage unavailable; the redirect still logs the user out
    }
    if (window.location.pathname !== "/login") window.location.href = "/login";
    throw new Error("Your session has expired. Please log in again.");
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
  addStock: (id, data) => send("POST", `${API_BASE}/products/${id}/stock`, data),

  // ── Sales ─────────────────────────────────────────
  getSales: () => fetchJson(`${API_BASE}/sales`),
  createSale: (data) => send("POST", `${API_BASE}/sales`, data),
  returnSaleItems: (id, data) => send("POST", `${API_BASE}/sales/${id}/returns`, data),
  updateSale: (id, data) => send("PUT", `${API_BASE}/sales/${id}`, data),
  deleteSale: (id) => send("DELETE", `${API_BASE}/sales/${id}`),
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
  login: (data) => send("POST", `${API_BASE}/auth/login`, data),
  getUsers: () => fetchJson(`${API_BASE}/auth/users`),
  createUser: (data) => send("POST", `${API_BASE}/auth/users`, data),

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

  // ── Suppliers ─────────────────────────────────────
  getSuppliers: () => fetchJson(`${API_BASE}/suppliers?withTransactions=1`),
  createSupplier: (data) => send("POST", `${API_BASE}/suppliers`, data),
  updateSupplier: (id, data) => send("PUT", `${API_BASE}/suppliers/${id}`, data),
  deleteSupplier: (id) => send("DELETE", `${API_BASE}/suppliers/${id}`),
  addSupplierPurchase: (id, data) => send("POST", `${API_BASE}/suppliers/${id}/purchases`, data),
  addSupplierPayment: (id, data) => send("POST", `${API_BASE}/suppliers/${id}/payments`, data),
  updateSupplierTransaction: (txId, data) => send("PUT", `${API_BASE}/suppliers/transactions/${txId}`, data),
  deleteSupplierTransaction: (txId) => send("DELETE", `${API_BASE}/suppliers/transactions/${txId}`),

  // ── Shop Settings ─────────────────────────────────
  getSettings: () => fetchJson(`${API_BASE}/settings`),
  updateSettings: (data) => send("PUT", `${API_BASE}/settings`, data),
};
