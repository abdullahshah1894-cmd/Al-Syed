/* eslint-disable react-refresh/only-export-components -- the provider, its hook and shared helpers live together on purpose */
import { createContext, useContext, useState, useEffect, useRef, useMemo } from "react";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";
import { localDate } from "../utils/dates";
import { itemImeis } from "../utils/sales";

// Warranty status from its expiry date: Expired, Expiring Soon (30 days), Active. Void stays Void.
const warrantyStatus = (w) => {
  if (w.status === "Void") return "Void";
  const expiry = w.warranty_expiry_date || w.warrantyExpiryDate;
  if (!expiry) return w.status || "Active";
  const today = localDate();
  if (expiry < today) return "Expired";
  if (expiry <= localDate(Date.now() + 30 * 24 * 60 * 60 * 1000)) return "Expiring Soon";
  return "Active";
};

const AppContext = createContext();

// Show a saved sale's effect on stock at once (units sold, quantity down); the background reload
// that follows replaces it with the server's numbers.
const applySaleToStock = (products, items) =>
  products.map((p) => {
    const lines = (items || []).filter((i) => (i.productId || i.product || i.id) === p.id);
    if (lines.length === 0) return p;
    const sold = new Set(lines.flatMap(itemImeis));
    if (sold.size > 0 && Array.isArray(p.imeis) && p.imeis.length > 0) {
      const imeis = p.imeis.map((u) =>
        u.status === "in_stock" && [u.imei, u.imei1, u.imei2].some((k) => k && sold.has(k)) ? { ...u, status: "sold" } : u
      );
      const left = imeis.filter((u) => u.status === "in_stock").length;
      return { ...p, imeis, quantity: left, stock: left };
    }
    const qty = lines.reduce((sum, i) => sum + Number(i.quantity || i.qty || 1), 0);
    const left = Math.max(0, Number(p.quantity || 0) - qty);
    return { ...p, quantity: left, stock: left };
  });

// Was this sale made by this seller (name in lower case)?
const soldBy = (s, seller) =>
  (s.sellerName || "").toLowerCase() === seller || (s.cashierName || "").toLowerCase() === seller;

// Move a customer's Udhaar by what a bill or receipt changed it (balance_effect from the server)
const applyBalanceEffect = (customers, customerId, effect) =>
  customerId && effect != null
    ? customers.map((c) => {
        if (c.id !== customerId) return c;
        const totalPending = Math.max(0, c.totalPending + Number(effect));
        return { ...c, totalPending, totalPaid: c.totalPurchases - totalPending };
      })
    : customers;

// The header's seller filter is remembered on this device across reloads
const SELLER_KEY = "alsyed.activeSeller";
const readSavedSeller = () => {
  try {
    return localStorage.getItem(SELLER_KEY) || "All Sellers";
  } catch {
    return "All Sellers";
  }
};

// The two hardcoded sellers for this shop
export const SELLERS = ["Aziz", "Mubashir"];

// Helper to determine accurate in-stock count for any product
export const getProductStock = (product) => {
  if (!product) return 0;
  if (product.imeis && Array.isArray(product.imeis) && product.imeis.length > 0) {
    return product.imeis.filter((i) => i.status === "in_stock").length;
  }
  return Number(product.quantity || 0);
};

export const AppProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [warranties, setWarranties] = useState([]);
  const [issues, setIssues] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [activeSeller, setActiveSellerState] = useState(readSavedSeller);
  const setActiveSeller = (name) => {
    setActiveSellerState(name);
    try {
      localStorage.setItem(SELLER_KEY, name);
    } catch {
      // storage blocked: the filter still works for this visit
    }
  };
  const [suppliers, setSuppliers] = useState([]);
  const [supplierTransactions, setSupplierTransactions] = useState([]);
  // Why the screens would be empty: null, "unreachable" (the server could not give the data) or "empty"
  const [dataProblem, setDataProblem] = useState(null);

  // Shop Settings
  const [shopSettings, setShopSettings] = useState({
    shopName: "Al-Syed Mobiles & Electronics",
    address: "Kohat Jinah plaza",
    phone: "03155300018",
    taxRate: 0,
    currencySymbol: "Rs.",
  });

// Normalize backend product field names → frontend camelCase
const normalizeProduct = (p) => {
  const imeis = p.imeis || [];
  const hasImeis = Array.isArray(imeis) && imeis.length > 0;
  const inStockCount = hasImeis ? imeis.filter((i) => i.status === "in_stock").length : null;
  const quantity = inStockCount !== null ? inStockCount : Number(p.quantity || 0);

  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    model: p.model,
    category: p.category,
    purchasePrice: Number(p.purchase_price || p.purchasePrice || 0),
    salePrice: Number(p.sale_price || p.salePrice || 0),
    quantity,
    stock: quantity,
    minStockAlert: Number(p.min_stock_alert ?? p.minStockAlert ?? 2),
    barcode: p.barcode || "",
    warrantyDuration: Number(p.warranty_duration ?? p.warrantyDuration ?? 12),
    warrantyType: p.warranty_type || p.warrantyType || "Official Brand Warranty",
    supplier: { name: p.supplier_name || "", phone: p.supplier_phone || "" },
    specs: p.specs || {},
    imeis,
    isDeleted: p.is_deleted || false,
    createdAt: p.created_at || new Date().toISOString(),
  };
};

  // Normalize backend sale → frontend camelCase
  const normalizeSale = (s) => ({
    id: s.id,
    billNumber: s.bill_number || s.billNumber,
    customer: s.customer_id || s.customer,
    customerId: s.customer_id || s.customerId || s.customer,
    customerName: s.customer_name || s.customerName || "Walk-in Customer",
    customerPhone: s.customer_phone || s.customerPhone,
    items: s.items || [],
    subtotalAmount: Number(s.subtotal_amount || s.subtotalAmount || 0),
    discountAmount: Number(s.discount_amount || s.discountAmount || 0),
    taxPercent: Number(s.tax_percent || s.taxPercent || 0),
    taxAmount: Number(s.tax_amount || s.taxAmount || 0),
    grandTotal: Number(s.grand_total || s.grandTotal || 0),
    paidAmount: Number(s.paid_amount || s.paidAmount || 0),
    dueAmount: Number(s.due_amount || s.dueAmount || 0),
    netProfit: Number(s.net_profit || s.netProfit || 0),
    paymentMethod: s.payment_method || s.paymentMethod || "Cash",
    paymentStatus: s.payment_status || s.paymentStatus || "paid",
    cashierName: s.cashier_name || s.cashierName,
    sellerName: s.seller_name || s.sellerName || s.cashier_name || s.cashierName || "",
    notes: s.notes || "",
    dueDate: s.due_date || s.dueDate || null,
    returns: s.returns || [],
    balanceEffect: s.balance_effect ?? null,
    updatedAt: s.updated_at || s.updatedAt || null,
    createdAt: s.created_at || s.createdAt || new Date().toISOString(),
  });

  // Normalize backend customer → frontend camelCase
  const normalizeCustomer = (c) => {
    const totalPurchases = Number(c.total_purchases || c.totalPurchases || 0);
    const totalPending = Number(c.outstanding_balance || c.totalPending || 0);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      cnic: c.cnic || "",
      sellerName: c.seller_name || c.sellerName || "",
      totalPurchases,
      totalPending,
      totalPaid: totalPurchases - totalPending,
      sales: c.sales || [],
      createdAt: c.created_at || new Date().toISOString(),
    };
  };

  // Normalize backend warranty → frontend camelCase
  const normalizeWarranty = (w) => ({
    id: w.id,
    imei: w.imei,
    product: w.product_id || w.product,
    productName: w.product_name || w.productName,
    brand: w.brand,
    model: w.model,
    customerName: w.customer_name || w.customerName,
    customerPhone: w.customer_phone || w.customerPhone,
    purchaseDate: w.purchase_date || w.purchaseDate,
    warrantyDuration: Number(w.warranty_duration ?? w.warrantyDuration ?? 12),
    warrantyStartDate: w.warranty_start_date || w.warrantyStartDate,
    warrantyExpiryDate: w.warranty_expiry_date || w.warrantyExpiryDate,
    warrantyType: w.warranty_type || w.warrantyType,
    status: warrantyStatus(w),
    claims: w.claims || [],
    createdAt: w.created_at || new Date().toISOString(),
  });

  const normalizeIssue = (i) => ({
    id: i.id,
    ticketNumber: i.ticket_number,
    customerName: i.customer_name,
    imei: i.imei,
    phoneIssue: i.phone_issue,
    companyName: i.company_name,
    status: i.status,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  });

  const normalizeSupplier = (s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone || "",
    company: s.company || "",
    address: s.address || "",
    notes: s.notes || "",
    openingBalance: Number(s.opening_balance || 0),
    totalPurchased: Number(s.total_purchased || 0),
    totalPaid: Number(s.total_paid || 0),
    balance: Number(s.balance || 0),
    lastActivity: s.last_activity || "",
    createdAt: s.created_at,
  });

  const normalizeSupplierTx = (t) => ({
    id: t.id,
    supplierId: t.supplier_id,
    type: t.type,
    date: t.date,
    invoiceNumber: t.invoice_number || "",
    items: t.items || [],
    total: Number(t.total || 0),
    paid: Number(t.paid || 0),
    notes: t.notes || "",
    stockAdded: !!t.stock_added,
    createdAt: t.created_at,
  });

  const normalizeExpense = (e) => ({
    id: e.id,
    title: e.title,
    amount: Number(e.amount || 0),
    category: e.category || "Other",
    description: e.description || "",
    sellerName: e.seller_name || "",
    paymentMethod: e.payment_method || "Cash",
    expenseDate: e.expense_date || (e.created_at ? localDate(e.created_at) : localDate()),
    createdAt: e.created_at || new Date().toISOString(),
  });

  // Tell the user plainly when something did not reach the database
  const notifyError = (what, err) => {
    console.error(`[AppContext] ${what} failed:`, err);
    alert(`${what} was NOT saved.\n\n${err.message}\n\nNothing was lost on screen — please try again.`);
  };

  // The same save tapped twice while the first is still on its way returns the first one's
  // result instead of saving a second copy (double receipts, double bills).
  const inFlight = useRef(new Map());
  const once = (key, run) => {
    if (inFlight.current.has(key)) return inFlight.current.get(key);
    const promise = run().finally(() => inFlight.current.delete(key));
    inFlight.current.set(key, promise);
    return promise;
  };

  const requestSeq = useRef({ products: 0, customers: 0, warranties: 0, suppliers: 0 });
  const latestOnly = async (key, load, apply) => {
    const seq = ++requestSeq.current[key];
    const data = await load();
    if (seq === requestSeq.current[key]) apply(data);
  };
  const refreshProducts = () =>
    latestOnly("products", api.getProducts, (data) => Array.isArray(data) && setProducts(data.map(normalizeProduct)));
  const refreshCustomers = () =>
    latestOnly("customers", api.getCustomers, (data) => Array.isArray(data) && setCustomers(data.map(normalizeCustomer)));
  const refreshWarranties = () =>
    latestOnly("warranties", api.getWarranties, (data) => Array.isArray(data) && setWarranties(data.map(normalizeWarranty)));
  // After a save the screen is ready at once; the full lists catch up from the server behind it
  const refreshInBackground = (...refreshers) => {
    Promise.all(refreshers.map((r) => r())).catch((e) => console.warn("[AppContext] Background reload failed:", e.message));
  };

  // Fetch all data from Supabase-backed backend once someone is logged in; clear it on logout
  const { token, isAdmin } = useAuth();
  const [dataToken, setDataToken] = useState(token);
  if (dataToken !== token) {
    setDataToken(token);
    if (!token) {
      setProducts([]);
      setSales([]);
      setCustomers([]);
      setWarranties([]);
      setIssues([]);
      setExpenses([]);
      setSuppliers([]);
      setSupplierTransactions([]);
      setActiveSeller("All Sellers");
      setDataProblem(null);
    }
  }
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchAllData = async () => {
      try {
        const [dbProducts, dbSales, dbCustomers, dbWarranties, dbIssues, dbExpenses, dbSettings, dbSuppliers] = await Promise.all([
          api.getProducts(),
          api.getSales(),
          api.getCustomers(),
          api.getWarranties(),
          api.getMobileIssues ? api.getMobileIssues() : Promise.resolve([]),
          api.getExpenses ? api.getExpenses() : Promise.resolve([]),
          api.getSettings(),
          // Suppliers are owner-only on the server; a cashier would only get "not allowed"
          isAdmin ? api.getSuppliers() : Promise.resolve(null),
        ]);
        if (cancelled) return;

        if (dbSuppliers && Array.isArray(dbSuppliers.suppliers)) {
          setSuppliers(dbSuppliers.suppliers.map(normalizeSupplier));
          setSupplierTransactions((dbSuppliers.transactions || []).map(normalizeSupplierTx));
        }
        if (dbSettings && typeof dbSettings === "object" && Object.keys(dbSettings).length > 0) {
          setShopSettings((prev) => ({ ...prev, ...dbSettings }));
        }

        const main = [dbProducts, dbSales, dbCustomers];
        if (main.some((list) => !Array.isArray(list))) setDataProblem("unreachable");
        else if (main.every((list) => list.length === 0)) setDataProblem("empty");
        else setDataProblem(null);

        if (Array.isArray(dbProducts)) {
          setProducts(dbProducts.map(normalizeProduct));
        }
        if (Array.isArray(dbSales)) {
          setSales(dbSales.map(normalizeSale));
        }
        if (Array.isArray(dbCustomers)) {
          const loadedCusts = dbCustomers.map(normalizeCustomer);
          setCustomers(loadedCusts);
        }
        if (Array.isArray(dbWarranties)) {
          setWarranties(dbWarranties.map(normalizeWarranty));
        }
        if (Array.isArray(dbIssues)) {
          setIssues(dbIssues.map(normalizeIssue));
        }
        if (Array.isArray(dbExpenses)) {
          setExpenses(dbExpenses.map(normalizeExpense));
        }
      } catch (e) {
        console.warn("[AppContext] Backend sync failed, using local state:", e.message);
      }
    };
    fetchAllData();
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin]);

  // Add new sale — saved to Supabase first; the screen only shows it once the database has it.
  // The backend marks IMEIs sold, reduces stock, creates warranties and updates the customer balance.
  const recordSale = (newSaleData) =>
    once(`sale:${JSON.stringify([newSaleData.customer || newSaleData.customerId || "", newSaleData.items, newSaleData.grandTotal, newSaleData.paidAmount])}`, () =>
      saveSale(newSaleData)
    );
  const saveSale = async (newSaleData) => {
    // Carry each item's cost so profit is stored with the sale
    const items = (newSaleData.items || []).map((item) => {
      const prod = products.find((p) => p.id === (item.productId || item.product || item.id));
      const unitPurchasePrice = Number(item.unitPurchasePrice ?? prod?.purchasePrice ?? 0);
      return { ...item, unitPurchasePrice };
    });
    const cost = items.reduce((sum, i) => sum + i.unitPurchasePrice * Number(i.quantity || i.qty || 1), 0);

    const formattedSale = {
      ...newSaleData,
      items,
      netProfit: newSaleData.netProfit || Number(newSaleData.grandTotal || 0) - cost,
      customerId: newSaleData.customer || newSaleData.customerId || null,
      customerName: newSaleData.customerName || "Walk-in Customer",
      sellerName: newSaleData.sellerName || newSaleData.cashierName || "",
    };
    delete formattedSale.billNumber;

    let saved;
    try {
      saved = await api.createSale(formattedSale);
    } catch (err) {
      notifyError("Sale", err);
      return null;
    }

    const normalized = { ...formattedSale, ...normalizeSale(saved) };
    setSales((prev) => [normalized, ...prev]);
    setProducts((prev) => applySaleToStock(prev, saved.items || items));
    setCustomers((prev) => applyBalanceEffect(prev, saved.customer_id, saved.balance_effect));
    refreshInBackground(refreshProducts, refreshCustomers, refreshWarranties);
    return normalized;
  };

  // Add Product — shown only after Supabase saves it
  const addProduct = async (productData) => {
    // Left blank, the database gives the product the next unique barcode
    const payload = { ...productData, barcode: String(productData.barcode || "").trim() };
    try {
      const saved = await api.createProduct(payload);
      const normalized = normalizeProduct(saved);
      setProducts((prev) => [normalized, ...prev]);
      return normalized;
    } catch (err) {
      notifyError(`Product "${productData.name}"`, err);
      return null;
    }
  };

  // Update Product — saves to Supabase
  const updateProduct = async (id, updatedFields) => {
    try {
      const saved = await api.updateProduct(id, updatedFields);
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? (saved && saved.id ? normalizeProduct(saved) : { ...p, ...updatedFields }) : p))
      );
      return true;
    } catch (err) {
      notifyError("Product update", err);
      return false;
    }
  };

  // Delete Product — soft delete in Supabase
  const deleteProduct = async (id) => {
    try {
      await api.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (err) {
      notifyError("Product delete", err);
      return false;
    }
  };

  // Add Customer — shown only after Supabase saves it (with seller association)
  const addCustomer = async (customerData) => {
    try {
      const saved = await api.createCustomer({
        name: customerData.name,
        phone: customerData.phone,
        email: customerData.email,
        address: customerData.address,
        cnic: customerData.cnic,
        seller_name: customerData.sellerName || customerData.seller_name || null,
      });
      const normalized = normalizeCustomer(saved);
      setCustomers((prev) => [normalized, ...prev]);
      return normalized;
    } catch (err) {
      notifyError(`Customer "${customerData.name}"`, err);
      return null;
    }
  };

  // Edit a customer's details (never the balance — only sales and payments change that)
  const updateCustomer = async (id, data) => {
    try {
      const saved = await api.updateCustomer(id, {
        name: data.name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        cnic: data.cnic,
        seller_name: data.sellerName ?? data.seller_name,
      });
      const normalized = normalizeCustomer(saved);
      setCustomers((prev) => prev.map((c) => (c.id === id ? normalized : c)));
      return normalized;
    } catch (err) {
      notifyError("Customer update", err);
      return null;
    }
  };

  // Soft-delete a customer (their sales stay)
  const deleteCustomer = async (id) => {
    try {
      await api.deleteCustomer(id);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      return true;
    } catch (err) {
      notifyError("Customer delete", err);
      return false;
    }
  };

  // Restock: add new IMEI units ([{imei, imei1, imei2, ptaStatus}]) or a quantity for non-IMEI items.
  // The server appends to the current stock, so units sold meanwhile are never put back in stock.
  const addStock = async (productId, { imeis = [], quantity = 0 } = {}) => {
    try {
      const saved = await api.addStock(productId, { imeis, quantity });
      const normalized = normalizeProduct(saved);
      setProducts((prev) => prev.map((p) => (p.id === productId ? normalized : p)));
      return normalized;
    } catch (err) {
      notifyError("Stock update", err);
      return null;
    }
  };

  // Log a warranty claim ({ issue, claimType, status, notes })
  const addWarrantyClaim = async (imei, claim) => {
    try {
      const saved = await api.addWarrantyClaim(imei, claim);
      const normalized = normalizeWarranty(saved);
      setWarranties((prev) => prev.map((w) => (w.id === normalized.id ? normalized : w)));
      return normalized;
    } catch (err) {
      notifyError("Warranty claim", err);
      return null;
    }
  };

  // Move a claim along: { status, notes }
  const updateWarrantyClaim = async (imei, claimId, data) => {
    try {
      const saved = await api.updateWarrantyClaim(imei, claimId, data);
      const normalized = normalizeWarranty(saved);
      setWarranties((prev) => prev.map((w) => (w.id === normalized.id ? normalized : w)));
      return normalized;
    } catch (err) {
      notifyError("Claim update", err);
      return null;
    }
  };

  // Settle Customer Pending Payment — the backend lowers the balance when it saves the receipt
  const payPendingAmount = (customerId, amountPaid, sellerName = "") =>
    once(`pay:${customerId}:${Number(amountPaid)}`, () => savePayment(customerId, amountPaid, sellerName));
  const savePayment = async (customerId, amountPaid, sellerName = "") => {
    const customer = customers.find((c) => c.id === customerId);

    if (customer) {
      const settlementRecord = {
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        sellerName: sellerName || customer.sellerName || "",
        items: [],
        subtotalAmount: 0,
        discountAmount: 0,
        taxPercent: 0,
        taxAmount: 0,
        grandTotal: 0,
        paidAmount: Number(amountPaid),
        dueAmount: 0,
        netProfit: 0,
        paymentMethod: "Udhaar Settlement",
        paymentStatus: "paid",
        notes: `Received payment of Rs.${amountPaid} for Udhaar balance.`,
      };

      try {
        const recorded = await api.createSale(settlementRecord);
        const normalized = normalizeSale(recorded);
        setSales((prev) => [normalized, ...prev]);
        setCustomers((prev) => applyBalanceEffect(prev, recorded.customer_id, recorded.balance_effect));
        refreshInBackground(refreshCustomers);
        return normalized;
      } catch (err) {
        notifyError(`Payment of Rs.${amountPaid} from ${customer.name}`, err);
        return null;
      }
    }
    return null;
  };

  // ── Expense Actions ────────────────────────────────────────────────────────
  const addExpense = async (expenseData) => {
    try {
      const saved = await api.createExpense({
        title: expenseData.title,
        amount: expenseData.amount,
        category: expenseData.category || "Other",
        description: expenseData.description || null,
        seller_name: expenseData.sellerName || null,
        payment_method: expenseData.paymentMethod || "Cash",
        expense_date: expenseData.expenseDate || localDate(),
      });
      const normalized = normalizeExpense(saved);
      setExpenses((prev) => [normalized, ...prev]);
      return normalized;
    } catch (err) {
      notifyError(`Expense "${expenseData.title}"`, err);
      return null;
    }
  };

  const updateExpense = async (id, data) => {
    try {
      const saved = await api.updateExpense(id, {
        title: data.title,
        amount: data.amount,
        category: data.category,
        description: data.description,
        seller_name: data.sellerName,
        payment_method: data.paymentMethod,
        expense_date: data.expenseDate,
      });
      setExpenses((prev) => prev.map((e) => (e.id === id ? normalizeExpense(saved) : e)));
      return true;
    } catch (err) {
      notifyError("Expense update", err);
      return false;
    }
  };

  const deleteExpense = async (id) => {
    try {
      await api.deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      return true;
    } catch (err) {
      notifyError("Expense delete", err);
      return false;
    }
  };

  // ── Mobile Issues Actions ──────────────────────────────────────────────────
  const addIssue = async (data) => {
    try {
      const newIssue = await api.addMobileIssue(data);
      setIssues((prev) => [normalizeIssue(newIssue), ...prev]);
      return normalizeIssue(newIssue);
    } catch (err) {
      notifyError("Repair ticket", err);
      return null;
    }
  };

  const updateIssueStatus = async (id, status) => {
    try {
      const updated = await api.updateMobileIssueStatus(id, status);
      setIssues((prev) => prev.map((i) => (i.id === id ? normalizeIssue(updated) : i)));
      return true;
    } catch (err) {
      notifyError("Repair status change", err);
      return false;
    }
  };

  const deleteIssue = async (id) => {
    try {
      await api.deleteMobileIssue(id);
      setIssues((prev) => prev.filter((i) => i.id !== id));
      return true;
    } catch (err) {
      notifyError("Repair ticket delete", err);
      return false;
    }
  };

  // ── Bill returns / edit / delete ───────────────────────────────────────────
  // The server changes stock, the bill, warranties and the customer balance together;
  // afterwards the affected lists are reloaded from the database.
  const afterBillChange = (saved) => {
    if (saved && saved.id) {
      const normalized = normalizeSale(saved);
      setSales((prev) =>
        saved.is_deleted ? prev.filter((x) => x.id !== saved.id) : prev.map((x) => (x.id === saved.id ? normalized : x))
      );
    }
    refreshInBackground(refreshProducts, refreshCustomers, refreshWarranties);
  };

  // items: [{ index, qty, imeis }] — index is the item position on the bill
  const returnSaleItems = async (saleId, items, note = "") => {
    try {
      const saved = await api.returnSaleItems(saleId, { items, note });
      afterBillChange(saved);
      return normalizeSale(saved);
    } catch (err) {
      notifyError("Return", err);
      return null;
    }
  };

  // data: { customerName, customerPhone, sellerName, notes, dueDate, discountAmount, paidAmount, rates: [{index, unitSalePrice}] }
  const updateSale = async (saleId, data) => {
    try {
      const saved = await api.updateSale(saleId, data);
      afterBillChange(saved);
      return normalizeSale(saved);
    } catch (err) {
      notifyError("Bill update", err);
      return null;
    }
  };

  // Deletes a bill as if it never happened: stock back, its Udhaar off, payment reversed
  const deleteSale = async (saleId) => {
    try {
      const saved = await api.deleteSale(saleId);
      afterBillChange({ ...saved, is_deleted: true });
      return true;
    } catch (err) {
      notifyError("Bill delete", err);
      return false;
    }
  };

  // ── Suppliers ──────────────────────────────────────────────────────────────
  const refreshSuppliers = async () => {
    const data = await api.getSuppliers();
    if (data && Array.isArray(data.suppliers)) {
      setSuppliers(data.suppliers.map(normalizeSupplier));
      setSupplierTransactions((data.transactions || []).map(normalizeSupplierTx));
    }
  };

  const toSupplierPayload = (d) => ({
    name: d.name,
    phone: d.phone,
    company: d.company,
    address: d.address,
    notes: d.notes,
    opening_balance: d.openingBalance,
  });

  const addSupplier = async (data) => {
    try {
      const saved = await api.createSupplier(toSupplierPayload(data));
      await refreshSuppliers();
      return normalizeSupplier(saved);
    } catch (err) {
      notifyError(`Supplier "${data.name}"`, err);
      return null;
    }
  };

  const updateSupplier = async (id, data) => {
    try {
      await api.updateSupplier(id, toSupplierPayload(data));
      await refreshSuppliers();
      return true;
    } catch (err) {
      notifyError("Supplier update", err);
      return false;
    }
  };

  const deleteSupplier = async (id) => {
    try {
      await api.deleteSupplier(id);
      await refreshSuppliers();
      return true;
    } catch (err) {
      notifyError("Supplier delete", err);
      return false;
    }
  };

  // data: { date, invoiceNumber, notes, paid, total, addToStock, items: [{ productId?, name, brand, model,
  //   category, quantity, imeis: [{imei1, imei2, ptaStatus}], costPrice, salePrice, warrantyDuration, warrantyType }] }
  const addSupplierPurchase = async (supplierId, data) => {
    try {
      const saved = await api.addSupplierPurchase(supplierId, data);
      await refreshSuppliers();
      refreshInBackground(refreshProducts);
      return normalizeSupplierTx(saved);
    } catch (err) {
      notifyError("Purchase", err);
      return null;
    }
  };

  // data: { amount, date, notes, reference }
  const addSupplierPayment = async (supplierId, data) => {
    try {
      const saved = await api.addSupplierPayment(supplierId, data);
      await refreshSuppliers();
      return normalizeSupplierTx(saved);
    } catch (err) {
      notifyError("Supplier payment", err);
      return null;
    }
  };

  // data: { date, invoiceNumber, notes, paid, total }
  const updateSupplierTransaction = async (txId, data) => {
    try {
      await api.updateSupplierTransaction(txId, data);
      await refreshSuppliers();
      return true;
    } catch (err) {
      notifyError("Supplier entry update", err);
      return false;
    }
  };

  const deleteSupplierTransaction = async (txId) => {
    try {
      await api.deleteSupplierTransaction(txId);
      await refreshSuppliers();
      return true;
    } catch (err) {
      notifyError("Supplier entry delete", err);
      return false;
    }
  };

  // ── Shop Settings ──────────────────────────────────────────────────────────
  const saveShopSettings = async (newSettings) => {
    try {
      const saved = await api.updateSettings(newSettings);
      setShopSettings((prev) => ({ ...prev, ...saved }));
      return true;
    } catch (err) {
      notifyError("Shop settings", err);
      return false;
    }
  };


  // The header's seller filter. Worked out only when the lists or the seller change, so pages that
  // memoise on these lists do not redo their work on every render.
  const sellerKey = activeSeller === "All Sellers" || activeSeller === "All" ? "" : activeSeller.toLowerCase();

  const filteredSales = useMemo(() => (sellerKey ? sales.filter((s) => soldBy(s, sellerKey)) : sales), [sales, sellerKey]);

  const filteredCustomers = useMemo(() => {
    if (!sellerKey) return customers;
    const soldTo = new Set(sales.filter((s) => soldBy(s, sellerKey)).map((s) => s.customerId || s.customer).filter(Boolean));
    return customers.filter((c) => (c.sellerName || "").toLowerCase() === sellerKey || soldTo.has(c.id));
  }, [customers, sales, sellerKey]);

  const filteredExpenses = useMemo(
    () => (sellerKey ? expenses.filter((e) => (e.sellerName || "").toLowerCase() === sellerKey) : expenses),
    [expenses, sellerKey]
  );

  return (
    <AppContext.Provider
      value={{
        products,
        setProducts,
        customers: filteredCustomers,
        allCustomers: customers,
        setCustomers,
        sales: filteredSales,
        allSales: sales,
        setSales,
        warranties,
        setWarranties,
        issues,
        expenses: filteredExpenses,
        allExpenses: expenses,
        setExpenses,
        shopSettings,
        setShopSettings,
        saveShopSettings,
        activeSeller,
        setActiveSeller,
        dataProblem,
        recordSale,
        addProduct,
        updateProduct,
        deleteProduct,
        addCustomer,
        payPendingAmount,
        addExpense,
        updateExpense,
        deleteExpense,
        addIssue,
        updateIssueStatus,
        deleteIssue,
        updateCustomer,
        deleteCustomer,
        addStock,
        addWarrantyClaim,
        updateWarrantyClaim,
        refreshProducts,
        refreshCustomers,
        returnSaleItems,
        updateSale,
        deleteSale,
        suppliers,
        supplierTransactions,
        refreshSuppliers,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        addSupplierPurchase,
        addSupplierPayment,
        updateSupplierTransaction,
        deleteSupplierTransaction,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
