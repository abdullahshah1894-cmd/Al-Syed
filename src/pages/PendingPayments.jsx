import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, SELLERS } from "../context/AppContext";
import { formatWAPhone } from "./POS";
import html2canvas from "html2canvas";
import { printElement } from "../services/printReceipt";
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

const PendingPayments = () => {
  const {
    customers: ctxCustomers,
    allCustomers,
    sales: ctxSales,
    allSales,
    payPendingAmount,
    shopSettings,
    activeSeller,
  } = useApp();

  const customers = allCustomers || ctxCustomers || [];
  const sales = allSales || ctxSales || [];
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("All"); // "All" | "Aziz" | "Mubashir"
  const [viewFilter, setViewFilter] = useState("all"); // "all" | "pending"
  const [selectedCustForPayment, setSelectedCustForPayment] = useState(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [historyCust, setHistoryCust] = useState(null);
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [statementCustomer, setStatementCustomer] = useState(null);
  const [isCapturingImage, setIsCapturingImage] = useState(false);

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

  // Check if a customer record is associated with a specific seller
  const isCustomerOfSeller = (c, seller) => {
    if (!seller || seller === "All" || seller === "All Sellers") return true;
    const sLower = seller.trim().toLowerCase();

    // 1. Customer's assigned seller name
    if ((c.sellerName || "").toLowerCase().includes(sLower)) return true;

    // 2. Customer's own name is or includes the seller (e.g. Aziz or Mubashir account)
    if ((c.name || "").toLowerCase().includes(sLower)) return true;

    // 3. Customer has sales or receipts handled by this seller
    const hasSaleWithSeller = sales.some(
      (sale) =>
        (sale.customerId === c.id ||
          sale.customer === c.id ||
          (c.phone && sale.customerPhone && sale.customerPhone.trim() === c.phone.trim()) ||
          (c.name && sale.customerName && sale.customerName.trim().toLowerCase() === c.name.trim().toLowerCase())) &&
        ((sale.sellerName || "").toLowerCase().includes(sLower) ||
          (sale.cashierName || "").toLowerCase().includes(sLower))
    );

    return hasSaleWithSeller;
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
      const isCustSale =
        s.customerId === c.id ||
        s.customer === c.id ||
        (c.phone && s.customerPhone && s.customerPhone.trim() === c.phone.trim()) ||
        (c.name && s.customerName && s.customerName.trim().toLowerCase() === c.name.trim().toLowerCase());

      if (!isCustSale) return false;

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
  }, [customers, sales, searchTerm, selectedSeller, viewFilter]);

  // Dynamic Statistics based on current seller selection
  const stats = useMemo(() => {
    const targetCustomers = customers.filter((c) => isCustomerOfSeller(c, selectedSeller));

    const totalPendingAmount = targetCustomers.reduce((sum, c) => sum + (Number(c.totalPending) || 0), 0);
    const pendingCount = targetCustomers.filter((c) => Number(c.totalPending) > 0).length;
    const totalCollected = targetCustomers.reduce((sum, c) => sum + (Number(c.totalPaid) || 0), 0);
    const allCount = targetCustomers.length;

    return { totalPendingAmount, pendingCount, totalCollected, allCount };
  }, [customers, sales, selectedSeller]);

  // Retrieve and calculate complete chronological ledger for a given customer
  const getCustomerTransactions = (cust) => {
    if (!cust) return [];

    const custSales = sales.filter((s) => {
      if (s.customerId && s.customerId === cust.id) return true;
      if (s.customer && s.customer === cust.id) return true;
      if (cust.phone && s.customerPhone && s.customerPhone.trim() === cust.phone.trim()) return true;
      if (cust.name && s.customerName && s.customerName.trim().toLowerCase() === cust.name.trim().toLowerCase()) return true;
      return false;
    });

    // Sort chronologically (oldest to newest) to accurately compute running Udhaar balance
    const sorted = [...custSales].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let runningBalance = 0;
    return sorted.map((record) => {
      const isPayment = record.paymentMethod === "Udhaar Settlement";
      const isCredit =
        (record.paymentMethod || "").toLowerCase().includes("credit") ||
        (record.paymentMethod || "").toLowerCase().includes("udhaar") ||
        record.paymentMethod === "Pending Bill";
      const isCash = !isPayment && !isCredit;

      const grandTotal = Number(record.grandTotal || 0);
      const paidAmount = Number(record.paidAmount || 0);
      const dueAmount = Number(record.dueAmount || 0);

      let paymentReceived = 0;
      let udhaarAdded = 0;

      if (isPayment) {
        paymentReceived = paidAmount;
        runningBalance = Math.max(0, runningBalance - paymentReceived);
      } else if (isCredit) {
        udhaarAdded = dueAmount > 0 ? dueAmount : Math.max(0, grandTotal - paidAmount);
        paymentReceived = paidAmount; // upfront paid at time of sale
        runningBalance += udhaarAdded;
      } else {
        // Cash sale
        paymentReceived = grandTotal;
      }

      const dateInfo = formatDateWithDay(record.createdAt);

      return {
        ...record,
        isPayment,
        isCredit,
        isCash,
        paymentReceived,
        udhaarAdded,
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

  const handleSettlePayment = async (e) => {
    e.preventDefault();
    if (!selectedCustForPayment || !paymentAmountInput || Number(paymentAmountInput) <= 0) return;

    const receipt = await payPendingAmount(selectedCustForPayment.id, Number(paymentAmountInput));

    if (receipt) {
      setPaymentReceipt(receipt);
    }

    setSelectedCustForPayment(null);
    setPaymentAmountInput("");
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
        text += `• ${d} | Bill #${tx.billNumber}: ${currency} ${tx.grandTotal?.toLocaleString()} (Bal: ${currency} ${tx.runningBalance?.toLocaleString()})\n`;
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

  // Robust WhatsApp sender (works reliably on both Desktop & Mobile)
  const openWhatsAppShare = async ({ element, phone, text, defaultFileName }) => {
    setIsCapturingImage(true);

    const formattedPhone = formatWAPhone(phone);
    const waUrl = formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // 1. Mobile native share attempt
    if (isMobile && element && navigator.canShare) {
      try {
        const canvas = await html2canvas(element, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          allowTaint: true,
          logging: false,
        });

        const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
        if (blob) {
          const file = new File([blob], defaultFileName || "Receipt.png", { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "Receipt",
              text: text,
            });
            setIsCapturingImage(false);
            return;
          }
        }
      } catch (shareErr) {
        if (shareErr.name === "AbortError") {
          setIsCapturingImage(false);
          return;
        }
        console.warn("Native share failed, falling back to direct WhatsApp link:", shareErr);
      }
    }

    // 2. Desktop Flow: copy image to clipboard & download image slip
    if (element) {
      try {
        const canvas = await html2canvas(element, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          allowTaint: true,
          logging: false,
        });

        canvas.toBlob(async (blob) => {
          if (blob) {
            // Try clipboard copy so user can directly Ctrl+V into WhatsApp chat
            try {
              if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
              }
            } catch (clipErr) {
              console.log("Clipboard copy not supported:", clipErr);
            }

            // Download image slip
            try {
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = defaultFileName || "Receipt.png";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (dlErr) {
              console.log("Download fallback skipped:", dlErr);
            }
          }
        }, "image/png");
      } catch (canvasErr) {
        console.warn("Canvas capture warning:", canvasErr);
      }
    }

    // 3. Always open WhatsApp with pre-filled receipt details
    setTimeout(() => {
      window.open(waUrl, "_blank");
      setIsCapturingImage(false);
    }, 300);
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
    });
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
                      setSelectedCustForPayment(cust);
                      setPaymentAmountInput(String(cust.totalPending));
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
                  >
                    <DollarSign size={14} />
                    <span>Record Payment</span>
                  </button>
                )}
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

      {/* Payment Settlement Modal */}
      {selectedCustForPayment && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base">Record Pending Payment</h3>
              <button
                onClick={() => setSelectedCustForPayment(null)}
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

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCustForPayment(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20"
                >
                  Confirm & Update Balance
                </button>
              </div>
            </form>
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
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => setStatementCustomer(activeHistoryCust)}
                  className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Printer size={14} />
                  <span>Print Statement</span>
                </button>

                {activeHistoryCust.totalPending > 0 && (
                  <button
                    onClick={() => {
                      setSelectedCustForPayment(activeHistoryCust);
                      setPaymentAmountInput(String(activeHistoryCust.totalPending));
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
                  >
                    <DollarSign size={14} />
                    <span>Record Payment</span>
                  </button>
                )}

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
                            : tx.isCredit
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        }`}
                      >
                        {tx.isPayment ? (
                          <>
                            <DollarSign size={11} /> Payment Received
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
                    </div>

                    {/* Amount & Balance column */}
                    <div className="text-left sm:text-right w-full sm:w-auto">
                      <div
                        className={`text-lg font-black ${
                          tx.isPayment ? "text-emerald-400" : tx.isCredit ? "text-rose-400" : "text-blue-400"
                        }`}
                      >
                        {tx.isPayment
                          ? `+${shopSettings.currencySymbol} ${tx.paymentReceived.toLocaleString()}`
                          : `${shopSettings.currencySymbol} ${tx.grandTotal.toLocaleString()}`}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {tx.isCredit && tx.paymentReceived > 0 && (
                          <span className="text-emerald-400 font-semibold mr-1.5">
                            (Paid: Rs. {tx.paymentReceived.toLocaleString()} | Due: +Rs. {tx.udhaarAdded.toLocaleString()})
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

                            return (
                              <div
                                key={idx}
                                className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 text-xs"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <span className="font-bold text-slate-200">
                                      {item.productName || item.name || "Product"}
                                    </span>
                                    {item.category && (
                                      <span className="ml-2 text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded">
                                        {item.category}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-right whitespace-nowrap">
                                    <span className="font-extrabold text-slate-100">
                                      Rs. {itemSubtotal.toLocaleString()}
                                    </span>
                                    <span className="block text-[10px] text-slate-400">
                                      {itemQty} x Rs. {itemPrice.toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                {/* IMEIs list if present */}
                                {imeis.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-900">
                                    {imeis.map((im, imIdx) => (
                                      <span
                                        key={imIdx}
                                        className="inline-flex items-center gap-1 font-mono text-[10px] bg-indigo-950/40 text-indigo-300 border border-indigo-800/50 px-2 py-0.5 rounded-md"
                                      >
                                        <Smartphone size={10} className="text-indigo-400" />
                                        <span>IMEI: {im}</span>
                                      </span>
                                    ))}
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
                                {(tx.items || []).map((i) => `${i.productName || i.name} (x${i.quantity || 1})`).join(", ") || "Sale"}
                              </span>
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
                          {tx.isPayment ? `Rs. ${tx.paymentReceived.toLocaleString()}` : "—"}
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
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto print:static print:bg-transparent print:p-0 print:block">
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
    </>
  );
};

export default PendingPayments;
