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

  // Fetch all data from Supabase-backed backend
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [dbProducts, dbSales, dbCustomers, dbWarranties, dbIssues, dbExpenses] = await Promise.all([
          api.getProducts(),
          api.getSales(),
          api.getCustomers(),
          api.getWarranties(),
          api.getMobileIssues ? api.getMobileIssues() : Promise.resolve([]),
          api.getExpenses ? api.getExpenses() : Promise.resolve([]),
        ]);

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

  // Add new sale — saves to Supabase & updates local state
  const recordSale = async (newSaleData) => {
    const saleId = `s_${Date.now()}`;
    const billNumber =
      newSaleData.billNumber ||
      `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(sales.length + 1).padStart(3, "0")}`;

    const formattedSale = {
      ...newSaleData,
      id: saleId,
      customerId: newSaleData.customer || newSaleData.customerId || null,
      customerName: newSaleData.customerName || "Walk-in Customer",
      sellerName: newSaleData.sellerName || newSaleData.cashierName || "",
      billNumber,
      createdAt: new Date().toISOString(),
    };

    // Optimistic update
    setSales((prev) => [formattedSale, ...prev]);

    // Update products IMEI status and stock quantity locally
    setProducts((prevProducts) =>
      prevProducts.map((prod) => {
        const soldItemsForProd = (newSaleData.items || []).filter(
          (item) => item.product === prod.id || item.productId === prod.id || item.id === prod.id
        );
        if (soldItemsForProd.length === 0) return prod;

        let updatedQuantity = Number(prod.quantity || 0);
        let updatedImeis = [...(prod.imeis || [])];

        soldItemsForProd.forEach((soldItem) => {
          const qty = Number(soldItem.quantity || soldItem.qty || 1);
          let imeiList =
            soldItem.imeisArray && soldItem.imeisArray.length > 0
              ? [...soldItem.imeisArray]
              : soldItem.imei
              ? [soldItem.imei]
              : [];

          // If product has IMEIs but none provided in the sale item, auto-take first N in-stock IMEIs
          if (imeiList.length === 0 && updatedImeis.length > 0) {
            const inStock = updatedImeis.filter((i) => i.status === "in_stock");
            const take = inStock.slice(0, qty);
            imeiList = take.map((i) => i.imei || i.imei1 || i.imei2).filter(Boolean);
          }

          if (updatedImeis.length > 0 && imeiList.length > 0) {
            updatedImeis = updatedImeis.map((imObj) => {
              const isSold = imeiList.some(
                (im) => im === imObj.imei || im === imObj.imei1 || im === imObj.imei2
              );
              return isSold
                ? { ...imObj, status: "sold", soldInSale: billNumber, soldAt: new Date().toISOString() }
                : imObj;
            });
            updatedQuantity = updatedImeis.filter((i) => i.status === "in_stock").length;

            // Auto-create warranty locally
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + (prod.warrantyDuration || 12));

            imeiList.forEach((imeiStr) => {
              const newWarranty = {
                id: `w_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                imei: imeiStr,
                product: prod.id,
                productName: prod.name,
                brand: prod.brand,
                model: prod.model,
                customerName: newSaleData.customerName,
                customerPhone: newSaleData.customerPhone,
                purchaseDate: new Date().toISOString().slice(0, 10),
                warrantyDuration: prod.warrantyDuration || 12,
                warrantyStartDate: new Date().toISOString().slice(0, 10),
                warrantyExpiryDate: expiryDate.toISOString().slice(0, 10),
                warrantyType: prod.warrantyType || "Official Brand Warranty",
                status: "Active",
                claims: [],
              };
              setWarranties((prevW) => [newWarranty, ...prevW]);
            });
          } else {
            updatedQuantity = Math.max(0, updatedQuantity - qty);
          }
        });

        return { ...prod, quantity: updatedQuantity, stock: updatedQuantity, imeis: updatedImeis };
      })
    );

    // Persist to Supabase backend & refresh products from server
    api.createSale(formattedSale).then(async (saved) => {
      if (saved) {
        setSales((prev) => prev.map((s) => (s.id === saleId ? normalizeSale(saved) : s)));
        try {
          const freshProducts = await api.getProducts();
          if (Array.isArray(freshProducts)) {
            setProducts(freshProducts.map(normalizeProduct));
          }
        } catch (_) {}
      }
    });

    // Update customer balance locally
    if (newSaleData.customer || newSaleData.customerId) {
      const custId = newSaleData.customer || newSaleData.customerId;
      const isCredit = (newSaleData.paymentMethod || "").toLowerCase().includes("credit") ||
        (newSaleData.paymentMethod || "").toLowerCase().includes("udhaar") ||
        (newSaleData.paymentMethod || "") === "Pending Bill";

      setCustomers((prevCusts) =>
        prevCusts.map((cust) => {
          if (cust.id === custId) {
            const saleTotal = Number(newSaleData.grandTotal || 0);
            const paidNow = Number(newSaleData.paidAmount || 0);
            const totalPurchases = Number(cust.totalPurchases || 0) + saleTotal;

            let totalPaid, newPending;
            if (isCredit) {
              const addedPending = Math.max(0, saleTotal - paidNow);
              totalPaid = Number(cust.totalPaid || 0) + paidNow;
              newPending = Number(cust.totalPending || 0) + addedPending;
            } else {
              totalPaid = Number(cust.totalPaid || 0) + saleTotal;
              newPending = Number(cust.totalPending || 0);
            }

            // Sync with backend immediately
            api.updateCustomer(cust.id, {
              total_purchases: totalPurchases,
              outstanding_balance: newPending,
            });

            return { ...cust, totalPurchases, totalPaid, totalPending: newPending };
          }
          return cust;
        })
      );
    }

    return formattedSale;
  };

  // Add Product — saves to Supabase
  const addProduct = async (productData) => {
    const newProd = {
      ...productData,
      id: `p_${Date.now()}`,
      barcode: productData.barcode || `888462${Math.floor(10000 + Math.random() * 90000)}`,
    };
    setProducts((prev) => [newProd, ...prev]);

    api.createProduct(productData).then((saved) => {
      if (saved) {
        setProducts((prev) => prev.map((p) => (p.id === newProd.id ? normalizeProduct(saved) : p)));
      }
    });
    return newProd;
  };

  // Update Product — saves to Supabase
  const updateProduct = (id, updatedFields) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updatedFields } : p)));
    api.updateProduct(id, updatedFields);
  };

  // Delete Product — soft delete in Supabase
  const deleteProduct = (id) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    api.deleteProduct(id);
  };

  // Add Customer — saves to Supabase (with seller association)
  const addCustomer = async (customerData) => {
    const newCust = {
      ...customerData,
      id: `c_${Date.now()}`,
      totalPurchases: 0,
      totalPaid: 0,
      totalPending: 0,
      sellerName: customerData.sellerName || customerData.seller_name || "",
      sales: [],
    };
    setCustomers((prev) => [newCust, ...prev]);

    api.createCustomer({
      name: customerData.name,
      phone: customerData.phone,
      email: customerData.email,
      address: customerData.address,
      cnic: customerData.cnic,
      seller_name: customerData.sellerName || customerData.seller_name || null,
    }).then((saved) => {
      if (saved) {
        setCustomers((prev) => prev.map((c) => (c.id === newCust.id ? normalizeCustomer(saved) : c)));
      }
    });
    return newCust;
  };

  // Settle Customer Pending Payment
  const payPendingAmount = async (customerId, amountPaid, sellerName = "") => {
    let updatedCustomer = null;

    // 1. Update Customer Locally
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id === customerId) {
          const newPaid = (c.totalPaid || 0) + Number(amountPaid);
          updatedCustomer = { ...c, totalPaid: newPaid, totalPending: Math.max(0, (c.totalPurchases || 0) - newPaid) };
          return updatedCustomer;
        }
        return c;
      })
    );

    if (updatedCustomer) {
      // 2. Persist Customer Balance in Supabase
      api.updateCustomer(updatedCustomer.id, {
        outstanding_balance: updatedCustomer.totalPending,
      });

      // 3. Record Payment History as a Settlement Receipt in Sales
      const settlementRecord = {
        billNumber: `PAY-${Date.now().toString().slice(-6)}`,
        customerId: updatedCustomer.id,
        customerName: updatedCustomer.name,
        customerPhone: updatedCustomer.phone,
        sellerName: sellerName || updatedCustomer.sellerName || "",
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

      const recorded = await api.createSale(settlementRecord);
      if (recorded) {
        const normalized = normalizeSale(recorded);
        setSales(prev => [normalized, ...prev]);
        return normalized;
      }
      return settlementRecord;
    }
    return null;
  };

  // ── Expense Actions ────────────────────────────────────────────────────────
  const addExpense = async (expenseData) => {
    const tempId = `exp_${Date.now()}`;
    const newExpense = { ...normalizeExpense({ ...expenseData, id: tempId, created_at: new Date().toISOString() }) };
    setExpenses((prev) => [newExpense, ...prev]);

    const saved = await api.createExpense({
      title: expenseData.title,
      amount: expenseData.amount,
      category: expenseData.category || "Other",
      description: expenseData.description || null,
      seller_name: expenseData.sellerName || null,
      payment_method: expenseData.paymentMethod || "Cash",
      expense_date: expenseData.expenseDate || new Date().toISOString().slice(0, 10),
    });
    if (saved) {
      setExpenses((prev) => prev.map((e) => (e.id === tempId ? normalizeExpense(saved) : e)));
      return normalizeExpense(saved);
    }
    return newExpense;
  };

  const updateExpense = async (id, data) => {
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...data } : e)));
    const saved = await api.updateExpense(id, {
      title: data.title,
      amount: data.amount,
      category: data.category,
      description: data.description,
      seller_name: data.sellerName,
      payment_method: data.paymentMethod,
      expense_date: data.expenseDate,
    });
    if (saved) {
      setExpenses((prev) => prev.map((e) => (e.id === id ? normalizeExpense(saved) : e)));
    }
  };

  const deleteExpense = async (id) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    await api.deleteExpense(id);
  };

  // ── Mobile Issues Actions ──────────────────────────────────────────────────
  const addIssue = async (data) => {
    const newIssue = await api.addMobileIssue(data);
    if (newIssue) {
      setIssues((prev) => [normalizeIssue(newIssue), ...prev]);
      return normalizeIssue(newIssue);
    }
    return null;
  };

  const updateIssueStatus = async (id, status) => {
    const updated = await api.updateMobileIssueStatus(id, status);
    if (updated) {
      setIssues((prev) => prev.map((i) => (i.id === id ? normalizeIssue(updated) : i)));
      return true;
    }
    return false;
  };

  const deleteIssue = async (id) => {
    const res = await api.deleteMobileIssue(id);
    if (res) {
      setIssues((prev) => prev.filter((i) => i.id !== id));
      return true;
    }
    return false;
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
