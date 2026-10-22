import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { useShareImage } from "../components/useShareImage";
import { printElement } from "../services/printReceipt";
import { localDate } from "../utils/dates";
import { itemImeis } from "../utils/sales";
import {
  BookOpen,
  Plus,
  Printer,
  X,
  FileText,
  Trash2,
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Search,
  Smartphone,
  CreditCard,
  Banknote,
  User
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, decimals = 0) =>
  Number(n || 0).toLocaleString("en-PK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

// Local (Pakistan) date — toISOString() is UTC and gives yesterday's date before 5 AM
const todayISO = () => localDate();

const fmtDate = (iso) => {
  if (!iso) return "";
  // Plain date as local midnight; slice also copes with a full timestamp
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return String(iso);
  return d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace(/ /g, "-");
};

const fmtTimestamp = () => {
  const d = new Date();
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-") +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).toLowerCase()
  );
};

// Rows get their database id up front, so the row on screen and the row in Supabase are the same record
const uid = () => crypto.randomUUID();

// Screen row ⇄ ledger_entries row. The full screen row is kept in `extra.ui` so it reloads exactly as shown.
const toDbEntry = (e) => ({
  id: e.id,
  type: e.type,
  date: e.date,
  description: e.description,
  qty: e.qty,
  rate: e.rate,
  amount: e.type === "item" ? Number(e.qty || 0) * Number(e.rate || 0) : 0,
  debit: e.debit,
  credit: e.credit,
  parentInvoiceId: e.parentInvoiceId || null,
  productId: e.productId || null,
  saleId: e.saleId || null,
  imeis: e.imeisArray && e.imeisArray.length > 0 ? e.imeisArray : e.imei ? [e.imei] : [],
  extra: { ui: e },
});

const fromDbEntry = (r) => {
  const ui = (r.extra && r.extra.ui) || {};
  return {
    type: r.type,
    date: r.date,
    description: r.description || "",
    qty: r.type === "item" ? Number(r.qty) : "",
    rate: r.type === "item" ? Number(r.rate) : "",
    dis: "",
    deal: "",
    lp: "",
    debit: r.type === "item" ? null : Number(r.debit),
    credit: r.type === "payment" ? Number(r.credit) : null,
    parentInvoiceId: r.parent_invoice_id || undefined,
    productId: r.product_id || undefined,
    imeisArray: r.imeis || [],
    ...ui,
    id: r.id,
    saleId: r.sale_id || ui.saleId || undefined,
  };
};

// ── Component ────────────────────────────────────────────────────────────────
const Ledger = () => {
  // allCustomers (not the header-filtered list) so a customer added here is always found
  const { products, shopSettings, allCustomers, recordSale, addCustomer } = useApp();
  // Editing the opening balance and deleting payment rows is for the owner only
  const { isAdmin } = useAuth();

  // ── State ─────────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [editingOB, setEditingOB] = useState(false);
  const [obInput, setObInput] = useState("0");
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [genTime] = useState(fmtTimestamp());

  // Scan / lookup state
  const [scanInput, setScanInput] = useState("");
  const [scanStatus, setScanStatus] = useState(null); // { type: "success"|"error", message }
  const scanRef = useRef(null);
  const receiptRef = useRef(null);
  const [openShare, shareDialog] = useShareImage();
  // Scans are handled one after another (a fast scanner can send the next code while the last one is looked up)
  const scanQueueRef = useRef(Promise.resolve());
  const focusScan = () => scanRef.current?.focus();

  // Invoice tracking — each scan session groups items under an auto-created invoice
  const [invoiceCounter, setInvoiceCounter] = useState(1);
  const [currentInvoiceId, setCurrentInvoiceId] = useState(null);
  // Same id, readable at once by queued scans (state only changes on the next render)
  const currentInvoiceRef = useRef(null);
  const setInvoice = (id) => {
    currentInvoiceRef.current = id;
    setCurrentInvoiceId(id);
  };

  // Manual add modal
  const [showManual, setShowManual] = useState(false);
  const EMPTY_MANUAL = { type: "item", date: todayISO(), description: "", qty: "1", rate: "", dis: "", deal: "", lp: "", debit: "", credit: "", openingBal: "" };
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL);

  // Checkout State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  // Ledger bills are usually Udhaar, so checkout starts on Pending Bill
  const [paymentMethod, setPaymentMethod] = useState("Pending Bill");
  const [selectedSeller, setSelectedSeller] = useState(SELLERS[0]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [completedSaleInvoice, setCompletedSaleInvoice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false); // set at once, so a double click cannot record the sale twice

  // Custom Customer Search Dropdown State
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef(null);
  
  // Quick Add Customer State
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  const handleQuickAddCustomer = async () => {
    if (isSavingCustomer) return;
    if (!newCustomerName.trim()) {
      alert("Customer name is required.");
      return;
    }
    setIsSavingCustomer(true);
    let newCust;
    try {
      newCust = await addCustomer({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
        address: "",
        cnic: "",
        sellerName: selectedSeller
      });
    } finally {
      setIsSavingCustomer(false);
    }
    // Not saved: the form stays open with what was typed
    if (!newCust) return;
    setSelectedCustomer(newCust.id);
    setShowQuickAddCustomer(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
  };

  // Handle clicks outside customer dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Focus scan input on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (scanRef.current) scanRef.current.focus();
  }, []);

  // ── Auto-clear scan status after 4s ───────────────────────────────────────
  useEffect(() => {
    if (scanStatus) {
      const t = setTimeout(() => setScanStatus(null), 4000);
      return () => clearTimeout(t);
    }
  }, [scanStatus]);

  // ── Persistence: every row on screen is saved to Supabase ─────────────────
  // syncedRef holds the last saved version of each row; the sync saves new rows,
  // changed rows and deletions, so a refresh reloads exactly what was on screen.
  const syncedRef = useRef(new Map());
  const entriesRef = useRef(entries);
  const syncQueueRef = useRef(Promise.resolve());
  const [saveState, setSaveState] = useState("saved"); // "saved" | "saving" | "error"
  const [loadError, setLoadError] = useState(null);

  const doSync = useCallback(async () => {
    // Work on the map as it is now; if a reload swaps it while we save, we stop before deleting anything
    const synced = syncedRef.current;
    const current = entriesRef.current;
    const currentIds = new Set(current.map((e) => e.id));
    const pending =
      current.some((e) => synced.get(e.id) !== JSON.stringify(e)) ||
      [...synced.keys()].some((id) => !currentIds.has(id));
    if (!pending) return;

    setSaveState("saving");
    let failed = false;

    for (const e of current) {
      const json = JSON.stringify(e);
      if (synced.get(e.id) === json) continue;
      try {
        // Upsert by id: also restores a row another till deleted, instead of failing forever
        await api.addLedgerEntry(toDbEntry(e));
        synced.set(e.id, json);
      } catch (err) {
        failed = true;
        console.error("[Ledger] Save failed:", err.message);
      }
    }

    // Only rows that were saved before can be deleted, so a failed load never wipes the database
    if (syncedRef.current === synced) {
      for (const id of [...synced.keys()]) {
        if (currentIds.has(id)) continue;
        try {
          await api.deleteLedgerEntry(id);
          synced.delete(id);
        } catch (err) {
          failed = true;
          console.error("[Ledger] Delete failed:", err.message);
        }
      }
    }

    setSaveState(failed ? "error" : "saved");
  }, []);

  // Saves run one after another, never in parallel
  const syncLedger = useCallback(() => {
    syncQueueRef.current = syncQueueRef.current.then(doSync, doSync);
    return syncQueueRef.current;
  }, [doSync]);

  // Save shortly after every change
  useEffect(() => {
    entriesRef.current = entries;
    const t = setTimeout(syncLedger, 300);
    return () => clearTimeout(t);
  }, [entries, syncLedger]);

  // Keep retrying while something is unsaved (e.g. internet dropped)
  useEffect(() => {
    if (saveState !== "error") return;
    const t = setInterval(syncLedger, 10000);
    return () => clearInterval(t);
  }, [saveState, syncLedger]);

  // Leaving the page inside the app: save what the 300 ms wait above would otherwise drop
  useEffect(() => () => {
    syncLedger();
  }, [syncLedger]);

  // Warn before closing / refreshing while changes are still unsaved (also during the 300 ms wait)
  useEffect(() => {
    const handler = (e) => {
      const unsaved =
        saveState !== "saved" || entriesRef.current.some((x) => syncedRef.current.get(x.id) !== JSON.stringify(x));
      if (!unsaved) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  // ── Load the ledger sheet for the selected dates from Supabase ────────────
  useEffect(() => {
    let cancelled = false;
    const loadLedger = async () => {
      try {
        const data = await api.getLedger(dateFrom, dateTo);
        if (cancelled) return;

        const opening = data.find((r) => r.type === "opening" && r.date === dateFrom);
        const loaded = data.filter((r) => r.type !== "opening").map(fromDbEntry);

        // Keep on screen: rows of these dates scanned while loading, and any row not saved yet (any date)
        const loadedIds = new Set(loaded.map((e) => e.id));
        const prevSynced = syncedRef.current;
        const localOnly = entriesRef.current.filter(
          (e) =>
            !loadedIds.has(e.id) &&
            ((e.date >= dateFrom && e.date <= dateTo) || prevSynced.get(e.id) !== JSON.stringify(e))
        );
        syncedRef.current = new Map(loaded.map((e) => [e.id, JSON.stringify(e)]));
        localOnly.forEach((e) => {
          if (prevSynced.has(e.id)) syncedRef.current.set(e.id, prevSynced.get(e.id));
        });

        const merged = [...loaded, ...localOnly];
        entriesRef.current = merged;
        setEntries(merged);

        const ob = opening ? Number(opening.debit) : 0;
        setOpeningBalance(ob);
        setObInput(String(ob));

        // Re-open the last invoice that was not checked out yet
        const invoices = merged.filter((e) => e.type === "invoice");
        const openInvoice = [...invoices].reverse().find((e) => !e.saleId);
        currentInvoiceRef.current = openInvoice ? openInvoice.id : null;
        setCurrentInvoiceId(currentInvoiceRef.current);
        setInvoiceCounter(invoices.length + 1);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    };
    // Loading takes its turn in the save queue, so a save never runs while the sheet is being replaced
    syncQueueRef.current = syncQueueRef.current.then(loadLedger, loadLedger);
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  // ── Lookup product by IMEI or barcode (local first, then backend) ──────────
  const lookupProduct = async (query) => {
    const q = query.trim();
    if (!q) return null;

    // Local search first (instant)
    for (const prod of products) {
      if (prod.imeis && prod.imeis.length > 0) {
        // Either SIM's IMEI identifies the phone
        const matchedImei = prod.imeis.find(
          (im) => (im.imei === q || im.imei1 === q || im.imei2 === q) && im.status === "in_stock"
        );
        if (matchedImei) return { product: prod, imei: matchedImei, matchType: "imei" };
      }
      if (prod.barcode && prod.barcode === q) {
        return { product: prod, imei: null, matchType: "barcode" };
      }
    }

    // Backend fallback — searches Supabase directly
    try {
      const result = await api.searchImei(q);
      if (result && result.product) {
        // Must check if the item is actually in stock in the backend
        if (result.matchedImei && result.matchedImei.status !== "in_stock") {
          return null; // Don't allow adding sold items!
        }

        const prod = result.product;
        const normalized = {
          ...prod,
          salePrice: Number(prod.sale_price ?? prod.salePrice ?? prod.purchase_price ?? prod.purchasePrice ?? 0),
          purchasePrice: Number(prod.purchase_price ?? prod.purchasePrice ?? 0),
        };
        return { product: normalized, imei: result.matchedImei, matchType: "backend" };
      }
    } catch {
      // not found on the server either
    }
    return null;
  };

  // Changes the rows and entriesRef together, so the next queued scan sees this change before React re-renders
  const changeEntries = (fn) => {
    entriesRef.current = fn(entriesRef.current);
    setEntries(fn);
  };

  // ── Create a new invoice header row and make it the current invoice ───────
  const createInvoice = () => {
    const invNumber = `INV-${todayISO().replace(/-/g, "")}-${String(invoiceCounter).padStart(3, "0")}`;
    const invId = uid();
    const invoiceEntry = {
      id: invId,
      type: "invoice",
      date: todayISO(),
      description: `Sales-${invNumber}-Ptc.;TPcs:0`,
      qty: "",
      rate: "",
      dis: "",
      deal: "",
      lp: "",
      debit: 0,
      credit: null,
    };
    changeEntries((prev) => [...prev, invoiceEntry]);
    setInvoice(invId);
    setInvoiceCounter((c) => c + 1);
    return invId;
  };

  // ── Handle IMEI / barcode scan ────────────────────────────────────────────
  const handleScan = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // The box itself, not state: a fast scanner's last digits may not have re-rendered yet
    const rawQuery = e.currentTarget.value.trim();
    if (!rawQuery) return;

    // Immediately clear input so fast barcode scanners don't get blocked
    setScanInput("");
    setScanStatus({ type: "success", message: "⟳ Processing scan(s)..." });

    // One scan at a time: two scans at once could each start an invoice or add the same unit twice
    scanQueueRef.current = scanQueueRef.current
      .then(() => processScan(rawQuery))
      .catch((err) => {
        console.error("[Ledger] Scan failed:", err);
        setScanStatus({ type: "error", message: `Scan failed: ${err.message || err}` });
      });
  };

  const processScan = async (rawQuery) => {
    // Split by commas, spaces, or newlines to allow bulk pasting
    const queries = rawQuery.split(/[\s,;]+/).filter((q) => q.trim().length > 0);

    let successCount = 0;
    let lastAdded = "";
    let localQtyTracker = {};
    let localImeiTracker = new Set();

    // One invoice for the whole scan / paste; it is created on the first item found.
    // A checked-out invoice never gets new items.
    let invId = currentInvoiceRef.current;
    if (invId && !entriesRef.current.some((e) => e.id === invId && e.type === "invoice" && !e.saleId)) invId = null;

    for (const query of queries) {
      // A sale is being saved for the current invoice: adding to it now would leave the item off the bill
      if (submittingRef.current) {
        setScanStatus({ type: "error", message: `Not added "${query}": wait until the checkout is saved.` });
        break;
      }
      const result = await lookupProduct(query);

      if (!result) {
        setScanStatus({ type: "error", message: `No in-stock product found for "${query}"` });
        continue;
      }

      const entries = entriesRef.current;
      const { product } = result;
      let { imei } = result;

      // Barcode scan of a phone model: take the next in-stock unit, so every phone on the bill has its IMEI
      // (otherwise a line could say qty 2 while only one IMEI leaves stock)
      if (!imei && product.imeis && product.imeis.length > 0) {
        const usedInInvoice = new Set(
          entries
            .filter((e) => invId && e.parentInvoiceId === invId)
            .flatMap((e) => itemImeis(e))
        );
        imei = product.imeis.find((u) => {
          const key = u.imei || u.imei1;
          return u.status === "in_stock" && !usedInInvoice.has(key) && !localImeiTracker.has(key);
        });
        if (!imei) {
          setScanStatus({ type: "error", message: `No more in-stock units of ${product.name} to add.` });
          continue;
        }
      }

      // Ensure this exact IMEI hasn't already been added to the active invoice
      if (imei) {
        // Same key the row stores below, so a re-scan of this unit is always caught
        const actualImei = imei.imei || imei.imei1;
        
        // Has it been added in a previous scan to this active invoice?
        const alreadyInEntries = entries.find(
          (e) => invId && e.parentInvoiceId === invId && (e.imei === actualImei || (e.imeisArray && e.imeisArray.includes(actualImei)))
        );
        
        // Or has it been added in the CURRENT bulk scan loop?
        if (alreadyInEntries || localImeiTracker.has(actualImei)) {
          setScanStatus({ type: "error", message: `IMEI ${actualImei} is already in the current invoice!` });
          continue;
        }
        
        localImeiTracker.add(actualImei);
      }

      // Enforce stock limits for bulk (non-IMEI) items
      if (!imei) {
        // Calculate how many are currently in the active invoice
        const existingEntry = entries.find((e) => invId && e.parentInvoiceId === invId && e.productId === product.id && !e.imei);
        const currentQty = existingEntry ? Number(existingEntry.qty || 0) : 0;
        // Calculate how many have been added in THIS specific scan loop
        const alreadyAddedInLoop = localQtyTracker ? (localQtyTracker[product.id] || 0) : 0;

        if (currentQty + alreadyAddedInLoop + 1 > product.quantity) {
          setScanStatus({ type: "error", message: `Cannot add more! Stock limit (${product.quantity}) reached for ${product.name}.` });
          continue;
        }

        if (!localQtyTracker) localQtyTracker = {};
        localQtyTracker[product.id] = alreadyAddedInLoop + 1;
      }

      // Ensure we have an active invoice (created once, reused for the rest of the loop)
      if (!invId) invId = createInvoice();
      const itemInvId = invId;

      // Add or update item in local state
      changeEntries((prev) => {
        const existingIdx = prev.findIndex(
          (e) => e.parentInvoiceId === itemInvId && e.productId === product.id
        );

        let updated;
        if (existingIdx !== -1) {
          // Both bulk items and IMEI items will bump qty
          updated = prev.map((e, i) => {
            if (i === existingIdx) {
              const newQty = Number(e.qty || 0) + 1;
              const newImeiList = e.imeisArray ? [...e.imeisArray] : (e.imei ? [e.imei] : []);
              if (imei) {
                newImeiList.push(imei.imei || imei.imei1);
              }
              const itemRate = Number(product.salePrice ?? product.sale_price ?? product.purchasePrice ?? product.purchase_price ?? 0);
              
              return { 
                ...e, 
                qty: newQty,
                imeisArray: newImeiList,
                rate: e.rate || itemRate, 
                description: `${product.name}`
              };
            }
            return e;
          });
        } else {
          const itemRate = Number(
            product.salePrice ??
            product.sale_price ??
            product.purchasePrice ??
            product.purchase_price ??
            0
          );

          // New row (all IMEIs get new rows, or first time bulk item)
          const itemEntry = {
            id: uid(),
            type: "item",
            date: todayISO(),
            description: `${product.name}`,
            fullName: product.name,
            qty: 1,
            rate: itemRate,
            dis: "",
            deal: "",
            lp: "",
            debit: null,
            credit: null,
            parentInvoiceId: itemInvId,
            imei: imei?.imei || imei?.imei1 || null,
            imeisArray: imei ? [imei.imei || imei.imei1] : [],
            productId: product.id,
          };
          updated = [...prev, itemEntry];
        }
        return updateInvoiceTotals(updated, itemInvId);
      });

      // Saved to Supabase by the ledger sync (see "Persistence" above)
      successCount++;
      lastAdded = product.name;
    }

    if (successCount > 0) {
      setScanStatus({
        type: "success",
        message: queries.length > 1
          ? `✓ ${successCount} items added successfully!`
          : `✓ ${lastAdded} added successfully!`,
      });
    }

    focusScan();
  };

  // ── Recompute invoice header totals from its child items ──────────────────
  const updateInvoiceTotals = (allEntries, invId) => {
    const children = allEntries.filter((e) => e.parentInvoiceId === invId);
    const totalDebit = children.reduce((s, c) => s + Number(c.qty || 0) * Number(c.rate || 0), 0);
    const totalPcs = children.reduce((s, c) => s + Number(c.qty || 0), 0);

    return allEntries.map((e) => {
      if (e.id === invId) {
        const descParts = e.description.split("TPcs:");
        const newDesc = descParts[0] + "TPcs:" + totalPcs;
        return { ...e, debit: totalDebit, description: newDesc };
      }
      return e;
    });
  };

  // ── Rows of a checked-out invoice (invoice has a saleId) are locked ───────
  const isLockedEntry = (allEntries, entry) => {
    const invId = entry.type === "invoice" ? entry.id : entry.parentInvoiceId;
    return !!invId && allEntries.some((e) => e.id === invId && e.saleId);
  };

  // ── Delete an entry ───────────────────────────────────────────────────────
  const handleDelete = (id) => {
    const target = entries.find((e) => e.id === id);
    if (!target || isLockedEntry(entries, target)) return;
    // Payment rows are the shop's records, not the open bill: only the owner removes them
    if (target.type === "payment" && !isAdmin) return;
    if (target.type === "invoice" && currentInvoiceRef.current === id) setInvoice(null);

    setEntries((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (!entry) return prev;
      // Checked-out invoices must keep matching their saved sale
      if (isLockedEntry(prev, entry)) return prev;

      // If deleting an invoice, remove all its children too
      if (entry.type === "invoice") {
        return prev.filter((e) => e.id !== id && e.parentInvoiceId !== id);
      }

      // If deleting an item, recalc its parent invoice
      const filtered = prev.filter((e) => e.id !== id);
      if (entry.parentInvoiceId) {
        return updateInvoiceTotals(filtered, entry.parentInvoiceId);
      }
      return filtered;
    });
  };

  // ── New invoice (finalize current, start fresh) ───────────────────────────
  const handleNewInvoice = () => {
    const current = currentInvoiceId && entries.find((e) => e.id === currentInvoiceId);
    const hasItems = !!current && entries.some((e) => e.type === "item" && e.parentInvoiceId === current.id);

    // Current invoice is still empty: keep using it instead of adding another empty one
    if (current && !hasItems && !current.saleId) {
      setScanInput("");
      scanRef.current?.focus();
      return;
    }
    if (current && hasItems && !current.saleId &&
      !window.confirm("This invoice has items that were not checked out. Start a new invoice anyway?")) {
      return;
    }

    createInvoice();
    setScanInput("");
    scanRef.current?.focus();
  };

  // ── Checkout & Finalize Invoice ────────────────────────────────────────────
  // Item lines of an invoice with no rate (0 or empty). A bill cannot be checked out until each has one.
  const missingRateLines = (list, invId) =>
    invId ? list.filter((e) => e.type === "item" && e.parentInvoiceId === invId && !(Number(e.rate) > 0)) : [];
  const rateLineNames = (lines) =>
    [...new Set(lines.map((e) => e.fullName || (e.description || "").split(" (")[0] || "Item"))];

  const handleCheckoutClick = () => {
    if (!currentInvoiceId) {
      alert("Please start a New Invoice and scan items first.");
      return;
    }
    
    // Check if invoice has any items
    const invoiceItems = entries.filter(e => e.type === "item" && e.parentInvoiceId === currentInvoiceId);
    if (invoiceItems.length === 0) {
      alert("Please add items to the invoice before checking out.");
      return;
    }

    const noRate = missingRateLines(entries, currentInvoiceId);
    if (noRate.length > 0) {
      alert(`Please enter a rate for: ${rateLineNames(noRate).join(", ")}`);
      return;
    }

    setShowCheckoutModal(true);
  };

  // Paid / due for the checkout. Pending Bill: only what is paid now (default 0).
  // Cash / Card: the full total unless a different amount is typed.
  const checkoutAmounts = (total) => {
    const typed = Math.max(0, Number(paidAmountInput) || 0);
    const paid = paymentMethod === "Pending Bill" ? typed : paidAmountInput !== "" ? typed : total;
    return { paid, due: Math.max(0, total - paid) };
  };

  const finalizeCheckout = async () => {
    // Ignore a second click while the first sale is still saving
    if (isSubmitting || submittingRef.current) return;

    const invoiceHeader = entries.find(e => e.id === currentInvoiceId);
    const invoiceItems = entries.filter(e => e.type === "item" && e.parentInvoiceId === currentInvoiceId);

    if (!invoiceHeader || invoiceItems.length === 0) return;

    // Every line needs a rate; a 0 rate would sell the item for nothing
    const noRate = missingRateLines(entries, currentInvoiceId);
    if (noRate.length > 0) {
      alert(`Please enter a rate for: ${rateLineNames(noRate).join(", ")}`);
      return;
    }

    let customerObj = null;
    if (selectedCustomer) {
      customerObj = allCustomers.find(c => c.id === selectedCustomer);
    }

    // Map ledger items to standard cart items format for backend
    const cartItems = invoiceItems.map(item => {
      const pid = item.productId || null;
      let isManual = !pid;
      return {
        id: pid || `manual_${item.id}`,
        productId: pid,
        product: pid,
        name: item.description,
        productName: item.description,
        quantity: Number(item.qty || 1),
        price: Number(item.rate || 0),
        unitSalePrice: Number(item.rate || 0),
        subtotal: Number(item.qty || 1) * Number(item.rate || 0),
        imeisArray: item.imeisArray && item.imeisArray.length > 0 ? item.imeisArray : (item.imei ? [item.imei] : []),
        isManual
      };
    });

    const currentSaleTotal = cartItems.reduce((sum, i) => sum + i.subtotal, 0);
    const { paid: effectivePaid, due: dueAmount } = checkoutAmounts(currentSaleTotal);

    // Money still due goes on a customer's Udhaar, so a walk-in cannot leave a balance
    if (dueAmount > 0 && !selectedCustomer) {
      alert(`Rs ${fmt(dueAmount)} is still due. Please select a customer to record it as Udhaar.`);
      return;
    }

    const saleData = {
      items: cartItems,
      subtotalAmount: currentSaleTotal,
      discountAmount: 0,
      taxPercent: 0,
      taxAmount: 0,
      grandTotal: currentSaleTotal,
      paidAmount: effectivePaid,
      dueAmount,
      netProfit: 0,
      paymentMethod: paymentMethod === "Pending Bill" ? "Credit (Udhaar)" : paymentMethod,
      paymentStatus: dueAmount === 0 ? "paid" : effectivePaid > 0 ? "partial" : "unpaid",
      cashierName: selectedSeller || "Admin",
      customer: selectedCustomer || null,
      customerName: customerObj ? customerObj.name : "Walk-in Customer",
      customerPhone: customerObj ? customerObj.phone : "",
      dueDate: paymentMethod === "Pending Bill" ? dueDate || null : null,
      notes: "Generated from Bill Ledger",
      billNumber: `INV-${Date.now().toString().slice(-6)}`,
    };

    // This records the sale (reducing stock in backend) and updates local states
    submittingRef.current = true;
    setIsSubmitting(true);
    let recorded;
    try {
      recorded = await recordSale(saleData);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
    // Not saved: keep the invoice open so it can be checked out again
    if (!recorded) return;

    // Link the ledger invoice to its saved sale so it is not re-opened after a refresh
    changeEntries((prev) => prev.map((e) => (e.id === invoiceHeader.id ? { ...e, saleId: recorded.id } : e)));

    setCompletedSaleInvoice(recorded);
    setShowCheckoutModal(false);

    // Reset the checkout form for the next bill (back to Pending Bill / Udhaar)
    setPaymentMethod("Pending Bill");
    setSelectedCustomer("");
    setPaidAmountInput("");
    setDueDate("");
    setCustomerSearch("");
    setShowCustomerDropdown(false);
    setShowQuickAddCustomer(false);

    // No current invoice now; the next scan starts a new one (no empty invoice left behind)
    setInvoice(null);
    setScanInput("");
  };

  // Customer's Udhaar for the receipt. Customers are refreshed from the server before recordSale
  // returns, so totalPending already includes this sale; previous = total minus what this sale added.
  const receiptUdhaar = (inv) => {
    const cust = inv?.customerId ? allCustomers.find((c) => c.id === inv.customerId) : null;
    if (!cust) return { previous: 0, total: 0 };
    const total = Math.max(0, Number(cust.totalPending || 0));
    const added = Number(inv.dueAmount || 0) - Math.max(0, Number(inv.paidAmount || 0) - Number(inv.grandTotal || 0));
    return { previous: Math.max(0, total - added), total };
  };

  const generateTextReceipt = (inv, previousBalance, includeWhatsAppFormatting = false, totalUdhaar = 0) => {
    const bold = includeWhatsAppFormatting ? "*" : "";
    let text = `${includeWhatsAppFormatting ? '🧾 ' : ''}${bold}${shopSettings.shopName || "MOBILE SHOP"}${bold}\n`;
    text += `==============================\n`;
    text += `📍 ${shopSettings.address || shopSettings.shopAddress || "Main Mobile Market"}\n`;
    text += `📞 Phone: ${shopSettings.phone || shopSettings.shopPhone || "+92 300 0000000"}\n`;
    text += `==============================\n`;
    text += `Invoice #: ${inv.billNumber || "INV"}\n`;
    text += `Date: ${new Date(inv.createdAt || Date.now()).toLocaleDateString()}\n`;
    text += `Customer: ${inv.customerName || "Walk-in Customer"}\n`;
    if (inv.customerPhone) text += `Contact: ${inv.customerPhone}\n`;
    text += `Payment: ${inv.paymentMethod || "Cash"}\n`;
    text += `Seller: ${inv.cashierName || "Shop Partner"}\n`;
    text += `------------------------------\n`;
    text += `${bold}ITEMS PURCHASED:${bold}\n`;
    (inv.items || []).forEach((item) => {
      text += `• ${bold}${item.description || item.productName || item.name || "Item"}${bold}\n`;
      const itemRate = item.rate || item.unitSalePrice || (item.quantity ? item.subtotal / item.quantity : 0);
      const itemSubtotal = item.subtotal || (item.quantity * itemRate);
      text += `  Qty: ${item.quantity || item.qty || 1} x Rs ${fmt(itemRate)} = Rs ${fmt(itemSubtotal)}\n`;
      const imeis = itemImeis(item);
      if (imeis.length > 0) text += `  IMEI: ${imeis.join(", ")}\n`;
    });
    text += `------------------------------\n`;
    text += `Subtotal: Rs ${(inv.subtotalAmount || inv.grandTotal || 0).toLocaleString()}\n`;
    if (inv.discountAmount > 0) {
      text += `Discount: -Rs ${inv.discountAmount.toLocaleString()}\n`;
    }
    if (previousBalance > 0) {
      text += `Previous Balance: Rs ${previousBalance.toLocaleString()}\n`;
    }
    text += `${bold}NET TOTAL: Rs ${((inv.grandTotal || 0) + previousBalance).toLocaleString()}${bold}\n`;
    text += `Paid Amount: Rs ${(inv.paidAmount || 0).toLocaleString()}\n`;
    if ((inv.dueAmount || 0) > 0) {
      text += `⚠️ ${bold}DUE / UDHAAR: Rs ${inv.dueAmount.toLocaleString()}${bold}\n`;
    }
    if (totalUdhaar > 0) {
      text += `${bold}Total Udhaar: Rs ${totalUdhaar.toLocaleString()}${bold}\n`;
    }
    text += `==============================\n`;
    text += `Thank you for your business!\n`;
    return text;
  };

  // Share the receipt as a picture: preview, then WhatsApp / any app / copy / download
  const handleWhatsAppShareModal = () => {
    if (!completedSaleInvoice) return;
    const udhaar = receiptUdhaar(completedSaleInvoice);
    openShare({
      element: receiptRef.current || document.getElementById("invoice-print-area"),
      fileName: `Invoice_${completedSaleInvoice.billNumber || "INV"}.png`,
      phone: completedSaleInvoice.customerPhone,
      text: generateTextReceipt(completedSaleInvoice, udhaar.previous, true, udhaar.total),
      title: "Share Invoice",
    });
  };

  // Same clean 80 mm print window as the POS receipt
  const handlePrintReceipt = () => printElement("invoice-print-area", "Sales Receipt");

  const closeReceipt = () => {
    setCompletedSaleInvoice(null);
    focusScan();
  };



  // ── Helper to recalculate active invoice totals when rate or qty changes ──
  const recalculateInvoiceTotal = (entriesList, invId) => {
    if (!invId) return entriesList;
    const children = entriesList.filter((e) => e.parentInvoiceId === invId);
    const totalDebit = children.reduce((s, c) => s + Number(c.qty || 0) * Number(c.rate || 0), 0);
    const totalPcs = children.reduce((s, c) => s + Number(c.qty || 0), 0);

    return entriesList.map((e) => {
      if (e.id === invId) {
        const descParts = e.description.split("TPcs:");
        const newDesc = (descParts[0] || "") + "TPcs:" + totalPcs;
        return { ...e, debit: totalDebit, description: newDesc };
      }
      return e;
    });
  };

  // ── Rate Change Handler for Ledger Rows ──
  const handleRateChange = (targetRow, newRateStr) => {
    const newRate = Math.max(0, Number(newRateStr) || 0);
    setEntries((prev) => {
      if (isLockedEntry(prev, targetRow)) return prev;
      const updated = prev.map((e) => {
        if (targetRow.groupIds ? targetRow.groupIds.includes(e.id) : e.id === targetRow.id) {
          return { ...e, rate: newRate };
        }
        return e;
      });
      return recalculateInvoiceTotal(updated, targetRow.parentInvoiceId);
    });
  };

  // ── Qty Change Handler for Ledger Rows ──
  const handleQtyChange = (targetRow, newQtyStr) => {
    // Phone rows count their IMEIs: scan or delete units instead of typing a quantity
    if (itemImeis(targetRow).length > 0) return;
    // The box may be empty while a new number is typed; it becomes 1 again when it loses focus
    const newQty = String(newQtyStr) === "" ? "" : Math.max(1, Math.floor(Number(newQtyStr)) || 1);
    setEntries((prev) => {
      if (isLockedEntry(prev, targetRow)) return prev;
      const updated = prev.map((e) => {
        if (targetRow.groupIds ? targetRow.groupIds.includes(e.id) : e.id === targetRow.id) {
          return { ...e, qty: newQty };
        }
        return e;
      });
      return recalculateInvoiceTotal(updated, targetRow.parentInvoiceId);
    });
  };

  // ── Manual add ────────────────────────────────────────────────────────────
  const handleManualAdd = () => {
    if (!manualForm.description) return;

    if (manualForm.type === "item") {
      // Create invoice header if needed
      const invId = currentInvoiceId || createInvoice();

      const itemEntry = {
        id: uid(), type: "item", date: manualForm.date,
        description: manualForm.description,
        qty: Number(manualForm.qty) || 1, rate: Number(manualForm.rate) || 0,
        dis: manualForm.dis, deal: manualForm.deal, lp: manualForm.lp,
        debit: null, credit: null, parentInvoiceId: invId,
      };
      setEntries((prev) => updateInvoiceTotals([...prev, itemEntry], invId));
    } else if (manualForm.type === "payment") {
      setEntries((prev) => [...prev, {
        id: uid(), type: "payment", date: manualForm.date,
        description: manualForm.description,
        qty: "", rate: "", dis: "", deal: "", lp: "",
        debit: Number(manualForm.debit) || 0, credit: Number(manualForm.credit) || 0,
      }]);
    }

    setManualForm(EMPTY_MANUAL);
    setShowManual(false);
    focusScan();
  };

  // ── Save opening balance ──────────────────────────────────────────────────
  const [savingOB, setSavingOB] = useState(false);
  const saveOB = async () => {
    if (!isAdmin || savingOB) return;
    const amount = Number(obInput) || 0;
    setSavingOB(true);
    try {
      await api.setOpeningBalance(dateFrom, amount);
      setOpeningBalance(amount);
      setEditingOB(false);
      focusScan();
    } catch (err) {
      alert(`Opening balance was NOT saved.\n\n${err.message}`);
    } finally {
      setSavingOB(false);
    }
  };

  // ── Running balance computation ───────────────────────────────────────────
  const rows = useMemo(() => {
    const computedRows = [];
    let currentBalance = openingBalance;
    
    entries.forEach((e) => {
      const qty = Number(e.qty || 0);
      const rate = Number(e.rate || 0);
      const computedAmount = e.type === "item" ? qty * rate : null;
      const debit = Number(e.debit || 0);
      const credit = Number(e.credit || 0);

      if (e.type === "invoice") {
        currentBalance += debit;
      } else if (e.type === "payment") {
        currentBalance = currentBalance + debit - credit;
      }
      
      computedRows.push({ ...e, computedAmount, runningBalance: currentBalance });
    });
    
    return computedRows;
  }, [entries, openingBalance]);

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance : openingBalance;

  // Invoices that were checked out (linked to a saved sale) can no longer be edited or deleted
  const lockedInvoiceIds = new Set(entries.filter((e) => e.type === "invoice" && e.saleId).map((e) => e.id));

  // Live paid / due preview for the checkout modal
  const checkoutTotal = entries
    .filter((e) => e.type === "item" && e.parentInvoiceId === currentInvoiceId)
    .reduce((s, e) => s + Number(e.qty || 1) * Number(e.rate || 0), 0);
  const checkoutDue = checkoutAmounts(checkoutTotal).due;
  const needsCustomer = checkoutDue > 0 && !selectedCustomer;

  // Lines of the current invoice still without a rate (checkout stays blocked)
  const noRateLines = missingRateLines(entries, currentInvoiceId);
  const noRateIds = new Set(noRateLines.map((e) => e.id));
  const noRateNames = rateLineNames(noRateLines);

  const completedUdhaar = receiptUdhaar(completedSaleInvoice);

  // ── Print ─────────────────────────────────────────────────────────────────
  // The statement is a wide table: the 80 mm receipt page cut it off, so it prints on A4
  const handlePrint = () => printElement("ledger-print-area", "Billing Ledger", { paper: "a4" });

  // ── Cell styles ───────────────────────────────────────────────────────────
  const cell = "border border-slate-700 px-1.5 py-[3px] text-[11px]";
  const cellR = cell + " text-right";
  const cellC = cell + " text-center";

  return (
    <>
    <div className={`p-4 space-y-4 bg-slate-950 min-h-screen ${completedSaleInvoice ? "print:hidden" : ""}`}>

      {/* ━━ Top Action Bar ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <BookOpen size={22} className="text-indigo-400" />
          <div>
            <h1 className="text-base font-bold text-slate-100">Billing Ledger</h1>
            <p className="text-[11px] text-slate-400">Scan IMEI / barcode to add products to the current bill</p>
            <p className={`text-[11px] font-semibold ${loadError || saveState === "error" ? "text-rose-400" : saveState === "saving" ? "text-amber-400" : "text-emerald-400"}`}>
              {loadError
                ? `Could not load saved ledger: ${loadError}`
                : saveState === "error"
                ? "Not saved yet — retrying every 10s. Don't close this page."
                : saveState === "saving"
                ? "Saving…"
                : "All changes saved to database"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleNewInvoice}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow active:scale-95">
            <FileText size={14} /> New Invoice
          </button>

          {currentInvoiceId && (
            <button onClick={handleCheckoutClick}
              disabled={noRateLines.length > 0}
              title={noRateLines.length > 0 ? "Enter a rate for every item first" : undefined}
              className={`px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all ${noRateLines.length > 0 ? "opacity-50 cursor-not-allowed" : "hover:bg-emerald-500 shadow shadow-emerald-600/30 active:scale-95 animate-pulse"}`}>
              <CheckCircle2 size={14} /> Checkout & Finalize
            </button>
          )}
          <button onClick={() => setShowManual(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow shadow-indigo-600/30 active:scale-95">
            <Plus size={14} /> Manual Entry
          </button>
          <button onClick={handlePrint}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-slate-700 transition-all">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* ━━ IMEI / Barcode Scanner Input ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ScanLine size={18} className="text-cyan-400" />
          <span className="text-sm font-bold text-slate-100">Scan Product IMEI / Barcode</span>
          {currentInvoiceId && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 ml-auto">
              Invoice Active
            </span>
          )}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={scanRef}
            type="text"
            inputMode="numeric"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={handleScan}
            placeholder="Scan or paste barcodes/IMEIs (separate multiple with spaces/commas) and press Enter..."
            className="w-full pl-10 pr-4 py-3 bg-slate-950 border-2 border-cyan-600/40 rounded-xl text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-all"
            autoComplete="off"
          />
          {scanInput && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">
              {scanInput.length} digit{scanInput.length !== 1 ? "s" : ""} — press Enter
            </span>
          )}
        </div>

        {/* Lines without a rate block the checkout */}
        {noRateLines.length > 0 && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-xs font-semibold border bg-rose-500/10 text-rose-300 border-rose-500/30">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>
              Rate required before checkout: {noRateNames.join(", ")}. Enter the rate in the highlighted Rate box.
            </span>
          </div>
        )}

        {/* Scan status feedback */}
        {scanStatus && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border ${scanStatus.type === "success"
              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
              : "bg-rose-500/10 text-rose-300 border-rose-500/30"
            }`}>
            {scanStatus.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{scanStatus.message}</span>
          </div>
        )}
      </div>

      {/* ━━ Printable Statement ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div id="ledger-print-area" className={`bg-white text-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-xl ${completedSaleInvoice ? '' : 'print-target'}`}>

        {/* Company header */}
        <div className="border-b-2 border-slate-800 px-4 pt-3 pb-2">
          <div className="text-center mb-2">
            <div className="text-[15px] font-extrabold tracking-widest uppercase">
              {shopSettings?.shopName || "AL SAEED M/Z KOHAT"}
            </div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.2em]">KOHAT</div>
          </div>

          <div className="flex items-start justify-between text-[11px]">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold w-8 text-slate-700">From</span>
                <input type="date" value={dateFrom} onChange={(e) => e.target.value && setDateFrom(e.target.value)}
                  className="border border-slate-400 rounded px-1 py-0.5 text-[11px] text-slate-800 bg-slate-50 focus:outline-none focus:border-indigo-500" />
                <span className="text-slate-500">{fmtDate(dateFrom)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold w-8 text-slate-700">To</span>
                <input type="date" value={dateTo} onChange={(e) => e.target.value && setDateTo(e.target.value)}
                  className="border border-slate-400 rounded px-1 py-0.5 text-[11px] text-slate-800 bg-slate-50 focus:outline-none focus:border-indigo-500" />
                <span className="text-slate-500">{fmtDate(dateTo)}</span>
              </div>
            </div>
            <div className="text-right text-[11px] font-semibold text-slate-600">{genTime}</div>
          </div>
        </div>

        {/* ── Ledger Table ── */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontSize: "11px" }}>
            <colgroup>
              <col style={{ width: "82px" }} />
              <col style={{ width: "210px" }} />
              <col style={{ width: "36px" }} />
              <col style={{ width: "52px" }} />
              <col style={{ width: "34px" }} />
              <col style={{ width: "40px" }} />
              <col style={{ width: "26px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "84px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "26px" }} />
            </colgroup>

            <thead>
              <tr className="bg-slate-200 border-y-2 border-slate-800">
                {["Date", "Description", "Qty", "Rate", "Dis", "Deal", "LP", "Amount", "Debit", "Credit", "Balance", ""].map((h, i) => (
                  <th key={i} className={`${i >= 2 ? cellC : cell} font-bold bg-slate-200 ${i === 11 ? "print:hidden" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* Data Rows */}
              {(() => {
                const groupedRows = [];
                const invoiceGroups = {};

                rows.forEach((row) => {
                  if (row.type === "item" && row.parentInvoiceId && row.productId) {
                    const key = `${row.parentInvoiceId}_${row.productId}`;
                    if (!invoiceGroups[key]) {
                      // All IMEIs of the row (imeisArray), not only the first one in row.imei
                      const newRow = { ...row, imeisArray: [...itemImeis(row)], groupIds: [row.id] };
                      invoiceGroups[key] = newRow;
                      groupedRows.push(newRow);
                    } else {
                      const g = invoiceGroups[key];
                      g.qty = Number(g.qty) + Number(row.qty || 1);
                      g.computedAmount = (g.computedAmount || 0) + (row.computedAmount || 0);
                      g.imeisArray.push(...itemImeis(row));
                      g.groupIds.push(row.id);
                    }
                  } else {
                    groupedRows.push({ ...row, groupIds: [row.id] });
                  }
                });

                return groupedRows.map((row, idx) => {
                  const isInvoice = row.type === "invoice";
                  const isPayment = row.type === "payment";
                  const isActive = !!currentInvoiceId && (row.id === currentInvoiceId || row.parentInvoiceId === currentInvoiceId);
                  const locked = lockedInvoiceIds.has(isInvoice ? row.id : row.parentInvoiceId);
                  const needsRate = !locked && row.type === "item" && row.groupIds.some((id) => noRateIds.has(id));

                  let displayDesc = row.description;
                  if (row.type === "item") {
                    const baseName = row.fullName || (row.description ? row.description.split(" (")[0] : "");
                    if (row.imeisArray && row.imeisArray.length > 0) {
                      displayDesc = `${baseName} [IMEI: ${row.imeisArray.join(", ")}]`;
                    } else if (baseName) {
                      displayDesc = baseName;
                    }
                  }

                  const bg = isInvoice
                    ? isActive ? "bg-sky-100" : "bg-sky-50"
                    : isPayment
                      ? "bg-green-50"
                      : idx % 2 === 0 ? "bg-white" : "bg-slate-50";

                  return (
                    <tr key={row.id} className={`${bg} hover:bg-yellow-50 transition-colors`}>
                      <td className={cell}>
                        <span className="text-slate-700">{fmtDate(row.date)}</span>
                      </td>
                      <td className={`${cell} ${isInvoice ? "font-semibold text-sky-800" : isPayment ? "font-semibold text-emerald-800" : "text-slate-800"}`}>
                        {displayDesc}
                        {isActive && isInvoice && <span className="ml-1 text-[9px] text-sky-500 font-bold">● CURRENT</span>}
                      </td>
                      <td className={`${cellC} p-[1px]`}>
                        {!isInvoice && !isPayment && !row.imei ? (
                          <input
                            type="number"
                            min="1"
                            value={row.qty !== undefined && row.qty !== null ? row.qty : 1}
                            onChange={(e) => handleQtyChange(row, e.target.value)}
                            onFocus={(e) => !locked && e.target.select()}
                            onBlur={() => !locked && row.qty === "" && handleQtyChange(row, "1")}
                            onKeyDown={(e) => e.key === "Enter" && focusScan()}
                            readOnly={locked}
                            className={`w-12 font-bold text-center text-slate-900 rounded px-1 py-0.5 focus:outline-none transition-colors print:bg-transparent print:border-none print:w-auto ${locked ? "bg-transparent border border-transparent cursor-default" : "bg-slate-100 border border-slate-300 focus:bg-white focus:border-indigo-500"}`}
                            title={locked ? "Checked out — cannot be edited" : "Edit Quantity"}
                          />
                        ) : !isInvoice && !isPayment ? (
                          row.qty || 1
                        ) : (
                          ""
                        )}
                      </td>
                      <td className={`${cellC} p-[1px]`}>
                        {!isInvoice && !isPayment ? (
                          <input
                            type="number"
                            min="0"
                            value={row.rate !== undefined && row.rate !== null ? row.rate : ""}
                            onChange={(e) => handleRateChange(row, e.target.value)}
                            onFocus={(e) => !locked && e.target.select()}
                            onKeyDown={(e) => e.key === "Enter" && focusScan()}
                            readOnly={locked}
                            className={`w-24 font-extrabold text-center text-slate-900 rounded-lg px-1.5 py-1 focus:outline-none transition-all print:bg-transparent print:border-none print:w-auto ${locked ? "bg-transparent border-2 border-transparent cursor-default" : needsRate ? "bg-rose-50 border-2 border-rose-500 ring-2 ring-rose-500/30 focus:bg-yellow-200 focus:border-indigo-600 shadow-sm" : "bg-amber-50 border-2 border-amber-400 focus:bg-yellow-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 shadow-sm"}`}
                            placeholder="Rate"
                            title={locked ? "Checked out — cannot be edited" : needsRate ? "Rate required — enter the selling price" : "Click to edit custom rate required"}
                          />
                        ) : (
                          ""
                        )}
                      </td>
                      <td className={cellC}>{row.dis || ""}</td>
                      <td className={cellC}>{row.deal || ""}</td>
                      <td className={cellC}>{row.lp || ""}</td>
                      <td className={cellR}>
                        {!isInvoice && !isPayment && row.computedAmount ? fmt(row.computedAmount) : ""}
                      </td>
                      <td className={`${cellR} font-semibold text-blue-900`}>
                        {row.debit ? fmt(row.debit) : ""}
                      </td>
                      <td className={`${cellR} text-emerald-800`}>
                        {row.credit ? fmt(row.credit) : ""}
                      </td>
                      <td className={`${cellR} font-bold text-slate-900`}>
                        {fmt(row.runningBalance)}
                      </td>
                      <td className={`${cell} text-center print:hidden`}>
                        {!locked && (isAdmin || !isPayment) && (
                          <button onClick={() => row.groupIds.forEach(id => handleDelete(id))}
                            className="text-rose-400 hover:text-rose-600 transition-colors p-0.5" title="Delete">
                            <Trash2 size={10} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                });
              })()}

              {/* Empty state */}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="border border-slate-700 text-center py-8 text-slate-400 text-sm">
                    <ScanLine size={24} className="mx-auto mb-2 opacity-40" />
                    Scan an IMEI above to start adding items to the bill
                  </td>
                </tr>
              )}
            </tbody>

            <tfoot>
              <tr className="bg-slate-200 border-t-2 border-slate-800">
                <td className={`${cell} font-bold text-center`} colSpan={7}>
                  <span className="text-slate-700 mr-6">
                    Total Dr= <span className="text-blue-800">{fmt(totalDebit, 2)}</span>
                  </span>
                  <span className="text-slate-700">
                    Total Cr= <span className="text-emerald-700">{fmt(totalCredit, 2)}</span>
                  </span>
                </td>
                <td className={cellR}></td>
                <td className={`${cellR} font-bold text-blue-800`}>{fmt(totalDebit, 2)}</td>
                <td className={`${cellR} font-bold text-emerald-700`}>{fmt(totalCredit, 2)}</td>
                <td className={`${cellR} font-extrabold text-slate-900 text-[12px]`}>
                  Balance= {fmt(finalBalance, 2)}
                </td>
                <td className={`${cell} print:hidden`}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ━━ Summary Cards ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opening Balance</p>
            {isAdmin && (
              <button onClick={() => { setObInput(String(openingBalance)); setEditingOB(true); }}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded transition-colors">
                Edit
              </button>
            )}
          </div>
          <p className="text-lg font-extrabold text-slate-300">Rs {fmt(openingBalance, 2)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Debit (Dr)</p>
          <p className="text-lg font-extrabold text-blue-400">Rs {fmt(totalDebit, 2)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Credit (Cr)</p>
          <p className="text-lg font-extrabold text-emerald-400">Rs {fmt(totalCredit, 2)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Final Balance</p>
          <p className="text-lg font-extrabold text-amber-400">Rs {fmt(finalBalance, 2)}</p>
        </div>
      </div>

      {/* ━━ Edit Opening Balance Modal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {editingOB && isAdmin && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-100 text-sm">Edit Opening Balance</h3>
            <input type="number" value={obInput} onChange={(e) => setObInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 text-lg font-mono focus:outline-none focus:border-indigo-500" placeholder="0" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEditingOB(false); focusScan(); }}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl">Cancel</button>
              <button onClick={saveOB} disabled={savingOB}
                className="px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-500 shadow disabled:opacity-60">{savingOB ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ━━ Manual Entry Modal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {showManual && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText size={17} className="text-indigo-400" />
                <h3 className="font-bold text-slate-100 text-sm">Manual Ledger Entry</h3>
              </div>
              <button onClick={() => { setShowManual(false); focusScan(); }} className="text-slate-400 hover:text-white"><X size={17} /></button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-400">Entry Type</label>
                <select value={manualForm.type} onChange={(e) => setManualForm({ ...manualForm, type: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500">
                  <option value="item">Item Row (adds to current invoice)</option>
                  <option value="payment">Payment / Receipt (Credit)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-400">Date</label>
                <input type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500" />
              </div>

              <div>
                <label className="font-semibold text-slate-400">Description <span className="text-rose-400">*</span></label>
                <input type="text" value={manualForm.description} onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500"
                  placeholder={manualForm.type === "item" ? "Product name" : "Payment description"} />
              </div>

              {manualForm.type === "item" && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="font-semibold text-slate-400">Qty</label>
                      <input type="number" value={manualForm.qty} onChange={(e) => setManualForm({ ...manualForm, qty: e.target.value })}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500" placeholder="1" />
                    </div>
                    <div>
                      <label className="font-bold text-amber-400">Rate (Rs) *</label>
                      <input
                        type="number"
                        min="0"
                        value={manualForm.rate}
                        onChange={(e) => setManualForm({ ...manualForm, rate: e.target.value })}
                        onFocus={(e) => e.target.select()}
                        className="w-full mt-1 bg-slate-950 border-2 border-amber-500/50 rounded-xl p-2.5 font-bold text-slate-100 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                        placeholder="Enter Rate..."
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-400">Dis %</label>
                      <input type="number" value={manualForm.dis} onChange={(e) => setManualForm({ ...manualForm, dis: e.target.value })}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500" placeholder="0" />
                    </div>
                  </div>
                  {manualForm.qty && manualForm.rate && (
                    <div className="p-2.5 bg-indigo-950/50 border border-indigo-800/40 rounded-xl text-indigo-300 font-semibold flex justify-between">
                      <span>Amount (Qty × Rate)</span>
                      <span>Rs {fmt(Number(manualForm.qty) * Number(manualForm.rate))}</span>
                    </div>
                  )}
                </>
              )}

              {manualForm.type === "payment" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-400">Debit (Dr)</label>
                    <input type="number" value={manualForm.debit} onChange={(e) => setManualForm({ ...manualForm, debit: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500" placeholder="0" />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-400">Credit (Cr)</label>
                    <input type="number" value={manualForm.credit} onChange={(e) => setManualForm({ ...manualForm, credit: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500" placeholder="0" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1 border-t border-slate-800">
              <button onClick={() => { setShowManual(false); focusScan(); }}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700">Cancel</button>
              <button onClick={handleManualAdd} disabled={!manualForm.description}
                className="px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-500 disabled:opacity-40 shadow">
                Add Entry
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ━━ Checkout Modal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800">Finalize Ledger Invoice</h2>
              <button onClick={() => { setShowCheckoutModal(false); focusScan(); }} className="text-slate-400 hover:text-slate-700 bg-white p-2 rounded-full shadow-sm">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
              {/* Payment Method Selection */}
              <div>
                <label className="text-sm font-bold text-slate-700 mb-3 block">Payment Method</label>
                <div className="grid grid-cols-3 gap-3">
                  {["Cash", "Card", "Pending Bill"].map(method => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`py-3 rounded-2xl font-bold text-sm flex flex-col items-center gap-2 border-2 transition-all ${
                        paymentMethod === method 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md shadow-indigo-600/10' 
                          : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300'
                      }`}
                    >
                      {method === "Cash" && <Banknote size={20} />}
                      {method === "Card" && <CreditCard size={20} />}
                      {method === "Pending Bill" && <BookOpen size={20} />}
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seller Selection */}
              <div>
                <label className="text-sm font-bold text-slate-700 mb-2.5 block">Select Seller</label>
                <div className="grid grid-cols-2 gap-3">
                  {SELLERS.map((sellerName) => {
                    const isSelected = selectedSeller === sellerName;
                    return (
                      <button
                        key={sellerName}
                        type="button"
                        onClick={() => setSelectedSeller(sellerName)}
                        className={`py-3 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md shadow-indigo-600/10"
                            : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                        }`}
                      >
                        <User size={18} />
                        <span>Seller: {sellerName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Customer Selection (To whom you want to sell) */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-bold text-slate-700 block">
                    Select Customer {(paymentMethod === "Pending Bill" || checkoutDue > 0) && <span className="text-rose-500">*</span>}
                  </label>
                  <button 
                    onClick={() => setShowQuickAddCustomer(!showQuickAddCustomer)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded"
                  >
                    <Plus size={12} /> {showQuickAddCustomer ? "Cancel" : "New Customer"}
                  </button>
                </div>

                {showQuickAddCustomer ? (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-3 space-y-3">
                    <input 
                      type="text" 
                      placeholder="Customer Name *" 
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                    <input 
                      type="text" 
                      placeholder="Phone Number (Optional)" 
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={handleQuickAddCustomer}
                      disabled={isSavingCustomer}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl disabled:opacity-60"
                    >
                      {isSavingCustomer ? "Saving…" : "Save & Select"}
                    </button>
                  </div>
                ) : (
                  <div className="relative" ref={customerDropdownRef}>
                    <div 
                      onClick={() => setShowCustomerDropdown(true)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-slate-700 font-medium cursor-pointer flex justify-between items-center transition-all hover:border-indigo-300"
                    >
                      <span>
                        {selectedCustomer 
                          ? (() => {
                              const c = allCustomers.find(c => c.id === selectedCustomer);
                              return c ? `${c.name} (${c.phone || 'No Phone'})` : "Unknown";
                            })()
                          : "-- Walk-in Customer --"
                        }
                      </span>
                      <span className="text-slate-400">▼</span>
                    </div>

                    {showCustomerDropdown && (
                      <div className="mt-2 bg-white border border-slate-200 rounded-2xl shadow-inner overflow-hidden">
                        <div className="p-3 border-b border-slate-100 bg-slate-50">
                          <input 
                            type="text" 
                            autoFocus
                            placeholder="Search by name or phone..." 
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-sm text-slate-700 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                          <div 
                            onClick={() => { setSelectedCustomer(""); setShowCustomerDropdown(false); }}
                            className="px-4 py-3 text-sm text-slate-500 hover:bg-slate-50 cursor-pointer"
                          >
                            -- Walk-in Customer --
                          </div>
                          {allCustomers.filter(c => (c.name || "").toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone && c.phone.includes(customerSearch))).map(c => (
                            <div 
                              key={c.id} 
                              onClick={() => { setSelectedCustomer(c.id); setShowCustomerDropdown(false); }}
                              className="px-4 py-3 text-sm text-slate-700 hover:bg-indigo-50 cursor-pointer border-t border-slate-100"
                            >
                              <div className="font-bold">{c.name}</div>
                              {c.phone && <div className="text-xs text-slate-400 mt-0.5">{c.phone}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {needsCustomer && (
                  <p className="text-rose-500 text-xs font-semibold mt-2 px-1 flex items-center gap-1">
                    <AlertCircle size={12}/> A registered customer is required for Udhaar.
                  </p>
                )}
              </div>

              {/* Paid now — Cash/Card default to the full total, Pending Bill to 0 */}
              <div>
                <label className="text-sm font-bold text-slate-700 mb-2 block">
                  {paymentMethod === "Pending Bill" ? "Amount Paid Now (Optional)" : "Amount Received (Cash/Card)"}
                </label>
                <input
                  type="number"
                  min="0"
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-slate-900 font-bold text-lg focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  placeholder={paymentMethod === "Pending Bill" ? "0" : `Full amount: Rs ${fmt(checkoutTotal)}`}
                />
                <div className="flex justify-between text-xs font-semibold mt-2 px-1">
                  <span className="text-slate-500">Bill Total: Rs {fmt(checkoutTotal)}</span>
                  {checkoutDue > 0 && <span className="text-rose-500">Udhaar: Rs {fmt(checkoutDue)}</span>}
                </div>
              </div>

              {paymentMethod === "Pending Bill" && (
                <div>
                  <label className="text-sm font-bold text-slate-700 mb-2 block">Due Date (Optional)</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-slate-700 font-medium focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>
              )}
            </div>

            {noRateLines.length > 0 && (
              <div className="px-6 py-3 bg-rose-50 border-t border-rose-100 text-rose-600 text-xs font-semibold flex items-start gap-1.5">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>Rate required for: {noRateNames.join(", ")}. Close this window and enter the rate in the highlighted box.</span>
              </div>
            )}
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
              <button
                onClick={finalizeCheckout}
                disabled={isSubmitting || needsCustomer || noRateLines.length > 0}
                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/30 transition-all disabled:opacity-50 disabled:shadow-none"
              >
                <CheckCircle2 size={20} />
                {isSubmitting ? "Saving…" : "CONFIRM & GENERATE INVOICE"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>

      {/* ━━ Invoice Print Modal (Micro POS Thermal Receipt Slip) ━━━━━━━━━ */}
      {completedSaleInvoice && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:static print:p-0 print:block print:bg-transparent">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl relative max-h-[95vh] overflow-y-auto print:shadow-none print:w-full print:max-w-none print:rounded-none">
            
            {/* MICRO POS THERMAL RECEIPT SLIP — the modal box scrolls, so the image gets the whole receipt */}
            <div id="invoice-print-area" ref={receiptRef} className="p-5 print:p-0 bg-white text-black print-target">
              {/* Shop Header */}
              <div className="text-center mb-4">
                <h2 className="text-xl font-black uppercase tracking-tight">{shopSettings.shopName || "AL-SYED MOBILE SHOP"}</h2>
                <p className="text-xs mt-0.5">{shopSettings.address || shopSettings.shopAddress}</p>
                <p className="text-xs">{shopSettings.phone || shopSettings.shopPhone}</p>
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>

              {/* Bill Info */}
              <div className="flex justify-between items-start mb-1 text-xs">
                <div>
                  <div className="font-bold">RECEIPT</div>
                  <div>
                    {new Date(completedSaleInvoice.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })},{" "}
                    {new Date(completedSaleInvoice.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                  </div>
                  {completedSaleInvoice.customerName && completedSaleInvoice.customerName !== "Walk-in Customer" && (
                    <div className="font-semibold mt-1">
                      Cust: {completedSaleInvoice.customerName}
                      {completedSaleInvoice.customerPhone && <div className="font-normal text-xs">{completedSaleInvoice.customerPhone}</div>}
                    </div>
                  )}
                  {completedSaleInvoice.cashierName && (
                    <div>Seller: {completedSaleInvoice.cashierName}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-black text-sm">{completedSaleInvoice.billNumber}</div>
                </div>
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>

              {/* Items */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span>ITEM / QTY</span>
                  <span>AMOUNT</span>
                </div>
                {(completedSaleInvoice.items || []).map((item, idx) => {
                  const rate = item.rate || item.unitSalePrice || (item.quantity ? item.subtotal / item.quantity : 0);
                  const sub = item.subtotal || (item.quantity * rate) || 0;
                  return (
                    <div key={idx} className="pb-1">
                      <div className="flex justify-between items-start text-sm">
                        <div className="pr-2">
                          <div className="font-semibold">{item.description || item.productName || item.name}</div>
                          <div className="text-xs">{item.quantity || item.qty || 1} × Rs. {Number(rate).toLocaleString()}</div>
                          {itemImeis(item).length > 0 && (
                            <div className="font-mono text-[10px]">IMEI: {itemImeis(item).join(", ")}</div>
                          )}
                        </div>
                        <span className="font-semibold whitespace-nowrap">Rs. {Number(sub).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>

              {/* Totals */}
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>Rs. {(completedSaleInvoice.subtotalAmount || completedSaleInvoice.grandTotal || 0).toLocaleString()}</span></div>
                {completedSaleInvoice.discountAmount > 0 && (
                  <div className="flex justify-between"><span>Discount</span><span>−Rs. {completedSaleInvoice.discountAmount.toLocaleString()}</span></div>
                )}
                
                <div className="flex justify-between text-lg font-black mt-2 pt-2 border-t border-black"><span>TOTAL</span><span>Rs. {completedSaleInvoice.grandTotal.toLocaleString()}</span></div>
                
                {completedSaleInvoice.dueAmount > 0 && (
                  <div className="mt-2 pt-2 border-t border-dashed border-black">
                    <div className="flex justify-between text-sm"><span>Paid</span><span>Rs. {(completedSaleInvoice.paidAmount || 0).toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm font-bold mt-1"><span>BALANCE DUE</span><span>Rs. {completedSaleInvoice.dueAmount.toLocaleString()}</span></div>
                  </div>
                )}
                
                {(completedUdhaar.previous > 0 || completedUdhaar.total > 0) && (
                  <div className="mt-2 pt-2 border-t border-dashed border-black text-rose-600">
                    {completedUdhaar.previous > 0 && (
                      <div className="flex justify-between text-sm"><span>Previous Udhaar</span><span>Rs. {completedUdhaar.previous.toLocaleString()}</span></div>
                    )}
                    {completedUdhaar.total > 0 && (
                      <div className="flex justify-between text-sm font-bold"><span>Total Udhaar</span><span>Rs. {completedUdhaar.total.toLocaleString()}</span></div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>
              <div className="text-center text-xs font-bold mt-2">THANK YOU FOR YOUR BUSINESS</div>
              <div className="text-center text-[10px] mt-1 mb-2">Developed By Syed</div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 p-4 border-t border-slate-100 bg-slate-50 print:hidden">
              <button onClick={handlePrintReceipt} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow">
                <Printer size={14} /> Print
              </button>
              <button onClick={handleWhatsAppShareModal} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow">
                <Smartphone size={14} /> Share
              </button>
              <button onClick={closeReceipt} className="py-2.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1">
                <CheckCircle2 size={14} /> Done
              </button>
            </div>
          </div>
        </div>
      )}

      {shareDialog}
    </>
  );
};

export default Ledger;
