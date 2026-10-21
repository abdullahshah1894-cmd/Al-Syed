import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "../services/api";

const AppContext = createContext();

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
  const [backendOnline, setBackendOnline] = useState(false);

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
    minStockAlert: p.min_stock_alert || p.minStockAlert || 2,
    barcode: p.barcode || "",
    warrantyDuration: p.warranty_duration || p.warrantyDuration || 12,
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
    warrantyDuration: w.warranty_duration || w.warrantyDuration || 12,
    warrantyStartDate: w.warranty_start_date || w.warrantyStartDate,
    warrantyExpiryDate: w.warranty_expiry_date || w.warrantyExpiryDate,
    warrantyType: w.warranty_type || w.warrantyType,
    status: w.status || "Active",
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

  const normalizeExpense = (e) => ({
    id: e.id,
    title: e.title,
    amount: Number(e.amount || 0),
    category: e.category || "Other",
    description: e.description || "",
    sellerName: e.seller_name || "",
    paymentMethod: e.payment_method || "Cash",
    expenseDate: e.expense_date || e.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    createdAt: e.created_at || new Date().toISOString(),
  });

  // Tell the user plainly when something did not reach the database
  const notifyError = (what, err) => {
    console.error(`[AppContext] ${what} failed:`, err);
    alert(`${what} was NOT saved.\n\n${err.message}\n\nNothing was lost on screen — please try again.`);
  };

  const refreshProducts = async () => {
    const data = await api.getProducts();
    if (Array.isArray(data)) setProducts(data.map(normalizeProduct));
  };
  const refreshCustomers = async () => {
    const data = await api.getCustomers();
    if (Array.isArray(data)) setCustomers(data.map(normalizeCustomer));
  };
  const refreshWarranties = async () => {
    const data = await api.getWarranties();
    if (Array.isArray(data)) setWarranties(data.map(normalizeWarranty));
  };

  // Fetch all data from Supabase-backed backend
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [dbProducts, dbSales, dbCustomers, dbWarranties, dbIssues, dbExpenses, dbSettings] = await Promise.all([
          api.getProducts(),
          api.getSales(),
          api.getCustomers(),
          api.getWarranties(),
          api.getMobileIssues ? api.getMobileIssues() : Promise.resolve([]),
          api.getExpenses ? api.getExpenses() : Promise.resolve([]),
          api.getSettings(),
        ]);

        if (dbSettings && typeof dbSettings === "object" && Object.keys(dbSettings).length > 0) {
          setShopSettings((prev) => ({ ...prev, ...dbSettings }));
        }

        if (Array.isArray(dbProducts)) {
          setProducts(dbProducts.map(normalizeProduct));
          setBackendOnline(true);
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
  }, []);

  // Add new sale — saved to Supabase first; the screen only shows it once the database has it.
  // The backend marks IMEIs sold, reduces stock, creates warranties and updates the customer balance.
  const recordSale = async (newSaleData) => {
    const billNumber =
      newSaleData.billNumber ||
      `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(sales.length + 1).padStart(3, "0")}`;

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
      billNumber,
    };

    let saved;
    try {
      saved = await api.createSale(formattedSale);
    } catch (err) {
      notifyError(`Sale ${billNumber}`, err);
      return null;
    }

    const normalized = { ...formattedSale, ...normalizeSale(saved) };
    setSales((prev) => [normalized, ...prev]);
    await Promise.all([refreshProducts(), refreshCustomers(), refreshWarranties()]);
    return normalized;
  };

  // Add Product — shown only after Supabase saves it
  const addProduct = async (productData) => {
    const payload = {
      ...productData,
      barcode: productData.barcode || `888462${Math.floor(10000 + Math.random() * 90000)}`,
    };
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

  // Settle Customer Pending Payment — the backend lowers the balance when it saves the receipt
  const payPendingAmount = async (customerId, amountPaid, sellerName = "") => {
    const customer = customers.find((c) => c.id === customerId);

    if (customer) {
      const settlementRecord = {
        billNumber: `PAY-${Date.now().toString().slice(-6)}`,
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
        await refreshCustomers();
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
        expense_date: expenseData.expenseDate || new Date().toISOString().slice(0, 10),
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

  const [activeSeller, setActiveSeller] = useState("All Sellers");

  const filteredSales =
    activeSeller === "All Sellers" || activeSeller === "All"
      ? sales
      : sales.filter(
          (s) =>
            (s.sellerName || "").toLowerCase() === activeSeller.toLowerCase() ||
            (s.cashierName || "").toLowerCase() === activeSeller.toLowerCase()
        );

  const filteredCustomers =
    activeSeller === "All Sellers" || activeSeller === "All"
      ? customers
      : customers.filter(
          (c) =>
            (c.sellerName || "").toLowerCase() === activeSeller.toLowerCase() ||
            (c.name || "").toLowerCase().includes(activeSeller.toLowerCase()) ||
            sales.some(
              (s) =>
                (s.customerId === c.id || s.customer === c.id) &&
                ((s.sellerName || "").toLowerCase() === activeSeller.toLowerCase() ||
                  (s.cashierName || "").toLowerCase() === activeSeller.toLowerCase())
            )
        );

  const filteredExpenses =
    activeSeller === "All Sellers" || activeSeller === "All"
      ? expenses
      : expenses.filter((e) => (e.sellerName || "").toLowerCase() === activeSeller.toLowerCase());

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
        backendOnline,
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
