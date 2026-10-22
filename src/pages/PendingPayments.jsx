import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, SELLERS } from "../context/AppContext";
import { formatWAPhone, shareImageToWhatsApp } from "../utils/shareImage";
import { printElement } from "../services/printReceipt";
import { isSettlement, itemImeis, saleBelongsTo, udhaarAdded as saleUdhaar } from "../utils/sales";
import {
  Clock,
  CheckCircle2,
  DollarSign,
  Calendar,
  User,
  Search,
  X,
  Printer,
  Smartphone,
  FileText,
  ShoppingBag,
  ArrowUpRight,
  Filter,
  Users,
  Tag,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";

// Helper to format date with day of the week
const formatDateWithDay = (dateStr) => {
  if (!dateStr) return { day: "—", date: "—", time: "—", full: "—" };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { day: "—", date: String(dateStr), time: "—", full: String(dateStr) };

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[d.getDay()];

  const dateFormatted = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const timeFormatted = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return {
    day: dayName,
    date: dateFormatted,
    time: timeFormatted,
    full: `${dayName}, ${dateFormatted} at ${timeFormatted}`,
  };
};

// Return state of one bill line: how much is sold, how much already came back, what is left
const lineReturnInfo = (item) => {
  const qty = Number(item.quantity || item.qty || 1);
  const imeis = itemImeis(item);
  const returnedImeis = Array.isArray(item.returnedImeis) ? item.returnedImeis : [];
  const isPhone = imeis.length > 0;
  const returnedCount = Math.min(qty, Math.max(Number(item.returnedQty || 0), returnedImeis.length));
  const remainingImeis = imeis.filter((im) => !returnedImeis.includes(im));
  const remaining = isPhone ? remainingImeis.length : Math.max(0, qty - returnedCount);
  return {
    qty,
    isPhone,
    returnedImeis,
    remainingImeis,
    returnedCount,
    remaining,
    fullyReturned: remaining === 0 && returnedCount > 0,
  };
};

const PendingPayments = () => {
  const {
    customers: ctxCustomers,
    allCustomers,
    sales: ctxSales,
    allSales,
    payPendingAmount,
    shopSettings,
    activeSeller,
    updateCustomer,
    deleteCustomer,
    returnSaleItems,
  } = useApp();

  const customers = useMemo(() => allCustomers || ctxCustomers || [], [allCustomers, ctxCustomers]);
  const sales = useMemo(() => allSales || ctxSales || [], [allSales, ctxSales]);
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("All"); // "All" | "Aziz" | "Mubashir"
  const [viewFilter, setViewFilter] = useState("all"); // "all" | "pending"
  const [selectedCustForPayment, setSelectedCustForPayment] = useState(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentSeller, setPaymentSeller] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [historyCust, setHistoryCust] = useState(null);
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [statementCustomer, setStatementCustomer] = useState(null);
  const [isCapturingImage, setIsCapturingImage] = useState(false);

  // Short status message at the bottom of the screen (returns, WhatsApp sharing)
  const [notice, setNotice] = useState(null); // { type: "success" | "error" | "info", text }
  const showNotice = (text, type = "success") => setNotice({ text, type, at: Date.now() });
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  // Edit customer account modal
  const [editCust, setEditCust] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", address: "", cnic: "", sellerName: "" });
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Return modal: only the sale id and line index are kept, the sale itself is always read fresh
  const [returnTarget, setReturnTarget] = useState(null); // { saleId, index }
  const [returnQty, setReturnQty] = useState("1");
  const [returnImeis, setReturnImeis] = useState([]);
  const [returnNote, setReturnNote] = useState("");
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  // Sync with URL query parameters if present (e.g., from Header global search)
  useEffect(() => {
    const sParam = searchParams.get("search");
    if (sParam) {
      setSearchTerm(sParam);
      setViewFilter("all");
    }
    const sellerParam = searchParams.get("seller");
    if (sellerParam) {
      setSelectedSeller(sellerParam);
      setViewFilter("all");
    }
  }, [searchParams]);

  // History modal filters
  const [historyFilter, setHistoryFilter] = useState("all"); // "all" | "sales" | "payments"
  const [historySearch, setHistorySearch] = useState("");
  const [historySort, setHistorySort] = useState("newest"); // "newest" | "oldest"

  // One seller per customer, so per-seller totals never count a customer twice:
  // the customer's assigned seller, otherwise the seller of their latest sale or receipt
  const customerSellerMap = useMemo(() => {
    const map = new Map();
    customers.forEach((c) => {
      let owner = (c.sellerName || "").trim().toLowerCase();
      if (!owner) {
        let latest = null;
        sales.forEach((s) => {
          const seller = (s.sellerName || s.cashierName || "").trim();
          if (!seller || !saleBelongsTo(s, c)) return;
          if (!latest || new Date(s.createdAt) > new Date(latest.createdAt)) latest = { createdAt: s.createdAt, seller };
        });
        owner = latest ? latest.seller.toLowerCase() : "";
      }
      map.set(c.id, owner);
    });
    return map;
  }, [customers, sales]);

  // Check if a customer record is associated with a specific seller (exact name match only)
  const isCustomerOfSeller = (c, seller) => {
    if (!seller || seller === "All" || seller === "All Sellers") return true;
    return customerSellerMap.get(c.id) === seller.trim().toLowerCase();
  };

  // Comprehensive customer search matcher
  const matchesSearch = (c, query) => {
    if (!query) return true;
    const q = query.trim().toLowerCase();

    // Customer Name
    if ((c.name || "").toLowerCase().includes(q)) return true;

    // Phone (matches partial digits)
    if ((c.phone || "").replace(/\s|-/g, "").includes(q.replace(/\s|-/g, ""))) return true;

    // CNIC
    if ((c.cnic || "").includes(q)) return true;

    // Address
    if ((c.address || "").toLowerCase().includes(q)) return true;

    // Seller Name
    if ((c.sellerName || "").toLowerCase().includes(q)) return true;

    // Matching invoice number, item name, or note
    const hasMatchingSale = sales.some((s) => {
      if (!saleBelongsTo(s, c)) return false;

      if ((s.billNumber || "").toLowerCase().includes(q)) return true;
      if ((s.notes || "").toLowerCase().includes(q)) return true;
      return (s.items || []).some(
        (it) =>
          (it.productName || it.name || "").toLowerCase().includes(q) ||
          (it.imei || "").toLowerCase().includes(q)
      );
    });

    return hasMatchingSale;
  };

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return customers.filter((c) => {
      // 1. Seller filter
      if (!isCustomerOfSeller(c, selectedSeller)) return false;

      // 2. Search match
      if (!matchesSearch(c, query)) return false;

      // 3. Status filter:
      // If user typed a search query, ALWAYS show the matching customer even if balance is 0!
      if (query) return true;

      // If user specifically filtered for "pending", only show outstanding accounts
      if (viewFilter === "pending") {
        return Number(c.totalPending || 0) > 0;
      }

      return true;
    });
  }, [customers, sales, searchTerm, selectedSeller, viewFilter, customerSellerMap]);

  // Dynamic Statistics based on current seller selection
  const stats = useMemo(() => {
    // Each customer counted once, even if listed twice
    const seen = new Set();
    const targetCustomers = customers.filter((c) => {
      if (seen.has(c.id) || !isCustomerOfSeller(c, selectedSeller)) return false;
      seen.add(c.id);
      return true;
    });

    const totalPendingAmount = targetCustomers.reduce((sum, c) => sum + (Number(c.totalPending) || 0), 0);
    const pendingCount = targetCustomers.filter((c) => Number(c.totalPending) > 0).length;
    // Udhaar money collected: settlement receipts plus the upfront part of sales that left a balance
    const totalCollected = sales.reduce((sum, s) => {
      if (!isSettlement(s) && !(Number(s.dueAmount) > 0)) return sum;
      if (!targetCustomers.some((c) => saleBelongsTo(s, c))) return sum;
      return sum + (Number(s.paidAmount) || 0);
    }, 0);
    const allCount = targetCustomers.length;

    return { totalPendingAmount, pendingCount, totalCollected, allCount };
  }, [customers, sales, selectedSeller, customerSellerMap]);

  // Retrieve and calculate complete chronological ledger for a given customer
  const getCustomerTransactions = (cust) => {
    if (!cust) return [];

    const custSales = sales.filter((s) => saleBelongsTo(s, cust));

    // Sort chronologically (oldest to newest) to accurately compute running Udhaar balance
    const sorted = [...custSales].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Same rule as the server: a sale adds its due amount, money paid above the bill
    // goes against the old balance, a settlement lowers it; never below 0
    let runningBalance = 0;
    return sorted.map((record) => {
      const isPayment = isSettlement(record);
      const udhaarAdded = saleUdhaar(record);
      const isCredit = !isPayment && udhaarAdded > 0;
      const isCash = !isPayment && !isCredit;

      // Returns already lowered grandTotal / paidAmount / dueAmount on the server, so the
      // running balance below stays right; a fully returned bill (grandTotal 0) adds nothing
      const isReturned = !isPayment && record.paymentStatus === "returned";
      const returnedTotal = (record.returns || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

      const grandTotal = Number(record.grandTotal || 0);
      const paidAmount = Number(record.paidAmount || 0);

      let paymentReceived;
      let oldBalancePaid = 0;

      if (isPayment) {
        paymentReceived = paidAmount;
        runningBalance = Math.max(0, runningBalance - paymentReceived);
      } else {
        oldBalancePaid = Math.max(0, paidAmount - grandTotal);
        // upfront paid at time of sale (a cash sale is paid in full)
        paymentReceived = isCredit || oldBalancePaid > 0 ? paidAmount : grandTotal;
        runningBalance = Math.max(0, runningBalance + udhaarAdded - oldBalancePaid);
      }

      const dateInfo = formatDateWithDay(record.createdAt);

      return {
        ...record,
        isPayment,
        isCredit,
        isCash,
        isReturned,
        returnedTotal,
        paymentReceived,
        udhaarAdded,
        oldBalancePaid,
        runningBalance,
        dateInfo,
      };
    });
  };

  // Handler when selecting a seller button
  const handleSelectSeller = (sellerName) => {
    if (selectedSeller.toLowerCase() === sellerName.toLowerCase()) {
      // Toggle back to All Sellers
      setSelectedSeller("All");
    } else {
      setSelectedSeller(sellerName);
      // Switch view filter to "all" so that accounts with 0 balance (e.g. Mubashir) also appear immediately
      setViewFilter("all");
    }
  };

  // Open the payment modal; the receiving seller defaults to the customer's seller or the current filter
  const openPaymentModal = (cust) => {
    const pick = (name) => SELLERS.find((s) => s.toLowerCase() === (name || "").trim().toLowerCase()) || "";
    setSelectedCustForPayment(cust);
    setPaymentAmountInput(String(cust.totalPending));
    setPaymentSeller(pick(cust.sellerName) || pick(selectedSeller) || pick(activeSeller));
  };

  const closePaymentModal = () => {
    if (isSubmittingPayment) return;
    setSelectedCustForPayment(null);
    setPaymentAmountInput("");
  };

  const handleSettlePayment = async (e) => {
    e.preventDefault();
    if (isSubmittingPayment) return;
    if (!selectedCustForPayment || !paymentAmountInput || Number(paymentAmountInput) <= 0) return;

    setIsSubmittingPayment(true);
    try {
      const receipt = await payPendingAmount(selectedCustForPayment.id, Number(paymentAmountInput), paymentSeller);

      // Keep the modal open when saving failed (payPendingAmount already showed the error)
      if (receipt) {
        setPaymentReceipt(receipt);
        setSelectedCustForPayment(null);
        setPaymentAmountInput("");
      }
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Helper: Format text receipt for WhatsApp
  const getPaymentReceiptWAText = (receipt) => {
    const shopName = shopSettings.shopName || "MOBILE SHOP";
    const shopPhone = shopSettings.phone || shopSettings.shopPhone || "";
    const currency = shopSettings.currencySymbol || "Rs.";
    const dateStr = new Date(receipt.createdAt || Date.now()).toLocaleDateString("en-GB");
    const timeStr = new Date(receipt.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const cust = customers.find((c) => c.id === receipt.customerId || c.id === receipt.customer);

    let text = `🧾 *${shopName}*\n`;
    if (shopPhone) text += `📞 Phone: ${shopPhone}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*PAYMENT RECEIPT SLIP*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Receipt #:* ${receipt.billNumber || "RCPT-001"}\n`;
    text += `*Date:* ${dateStr} at ${timeStr}\n`;
    text += `*Customer:* ${receipt.customerName || cust?.name || "Customer"}\n`;
    if (receipt.customerPhone || cust?.phone) {
      text += `*Phone:* ${receipt.customerPhone || cust?.phone}\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*💰 AMOUNT RECEIVED:* ${currency} ${Number(receipt.paidAmount || 0).toLocaleString()}\n`;
    if (receipt.notes) {
      text += `*Remarks:* ${receipt.notes}\n`;
    }
    if (cust && cust.totalPending !== undefined) {
      text += `*Remaining Udhaar Balance:* ${currency} ${Number(cust.totalPending || 0).toLocaleString()}\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Thank you for your payment! 🙏`;
    return text;
  };

  const getStatementWAText = (cust) => {
    const shopName = shopSettings.shopName || "MOBILE SHOP";
    const shopPhone = shopSettings.phone || shopSettings.shopPhone || "";
    const currency = shopSettings.currencySymbol || "Rs.";
    const dateStr = new Date().toLocaleDateString("en-GB");
    const custTx = getCustomerTransactions(cust);

    let text = `📋 *${shopName}*\n`;
    if (shopPhone) text += `📞 Phone: ${shopPhone}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*CUSTOMER UDHAAR STATEMENT*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Customer:* ${cust.name}\n`;
    if (cust.phone) text += `*Phone:* ${cust.phone}\n`;
    text += `*Date:* ${dateStr}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Total Purchases:* ${currency} ${Number(cust.totalPurchases || 0).toLocaleString()}\n`;
    text += `*Total Payments:* ${currency} ${Number(cust.totalPaid || 0).toLocaleString()}\n`;
    text += `*⚠️ OUTSTANDING UDHAAR:* ${currency} ${Number(cust.totalPending || 0).toLocaleString()}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Recent Transactions (Last 5):*\n`;

    const recent = custTx.slice(-5);
    recent.forEach((tx) => {
      const d = tx.dateInfo ? `${tx.dateInfo.day}, ${tx.dateInfo.date}` : "";
      if (tx.isPayment) {
        text += `• ${d} | Payment: +${currency} ${tx.paymentReceived?.toLocaleString()} (Bal: ${currency} ${tx.runningBalance?.toLocaleString()})\n`;
      } else {
        const returnedTag = tx.isReturned
          ? " - Returned"
          : tx.returnedTotal > 0
          ? ` - Returned ${currency} ${tx.returnedTotal.toLocaleString()}`
          : "";
        text += `• ${d} | Bill #${tx.billNumber}: ${currency} ${tx.grandTotal?.toLocaleString()}${returnedTag} (Bal: ${currency} ${tx.runningBalance?.toLocaleString()})\n`;
      }
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (Number(cust.totalPending || 0) > 0) {
      text += `Please arrange payment of the pending balance at your earliest convenience. Thank you! 🙏`;
    } else {
      text += `Your account is fully settled. Thank you! 🙏`;
    }
    return text;
  };

  // Send a receipt / statement to WhatsApp as a PNG image (share sheet on phones,
  // clipboard + download + open chat on a computer) and tell the user what happened
  const openWhatsAppShare = async ({ element, phone, text, defaultFileName, label = "Image" }) => {
    if (isCapturingImage) return;
    setIsCapturingImage(true);
    try {
      const result = await shareImageToWhatsApp({ element, phone, text, fileName: defaultFileName || "Receipt.png" });
      let message = String(result.message || "").replace(/^Invoice image/, label);
      if ((result.method === "clipboard" || result.method === "download") && !formatWAPhone(phone)) {
        message += " No valid customer phone number, so choose the chat in WhatsApp yourself.";
      }
      showNotice(message, result.method === "cancelled" ? "info" : "success");
    } catch (err) {
      // Image could not be made: still open the chat with the text so nothing is lost
      console.warn("WhatsApp image share failed:", err);
      const wa = formatWAPhone(phone);
      const url = wa
        ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}`
        : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener");
      showNotice(`Could not create the image (${err?.message || "unknown error"}). WhatsApp opened with the text only.`, "error");
    } finally {
      setIsCapturingImage(false);
    }
  };

  // WhatsApp share for Payment Receipt
  const handleWhatsAppShare = () => {
    if (!paymentReceipt) return;
    const receiptElement = document.getElementById("receipt-content");
    const waText = getPaymentReceiptWAText(paymentReceipt);

    openWhatsAppShare({
      element: receiptElement,
      phone: paymentReceipt.customerPhone,
      text: waText,
      defaultFileName: `Receipt_${paymentReceipt.billNumber || "PAY"}.png`,
      label: "Receipt image",
    });
  };

  // WhatsApp share for Customer Statement
  const handleWhatsAppStatementShare = () => {
    if (!statementCustomer) return;
    const statementEl = document.getElementById("statement-print-area");
    const waText = getStatementWAText(statementCustomer);

    openWhatsAppShare({
      element: statementEl,
      phone: statementCustomer.phone,
      text: waText,
      defaultFileName: `Statement_${statementCustomer.name || "Customer"}.png`,
      label: "Statement image",
    });
  };

  // ── Account edit / delete ────────────────────────────────────────────────
  const openEditCustomer = (cust) => {
    setEditCust(cust);
    setEditForm({
      name: cust.name || "",
      phone: cust.phone || "",
      address: cust.address || "",
      cnic: cust.cnic || "",
      sellerName: SELLERS.find((s) => s.toLowerCase() === (cust.sellerName || "").trim().toLowerCase()) || "",
    });
  };

  const closeEditCustomer = () => {
    if (isSavingCustomer) return;
    setEditCust(null);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (isSavingCustomer || !editCust || !editForm.name.trim()) return;
    setIsSavingCustomer(true);
    try {
      // Details only; balances are never sent (only sales, payments and returns change them)
      const saved = await updateCustomer(editCust.id, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        email: editCust.email || "",
        address: editForm.address.trim(),
        cnic: editForm.cnic.trim(),
        sellerName: editForm.sellerName,
      });
      if (saved) {
        setEditCust(null);
        showNotice(`${saved.name || "Customer"} updated.`);
      }
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const handleDeleteCustomer = async (cust) => {
    const owes = Number(cust.totalPending || 0);
    const warning =
      owes > 0
        ? `This customer still owes ${shopSettings.currencySymbol || "Rs."} ${owes.toLocaleString()}.\n\n`
        : "";
    if (!window.confirm(`${warning}Delete the account of "${cust.name}"? Their bills stay in the records.`)) return;

    const ok = await deleteCustomer(cust.id);
    if (!ok) return;
    // Close anything still open for this customer
    if (historyCust?.id === cust.id) {
      setHistoryCust(null);
      setHistorySearch("");
      setHistoryFilter("all");
    }
    if (statementCustomer?.id === cust.id) setStatementCustomer(null);
    if (selectedCustForPayment?.id === cust.id) setSelectedCustForPayment(null);
    if (editCust?.id === cust.id) setEditCust(null);
    if (returnTarget) setReturnTarget(null);
    showNotice(`${cust.name || "Customer"} deleted.`);
  };

  // ── Returns ──────────────────────────────────────────────────────────────
  // Always read the bill fresh from the sales list, so the modal shows the latest return state
  const returnSale = returnTarget ? sales.find((s) => s.id === returnTarget.saleId) || null : null;
  const returnItem = returnSale ? (returnSale.items || [])[returnTarget.index] || null : null;
  const returnInfo = returnItem ? lineReturnInfo(returnItem) : null;
  const returnUnitPrice = returnItem
    ? Number(returnItem.unitSalePrice || returnItem.unitPrice || returnItem.price || 0)
    : 0;
  const returnCount = returnInfo
    ? returnInfo.isPhone
      ? returnImeis.length
      : Math.max(0, Math.floor(Number(returnQty) || 0))
    : 0;
  const returnValid =
    !!returnInfo &&
    (returnInfo.isPhone || Number.isInteger(Number(returnQty))) &&
    returnCount >= 1 &&
    returnCount <= returnInfo.remaining;
  const returnEstimate = returnUnitPrice * returnCount;
  const returnDuePart = returnSale ? Math.min(Math.max(0, Number(returnSale.dueAmount || 0)), returnEstimate) : 0;

  const openReturnModal = (sale, index) => {
    setReturnTarget({ saleId: sale.id, index });
    setReturnQty("1");
    setReturnImeis([]);
    setReturnNote("");
  };

  const closeReturnModal = () => {
    if (isSubmittingReturn) return;
    setReturnTarget(null);
  };

  const toggleReturnImei = (imei) =>
    setReturnImeis((prev) => (prev.includes(imei) ? prev.filter((x) => x !== imei) : [...prev, imei]));

  const handleConfirmReturn = async () => {
    if (isSubmittingReturn || !returnSale || !returnInfo || !returnValid) return;
    const line = returnInfo.isPhone
      ? { index: returnTarget.index, qty: returnImeis.length, imeis: returnImeis }
      : { index: returnTarget.index, qty: returnCount };

    setIsSubmittingReturn(true);
    try {
      const updated = await returnSaleItems(returnSale.id, [line], returnNote.trim());
      // On failure returnSaleItems already showed the error; keep the modal open
      if (updated) {
        const last = (updated.returns || [])[(updated.returns || []).length - 1];
        const cur = shopSettings.currencySymbol || "Rs.";
        const details = last
          ? ` ${cur} ${Number(last.amount || 0).toLocaleString()} refunded (Udhaar reduced ${cur} ${Number(
              last.dueReduced || 0
            ).toLocaleString()}, cash back ${cur} ${Number(last.cashBack || 0).toLocaleString()}).`
          : "";
        setReturnTarget(null);
        showNotice(`Return saved, item back in stock.${details}`);
      }
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  // Find active customer in history
  const activeHistoryCust = historyCust
    ? customers.find((c) => c.id === historyCust.id) || historyCust
    : null;

  // Process transactions for active history customer
  const activeTransactions = activeHistoryCust ? getCustomerTransactions(activeHistoryCust) : [];

  const filteredHistoryTransactions = useMemo(() => {
    if (!activeTransactions.length) return [];
    let list = activeTransactions.filter((t) => {
      if (historyFilter === "payments" && !t.isPayment) return false;
      if (historyFilter === "sales" && t.isPayment) return false;

      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        const billMatch = (t.billNumber || "").toLowerCase().includes(q);
        const dayMatch = (t.dateInfo.day || "").toLowerCase().includes(q);
        const dateMatch = (t.dateInfo.date || "").toLowerCase().includes(q);
        const notesMatch = (t.notes || "").toLowerCase().includes(q);
        const methodMatch = (t.paymentMethod || "").toLowerCase().includes(q);
        const itemMatch = (t.items || []).some(
          (item) =>
            (item.productName || item.name || "").toLowerCase().includes(q) ||
            (item.imei || "").toLowerCase().includes(q) ||
            (item.imeisArray || []).some((im) => im.toLowerCase().includes(q))
        );
        return billMatch || dayMatch || dateMatch || notesMatch || methodMatch || itemMatch;
      }
      return true;
    });

    if (historySort === "newest") {
      return [...list].reverse();
    }
    return list;
  }, [activeTransactions, historyFilter, historySearch, historySort]);

  return (
    <>
    <div className={`p-6 space-y-6 ${paymentReceipt || statementCustomer ? "print:hidden" : ""}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Clock size={24} className="text-rose-400" />
            <h1 className="text-xl font-bold text-slate-100">Customer Pending Bills (Udhaar System)</h1>
          </div>
          <p className="text-xs text-slate-400">
            Filter by seller, search any customer name/phone, and click any record to view their full transaction ledger
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-stretch sm:items-center">
          {/* Seller Selection Filter Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 flex-wrap sm:flex-nowrap">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 hidden sm:inline">
              Seller:
            </span>
            <button
              onClick={() => setSelectedSeller("All")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedSeller === "All"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Users size={13} />
              <span>All Sellers</span>
            </button>
            {SELLERS.map((sellerName) => {
              const isSelected = selectedSeller.toLowerCase() === sellerName.toLowerCase();
              return (
                <button
                  key={sellerName}
                  onClick={() => handleSelectSeller(sellerName)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400/50"
                      : "text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent"
                  }`}
                >
                  <User size={13} />
                  <span>{sellerName}</span>
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />}
                </button>
              );
            })}
          </div>

          {/* Search box with Clear Button */}
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search customer name, phone, bill..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5 rounded-md hover:bg-slate-800 transition-colors"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Overview Bar & Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4">
        {/* Toggle between Udhaar Pending & All Accounts */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setViewFilter("pending")}
            className={`px-4 py-1.5 rounded-lg transition-all ${
              viewFilter === "pending"
                ? "bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Pending Udhaar ({stats.pendingCount})
          </button>
          <button
            onClick={() => setViewFilter("all")}
            className={`px-4 py-1.5 rounded-lg transition-all ${
              viewFilter === "all"
                ? "bg-indigo-600 text-white font-bold shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All Accounts ({stats.allCount})
          </button>
        </div>

        {/* Dynamic Aggregate Stats for Current Seller Selection */}
        <div className="flex items-center gap-4 text-xs flex-wrap">
          {selectedSeller !== "All" && (
            <div className="px-2.5 py-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-lg font-bold flex items-center gap-1.5">
              <User size={13} />
              <span>{selectedSeller}'s Accounts</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Total Outstanding:</span>
            <span className="font-black text-rose-400 text-sm">
              {shopSettings.currencySymbol} {stats.totalPendingAmount.toLocaleString()}
            </span>
          </div>
          <div className="h-4 w-px bg-slate-800 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Total Collected:</span>
            <span className="font-bold text-emerald-400">
              {shopSettings.currencySymbol} {stats.totalCollected.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Active Filter Indicators Banner */}
      {(selectedSeller !== "All" || searchTerm.trim()) && (
        <div className="flex items-center gap-2 flex-wrap text-xs bg-indigo-950/20 border border-indigo-500/20 px-4 py-2.5 rounded-2xl">
          <span className="text-slate-400 font-medium">Active Filters:</span>
          {selectedSeller !== "All" && (
            <span className="inline-flex items-center gap-1.5 bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-lg font-bold">
              <User size={12} /> Seller: {selectedSeller}
              <button
                onClick={() => setSelectedSeller("All")}
                className="hover:text-white ml-1"
                title="Clear seller filter"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {searchTerm.trim() && (
            <span className="inline-flex items-center gap-1.5 bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg font-bold">
              <Search size={12} /> Search: "{searchTerm}"
              <button
                onClick={() => setSearchTerm("")}
                className="hover:text-white ml-1"
                title="Clear search"
              >
                <X size={12} />
              </button>
            </span>
          )}
          <span className="text-slate-500 ml-auto font-medium">
            Found {filteredCustomers.length} customer(s)
          </span>
          <button
            onClick={() => {
              setSelectedSeller("All");
              setSearchTerm("");
              setViewFilter("all");
            }}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-semibold ml-2 flex items-center gap-1"
          >
            <RotateCcw size={11} /> Reset Filters
          </button>
        </div>
      )}

      {/* Customers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map((cust) => {
          // Pre-fetch last transaction info for preview
          const custTx = getCustomerTransactions(cust);
          const lastTx = custTx.length > 0 ? custTx[custTx.length - 1] : null;

          return (
            <div
              key={cust.id}
              onClick={() => setHistoryCust(cust)}
              className="bg-slate-900 border border-slate-800 hover:border-indigo-500/60 rounded-3xl p-5 shadow-sm space-y-4 cursor-pointer transition-all duration-200 hover:bg-slate-800/40 hover:scale-[1.01] hover:shadow-xl hover:shadow-indigo-500/5 group relative"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-3 gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-100 text-base group-hover:text-indigo-300 transition-colors">
                      {cust.name}
                    </h3>
                    {cust.sellerName && (
                      <span className="text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md font-semibold">
                        Seller: {cust.sellerName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{cust.phone || "No phone"}</span>
                    {cust.address && <span className="text-slate-500">• {cust.address}</span>}
                  </p>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${
                    cust.totalPending > 0
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  }`}
                >
                  {cust.totalPending > 0 ? "Udhaar Pending" : "Settled (Rs. 0)"}
                </span>
              </div>

              {/* Financial Metrics */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Purchase:</span>
                  <span className="font-semibold text-slate-200">
                    {shopSettings.currencySymbol} {Number(cust.totalPurchases || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Amount Paid:</span>
                  <span className="font-semibold text-emerald-400">
                    {shopSettings.currencySymbol} {Number(cust.totalPaid || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-800">
                  <span className="font-bold text-rose-300">Remaining Balance:</span>
                  <span className="font-extrabold text-rose-400 text-base">
                    {shopSettings.currencySymbol} {Number(cust.totalPending || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Last Activity Preview */}
              {lastTx && (
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 text-[11px] text-slate-400 space-y-0.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500 uppercase font-semibold">Last Activity:</span>
                    <span className="font-bold text-indigo-300">{lastTx.dateInfo.day}, {lastTx.dateInfo.date}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="truncate max-w-[180px] text-slate-300 font-medium">
                      {lastTx.isPayment ? `Paid: Rs. ${lastTx.paymentReceived.toLocaleString()}` : `Sale: ${lastTx.billNumber}`}
                    </span>
                    <span className={`font-bold ${lastTx.isPayment ? "text-emerald-400" : "text-rose-400"}`}>
                      {lastTx.isPayment ? `+Rs. ${lastTx.paymentReceived.toLocaleString()}` : `Total: Rs. ${lastTx.grandTotal.toLocaleString()}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Click Callout */}
              <div className="pt-1 text-[11px] text-indigo-400 font-semibold flex items-center justify-between group-hover:text-indigo-300 transition-colors">
                <span className="flex items-center gap-1.5">
                  <FileText size={13} />
                  Click to view full statement & history
                </span>
                <span className="text-xs group-hover:translate-x-1 transition-transform">→</span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistoryCust(cust);
                  }}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-700/50"
                >
                  <Calendar size={14} className="text-indigo-400" />
                  <span>View Details</span>
                </button>

                {cust.totalPending > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPaymentModal(cust);
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
                  >
                    <DollarSign size={14} />
                    <span>Record Payment</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditCustomer(cust);
                  }}
                  className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-2xl text-xs flex items-center justify-center transition-all border border-slate-700/50"
                  title="Edit account"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCustomer(cust);
                  }}
                  className="px-3 py-2.5 bg-slate-800 hover:bg-rose-600/30 text-slate-400 hover:text-rose-300 rounded-2xl text-xs flex items-center justify-center transition-all border border-slate-700/50 hover:border-rose-500/40"
                  title="Delete account"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredCustomers.length === 0 && (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8 space-y-3">
          <Clock size={36} className="mx-auto text-slate-600" />
          <h3 className="text-base font-bold text-slate-300">No Customers Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchTerm.trim()
              ? `No customer records match "${searchTerm}". Check the spelling or click Reset Filters.`
              : selectedSeller !== "All"
              ? `No customer records found under seller "${selectedSeller}".`
              : "All customers have settled their accounts! Click 'All Accounts' to inspect full customer histories."}
          </p>
          {(searchTerm.trim() || selectedSeller !== "All") && (
            <button
              onClick={() => {
                setSelectedSeller("All");
                setSearchTerm("");
                setViewFilter("all");
              }}
              className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow inline-flex items-center gap-1.5"
            >
              <RotateCcw size={13} /> Reset Filters & Show All
            </button>
          )}
        </div>
      )}

      {/* Payment Settlement Modal (above the history modal, which can open it) */}
      {selectedCustForPayment && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base">Record Pending Payment</h3>
              <button
                onClick={closePaymentModal}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSettlePayment} className="space-y-3">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1 text-xs">
                <p className="text-slate-400">
                  Customer: <strong className="text-slate-200">{selectedCustForPayment.name}</strong>
                </p>
                <p className="text-slate-400">
                  Current Outstanding:{" "}
                  <strong className="text-rose-400">
                    Rs. {selectedCustForPayment.totalPending.toLocaleString()}
                  </strong>
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Received Amount (Rs.) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedCustForPayment.totalPending}
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 font-bold focus:outline-none focus:border-indigo-500 mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Received By (Seller) *</label>
                <select
                  required
                  value={paymentSeller}
                  onChange={(e) => setPaymentSeller(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 font-bold focus:outline-none focus:border-indigo-500 mt-1"
                >
                  <option value="">Select seller...</option>
                  {SELLERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  disabled={isSubmittingPayment}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmittingPayment ? "Saving…" : "Confirm & Update Balance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Account Modal (above the history modal) */}
      {editCust && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <Pencil size={16} className="text-indigo-400" /> Edit Customer Account
              </h3>
              <button onClick={closeEditCustomer} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400">Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 font-bold focus:outline-none focus:border-indigo-500 mt-1"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Phone</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="03xx-xxxxxxx"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">CNIC</label>
                  <input
                    type="text"
                    value={editForm.cnic}
                    onChange={(e) => setEditForm((f) => ({ ...f, cnic: e.target.value }))}
                    placeholder="xxxxx-xxxxxxx-x"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 mt-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400">Address</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400">Seller</label>
                <select
                  value={editForm.sellerName}
                  onChange={(e) => setEditForm((f) => ({ ...f, sellerName: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 font-bold focus:outline-none focus:border-indigo-500 mt-1"
                >
                  <option value="">No seller assigned</option>
                  {SELLERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-500">
                Balances are not edited here; they change only through sales, payments and returns.
              </p>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditCustomer}
                  disabled={isSavingCustomer}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCustomer || !editForm.name.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingCustomer ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Item Modal (above the history modal) */}
      {returnTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <Undo2 size={16} className="text-amber-400" /> Return Item
              </h3>
              <button onClick={closeReturnModal} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {!returnSale || !returnItem || !returnInfo ? (
              <p className="text-xs text-slate-400">This bill line is no longer available.</p>
            ) : returnInfo.remaining === 0 ? (
              <p className="text-xs text-slate-400">Everything on this line has already been returned.</p>
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1 text-xs">
                  <p className="text-slate-400">
                    Bill: <strong className="text-slate-200 font-mono">{returnSale.billNumber}</strong>
                  </p>
                  <p className="text-slate-400">
                    Item: <strong className="text-slate-200">{returnItem.productName || returnItem.name || "Product"}</strong>
                  </p>
                  <p className="text-slate-400">
                    Sold: <strong className="text-slate-200">{returnInfo.qty}</strong> x Rs.{" "}
                    {returnUnitPrice.toLocaleString()}
                    {returnInfo.returnedCount > 0 && (
                      <span className="text-amber-300"> • {returnInfo.returnedCount} already returned</span>
                    )}
                  </p>
                </div>

                {returnInfo.isPhone ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-400">IMEIs to return *</label>
                      {returnInfo.remainingImeis.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setReturnImeis(
                              returnImeis.length === returnInfo.remainingImeis.length ? [] : [...returnInfo.remainingImeis]
                            )
                          }
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                        >
                          {returnImeis.length === returnInfo.remainingImeis.length ? "Clear" : "Select all"}
                        </button>
                      )}
                    </div>
                    <div className="mt-1 space-y-1.5">
                      {returnInfo.remainingImeis.map((im) => (
                        <label
                          key={im}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs font-mono transition-all ${
                            returnImeis.includes(im)
                              ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                              : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={returnImeis.includes(im)}
                            onChange={() => toggleReturnImei(im)}
                            className="accent-amber-500"
                          />
                          <Smartphone size={12} className="text-indigo-400" />
                          <span>{im}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-semibold text-slate-400">
                      Quantity to return * (1 - {returnInfo.remaining})
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={returnInfo.remaining}
                      step="1"
                      value={returnQty}
                      onChange={(e) => setReturnQty(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 font-bold focus:outline-none focus:border-indigo-500 mt-1"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-400">Note (optional)</label>
                  <input
                    type="text"
                    value={returnNote}
                    onChange={(e) => setReturnNote(e.target.value)}
                    placeholder="e.g. faulty, customer changed mind"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 mt-1"
                  />
                </div>

                {/* What will happen */}
                <div className="bg-amber-950/20 border border-amber-900/40 rounded-2xl p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Refund amount:</span>
                    <span className="font-black text-amber-300">
                      Rs. {returnEstimate.toLocaleString()}
                      {returnCount > 0 && (
                        <span className="text-[10px] font-semibold text-slate-400">
                          {" "}
                          ({returnCount} x Rs. {returnUnitPrice.toLocaleString()})
                        </span>
                      )}
                    </span>
                  </div>
                  {returnEstimate > 0 && (
                    <p className="text-[11px] text-slate-400">
                      About Rs. {returnDuePart.toLocaleString()} comes off the Udhaar first
                      {returnEstimate - returnDuePart > 0 &&
                        `, Rs. ${(returnEstimate - returnDuePart).toLocaleString()} cash back`}
                      .
                    </p>
                  )}
                  {Number(returnSale.discountAmount || 0) > 0 && (
                    <p className="text-[11px] text-slate-400">
                      This bill had a discount of Rs. {Number(returnSale.discountAmount).toLocaleString()}, shared over
                      its items, so the final refund may be a little lower.
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">
                    The {returnInfo.isPhone ? "phone(s) go" : "item goes"} back into stock
                    {returnInfo.isPhone && " and the warranty is voided"}.
                  </p>
                </div>

                {!returnValid && (
                  <p className="text-[11px] text-rose-400">
                    {returnInfo.isPhone
                      ? "Select at least one IMEI."
                      : `Enter a quantity from 1 to ${returnInfo.remaining}.`}
                  </p>
                )}
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={closeReturnModal}
                disabled={isSubmittingReturn}
                className="mt-3 px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={isSubmittingReturn || !returnValid}
                className="mt-3 px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmittingReturn ? "Saving…" : "Confirm Return"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Customer Transaction & Statement Modal */}
      {activeHistoryCust && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 mb-4 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-lg">
                  {activeHistoryCust.name?.charAt(0)?.toUpperCase() || "C"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-100 text-xl">{activeHistoryCust.name}</h3>
                    {activeHistoryCust.sellerName && (
                      <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-md font-semibold">
                        Seller: {activeHistoryCust.sellerName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Phone: <span className="text-slate-200 font-mono">{activeHistoryCust.phone || "—"}</span>
                    {activeHistoryCust.address && <span className="ml-2 text-slate-400">• {activeHistoryCust.address}</span>}
                  </p>
                </div>
              </div>

              {/* Action buttons inside header */}
              <div className="flex items-center gap-2 flex-wrap justify-end self-end sm:self-auto">
                <button
                  onClick={() => setStatementCustomer(activeHistoryCust)}
                  className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Printer size={14} />
                  <span>Print Statement</span>
                </button>

                {activeHistoryCust.totalPending > 0 && (
                  <button
                    onClick={() => openPaymentModal(activeHistoryCust)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
                  >
                    <DollarSign size={14} />
                    <span>Record Payment</span>
                  </button>
                )}

                <button
                  onClick={() => openEditCustomer(activeHistoryCust)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/50 rounded-xl transition-all"
                  title="Edit account"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDeleteCustomer(activeHistoryCust)}
                  className="p-2 bg-slate-800 hover:bg-rose-600/30 text-slate-400 hover:text-rose-300 border border-slate-700/50 hover:border-rose-500/40 rounded-xl transition-all"
                  title="Delete account"
                >
                  <Trash2 size={14} />
                </button>

                <button
                  onClick={() => {
                    setHistoryCust(null);
                    setHistorySearch("");
                    setHistoryFilter("all");
                  }}
                  className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors ml-1"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Customer KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total Purchases / Bills
                </span>
                <p className="text-base font-extrabold text-slate-100 mt-0.5">
                  {shopSettings.currencySymbol} {Number(activeHistoryCust.totalPurchases || 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-slate-500">
                  {activeTransactions.filter((t) => !t.isPayment).length} total sale bills
                </span>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                  Total Payments Made
                </span>
                <p className="text-base font-extrabold text-emerald-400 mt-0.5">
                  {shopSettings.currencySymbol} {Number(activeHistoryCust.totalPaid || 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-slate-500">
                  {activeTransactions.filter((t) => t.isPayment).length} payment receipts
                </span>
              </div>

              <div className="bg-rose-950/20 p-3.5 rounded-2xl border border-rose-900/40">
                <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider block">
                  Current Outstanding Udhaar
                </span>
                <p className="text-xl font-black text-rose-400 mt-0.5">
                  {shopSettings.currencySymbol} {Number(activeHistoryCust.totalPending || 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-rose-400/80">
                  {activeHistoryCust.totalPending > 0 ? "Requires payment" : "Fully settled"}
                </span>
              </div>
            </div>

            {/* Filter and Search Bar inside History */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mb-3 bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
              {/* Type filter tabs */}
              <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800/80 text-xs">
                <button
                  onClick={() => setHistoryFilter("all")}
                  className={`px-3 py-1 rounded-lg transition-all font-semibold ${
                    historyFilter === "all"
                      ? "bg-indigo-600 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  All ({activeTransactions.length})
                </button>
                <button
                  onClick={() => setHistoryFilter("payments")}
                  className={`px-3 py-1 rounded-lg transition-all font-semibold ${
                    historyFilter === "payments"
                      ? "bg-emerald-600 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Payments ({activeTransactions.filter((t) => t.isPayment).length})
                </button>
                <button
                  onClick={() => setHistoryFilter("sales")}
                  className={`px-3 py-1 rounded-lg transition-all font-semibold ${
                    historyFilter === "sales"
                      ? "bg-rose-600 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Sales ({activeTransactions.filter((t) => !t.isPayment).length})
                </button>
              </div>

              {/* Search and Sort */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-56">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search day, item, IMEI, bill #..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  onClick={() => setHistorySort((prev) => (prev === "newest" ? "oldest" : "newest"))}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs text-slate-300 font-semibold flex items-center gap-1 whitespace-nowrap"
                  title="Toggle Chronological Order"
                >
                  <span>{historySort === "newest" ? "Newest First" : "Oldest First"}</span>
                </button>
              </div>
            </div>

            {/* Detailed Transaction List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
              {filteredHistoryTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className={`p-4 border rounded-2xl transition-all ${
                    tx.isPayment
                      ? "bg-emerald-950/20 border-emerald-900/40 hover:border-emerald-700/50"
                      : tx.isReturned
                      ? "bg-amber-950/10 border-amber-900/40 hover:border-amber-700/50"
                      : tx.isCredit
                      ? "bg-rose-950/20 border-rose-900/40 hover:border-rose-700/50"
                      : "bg-slate-950/60 border-slate-800/80 hover:border-indigo-800/50"
                  }`}
                >
                  {/* Top Bar: Date, Day, Type & Amounts */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Prominent Day Badge */}
                      <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-black uppercase tracking-wider">
                        {tx.dateInfo.day}
                      </span>

                      <span className="text-xs font-bold text-slate-200">{tx.dateInfo.date}</span>
                      <span className="text-[11px] text-slate-400">at {tx.dateInfo.time}</span>

                      {/* Type Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${
                          tx.isPayment
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : tx.isReturned
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : tx.isCredit
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        }`}
                      >
                        {tx.isPayment ? (
                          <>
                            <DollarSign size={11} /> Payment Received
                          </>
                        ) : tx.isReturned ? (
                          <>
                            <Undo2 size={11} /> Returned
                          </>
                        ) : tx.isCredit ? (
                          <>
                            <Clock size={11} /> Udhaar Sale / Bill
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={11} /> Cash Sale
                          </>
                        )}
                      </span>

                      {/* Bill / Ref # */}
                      <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {tx.billNumber}
                      </span>

                      {/* Partly returned bill */}
                      {!tx.isPayment && !tx.isReturned && tx.returnedTotal > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          <Undo2 size={11} /> Partly Returned
                        </span>
                      )}
                    </div>

                    {/* Amount & Balance column */}
                    <div className="text-left sm:text-right w-full sm:w-auto">
                      <div
                        className={`text-lg font-black ${
                          tx.isPayment
                            ? "text-emerald-400"
                            : tx.isReturned
                            ? "text-amber-300"
                            : tx.isCredit
                            ? "text-rose-400"
                            : "text-blue-400"
                        }`}
                      >
                        {tx.isPayment
                          ? `+${shopSettings.currencySymbol} ${tx.paymentReceived.toLocaleString()}`
                          : `${shopSettings.currencySymbol} ${tx.grandTotal.toLocaleString()}`}
                      </div>
                      {!tx.isPayment && tx.returnedTotal > 0 && (
                        <div className="text-[11px] text-amber-300/90 font-semibold">
                          {tx.isReturned ? "Bill fully returned" : "After returns"} (returned: Rs.{" "}
                          {tx.returnedTotal.toLocaleString()})
                        </div>
                      )}
                      <div className="text-[11px] text-slate-400">
                        {tx.isCredit && tx.paymentReceived > 0 && (
                          <span className="text-emerald-400 font-semibold mr-1.5">
                            (Paid: Rs. {tx.paymentReceived.toLocaleString()} | Due: +Rs. {tx.udhaarAdded.toLocaleString()})
                          </span>
                        )}
                        {tx.oldBalancePaid > 0 && (
                          <span className="text-emerald-400 font-semibold mr-1.5">
                            (Paid towards old balance: -Rs. {tx.oldBalancePaid.toLocaleString()})
                          </span>
                        )}
                        <span>
                          Udhaar Balance:{" "}
                          <strong className="text-slate-200">
                            Rs. {tx.runningBalance.toLocaleString()}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Body Details: Payment Note or Itemized Sold Products */}
                  {tx.isPayment ? (
                    <div className="mt-3 text-xs text-slate-300 bg-emerald-950/30 border border-emerald-900/30 rounded-xl p-3 flex items-start gap-2.5">
                      <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                      <div className="space-y-1 flex-1">
                        <p className="font-semibold text-emerald-200">
                          {tx.notes || "Received payment towards pending Udhaar balance."}
                        </p>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-emerald-900/40">
                          <span>Payment Method: <strong className="text-slate-300">{tx.paymentMethod}</strong></span>
                          {tx.sellerName && (
                            <span>Received by: <strong className="text-slate-300">{tx.sellerName}</strong></span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {/* Products Sold List */}
                      {tx.items && tx.items.length > 0 ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            <span className="flex items-center gap-1.5">
                              <ShoppingBag size={13} className="text-indigo-400" />
                              Items Sold in this Bill ({tx.items.length}):
                            </span>
                            {tx.sellerName && (
                              <span className="text-slate-500 font-normal">
                                Sold by: <strong className="text-slate-300">{tx.sellerName}</strong>
                              </span>
                            )}
                          </div>

                          {tx.items.map((item, idx) => {
                            const itemQty = Number(item.quantity || item.qty || 1);
                            const itemPrice = Number(item.unitPrice || item.unitSalePrice || item.price || 0);
                            const itemSubtotal = Number(item.subtotal || itemQty * itemPrice);

                            // Extract IMEIs
                            const imeis = [];
                            if (item.imei) imeis.push(item.imei);
                            if (Array.isArray(item.imeisArray)) {
                              item.imeisArray.forEach((im) => {
                                if (im && !imeis.includes(im)) imeis.push(im);
                              });
                            }
                            if (Array.isArray(item.imeis)) {
                              item.imeis.forEach((im) => {
                                const imStr = typeof im === "string" ? im : im.imei;
                                if (imStr && !imeis.includes(imStr)) imeis.push(imStr);
                              });
                            }

                            // What already came back from this line
                            const ret = lineReturnInfo(item);

                            return (
                              <div
                                key={idx}
                                className={`border rounded-xl p-2.5 text-xs ${
                                  ret.fullyReturned
                                    ? "bg-slate-950/40 border-amber-900/40"
                                    : "bg-slate-950/70 border-slate-800/80"
                                }`}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`font-bold ${
                                        ret.fullyReturned ? "text-slate-500 line-through" : "text-slate-200"
                                      }`}
                                    >
                                      {item.productName || item.name || "Product"}
                                    </span>
                                    {item.category && (
                                      <span className="text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded">
                                        {item.category}
                                      </span>
                                    )}
                                    {ret.fullyReturned ? (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                                        Returned
                                      </span>
                                    ) : ret.returnedCount > 0 ? (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded">
                                        {ret.returnedCount} of {ret.qty} returned
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <div className="text-right whitespace-nowrap">
                                      <span
                                        className={`font-extrabold ${
                                          ret.fullyReturned ? "text-slate-500 line-through" : "text-slate-100"
                                        }`}
                                      >
                                        Rs. {itemSubtotal.toLocaleString()}
                                      </span>
                                      <span className="block text-[10px] text-slate-400">
                                        {itemQty} x Rs. {itemPrice.toLocaleString()}
                                      </span>
                                    </div>
                                    {ret.remaining > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => openReturnModal(tx, idx)}
                                        className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                                        title="Return this item to stock"
                                      >
                                        <Undo2 size={11} /> Return
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* IMEIs list if present (returned IMEIs struck through) */}
                                {imeis.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-900">
                                    {imeis.map((im, imIdx) => {
                                      const imReturned = ret.returnedImeis.includes(im);
                                      return (
                                        <span
                                          key={imIdx}
                                          className={`inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-md border ${
                                            imReturned
                                              ? "bg-amber-950/30 text-amber-300/80 border-amber-800/50"
                                              : "bg-indigo-950/40 text-indigo-300 border-indigo-800/50"
                                          }`}
                                        >
                                          <Smartphone size={10} className={imReturned ? "text-amber-400" : "text-indigo-400"} />
                                          <span className={imReturned ? "line-through" : ""}>IMEI: {im}</span>
                                          {imReturned && <span className="font-sans font-bold not-italic">(returned)</span>}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                          {tx.notes || "Sale recorded without itemized product details."}
                        </div>
                      )}

                      {/* Sale notes if present */}
                      {tx.notes && (
                        <p className="text-[11px] text-slate-400 italic pt-1">
                          Note: {tx.notes}
                        </p>
                      )}

                      {/* Return history of this bill */}
                      {(tx.returns || []).length > 0 && (
                        <div className="bg-amber-950/10 border border-amber-900/40 rounded-xl p-2.5 space-y-2">
                          <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Undo2 size={13} /> Returns on this bill ({tx.returns.length})
                          </div>
                          {tx.returns.map((r, rIdx) => {
                            const rDate = formatDateWithDay(r.at || r.date);
                            return (
                              <div
                                key={r.id || rIdx}
                                className="text-[11px] text-slate-300 border-t border-amber-900/30 pt-1.5 first:border-t-0 first:pt-0 space-y-0.5"
                              >
                                <div className="flex justify-between gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-200">
                                    {rDate.day}, {rDate.date}
                                    {rDate.time !== "—" && <span className="text-slate-400 font-normal"> at {rDate.time}</span>}
                                  </span>
                                  <span className="font-extrabold text-amber-300">
                                    Rs. {Number(r.amount || 0).toLocaleString()}
                                  </span>
                                </div>
                                <div className="text-slate-400">
                                  {(r.items || [])
                                    .map((ri) => {
                                      const ims = (ri.imeis || []).filter(Boolean);
                                      return `${ri.productName || "Item"} x${Number(ri.qty || ims.length || 1)}${
                                        ims.length ? ` (IMEI: ${ims.join(", ")})` : ""
                                      }`;
                                    })
                                    .join(", ") || "Items returned"}
                                </div>
                                <div className="flex gap-3 flex-wrap text-[10px]">
                                  <span>
                                    Udhaar reduced{" "}
                                    <strong className="text-rose-300">Rs. {Number(r.dueReduced || 0).toLocaleString()}</strong>
                                  </span>
                                  <span>
                                    cash back{" "}
                                    <strong className="text-emerald-300">Rs. {Number(r.cashBack || 0).toLocaleString()}</strong>
                                  </span>
                                  {r.by && <span className="text-slate-500">by {r.by}</span>}
                                </div>
                                {r.note && <p className="text-[10px] text-slate-400 italic">Note: {r.note}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {filteredHistoryTransactions.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-xs bg-slate-950/30 rounded-2xl border border-slate-800/60">
                  No matching transaction records found.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center mt-4 gap-3">
              <div className="text-xs text-slate-400">
                Total recorded transactions: <strong className="text-slate-200">{activeTransactions.length}</strong>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400">Outstanding Udhaar Balance:</span>
                <span className="text-xl font-black text-rose-400">
                  {shopSettings.currencySymbol} {Number(activeHistoryCust.totalPending || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Printable Statement / Khata Slip Modal */}
      {statementCustomer && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto print:static print:bg-transparent print:p-0 print:block">
          <div className="bg-white text-slate-900 w-full max-w-2xl rounded-2xl p-6 shadow-2xl relative print:shadow-none print:w-full print:max-w-none print:rounded-none print:p-0">
            <button
              onClick={() => setStatementCustomer(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-800 print:hidden p-1 rounded-full hover:bg-slate-100"
            >
              <X size={18} />
            </button>

            <div id="statement-print-area" className="p-4 bg-white text-black print-target">
              {/* Header */}
              <div className="text-center border-b-2 border-black pb-3 mb-3">
                <h2 className="text-2xl font-black uppercase tracking-tight">
                  {shopSettings.shopName || "MOBILE SHOP"}
                </h2>
                <p className="text-xs">{shopSettings.address || shopSettings.shopAddress}</p>
                <p className="text-xs">Ph: {shopSettings.phone || shopSettings.shopPhone}</p>
                <div className="mt-2 inline-block text-[11px] font-extrabold px-3 py-1 bg-black text-white uppercase tracking-wider">
                  CUSTOMER ACCOUNT STATEMENT / KHATA SLIP
                </div>
              </div>

              {/* Customer Info */}
              <div className="flex justify-between text-xs py-2 border-b border-dashed border-black">
                <div>
                  <p><span className="font-bold">Customer:</span> {statementCustomer.name}</p>
                  <p><span className="font-bold">Phone:</span> {statementCustomer.phone || "—"}</p>
                  {statementCustomer.address && <p><span className="font-bold">Address:</span> {statementCustomer.address}</p>}
                </div>
                <div className="text-right">
                  <p><span className="font-bold">Date:</span> {new Date().toLocaleDateString("en-GB")}</p>
                  <p><span className="font-bold">Time:</span> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  <p><span className="font-bold">Status:</span> {statementCustomer.totalPending > 0 ? "OUTSTANDING" : "SETTLED"}</p>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="my-3">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-black text-left text-[11px] uppercase">
                      <th className="py-1">Day / Date</th>
                      <th className="py-1">Bill / Ref #</th>
                      <th className="py-1">Description / Items</th>
                      <th className="py-1 text-right">Debit (+)</th>
                      <th className="py-1 text-right">Credit (-)</th>
                      <th className="py-1 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getCustomerTransactions(statementCustomer).map((tx) => (
                      <tr key={tx.id} className="border-b border-slate-200 text-[11px]">
                        <td className="py-1.5 whitespace-nowrap">
                          <span className="font-bold block">{tx.dateInfo.day}</span>
                          <span className="text-[10px] text-slate-600">{tx.dateInfo.date}</span>
                        </td>
                        <td className="py-1.5 font-mono font-bold text-[10px]">{tx.billNumber}</td>
                        <td className="py-1.5">
                          {tx.isPayment ? (
                            <span className="font-semibold text-emerald-700">{tx.notes || "Udhaar Payment"}</span>
                          ) : (
                            <div>
                              <span className="font-medium">
                                {(tx.items || [])
                                  .map((i) => {
                                    const r = lineReturnInfo(i);
                                    const tag = r.fullyReturned ? ", returned" : r.returnedCount > 0 ? `, ${r.returnedCount} returned` : "";
                                    return `${i.productName || i.name} (x${i.quantity || 1}${tag})`;
                                  })
                                  .join(", ") || "Sale"}
                              </span>
                              {(tx.isReturned || tx.returnedTotal > 0) && (
                                <span className="text-[9px] font-bold block uppercase">
                                  {tx.isReturned ? "Bill returned" : "Partly returned"}
                                  {tx.returnedTotal > 0 && `: Rs. ${tx.returnedTotal.toLocaleString()}`}
                                </span>
                              )}
                              {tx.items?.some((i) => i.imei || i.imeisArray?.length) && (
                                <span className="text-[9px] text-slate-500 block font-mono">
                                  IMEI: {tx.items.map((i) => i.imei || i.imeisArray?.join(", ")).filter(Boolean).join(", ")}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 text-right font-semibold">
                          {tx.isCredit ? `Rs. ${tx.udhaarAdded.toLocaleString()}` : "—"}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-emerald-700">
                          {tx.isPayment
                            ? `Rs. ${tx.paymentReceived.toLocaleString()}`
                            : tx.oldBalancePaid > 0
                            ? `Rs. ${tx.oldBalancePaid.toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="py-1.5 text-right font-black">
                          Rs. {tx.runningBalance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="border-t-2 border-black pt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Total Purchases / Bills:</span>
                  <span className="font-bold">Rs. {Number(statementCustomer.totalPurchases || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Payments Received:</span>
                  <span className="font-bold text-emerald-700">Rs. {Number(statementCustomer.totalPaid || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-base font-black border-t-2 border-black pt-2 mt-1">
                  <span>CURRENT OUTSTANDING UDHAAR:</span>
                  <span className="text-red-600">Rs. {Number(statementCustomer.totalPending || 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-black mt-4 pt-3 flex justify-between text-[10px] text-slate-500">
                <span>Generated by Mobile POS</span>
                <span>Customer Signature: __________________</span>
              </div>
            </div>

            {/* Print & Share Actions */}
            <div className="flex gap-2 pt-3 print:hidden mt-2 border-t border-slate-200">
              <button
                onClick={() => printElement("statement-print-area", "Statement")}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow"
              >
                <Printer size={15} /> Print Statement
              </button>
              <button
                onClick={handleWhatsAppStatementShare}
                disabled={isCapturingImage}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow disabled:opacity-60"
              >
                {isCapturingImage ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>{" "}
                    Preparing...
                  </>
                ) : (
                  <>
                    <Smartphone size={15} /> WhatsApp Statement
                  </>
                )}
              </button>
              <button
                onClick={() => setStatementCustomer(null)}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Receipt Modal - Micro Thermal Roll Format */}
      {paymentReceipt && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[60] overflow-y-auto print:static print:bg-transparent print:p-0 print:block">
          <div className="bg-white text-slate-900 w-full max-w-sm rounded-2xl p-5 shadow-2xl relative print:shadow-none print:w-full print:max-w-none print:rounded-none print:p-0">
            <button
              onClick={() => setPaymentReceipt(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-800 print:hidden p-1 rounded-full hover:bg-slate-100"
            >
              <X size={18} />
            </button>

            <div id="receipt-content" className="p-5 max-h-[70vh] overflow-y-auto print:max-h-none print:p-0 bg-white text-black print-target">
              {/* Header */}
              <div className="text-center mb-4">
                <h2 className="text-xl font-black uppercase tracking-tight">
                  {shopSettings.shopName || "MOBILE SHOP"}
                </h2>
                <p className="text-xs mt-0.5">{shopSettings.address || shopSettings.shopAddress}</p>
                <p className="text-xs">Ph: {shopSettings.phone || shopSettings.shopPhone}</p>
                <div className="mt-1 inline-block text-[10px] font-bold px-2 py-0.5 border border-black uppercase">
                  Payment Receipt Slip
                </div>
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>

              {/* Receipt Info */}
              <div className="text-xs space-y-1 pb-2">
                <div className="flex justify-between">
                  <span className="font-semibold">Receipt #:</span>
                  <span className="font-bold">{paymentReceipt.billNumber || "RCPT-001"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Date:</span>
                  <span>
                    {new Date(paymentReceipt.createdAt).toLocaleDateString()}{" "}
                    {new Date(paymentReceipt.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="font-semibold">Customer:</span>
                  <span className="font-bold">{paymentReceipt.customerName}</span>
                </div>
                {paymentReceipt.customerPhone && (
                  <div className="flex justify-between">
                    <span className="font-semibold">Phone:</span>
                    <span>{paymentReceipt.customerPhone}</span>
                  </div>
                )}
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>

              {/* Received Box */}
              <div className="text-center my-4">
                <p className="text-[12px] font-bold uppercase tracking-wider mb-1">Amount Received</p>
                <p className="text-2xl font-black">Rs. {paymentReceipt.paidAmount?.toLocaleString()}</p>
                {paymentReceipt.notes && <p className="text-[10px] mt-1 italic">{paymentReceipt.notes}</p>}
              </div>

              {/* Remaining Udhaar */}
              {(() => {
                const currentCust = customers.find(
                  (c) => c.id === paymentReceipt.customerId || c.id === paymentReceipt.customer
                );
                if (currentCust) {
                  return (
                    <div className="flex justify-between font-black text-sm pt-2 border-t-2 border-dashed border-black text-rose-600">
                      <span>REMAINING BALANCE:</span>
                      <span>Rs. {currentCust.totalPending.toLocaleString()}</span>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="border-t-2 border-dashed border-black my-3"></div>
              <div className="text-center text-xs font-bold mt-2">THANK YOU FOR YOUR PAYMENT</div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 print:hidden flex-wrap p-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button
                onClick={() => printElement("receipt-content", "Payment Receipt")}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow"
              >
                <Printer size={15} /> Print
              </button>
              <button
                onClick={handleWhatsAppShare}
                disabled={isCapturingImage}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow disabled:opacity-60"
              >
                {isCapturingImage ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>{" "}
                    Preparing...
                  </>
                ) : (
                  <>
                    <Smartphone size={15} /> WhatsApp
                  </>
                )}
              </button>
              <button
                onClick={() => setPaymentReceipt(null)}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1"
              >
                <CheckCircle2 size={15} /> Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status message (returns, account changes, WhatsApp sharing) */}
      {notice && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-2rem)] max-w-md print:hidden">
          <div
            className={`flex items-start gap-2.5 p-3.5 rounded-2xl border shadow-2xl text-xs font-semibold backdrop-blur-md ${
              notice.type === "error"
                ? "bg-rose-950/90 border-rose-500/40 text-rose-200"
                : notice.type === "info"
                ? "bg-slate-900/95 border-slate-700 text-slate-200"
                : "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
            }`}
          >
            <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1">{notice.text}</span>
            <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white p-0.5 rounded-md">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default PendingPayments;
