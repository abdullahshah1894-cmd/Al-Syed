import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, SELLERS } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { useShareImage } from "../components/useShareImage";
import { printElement } from "../services/printReceipt";
import { isSettlement, itemImeis, saleBelongsTo, udhaarAdded as saleUdhaar, udhaarCollected } from "../utils/sales";
import {
  Clock,
  CheckCircle2,
  Banknote,
  User,
  Search,
  X,
  Printer,
  Smartphone,
  FileText,
  ShoppingBag,
  Users,
  RotateCcw,
  Pencil,
  Trash2,
  Undo2,
  Share2,
  ArrowUpDown,
} from "lucide-react";
import {
  Page,
  PageHeader,
  Card,
  Stat,
  Badge,
  Button,
  IconButton,
  Field,
  Input,
  Select,
  Segmented,
  EmptyState,
  Modal,
  inputClass,
} from "../components/ui";

// "Statement_Ali Khan/2" -> "Statement_Ali_Khan_2.png" (safe on every phone / computer)
const pngName = (base) => `${String(base || "Receipt").replace(/[^\w.-]+/g, "_")}.png`;

// Everything searchable about one bill line (name and every IMEI form)
const itemSearchText = (item) =>
  [
    item?.productName,
    item?.name,
    ...itemImeis(item),
    ...(Array.isArray(item?.imeis) ? item.imeis.map((im) => (typeof im === "string" ? im : im?.imei)) : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

// Short "Item x1 (IMEI: ...)" list of what came back in one return
const returnItemsText = (items) =>
  (items || [])
    .map((ri) => {
      const ims = (ri.imeis || []).filter(Boolean);
      return `${ri.productName || "Item"} x${Number(ri.qty || ims.length || 1)}${ims.length ? ` (IMEI: ${ims.join(", ")})` : ""}`;
    })
    .join(", ");

// Helper to format date with day of the week
const formatDateWithDay = (dateStr) => {
  if (!dateStr) return { day: "—", date: "—", time: "—", full: "—" };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { day: "—", date: String(dateStr), time: "—", full: String(dateStr) };

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[d.getDay()];

  // dd/mm/yyyy, the way the shop writes dates
  const dateFormatted = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const timeFormatted = d.toLocaleTimeString("en-GB", {
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

// What a return took off the customer's balance. New records keep it as accountReduced (dueReduced is
// how much the bill's due went down); older records only have dueReduced, which meant the same thing.
const returnAccountPart = (ret) =>
  Number(ret?.accountReduced !== undefined && ret?.accountReduced !== null ? ret.accountReduced : ret?.dueReduced || 0);

// Letters / digits only, lower case: "0300-123 4567" -> "03001234567"
const alnum = (v) => String(v || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Totals of a ledger. billed = bills as they were made, returned = refunds on returns,
// paidAtSale = what was paid on the bills when they were made, received = Udhaar payments (receipts
// plus money paid above a bill, the same rule as every report), cashBack = refunds given in cash.
// billed - returned - paidAtSale - received + cashBack is the balance (before any old record / bill edit).
const ledgerTotals = (txs) => {
  const t = (txs || []).reduce(
    (acc, tx) => {
      if (tx.isReturnEntry) {
        acc.cashBack += tx.cashBack;
        acc.returned += tx.returnAmount;
      } else if (tx.isPayment) {
        acc.received += tx.paymentReceived;
        acc.payments += 1;
      } else {
        acc.billed += tx.originalTotal;
        acc.paidAtSale += tx.paidAtSale;
        acc.received += tx.oldBalancePaid;
        acc.bills += 1;
      }
      return acc;
    },
    { billed: 0, returned: 0, paidAtSale: 0, received: 0, cashBack: 0, bills: 0, payments: 0 }
  );
  // Money the customer has paid in all, after the cash given back on returns
  t.totalPaid = t.paidAtSale + t.received - t.cashBack;
  return t;
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
  // Account edit / delete and returns are for the owner only (the server answers 403 to cashiers)
  const { isAdmin } = useAuth();
  // Receipt / statement image preview with WhatsApp / Share to… / Copy / Download
  const [openShare, shareDialog] = useShareImage();

  // The account list follows the header seller filter like every other page (ctxCustomers is already
  // filtered). A customer's khata always uses all of their records, so its balance matches the account.
  const everyCustomer = useMemo(() => allCustomers || ctxCustomers || [], [allCustomers, ctxCustomers]);
  const customers = useMemo(() => ctxCustomers || everyCustomer, [ctxCustomers, everyCustomer]);
  const sales = useMemo(() => allSales || ctxSales || [], [allSales, ctxSales]);
  // Records of the header seller (all records when no seller is picked there)
  const headerSales = useMemo(() => ctxSales || sales, [ctxSales, sales]);
  const headerSellerOn = !!activeSeller && activeSeller !== "All Sellers" && activeSeller !== "All";
  const findCustomer = (id) => everyCustomer.find((c) => c.id === id) || null;
  const [searchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("All"); // "All" | "Aziz" | "Mubashir"
  const [viewFilter, setViewFilter] = useState("all"); // "all" | "pending"
  const [selectedCustForPayment, setSelectedCustForPayment] = useState(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentSeller, setPaymentSeller] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  // Set at once (state updates only land on the next render), so a fast double / triple click saves once
  const paymentLockRef = useRef(false);
  const [historyCust, setHistoryCust] = useState(null);
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  // Only the id is kept: the statement always shows the customer's latest balance
  const [statementCustId, setStatementCustId] = useState(null);
  const statementCustomer = statementCustId ? findCustomer(statementCustId) : null;
  // The customer in the payment modal, read fresh so the outstanding amount is current
  const payCust = selectedCustForPayment
    ? findCustomer(selectedCustForPayment.id) || selectedCustForPayment
    : null;

  // Short status message at the bottom of the screen (returns, account changes)
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

  // Sync with URL query parameters if present (e.g., from Header global search).
  // Done while rendering (once per new URL) instead of in an effect, so there is no extra render pass.
  const paramKey = searchParams.toString();
  const [syncedParamKey, setSyncedParamKey] = useState(null);
  if (syncedParamKey !== paramKey) {
    setSyncedParamKey(paramKey);
    const sParam = searchParams.get("search");
    if (sParam) {
      setSearchTerm(sParam);
      setViewFilter("all");
    }
    const sellerParam = searchParams.get("seller");
    if (sellerParam) {
      setSelectedSeller(SELLERS.find((s) => s.toLowerCase() === sellerParam.trim().toLowerCase()) || sellerParam);
      setViewFilter("all");
    }
  }

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
  const isCustomerOfSeller = useCallback(
    (c, seller) => {
      if (!seller || seller === "All" || seller === "All Sellers") return true;
      return customerSellerMap.get(c.id) === seller.trim().toLowerCase();
    },
    [customerSellerMap]
  );

  // A search needs at least one letter or digit: "-" or "." alone would match almost everyone
  const activeQuery = /[\p{L}\p{N}]/u.test(searchTerm) ? searchTerm.trim().toLowerCase() : "";

  // Comprehensive customer search matcher
  const matchesSearch = useCallback(
    (c, q) => {
      if (!q) return true;

      // Customer Name
      if ((c.name || "").toLowerCase().includes(q)) return true;

      // Phone / CNIC: digits only on both sides ("0300-123" finds "0300 1234567"); an empty number never matches
      const qKey = alnum(q);
      if (qKey && alnum(c.phone) && alnum(c.phone).includes(qKey)) return true;
      if (qKey && alnum(c.cnic) && alnum(c.cnic).includes(qKey)) return true;

      // Address
      if ((c.address || "").toLowerCase().includes(q)) return true;

      // Seller Name
      if ((c.sellerName || "").toLowerCase().includes(q)) return true;

      // Matching invoice number, item name, or note
      return sales.some((s) => {
        if (!saleBelongsTo(s, c)) return false;
        if ((s.billNumber || "").toLowerCase().includes(q)) return true;
        if ((s.notes || "").toLowerCase().includes(q)) return true;
        return (s.items || []).some((it) => itemSearchText(it).includes(q));
      });
    },
    [sales]
  );

  // Filtered customer list
  const filteredCustomers = useMemo(
    () =>
      customers.filter((c) => {
        // 1. Seller filter
        if (!isCustomerOfSeller(c, selectedSeller)) return false;

        // 2. Search match
        if (!matchesSearch(c, activeQuery)) return false;

        // 3. Status filter: a search always shows the matching customer, even with a 0 balance
        if (activeQuery) return true;

        // If user specifically filtered for "pending", only show outstanding accounts
        if (viewFilter === "pending") return Number(c.totalPending || 0) > 0;

        return true;
      }),
    [customers, activeQuery, selectedSeller, viewFilter, isCustomerOfSeller, matchesSearch]
  );

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
    // Udhaar money collected (same rule as every report: receipts plus overpayment on a sale),
    // only records of the header seller when one is picked there
    const totalCollected = headerSales.reduce((sum, s) => {
      const got = udhaarCollected(s);
      if (!got || !targetCustomers.some((c) => saleBelongsTo(s, c))) return sum;
      return sum + got;
    }, 0);
    const allCount = targetCustomers.length;

    return { totalPendingAmount, pendingCount, totalCollected, allCount };
  }, [customers, headerSales, selectedSeller, isCustomerOfSeller]);

  // Retrieve and calculate complete chronological ledger for a given customer
  const getCustomerTransactions = (cust) => {
    if (!cust) return [];

    const custSales = sales.filter((s) => saleBelongsTo(s, cust));
    const timeOf = (d) => {
      const t = new Date(d).getTime();
      return isNaN(t) ? 0 : t;
    };

    // Ledger events in time order: every bill / payment receipt when it was made, and every
    // return when it happened (a return lowers the balance on its own day, not on the bill's day)
    const events = [];
    custSales.forEach((record) => {
      const at = timeOf(record.createdAt);
      events.push({ record, at });
      if (isSettlement(record)) return;
      (record.returns || []).forEach((ret, idx) => {
        events.push({ record, ret, idx, at: Math.max(at, timeOf(ret.at || ret.date)) });
      });
    });
    // Stable sort: a bill stays before its own returns when the times are equal
    events.sort((a, b) => a.at - b.at);

    // Same rules as the server: a sale adds its due amount, money paid above the bill goes against
    // the old balance, a settlement lowers it (never below 0), a return lowers it by what it took off
    // the customer's account (accountReduced); the rest of the refund was cash back
    let runningBalance = 0;
    return events.map(({ record, ret, idx }) => {
      if (ret) {
        const dueReduced = Number(ret.dueReduced || 0);
        const accountReduced = returnAccountPart(ret);
        runningBalance = Math.max(0, runningBalance - accountReduced);
        const when = ret.at || ret.date || record.createdAt;
        return {
          id: `${record.id}-return-${ret.id || idx}`,
          saleId: record.id,
          isReturnEntry: true,
          isPayment: false,
          isCredit: false,
          isCash: false,
          isReturned: false,
          billNumber: record.billNumber,
          createdAt: when,
          items: ret.items || [],
          notes: ret.note || "",
          paymentMethod: "Return",
          sellerName: ret.by || "",
          returns: [],
          returnAmount: Number(ret.amount || 0),
          dueReduced,
          accountReduced,
          cashBack: Number(ret.cashBack || 0),
          grandTotal: 0,
          paidAmount: 0,
          paymentReceived: 0,
          udhaarAdded: 0,
          oldBalancePaid: 0,
          returnedTotal: 0,
          runningBalance,
          dateInfo: formatDateWithDay(when),
        };
      }

      const isPayment = isSettlement(record);
      // Returns lowered the bill's due amount on the server (by dueReduced); add that back, so the
      // bill shows the Udhaar it added when it was made (the return rows then take off their part)
      const returnedDue = (record.returns || []).reduce((sum, r) => sum + Number(r.dueReduced || 0), 0);
      const udhaarAdded = isPayment ? 0 : saleUdhaar(record) + returnedDue;
      const isCredit = !isPayment && udhaarAdded > 0;
      const isCash = !isPayment && !isCredit;

      // grandTotal / paidAmount are the bill as it is now (after returns)
      const isReturned = !isPayment && record.paymentStatus === "returned";
      const returnedTotal = (record.returns || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
      // The bill as it was made: returns lowered the total, and cash back lowered what counts as paid
      const returnedCash = (record.returns || []).reduce((sum, r) => sum + Number(r.cashBack || 0), 0);

      const grandTotal = Number(record.grandTotal || 0);
      const paidAmount = Number(record.paidAmount || 0);

      let paymentReceived;
      let oldBalancePaid = 0;

      if (isPayment) {
        paymentReceived = paidAmount;
        runningBalance = Math.max(0, runningBalance - paymentReceived);
      } else {
        oldBalancePaid = Math.max(0, paidAmount - grandTotal);
        // Paid at the time of sale, before any cash back. On an Udhaar bill that is the bill as made minus
        // the Udhaar it added (the stored paid amount can be clipped at 0 by a cash back); a cash sale was
        // paid in full, a sale paid above its total also paid that extra
        paymentReceived = isCredit
          ? Math.max(0, grandTotal + returnedTotal - udhaarAdded)
          : oldBalancePaid > 0
          ? paidAmount + returnedCash
          : grandTotal + returnedTotal;
        runningBalance = Math.max(0, runningBalance + udhaarAdded - oldBalancePaid);
      }

      const dateInfo = formatDateWithDay(record.createdAt);

      return {
        ...record,
        grandTotal,
        paidAmount,
        isPayment,
        isCredit,
        isCash,
        isReturned,
        returnedTotal,
        originalTotal: grandTotal + returnedTotal,
        // The part of the bill paid at the sale (money above the bill is in oldBalancePaid)
        paidAtSale: isPayment ? 0 : isCredit ? paymentReceived : grandTotal + returnedTotal,
        paymentReceived,
        udhaarAdded,
        oldBalancePaid,
        runningBalance,
        dateInfo,
      };
    });
  };

  // Where the ledger ends vs. the balance saved on the account (the saved balance is what counts)
  const ledgerGap = (cust, txs) => {
    const ledgerEnd = txs.length ? txs[txs.length - 1].runningBalance : 0;
    const diff = Number(cust?.totalPending || 0) - ledgerEnd;
    return Math.abs(diff) >= 1 ? { ledgerEnd, diff } : null;
  };

  // Handler when selecting a seller button
  const handleSelectSeller = (sellerName) => {
    if (selectedSeller.toLowerCase() === sellerName.toLowerCase()) {
      // Toggle back to All Sellers
      setSelectedSeller("All");
    } else {
      // The "Owes Udhaar" / "All accounts" choice stays as it is
      setSelectedSeller(sellerName);
    }
  };

  // Open the payment modal; the receiving seller defaults to the customer's seller or the current filter
  const openPaymentModal = (cust) => {
    const pick = (name) => SELLERS.find((s) => s.toLowerCase() === (name || "").trim().toLowerCase()) || "";
    setSelectedCustForPayment(cust);
    setPaymentAmountInput(String(cust.totalPending));
    setPaymentSeller(pick(cust.sellerName) || pick(selectedSeller) || pick(activeSeller));
  };

  // useCallback: the modal re-focuses itself whenever onClose changes, so it must stay the same while typing
  const closePaymentModal = useCallback(() => {
    if (isSubmittingPayment) return;
    setSelectedCustForPayment(null);
    setPaymentAmountInput("");
  }, [isSubmittingPayment]);

  const handleSettlePayment = async (e) => {
    e.preventDefault();
    if (paymentLockRef.current || isSubmittingPayment) return;
    if (!selectedCustForPayment || !paymentAmountInput || !(Number(paymentAmountInput) > 0)) return;

    paymentLockRef.current = true;
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
      paymentLockRef.current = false;
      setIsSubmittingPayment(false);
    }
  };

  // Helper: Format text receipt for WhatsApp
  const getPaymentReceiptWAText = (receipt) => {
    const shopName = shopSettings.shopName || "MOBILE SHOP";
    const shopPhone = shopSettings.phone || shopSettings.shopPhone || "";
    const currency = shopSettings.currencySymbol || "Rs.";
    const dateStr = new Date(receipt.createdAt || Date.now()).toLocaleDateString("en-GB");
    const timeStr = new Date(receipt.createdAt || Date.now()).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const cust = findCustomer(receipt.customerId || receipt.customer);

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
    const totals = ledgerTotals(custTx);

    let text = `📋 *${shopName}*\n`;
    if (shopPhone) text += `📞 Phone: ${shopPhone}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*CUSTOMER UDHAAR STATEMENT*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Customer:* ${cust.name || "Customer"}\n`;
    if (cust.phone) text += `*Phone:* ${cust.phone}\n`;
    text += `*Date:* ${dateStr}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Total Purchases (after returns):* ${currency} ${Number(cust.totalPurchases || 0).toLocaleString()}\n`;
    text += `*Paid at sale:* ${currency} ${totals.paidAtSale.toLocaleString()}\n`;
    text += `*Payments received:* ${currency} ${totals.received.toLocaleString()}\n`;
    if (totals.cashBack > 0) text += `*Cash back on returns:* ${currency} ${totals.cashBack.toLocaleString()}\n`;
    text += `*⚠️ OUTSTANDING UDHAAR:* ${currency} ${Number(cust.totalPending || 0).toLocaleString()}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Recent Transactions (Last 5):*\n`;

    const recent = custTx.slice(-5);
    recent.forEach((tx) => {
      const d = tx.dateInfo ? `${tx.dateInfo.day}, ${tx.dateInfo.date}` : "";
      if (tx.isReturnEntry) {
        const parts = [`Udhaar -${currency} ${tx.accountReduced.toLocaleString()}`];
        if (tx.cashBack > 0) parts.push(`cash back ${currency} ${tx.cashBack.toLocaleString()}`);
        text += `• ${d} | Return on Bill #${tx.billNumber}: ${currency} ${tx.returnAmount.toLocaleString()} (${parts.join(", ")}) (Bal: ${currency} ${tx.runningBalance.toLocaleString()})\n`;
      } else if (tx.isPayment) {
        text += `• ${d} | Payment: +${currency} ${tx.paymentReceived?.toLocaleString()} (Bal: ${currency} ${tx.runningBalance?.toLocaleString()})\n`;
      } else {
        const returnedTag = tx.isReturned
          ? " - Returned"
          : tx.returnedTotal > 0
          ? ` - Returned ${currency} ${tx.returnedTotal.toLocaleString()}`
          : "";
        text += `• ${d} | Bill #${tx.billNumber}: ${currency} ${tx.originalTotal?.toLocaleString()}${returnedTag} (Bal: ${currency} ${tx.runningBalance?.toLocaleString()})\n`;
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

  // Share the payment receipt as an image (preview, then WhatsApp / any app / copy / download)
  const handleWhatsAppShare = () => {
    if (!paymentReceipt) return;
    const cust = findCustomer(paymentReceipt.customerId || paymentReceipt.customer);
    openShare({
      element: document.getElementById("receipt-content"),
      fileName: pngName(`Receipt_${paymentReceipt.billNumber || "PAY"}`),
      phone: paymentReceipt.customerPhone || cust?.phone || "",
      text: getPaymentReceiptWAText(paymentReceipt),
      title: "Share Receipt",
    });
  };

  // Share the customer statement as an image
  const handleWhatsAppStatementShare = () => {
    if (!statementCustomer) return;
    openShare({
      element: document.getElementById("statement-print-area"),
      fileName: pngName(`Statement_${statementCustomer.name || "Customer"}`),
      phone: statementCustomer.phone || "",
      text: getStatementWAText(statementCustomer),
      title: "Share Statement",
    });
  };

  // ── Account edit / delete ────────────────────────────────────────────────
  const openEditCustomer = (cust) => {
    if (!isAdmin) return;
    setEditCust(cust);
    setEditForm({
      name: cust.name || "",
      phone: cust.phone || "",
      address: cust.address || "",
      cnic: cust.cnic || "",
      sellerName: SELLERS.find((s) => s.toLowerCase() === (cust.sellerName || "").trim().toLowerCase()) || "",
    });
  };

  const closeEditCustomer = useCallback(() => {
    if (isSavingCustomer) return;
    setEditCust(null);
  }, [isSavingCustomer]);

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!isAdmin || isSavingCustomer || !editCust || !editForm.name.trim()) return;
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

  const [deletingCustId, setDeletingCustId] = useState(null);
  const handleDeleteCustomer = async (cust) => {
    if (!isAdmin || deletingCustId) return;
    const owes = Number(cust.totalPending || 0);
    const warning =
      owes > 0
        ? `This customer still owes ${shopSettings.currencySymbol || "Rs."} ${owes.toLocaleString()}.\n\n`
        : "";
    if (!window.confirm(`${warning}Delete the account of "${cust.name || "this customer"}"? Their bills stay in the records.`)) return;

    setDeletingCustId(cust.id);
    // deleteCustomer alerts the user itself and returns false when the server refuses
    const ok = await deleteCustomer(cust.id);
    setDeletingCustId(null);
    if (!ok) return;
    // Close anything still open for this customer
    if (historyCust?.id === cust.id) {
      setHistoryCust(null);
      setHistorySearch("");
      setHistoryFilter("all");
    }
    if (statementCustId === cust.id) setStatementCustId(null);
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
  // Same as the server: the bill discount / tax is shared over its lines (bill as made / lines value)
  const returnRatio = (() => {
    if (!returnSale) return 1;
    const lines = (returnSale.items || []).reduce(
      (sum, i) =>
        sum +
        (Number(i.subtotal) ||
          Number(i.unitSalePrice || i.unitPrice || i.price || 0) * Number(i.quantity || i.qty || 1)),
      0
    );
    const made =
      Number(returnSale.grandTotal || 0) +
      (returnSale.returns || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    return lines > 0 ? made / lines : 1;
  })();
  const returnEstimate = returnSale
    ? Math.min(Number(returnSale.grandTotal || 0), Math.round(returnUnitPrice * returnCount * returnRatio * 100) / 100)
    : 0;
  // Split like the server: off the Udhaar only what this bill still owes AND the customer still owes
  // (a later payment may have cleared it already); the rest is cash back. Walk-in bills: all cash back.
  const returnCustId = returnSale ? returnSale.customerId || returnSale.customer : null;
  const returnCust = returnCustId ? findCustomer(returnCustId) : null;
  const returnBillDue = returnSale ? Math.max(0, Number(returnSale.dueAmount || 0)) : 0;
  const returnDuePart = returnSale
    ? Math.max(
        0,
        Math.min(
          returnBillDue,
          returnCustId && returnCust ? Number(returnCust.totalPending || 0) : returnBillDue,
          returnEstimate
        )
      )
    : 0;
  const returnCashPart = Math.max(0, returnEstimate - returnDuePart);

  const openReturnModal = (sale, index) => {
    if (!isAdmin) return;
    setReturnTarget({ saleId: sale.id, index });
    setReturnQty("1");
    setReturnImeis([]);
    setReturnNote("");
  };

  const closeReturnModal = useCallback(() => {
    if (isSubmittingReturn) return;
    setReturnTarget(null);
  }, [isSubmittingReturn]);

  const toggleReturnImei = (imei) =>
    setReturnImeis((prev) => (prev.includes(imei) ? prev.filter((x) => x !== imei) : [...prev, imei]));

  const handleConfirmReturn = async () => {
    if (!isAdmin || isSubmittingReturn || !returnSale || !returnInfo || !returnValid) return;
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
          ? ` ${cur} ${Number(last.amount || 0).toLocaleString()} refunded (off the Udhaar ${cur} ${returnAccountPart(
              last
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
  const activeHistoryCust = historyCust ? findCustomer(historyCust.id) || historyCust : null;

  // Process transactions for active history customer
  const activeTransactions = activeHistoryCust ? getCustomerTransactions(activeHistoryCust) : [];
  const activeGap = activeHistoryCust ? ledgerGap(activeHistoryCust, activeTransactions) : null;
  const statementTransactions = statementCustomer ? getCustomerTransactions(statementCustomer) : [];
  const statementGap = statementCustomer ? ledgerGap(statementCustomer, statementTransactions) : null;
  const activeTotals = ledgerTotals(activeTransactions);
  const statementTotals = ledgerTotals(statementTransactions);
  const billCount = activeTotals.bills;
  const paymentCount = activeTotals.payments;

  // Recomputed every render (the ledger is rebuilt from the latest sales each time)
  const filteredHistoryTransactions = (() => {
    if (!activeTransactions.length) return [];
    const q = historySearch.trim().toLowerCase();
    const list = activeTransactions.filter((t) => {
      if (historyFilter === "payments" && !t.isPayment) return false;
      if (historyFilter === "sales" && t.isPayment) return false;

      if (q) {
        const billMatch = (t.billNumber || "").toLowerCase().includes(q);
        const dayMatch = (t.dateInfo.day || "").toLowerCase().includes(q);
        const dateMatch = (t.dateInfo.date || "").toLowerCase().includes(q);
        const notesMatch = (t.notes || "").toLowerCase().includes(q);
        const methodMatch = (t.paymentMethod || "").toLowerCase().includes(q);
        const itemMatch = (t.items || []).some((item) => itemSearchText(item).includes(q));
        return billMatch || dayMatch || dateMatch || notesMatch || methodMatch || itemMatch;
      }
      return true;
    });

    return historySort === "newest" ? [...list].reverse() : list;
  })();

  const cur = shopSettings.currencySymbol || "Rs.";
  const hasFilters = selectedSeller !== "All" || !!searchTerm.trim();
  const resetFilters = () => {
    setSelectedSeller("All");
    setSearchTerm("");
    setViewFilter("all");
  };
  // Seller chips: "All" or the matching seller name (case-insensitive, like the filter itself)
  const sellerChipValue =
    selectedSeller === "All"
      ? "All"
      : SELLERS.find((s) => s.toLowerCase() === selectedSeller.toLowerCase()) || selectedSeller;

  // Esc / backdrop closes the khata only when nothing else is open on top of it
  const stackedOpen =
    !!payCust || (isAdmin && (!!editCust || !!returnTarget)) || !!statementCustomer || !!paymentReceipt;
  const closeHistory = useCallback(() => {
    if (stackedOpen) return;
    setHistoryCust(null);
    setHistorySearch("");
    setHistoryFilter("all");
  }, [stackedOpen]);

  // Day / date / time line shared by every ledger entry
  const dateLine = (dateInfo) => (
    <>
      <Badge tone="brand">{dateInfo.day}</Badge>
      <span className="text-sm font-semibold text-ink">{dateInfo.date}</span>
      <span className="text-xs text-muted">at {dateInfo.time}</span>
    </>
  );
  const billChip = (billNumber) => (
    <span className="font-mono text-[11px] font-semibold text-ink-soft bg-sunken px-2 py-0.5 rounded-md">{billNumber}</span>
  );

  return (
    <>
    <Page className={paymentReceipt || statementCustomer ? "print:hidden" : ""}>
      <PageHeader
        title="Udhaar khata"
        description="Who owes the shop and how much. Open an account to see every bill, payment and return."
      />

      {/* Totals for the current seller selection */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Udhaar to collect"
          value={`${cur} ${stats.totalPendingAmount.toLocaleString()}`}
          tone={stats.totalPendingAmount > 0 ? "khata" : "paid"}
          hint={
            selectedSeller !== "All"
              ? `${selectedSeller}'s accounts`
              : headerSellerOn
              ? `Accounts of ${activeSeller} (seller picked at the top)`
              : "All sellers"
          }
          icon={Clock}
        />
        <Stat
          label="Udhaar collected"
          value={`${cur} ${stats.totalCollected.toLocaleString()}`}
          tone="paid"
          hint="Payments and money paid on Udhaar bills"
          icon={Banknote}
        />
        <Stat
          label="Accounts with Udhaar"
          value={`${stats.pendingCount} of ${stats.allCount}`}
          hint="Customers who still owe money"
          icon={Users}
        />
      </div>

      {/* Filters */}
      <Card className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Segmented
              value={viewFilter}
              onChange={setViewFilter}
              options={[
                { value: "pending", label: `Owes Udhaar (${stats.pendingCount})` },
                { value: "all", label: `All accounts (${stats.allCount})` },
              ]}
            />
            <Segmented
              value={sellerChipValue}
              onChange={(v) => (v === "All" ? setSelectedSeller("All") : handleSelectSeller(v))}
              options={[
                { value: "All", label: "All sellers" },
                ...SELLERS.map((s) => ({ value: s, label: s })),
              ]}
            />
          </div>

          <div className="relative w-full lg:w-80 shrink-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search name, phone, bill no., IMEI…"
              aria-label="Search customers"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`${inputClass} pl-9 pr-10`}
            />
            {searchTerm && (
              <IconButton
                icon={X}
                label="Clear search"
                size="sm"
                onClick={() => setSearchTerm("")}
                className="absolute right-1 top-1/2 -translate-y-1/2"
              />
            )}
          </div>
        </div>

        {/* Active filters */}
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
            {selectedSeller !== "All" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 pl-2.5 pr-1 py-0.5 font-semibold">
                <User size={12} aria-hidden="true" /> Seller: {selectedSeller}
                <button
                  type="button"
                  onClick={() => setSelectedSeller("All")}
                  className="ml-0.5 rounded-full p-1 hover:bg-brand-100"
                  aria-label="Clear seller filter"
                  title="Clear seller filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {searchTerm.trim() && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sunken text-ink-soft pl-2.5 pr-1 py-0.5 font-semibold max-w-full">
                <Search size={12} aria-hidden="true" />
                <span className="truncate">
                  Search: "{searchTerm}"{!activeQuery && " (type a letter or number to search)"}
                </span>
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="ml-0.5 rounded-full p-1 hover:bg-line"
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            <span className="text-muted">
              {filteredCustomers.length} {filteredCustomers.length === 1 ? "customer" : "customers"} found
            </span>
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={resetFilters} className="ml-auto h-10 sm:h-8">
              Reset filters
            </Button>
          </div>
        )}
      </Card>

      {/* Customer accounts */}
      {filteredCustomers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCustomers.map((cust) => {
            // Pre-fetch last transaction info for preview
            const custTx = getCustomerTransactions(cust);
            const lastTx = custTx.length > 0 ? custTx[custTx.length - 1] : null;
            const custTotals = ledgerTotals(custTx);
            const owes = Number(cust.totalPending || 0);

            return (
              <Card
                key={cust.id}
                onClick={() => setHistoryCust(cust)}
                className="flex flex-col gap-4 cursor-pointer transition-colors hover:border-brand-200"
              >
                {/* Who */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-ink break-words">{cust.name}</h3>
                    <p className="text-xs text-muted mt-0.5 break-words">
                      {cust.phone || "No phone"}
                      {cust.address && <span> · {cust.address}</span>}
                    </p>
                  </div>
                  {cust.sellerName && <Badge tone="neutral">{cust.sellerName}</Badge>}
                </div>

                {/* The balance is what matters */}
                <div className={`rounded-xl px-4 py-3 ${owes > 0 ? "bg-khata-50" : "bg-paid-50"}`}>
                  <div className={`text-xs font-semibold ${owes > 0 ? "text-khata-700" : "text-paid-700"}`}>
                    {owes > 0 ? "Owes Udhaar" : "Balance"}
                  </div>
                  {owes > 0 ? (
                    <div className="font-display text-3xl font-bold leading-tight text-khata-600 break-words">
                      {cur} {owes.toLocaleString()}
                    </div>
                  ) : (
                    <div className="font-display text-2xl font-bold leading-tight text-paid-600 flex items-center gap-1.5">
                      <CheckCircle2 size={20} aria-hidden="true" /> Settled
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted">Total bought</div>
                    <div className="font-semibold text-ink text-sm">
                      {cur} {Number(cust.totalPurchases || 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Total paid</div>
                    <div className="font-semibold text-paid-700 text-sm">
                      {cur} {custTotals.totalPaid.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Last activity */}
                {lastTx && (
                  <div className="rounded-xl bg-sunken px-3 py-2 text-xs">
                    <div className="text-muted">
                      Last activity: {lastTx.dateInfo.day}, {lastTx.dateInfo.date}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-ink-soft">
                        {lastTx.isReturnEntry
                          ? `Return on ${lastTx.billNumber}`
                          : lastTx.isPayment
                          ? "Payment received"
                          : `Bill ${lastTx.billNumber}`}
                      </span>
                      <span
                        className={`font-semibold whitespace-nowrap ${
                          lastTx.isReturnEntry ? "text-saffron-700" : lastTx.isPayment ? "text-paid-700" : "text-ink"
                        }`}
                      >
                        {lastTx.isReturnEntry
                          ? `-${cur} ${lastTx.returnAmount.toLocaleString()}`
                          : lastTx.isPayment
                          ? `+${cur} ${lastTx.paymentReceived.toLocaleString()}`
                          : `${cur} ${lastTx.grandTotal.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
                  <Button
                    variant="secondary"
                    icon={FileText}
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHistoryCust(cust);
                    }}
                  >
                    View khata
                  </Button>

                  {cust.totalPending > 0 && (
                    <Button
                      variant="success"
                      icon={Banknote}
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPaymentModal(cust);
                      }}
                    >
                      Record payment
                    </Button>
                  )}

                  {isAdmin && (
                    <div className="flex gap-1">
                      <IconButton
                        icon={Pencil}
                        label="Edit account"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditCustomer(cust);
                        }}
                      />
                      <IconButton
                        icon={Trash2}
                        label="Delete account"
                        variant="danger-soft"
                        disabled={!!deletingCustId}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustomer(cust);
                        }}
                      />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {filteredCustomers.length === 0 && (
        <Card padded={false}>
          <EmptyState
            icon={searchTerm.trim() || selectedSeller !== "All" ? Search : CheckCircle2}
            title={activeQuery || selectedSeller !== "All" || viewFilter !== "pending" ? "No customers found" : "Nobody owes Udhaar"}
            description={
              activeQuery
                ? `No customer matches "${searchTerm}". Check the spelling or reset the filters.`
                : selectedSeller !== "All"
                ? `No customer accounts under ${selectedSeller}.`
                : viewFilter === "pending"
                ? "Every account is settled. Pick All accounts to see each customer's history."
                : "Customer accounts appear here after their first Udhaar bill."
            }
            action={
              hasFilters && (
                <Button icon={RotateCcw} onClick={resetFilters}>
                  Reset filters and show all
                </Button>
              )
            }
          />
        </Card>
      )}

      {/* Customer khata: every bill, payment and return */}
      {activeHistoryCust && (
        <Modal
          open
          onClose={closeHistory}
          size="xl"
          title={activeHistoryCust.name || "Customer"}
          description={
            <>
              Phone: <span className="font-mono">{activeHistoryCust.phone || "—"}</span>
              {activeHistoryCust.address && <span> · {activeHistoryCust.address}</span>}
              {activeHistoryCust.sellerName && <span> · Seller: {activeHistoryCust.sellerName}</span>}
            </>
          }
          footer={
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted space-y-0.5">
                <div>
                  {activeTransactions.length} {activeTransactions.length === 1 ? "entry" : "entries"} in this khata
                </div>
                {activeGap && (
                  <div className="text-saffron-700 max-w-md">
                    The entries above add up to {cur} {activeGap.ledgerEnd.toLocaleString()}; the saved account balance
                    ({cur} {Number(activeHistoryCust.totalPending || 0).toLocaleString()}) also includes older records or
                    bill edits and is the amount owed.
                  </div>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-ink-soft">Udhaar balance</span>
                {Number(activeHistoryCust.totalPending || 0) > 0 ? (
                  <span className="font-display text-xl font-bold text-khata-600">
                    {cur} {Number(activeHistoryCust.totalPending || 0).toLocaleString()}
                  </span>
                ) : (
                  <span className="font-display text-xl font-bold text-paid-600">Settled</span>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Account actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="soft" icon={Printer} onClick={() => setStatementCustId(activeHistoryCust.id)}>
                Statement
              </Button>
              {activeHistoryCust.totalPending > 0 && (
                <Button variant="success" icon={Banknote} onClick={() => openPaymentModal(activeHistoryCust)}>
                  Record payment
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button variant="secondary" icon={Pencil} onClick={() => openEditCustomer(activeHistoryCust)}>
                    Edit
                  </Button>
                  <Button
                    variant="danger-soft"
                    icon={Trash2}
                    onClick={() => handleDeleteCustomer(activeHistoryCust)}
                    disabled={!!deletingCustId}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>

            {/* Account totals */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                label="Total bought"
                value={`${cur} ${Number(activeHistoryCust.totalPurchases || 0).toLocaleString()}`}
                hint={`${billCount} ${billCount === 1 ? "bill" : "bills"}`}
              />
              <Stat
                label="Total paid"
                value={`${cur} ${activeTotals.totalPaid.toLocaleString()}`}
                tone="paid"
                hint={`${cur} ${activeTotals.paidAtSale.toLocaleString()} paid at sale + ${cur} ${activeTotals.received.toLocaleString()} in ${paymentCount} ${paymentCount === 1 ? "payment" : "payments"}${
                  activeTotals.cashBack > 0 ? ` − ${cur} ${activeTotals.cashBack.toLocaleString()} cash back` : ""
                }`}
              />
              <Stat
                label="Udhaar balance"
                value={`${cur} ${Number(activeHistoryCust.totalPending || 0).toLocaleString()}`}
                tone={activeHistoryCust.totalPending > 0 ? "khata" : "paid"}
                hint={activeHistoryCust.totalPending > 0 ? "Still to collect" : "Fully settled"}
                className={activeHistoryCust.totalPending > 0 ? "border-khata-200" : ""}
              />
            </div>

            {/* Entry filters */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <Segmented
                size="sm"
                value={historyFilter}
                onChange={setHistoryFilter}
                options={[
                  { value: "all", label: `All (${activeTransactions.length})` },
                  { value: "payments", label: `Payments (${paymentCount})` },
                  { value: "sales", label: `Bills and returns (${activeTransactions.length - paymentCount})` },
                ]}
              />
              <div className="flex items-center gap-2">
                <div className="relative flex-1 lg:w-64">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Search day, item, IMEI, bill no."
                    aria-label="Search this khata"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <Button
                  variant="secondary"
                  icon={ArrowUpDown}
                  onClick={() => setHistorySort((prev) => (prev === "newest" ? "oldest" : "newest"))}
                  title="Change the order"
                >
                  {historySort === "newest" ? "Newest first" : "Oldest first"}
                </Button>
              </div>
            </div>

            {/* Entries */}
            <div className="space-y-3">
              {filteredHistoryTransactions.map((tx) =>
                tx.isReturnEntry ? (
                  /* Return: lowers the balance on the day it happened */
                  <div key={tx.id} className="rounded-xl border border-saffron-200 bg-saffron-50/50 p-3 sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        {dateLine(tx.dateInfo)}
                        <Badge tone="saffron">
                          <Undo2 size={11} aria-hidden="true" /> Items returned
                        </Badge>
                        {billChip(tx.billNumber)}
                      </div>
                      <div className="sm:text-right">
                        <div className="font-display text-lg font-bold text-saffron-700">
                          -{cur} {tx.returnAmount.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted space-x-1.5">
                          <span className="text-khata-700 font-semibold">Off the Udhaar -{cur} {tx.accountReduced.toLocaleString()}</span>
                          {tx.cashBack > 0 && (
                            <span className="text-paid-700 font-semibold">Cash back {cur} {tx.cashBack.toLocaleString()}</span>
                          )}
                          <span>
                            Balance <strong className="text-ink">{cur} {tx.runningBalance.toLocaleString()}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-ink-soft">
                      {returnItemsText(tx.items) || "Items returned"}
                      {tx.sellerName && <span className="text-muted"> · by {tx.sellerName}</span>}
                    </div>
                    {tx.notes && <p className="text-xs text-muted italic mt-0.5">Note: {tx.notes}</p>}
                  </div>
                ) : (
                <div
                  key={tx.id}
                  className={`rounded-xl border p-3 sm:p-4 ${
                    tx.isPayment
                      ? "border-paid-200 bg-paid-50/50"
                      : tx.isReturned
                      ? "border-saffron-200 bg-saffron-50/40"
                      : tx.isCredit
                      ? "border-khata-200 bg-khata-50/40"
                      : "border-line bg-surface"
                  }`}
                >
                  {/* Top: date, type, amounts */}
                  <div className="flex flex-col gap-2 border-b border-line pb-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      {dateLine(tx.dateInfo)}
                      <Badge tone={tx.isPayment ? "paid" : tx.isReturned ? "saffron" : tx.isCredit ? "khata" : "neutral"}>
                        {tx.isPayment ? (
                          <>
                            <Banknote size={11} aria-hidden="true" /> Payment received
                          </>
                        ) : tx.isReturned ? (
                          <>
                            <Undo2 size={11} aria-hidden="true" /> Returned
                          </>
                        ) : tx.isCredit ? (
                          <>
                            <Clock size={11} aria-hidden="true" /> Udhaar bill
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={11} aria-hidden="true" /> Cash sale
                          </>
                        )}
                      </Badge>
                      {billChip(tx.billNumber)}
                      {/* Partly returned bill */}
                      {!tx.isPayment && !tx.isReturned && tx.returnedTotal > 0 && (
                        <Badge tone="saffron">
                          <Undo2 size={11} aria-hidden="true" /> Partly returned
                        </Badge>
                      )}
                    </div>

                    <div className="sm:text-right">
                      <div
                        className={`font-display text-lg font-bold ${
                          tx.isPayment
                            ? "text-paid-600"
                            : tx.isReturned
                            ? "text-saffron-700"
                            : tx.isCredit
                            ? "text-khata-600"
                            : "text-ink"
                        }`}
                      >
                        {tx.isPayment
                          ? `+${cur} ${tx.paymentReceived.toLocaleString()}`
                          : `${cur} ${tx.originalTotal.toLocaleString()}`}
                      </div>
                      {!tx.isPayment && tx.returnedTotal > 0 && (
                        <div className="text-xs font-semibold text-saffron-700">
                          {tx.isReturned
                            ? `Bill fully returned (${cur} ${tx.returnedTotal.toLocaleString()})`
                            : `Returned ${cur} ${tx.returnedTotal.toLocaleString()} · now ${cur} ${tx.grandTotal.toLocaleString()}`}
                        </div>
                      )}
                      <div className="text-xs text-muted space-x-1.5">
                        {tx.isCredit && (
                          <span className="text-paid-700 font-semibold">
                            {tx.paymentReceived > 0 && `Paid at sale ${cur} ${tx.paymentReceived.toLocaleString()} · `}
                            <span className="text-khata-700">Udhaar +{cur} {tx.udhaarAdded.toLocaleString()}</span>
                          </span>
                        )}
                        {tx.oldBalancePaid > 0 && (
                          <span className="text-paid-700 font-semibold">
                            Paid on old balance -{cur} {tx.oldBalancePaid.toLocaleString()}
                          </span>
                        )}
                        <span>
                          Balance <strong className="text-ink">{cur} {tx.runningBalance.toLocaleString()}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Body: payment note or the items on the bill */}
                  {tx.isPayment ? (
                    <div className="mt-3 flex items-start gap-2.5 text-sm">
                      <CheckCircle2 size={16} className="text-paid-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <div className="flex-1 space-y-1">
                        <p className="font-medium text-ink">
                          {tx.notes || "Payment received towards the Udhaar balance."}
                        </p>
                        <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted">
                          <span>
                            Method: <strong className="text-ink-soft">{tx.paymentMethod}</strong>
                          </span>
                          {tx.sellerName && (
                            <span>
                              Received by: <strong className="text-ink-soft">{tx.sellerName}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {tx.items && tx.items.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs font-semibold text-ink-soft">
                            <span className="flex items-center gap-1.5">
                              <ShoppingBag size={13} className="text-muted" aria-hidden="true" />
                              Items on this bill ({tx.items.length})
                            </span>
                            {tx.sellerName && (
                              <span className="font-normal text-muted">
                                Sold by <strong className="text-ink-soft">{tx.sellerName}</strong>
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
                                className={`rounded-lg border p-2.5 text-sm ${
                                  ret.fullyReturned ? "border-saffron-200 bg-sunken/60" : "border-line bg-surface"
                                }`}
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                    <span
                                      className={`font-semibold break-words ${
                                        ret.fullyReturned ? "text-muted line-through" : "text-ink"
                                      }`}
                                    >
                                      {item.productName || item.name || "Product"}
                                    </span>
                                    {item.category && <Badge tone="neutral">{item.category}</Badge>}
                                    {ret.fullyReturned ? (
                                      <Badge tone="saffron">Returned</Badge>
                                    ) : ret.returnedCount > 0 ? (
                                      <Badge tone="saffron">
                                        {ret.returnedCount} of {ret.qty} returned
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                                    <div className="sm:text-right whitespace-nowrap">
                                      <span
                                        className={`font-semibold ${
                                          ret.fullyReturned ? "text-muted line-through" : "text-ink"
                                        }`}
                                      >
                                        {cur} {itemSubtotal.toLocaleString()}
                                      </span>
                                      <span className="block text-xs text-muted">
                                        {itemQty} x {cur} {itemPrice.toLocaleString()}
                                      </span>
                                    </div>
                                    {isAdmin && ret.remaining > 0 && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        icon={Undo2}
                                        onClick={() => openReturnModal(tx, idx)}
                                        className="h-10 sm:h-8"
                                        title="Return this item to stock"
                                      >
                                        Return
                                      </Button>
                                    )}
                                  </div>
                                </div>

                                {/* IMEIs (returned ones struck through) */}
                                {imeis.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
                                    {imeis.map((im, imIdx) => {
                                      const imReturned = ret.returnedImeis.includes(im);
                                      return (
                                        <span
                                          key={imIdx}
                                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] break-all ${
                                            imReturned ? "bg-saffron-50 text-saffron-700" : "bg-sunken text-ink-soft"
                                          }`}
                                        >
                                          <Smartphone size={11} aria-hidden="true" />
                                          <span className={imReturned ? "line-through" : ""}>IMEI {im}</span>
                                          {imReturned && <span className="font-sans font-semibold">(returned)</span>}
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
                        <div className="rounded-lg bg-sunken p-2.5 text-xs italic text-muted">
                          {tx.notes || "Sale saved without item details."}
                        </div>
                      )}

                      {tx.notes && <p className="pt-1 text-xs italic text-muted">Note: {tx.notes}</p>}

                      {/* Returns on this bill */}
                      {(tx.returns || []).length > 0 && (
                        <div className="space-y-2 rounded-lg border border-saffron-200 bg-saffron-50/50 p-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-saffron-700">
                            <Undo2 size={13} aria-hidden="true" /> Returns on this bill ({tx.returns.length})
                          </div>
                          {tx.returns.map((r, rIdx) => {
                            const rDate = formatDateWithDay(r.at || r.date);
                            return (
                              <div
                                key={r.id || rIdx}
                                className="space-y-0.5 border-t border-saffron-200 pt-1.5 text-xs text-ink-soft first:border-t-0 first:pt-0"
                              >
                                <div className="flex flex-wrap justify-between gap-2">
                                  <span className="font-semibold text-ink">
                                    {rDate.day}, {rDate.date}
                                    {rDate.time !== "—" && <span className="font-normal text-muted"> at {rDate.time}</span>}
                                  </span>
                                  <span className="font-semibold text-saffron-700">
                                    {cur} {Number(r.amount || 0).toLocaleString()}
                                  </span>
                                </div>
                                <div className="text-muted">{returnItemsText(r.items) || "Items returned"}</div>
                                <div className="flex flex-wrap gap-3">
                                  <span>
                                    Off the Udhaar{" "}
                                    <strong className="text-khata-700">{cur} {returnAccountPart(r).toLocaleString()}</strong>
                                  </span>
                                  <span>
                                    Cash back{" "}
                                    <strong className="text-paid-700">{cur} {Number(r.cashBack || 0).toLocaleString()}</strong>
                                  </span>
                                  {r.by && <span className="text-muted">by {r.by}</span>}
                                </div>
                                {r.note && <p className="italic text-muted">Note: {r.note}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )
              )}

              {filteredHistoryTransactions.length === 0 && (
                <div className="rounded-xl border border-dashed border-line">
                  <EmptyState
                    icon={FileText}
                    title={activeTransactions.length ? "No entries match" : "No entries yet"}
                    description={
                      activeTransactions.length
                        ? "Clear the search or pick All to see every entry."
                        : "Bills and payments for this customer will show here."
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Record payment (above the khata, which can open it) */}
      {payCust && (
        <Modal
          open
          onClose={closePaymentModal}
          z="z-[60]"
          size="sm"
          title="Record payment"
          description="The amount comes off this customer's Udhaar."
          footer={
            <>
              <Button variant="secondary" onClick={closePaymentModal} disabled={isSubmittingPayment}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="udhaar-payment-form"
                variant="success"
                loading={isSubmittingPayment}
              >
                {isSubmittingPayment ? "Saving…" : "Save payment"}
              </Button>
            </>
          }
        >
          <form id="udhaar-payment-form" onSubmit={handleSettlePayment} className="space-y-4">
            <div className="rounded-xl bg-khata-50 px-4 py-3">
              <div className="text-sm font-semibold text-ink">{payCust.name || "Customer"}</div>
              <div className="text-xs text-khata-700 mt-1">Owes now</div>
              <div className="font-display text-2xl font-bold text-khata-600">
                {cur} {Number(payCust.totalPending || 0).toLocaleString()}
              </div>
            </div>

            <Field label={`Amount received (${cur})`} htmlFor="udhaar-pay-amount">
              <Input
                id="udhaar-pay-amount"
                type="number"
                inputMode="decimal"
                required
                min="1"
                max={Number(payCust.totalPending || 0)}
                value={paymentAmountInput}
                onChange={(e) => setPaymentAmountInput(e.target.value)}
                className="h-12 text-lg font-semibold"
              />
            </Field>

            <Field label="Received by" htmlFor="udhaar-pay-seller">
              <Select
                id="udhaar-pay-seller"
                required
                value={paymentSeller}
                onChange={(e) => setPaymentSeller(e.target.value)}
              >
                <option value="">Select seller…</option>
                {SELLERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </form>
        </Modal>
      )}

      {/* Edit customer account (above the khata) — owner only */}
      {isAdmin && editCust && (
        <Modal
          open
          onClose={closeEditCustomer}
          z="z-[60]"
          size="md"
          title="Edit customer account"
          footer={
            <>
              <Button variant="secondary" onClick={closeEditCustomer} disabled={isSavingCustomer}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="udhaar-edit-form"
                loading={isSavingCustomer}
                disabled={!editForm.name.trim()}
              >
                {isSavingCustomer ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          <form id="udhaar-edit-form" onSubmit={handleSaveCustomer} className="space-y-4">
            <Field label="Name" htmlFor="udhaar-edit-name">
              <Input
                id="udhaar-edit-name"
                type="text"
                required
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="udhaar-edit-phone">
                <Input
                  id="udhaar-edit-phone"
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="03xx-xxxxxxx"
                />
              </Field>
              <Field label="CNIC" htmlFor="udhaar-edit-cnic">
                <Input
                  id="udhaar-edit-cnic"
                  type="text"
                  value={editForm.cnic}
                  onChange={(e) => setEditForm((f) => ({ ...f, cnic: e.target.value }))}
                  placeholder="xxxxx-xxxxxxx-x"
                />
              </Field>
            </div>
            <Field label="Address" htmlFor="udhaar-edit-address">
              <Input
                id="udhaar-edit-address"
                type="text"
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
              />
            </Field>
            <Field
              label="Seller"
              htmlFor="udhaar-edit-seller"
              hint="Balances are not edited here; only sales, payments and returns change them."
            >
              <Select
                id="udhaar-edit-seller"
                value={editForm.sellerName}
                onChange={(e) => setEditForm((f) => ({ ...f, sellerName: e.target.value }))}
              >
                <option value="">No seller assigned</option>
                {SELLERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </form>
        </Modal>
      )}

      {/* Return item (above the khata) — owner only */}
      {isAdmin && returnTarget && (
        <Modal
          open
          onClose={closeReturnModal}
          z="z-[60]"
          size="md"
          title="Return item"
          description="The item goes back into stock and the bill is lowered."
          footer={
            <>
              <Button variant="secondary" onClick={closeReturnModal} disabled={isSubmittingReturn}>
                Cancel
              </Button>
              <Button
                icon={Undo2}
                onClick={handleConfirmReturn}
                loading={isSubmittingReturn}
                disabled={!returnValid}
              >
                {isSubmittingReturn ? "Saving…" : "Return items"}
              </Button>
            </>
          }
        >
          {!returnSale || !returnItem || !returnInfo ? (
            <p className="text-sm text-muted">This bill line is no longer available.</p>
          ) : returnInfo.remaining === 0 ? (
            <p className="text-sm text-muted">Everything on this line has already been returned.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-sunken p-3 text-sm space-y-1">
                <p className="text-muted">
                  Bill: <strong className="font-mono text-ink">{returnSale.billNumber}</strong>
                </p>
                <p className="text-muted">
                  Item: <strong className="text-ink">{returnItem.productName || returnItem.name || "Product"}</strong>
                </p>
                <p className="text-muted">
                  Sold: <strong className="text-ink">{returnInfo.qty}</strong> x {cur} {returnUnitPrice.toLocaleString()}
                  {returnInfo.returnedCount > 0 && (
                    <span className="text-saffron-700 font-semibold"> · {returnInfo.returnedCount} already returned</span>
                  )}
                </p>
              </div>

              {returnInfo.isPhone ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink-soft">IMEIs to return</span>
                    {returnInfo.remainingImeis.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setReturnImeis(
                            returnImeis.length === returnInfo.remainingImeis.length ? [] : [...returnInfo.remainingImeis]
                          )
                        }
                      >
                        {returnImeis.length === returnInfo.remainingImeis.length ? "Clear" : "Select all"}
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {returnInfo.remainingImeis.map((im) => (
                      <label
                        key={im}
                        className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 font-mono text-sm transition-colors ${
                          returnImeis.includes(im)
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-line-strong bg-surface text-ink-soft hover:bg-sunken"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={returnImeis.includes(im)}
                          onChange={() => toggleReturnImei(im)}
                          className="h-4 w-4 accent-brand-600"
                        />
                        <Smartphone size={14} className="text-muted" aria-hidden="true" />
                        <span className="break-all">{im}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <Field label={`Quantity to return (1 to ${returnInfo.remaining})`} htmlFor="udhaar-return-qty">
                  <Input
                    id="udhaar-return-qty"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max={returnInfo.remaining}
                    step="1"
                    value={returnQty}
                    onChange={(e) => setReturnQty(e.target.value)}
                    className="font-semibold"
                  />
                </Field>
              )}

              <Field label="Note" htmlFor="udhaar-return-note" hint="Optional">
                <Input
                  id="udhaar-return-note"
                  type="text"
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="e.g. faulty, customer changed mind"
                />
              </Field>

              {/* What will happen */}
              <div className="rounded-xl border border-saffron-200 bg-saffron-50 p-3 text-sm space-y-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink-soft">Refund</span>
                  <span className="font-display text-lg font-bold text-saffron-700">
                    {cur} {returnEstimate.toLocaleString()}
                    {returnCount > 0 && (
                      <span className="font-sans text-xs font-medium text-muted">
                        {" "}
                        ({returnCount} x {cur} {returnUnitPrice.toLocaleString()})
                      </span>
                    )}
                  </span>
                </div>
                {returnEstimate > 0 && (
                  <div className="space-y-0.5 border-t border-saffron-200 pt-1.5">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-ink-soft">Off the Udhaar</span>
                      <strong className="text-khata-700">{cur} {returnDuePart.toLocaleString()}</strong>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-ink-soft">Cash back to the customer</span>
                      <strong className="text-paid-700">{cur} {returnCashPart.toLocaleString()}</strong>
                    </div>
                    <p className="text-xs text-muted">
                      {returnCustId || returnBillDue > 0
                        ? `Only what this bill still owes (${cur} ${returnBillDue.toLocaleString()}) and the customer still owes (${cur} ${Number(
                            returnCust?.totalPending || 0
                          ).toLocaleString()}) comes off the Udhaar; the rest is given back in cash.`
                        : "Walk-in bill: there is no Udhaar account, so the whole refund is cash back."}
                    </p>
                  </div>
                )}
                {Number(returnSale.discountAmount || 0) > 0 && (
                  <p className="text-xs text-ink-soft">
                    This bill had a discount of {cur} {Number(returnSale.discountAmount).toLocaleString()}, shared over
                    its items, so the final refund may be a little lower.
                  </p>
                )}
                <p className="text-xs text-ink-soft">
                  The {returnInfo.isPhone ? "phone(s) go" : "item goes"} back into stock
                  {returnInfo.isPhone && " and the warranty is voided"}.
                </p>
              </div>

              {!returnValid && (
                <p className="text-xs font-semibold text-khata-600">
                  {returnInfo.isPhone ? "Select at least one IMEI." : `Enter a quantity from 1 to ${returnInfo.remaining}.`}
                </p>
              )}
            </div>
          )}
        </Modal>
      )}
    </Page>

      {/* Printable statement / khata slip */}
      {statementCustomer && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-4 print:static print:bg-transparent print:p-0 print:block">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Customer statement"
            className="relative flex h-full w-full flex-col bg-surface shadow-pop sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl print:block print:h-auto print:max-h-none print:w-full print:max-w-none print:rounded-none print:shadow-none"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 pt-4 pb-3 print:hidden">
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-snug">Customer statement</h2>
                <p className="text-xs text-muted mt-0.5">Print it or send it as a picture on WhatsApp.</p>
              </div>
              <IconButton icon={X} label="Close" size="sm" onClick={() => setStatementCustId(null)} />
            </div>

            <div className="flex-1 overflow-y-auto bg-sunken p-3 sm:p-4 custom-scrollbar print:overflow-visible print:bg-transparent print:p-0">
              <div className="overflow-x-auto rounded-xl border border-line bg-white custom-scrollbar print:overflow-visible print:rounded-none print:border-0">
            {/* A fixed-width slip: on a phone it scrolls sideways, and the shared picture keeps every column */}
            <div id="statement-print-area" className="p-4 bg-white text-black print-target min-w-[34rem] print:min-w-0">
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
              <div className="flex justify-between gap-4 text-xs py-2 border-b border-dashed border-black">
                <div className="min-w-0 break-words">
                  <p><span className="font-bold">Customer:</span> {statementCustomer.name}</p>
                  <p><span className="font-bold">Phone:</span> {statementCustomer.phone || "—"}</p>
                  {statementCustomer.address && <p><span className="font-bold">Address:</span> {statementCustomer.address}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p><span className="font-bold">Date:</span> {new Date().toLocaleDateString("en-GB")}</p>
                  <p><span className="font-bold">Time:</span> {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })}</p>
                  <p><span className="font-bold">Status:</span> {statementCustomer.totalPending > 0 ? "OUTSTANDING" : "SETTLED"}</p>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="my-3">
                <table className="w-full text-xs border-collapse [&_th]:px-1.5 [&_td]:px-1.5 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
                  <thead>
                    <tr className="border-b-2 border-black text-left text-[11px] uppercase align-bottom">
                      <th className="py-1 whitespace-nowrap">Day / Date</th>
                      <th className="py-1 whitespace-nowrap">Bill / Ref #</th>
                      <th className="py-1">Description / Items</th>
                      <th className="py-1 text-right whitespace-nowrap">Udhaar (+)</th>
                      <th className="py-1 text-right whitespace-nowrap">Paid / off (-)</th>
                      <th className="py-1 text-right whitespace-nowrap">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementTransactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-slate-200 text-[11px] align-top">
                        <td className="py-1.5 whitespace-nowrap">
                          <span className="font-bold block">{tx.dateInfo.day}</span>
                          <span className="text-[10px] text-slate-600">{tx.dateInfo.date}</span>
                        </td>
                        <td className="py-1.5 font-mono font-bold text-[10px] break-words">{tx.billNumber}</td>
                        <td className="py-1.5">
                          {tx.isReturnEntry ? (
                            <div>
                              <span className="font-semibold">
                                Return: {returnItemsText(tx.items) || "items returned"} (Rs. {tx.returnAmount.toLocaleString()})
                              </span>
                              <span className="text-[9px] block">
                                Off the Udhaar Rs. {tx.accountReduced.toLocaleString()}
                                {tx.cashBack > 0 && ` · Cash back Rs. ${tx.cashBack.toLocaleString()}`}
                              </span>
                            </div>
                          ) : tx.isPayment ? (
                            <span className="font-semibold text-emerald-700">{tx.notes || "Udhaar Payment"}</span>
                          ) : (
                            <div>
                              <span className="font-medium">
                                {(tx.items || [])
                                  .map((i) => {
                                    const r = lineReturnInfo(i);
                                    const tag = r.fullyReturned ? ", returned" : r.returnedCount > 0 ? `, ${r.returnedCount} returned` : "";
                                    return `${i.productName || i.name || "Item"} (x${r.qty}${tag})`;
                                  })
                                  .join(", ") || "Sale"}
                              </span>
                              <span className="text-[9px] block">
                                Bill Rs. {tx.originalTotal.toLocaleString()}
                                {tx.isCredit
                                  ? ` · paid at sale Rs. ${tx.paymentReceived.toLocaleString()}`
                                  : tx.oldBalancePaid > 0
                                  ? ` · paid Rs. ${tx.paymentReceived.toLocaleString()}`
                                  : " · paid in full"}
                              </span>
                              {(tx.isReturned || tx.returnedTotal > 0) && (
                                <span className="text-[9px] font-bold block uppercase">
                                  {tx.isReturned ? "Bill returned" : "Partly returned"}
                                  {tx.returnedTotal > 0 && `: Rs. ${tx.returnedTotal.toLocaleString()}`}
                                </span>
                              )}
                              {(tx.items || []).some((i) => itemImeis(i).length > 0) && (
                                <span className="text-[9px] text-slate-500 block font-mono">
                                  IMEI: {tx.items.flatMap((i) => itemImeis(i)).join(", ")}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 text-right font-semibold whitespace-nowrap">
                          {tx.isCredit ? `Rs. ${tx.udhaarAdded.toLocaleString()}` : "—"}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-emerald-700 whitespace-nowrap">
                          {tx.isReturnEntry
                            ? tx.accountReduced > 0
                              ? `Rs. ${tx.accountReduced.toLocaleString()}`
                              : "—"
                            : tx.isPayment
                            ? `Rs. ${tx.paymentReceived.toLocaleString()}`
                            : tx.oldBalancePaid > 0
                            ? `Rs. ${tx.oldBalancePaid.toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="py-1.5 text-right font-black whitespace-nowrap">
                          Rs. {tx.runningBalance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="border-t-2 border-black pt-2 space-y-1 text-xs">
                <div className="flex justify-between gap-3">
                  <span>Bills as sold ({statementTotals.bills}):</span>
                  <span className="font-bold whitespace-nowrap">Rs. {statementTotals.billed.toLocaleString()}</span>
                </div>
                {statementTotals.returned > 0 && (
                  <div className="flex justify-between gap-3">
                    <span>Items returned:</span>
                    <span className="font-bold whitespace-nowrap">- Rs. {statementTotals.returned.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span>Paid at sale (on the bills):</span>
                  <span className="font-bold text-emerald-700 whitespace-nowrap">- Rs. {statementTotals.paidAtSale.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>
                    Payments received ({statementTotals.payments} {statementTotals.payments === 1 ? "receipt" : "receipts"}):
                  </span>
                  <span className="font-bold text-emerald-700 whitespace-nowrap">- Rs. {statementTotals.received.toLocaleString()}</span>
                </div>
                {statementTotals.cashBack > 0 && (
                  <div className="flex justify-between gap-3">
                    <span>Cash given back on returns:</span>
                    <span className="font-bold whitespace-nowrap">+ Rs. {statementTotals.cashBack.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3 text-[11px] text-slate-600">
                  <span>Total paid (at sale + payments - cash back):</span>
                  <span className="font-bold whitespace-nowrap">Rs. {statementTotals.totalPaid.toLocaleString()}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 text-base font-black border-t-2 border-black pt-2 mt-1">
                  <span>CURRENT OUTSTANDING UDHAAR:</span>
                  <span className="text-red-600">Rs. {Number(statementCustomer.totalPending || 0).toLocaleString()}</span>
                </div>
                {statementGap && (
                  <p className="text-[10px] text-slate-600">
                    The entries above add up to Rs. {statementGap.ledgerEnd.toLocaleString()}; the outstanding amount
                    also includes older records or bill edits.
                  </p>
                )}
              </div>

              <div className="border-t border-dashed border-black mt-4 pt-3 flex justify-between text-[10px] text-slate-500">
                <span>Generated by Mobile POS</span>
                <span>Customer Signature: __________________</span>
              </div>
            </div>
              </div>
            </div>

            {/* Print & share */}
            <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3 print:hidden">
              <Button
                icon={Printer}
                className="flex-1"
                onClick={() => printElement("statement-print-area", "Statement")}
              >
                Print statement
              </Button>
              <Button
                variant="success"
                icon={Share2}
                className="flex-1"
                onClick={handleWhatsAppStatementShare}
                title="Preview the statement picture, then send it on WhatsApp or any app"
              >
                Share on WhatsApp
              </Button>
              <Button variant="secondary" onClick={() => setStatementCustId(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Payment receipt (thermal roll slip) */}
      {paymentReceipt && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-4 print:static print:bg-transparent print:p-0 print:block">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Payment receipt"
            className="relative flex h-full w-full flex-col bg-surface shadow-pop sm:h-auto sm:max-h-[90vh] sm:max-w-sm sm:rounded-2xl print:block print:h-auto print:max-h-none print:w-full print:max-w-none print:rounded-none print:shadow-none"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 pt-4 pb-3 print:hidden">
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-snug flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-paid-600" aria-hidden="true" /> Payment saved
                </h2>
                <p className="text-xs text-muted mt-0.5">Print the slip or send it to the customer.</p>
              </div>
              <IconButton icon={X} label="Close" size="sm" onClick={() => setPaymentReceipt(null)} />
            </div>

            <div className="flex-1 overflow-y-auto bg-sunken p-3 sm:p-4 custom-scrollbar print:overflow-visible print:bg-transparent print:p-0">
              <div className="rounded-xl border border-line bg-white print:rounded-none print:border-0">
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
                    {new Date(paymentReceipt.createdAt).toLocaleDateString("en-GB")}{" "}
                    {new Date(paymentReceipt.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })}
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
                const currentCust = findCustomer(paymentReceipt.customerId || paymentReceipt.customer);
                if (currentCust) {
                  return (
                    <div className="flex justify-between font-black text-sm pt-2 border-t-2 border-dashed border-black text-rose-600">
                      <span>REMAINING BALANCE:</span>
                      <span>Rs. {Number(currentCust.totalPending || 0).toLocaleString()}</span>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="border-t-2 border-dashed border-black my-3"></div>
              <div className="text-center text-xs font-bold mt-2">THANK YOU FOR YOUR PAYMENT</div>
            </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3 print:hidden">
              <Button icon={Printer} className="flex-1" onClick={() => printElement("receipt-content", "Payment Receipt")}>
                Print
              </Button>
              <Button
                variant="success"
                icon={Share2}
                className="flex-1"
                onClick={handleWhatsAppShare}
                title="Preview the receipt picture, then send it on WhatsApp or any app"
              >
                Share
              </Button>
              <Button variant="secondary" icon={CheckCircle2} onClick={() => setPaymentReceipt(null)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt / statement image preview & share (z-[80], above every other modal) */}
      {shareDialog}

      {/* Status message (returns, account changes) */}
      {notice && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-2rem)] max-w-md print:hidden" role="status">
          <div
            className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm font-medium shadow-pop ${
              notice.type === "error"
                ? "bg-khata-50 border-khata-200 text-khata-700"
                : notice.type === "info"
                ? "bg-surface border-line text-ink"
                : "bg-paid-50 border-paid-200 text-paid-700"
            }`}
          >
            <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span className="flex-1">{notice.text}</span>
            <IconButton icon={X} label="Dismiss" size="sm" onClick={() => setNotice(null)} className="-my-1 -mr-1" />
          </div>
        </div>
      )}
    </>
  );
};

export default PendingPayments;
