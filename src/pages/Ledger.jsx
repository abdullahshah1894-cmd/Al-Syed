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
  User,
  Lock,
  Pencil,
  ChevronDown
} from "lucide-react";
import { Page, PageHeader, Card, Stat, Badge, Button, IconButton, Field, Input, Segmented, Modal, inputClass } from "../components/ui";

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

// This till's own id, kept in the browser. Each till only re-opens and shows its own open bill,
// so two tills never add to one invoice. Rows from older builds have no device id and stay visible everywhere.
const DEVICE_KEY = "ledger.deviceId";
let deviceIdCache = null;
const getDeviceId = () => {
  if (deviceIdCache) return deviceIdCache;
  try {
    deviceIdCache = localStorage.getItem(DEVICE_KEY);
    if (!deviceIdCache) {
      deviceIdCache = uid();
      localStorage.setItem(DEVICE_KEY, deviceIdCache);
    }
  } catch {
    // Storage blocked (private window): an id for this page load only
    deviceIdCache = deviceIdCache || uid();
  }
  return deviceIdCache;
};
const isMine = (e) => !e.deviceId || e.deviceId === getDeviceId();

// Background product reloads after scans, at most every 15 s
let lastProductRefresh = 0;
const productRefreshDue = () => {
  const now = Date.now();
  if (now - lastProductRefresh < 15000) return false;
  lastProductRefresh = now;
  return true;
};

// Draft header text until checkout; then it becomes the real bill number from the database
const DRAFT_DESC = "New bill (draft);TPcs:0";
const isFocusBusy = (scanEl) => {
  const a = document.activeElement;
  if (!a || a === scanEl || a === document.body) return false;
  // Typing somewhere else, or a window (checkout, manual entry) is open
  return !!(a.matches?.("input, select, textarea, [contenteditable='true']") || a.closest?.('[role="dialog"]'));
};

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
  extra: e.deviceId ? { ui: e, deviceId: e.deviceId } : { ui: e },
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
    ...(r.extra && r.extra.deviceId ? { deviceId: r.extra.deviceId } : {}),
    ...ui,
    id: r.id,
    saleId: r.sale_id || ui.saleId || undefined,
  };
};

// ── Component ────────────────────────────────────────────────────────────────
const Ledger = () => {
  // allCustomers (not the header-filtered list) so a customer added here is always found
  const { products, shopSettings, allCustomers, recordSale, addCustomer, refreshProducts } = useApp();
  // Latest product list for queued scans (a scan's closure would otherwise see the list from when it was typed)
  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);
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
  // After a scan finishes: back to the scan box, unless the user is typing a rate / qty or a window is open
  const focusScanIfFree = () => {
    if (!isFocusBusy(scanRef.current)) focusScan();
  };

  // Invoice tracking — each scan session groups items under an auto-created invoice
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

        // Re-open the last invoice of THIS till that was not checked out yet (another till's open bill is theirs)
        const invoices = merged.filter((e) => e.type === "invoice");
        const openInvoice = [...invoices].reverse().find((e) => !e.saleId && isMine(e));
        currentInvoiceRef.current = openInvoice ? openInvoice.id : null;
        setCurrentInvoiceId(currentInvoiceRef.current);
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

    // Local search first (instant). The list is refreshed in the background after scans,
    // so a found code never waits on the server (a slow lookup used to land while a rate was being typed).
    for (const prod of productsRef.current) {
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

    // Backend fallback, only when nothing matched locally — searches Supabase directly
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

  // Keep the product list fresh without making a scan wait for it (at most every 15 s)
  const refreshProductsSoon = () => {
    if (!productRefreshDue()) return;
    Promise.resolve(refreshProducts?.()).catch(() => {});
  };

  // ── Create a new invoice header row and make it the current invoice ───────
  // The real bill number comes from the database at checkout; until then the bill is a draft.
  const createInvoice = () => {
    const invId = uid();
    const invoiceEntry = {
      id: invId,
      type: "invoice",
      date: todayISO(),
      description: DRAFT_DESC,
      qty: "",
      rate: "",
      dis: "",
      deal: "",
      lp: "",
      debit: 0,
      credit: null,
      deviceId: getDeviceId(),
    };
    changeEntries((prev) => [...prev, invoiceEntry]);
    setInvoice(invId);
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
    if (invId && !entriesRef.current.some((e) => e.id === invId && e.type === "invoice" && !e.saleId && isMine(e))) invId = null;

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
                // Keep a rate the user typed (or is typing); fill it only when the line never had one
                rate: Number(e.rate) > 0 || e.rate === "" ? e.rate : itemRate,
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
            deviceId: getDeviceId(),
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

    // Stock may have changed on another till: reload the list quietly for the next scan
    refreshProductsSoon();
    focusScanIfFree();
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
    if (current && hasItems && !current.saleId) {
      // An open bill left behind would keep its items reserved and confuse the next bill: discard it or keep it
      if (submittingRef.current) return;
      if (!window.confirm("This bill has items that were not checked out.\n\nDiscard this bill and start a new one?")) {
        focusScan();
        return;
      }
      changeEntries((prev) => prev.filter((e) => e.id !== current.id && e.parentInvoiceId !== current.id));
      setInvoice(null);
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
  // Walk-in: paid stops at the bill total, the rest is change to give back.
  // Customer: paid may go above the bill up to their old Udhaar (the extra pays it off); more is refused.
  const checkoutAmounts = (total) => {
    const cust = selectedCustomer ? allCustomers.find((c) => c.id === selectedCustomer) : null;
    const oldUdhaar = cust ? Math.max(0, Number(cust.totalPending || 0)) : 0;
    const typed = Math.max(0, Number(paidAmountInput) || 0);
    const tendered = paymentMethod === "Pending Bill" ? typed : paidAmountInput !== "" ? typed : total;
    const maxPaid = cust ? total + oldUdhaar : total;
    const paid = Math.min(tendered, maxPaid);
    return {
      paid,
      due: Math.max(0, total - paid),
      change: cust ? 0 : Math.max(0, tendered - total),
      toOldUdhaar: cust ? Math.max(0, paid - total) : 0,
      tooMuch: cust && tendered > maxPaid ? tendered - maxPaid : 0,
      maxPaid,
      oldUdhaar,
    };
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
    const { paid: effectivePaid, due: dueAmount, change: changeGiven, toOldUdhaar, tooMuch, maxPaid } =
      checkoutAmounts(currentSaleTotal);

    if (tooMuch > 0) {
      alert(`Rs ${fmt(tooMuch)} too much. The most this customer can pay now is Rs ${fmt(maxPaid)} (this bill + old Udhaar).`);
      return;
    }

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

    // Link the ledger invoice to its saved sale so it is not re-opened after a refresh,
    // and give the header the real bill number the database issued
    const totalPcs = invoiceItems.reduce((s, i) => s + Number(i.qty || 0), 0);
    const billLabel = recorded.billNumber ? `Sales-${recorded.billNumber}-Ptc.` : "Sales (saved)";
    changeEntries((prev) =>
      prev.map((e) =>
        e.id === invoiceHeader.id ? { ...e, saleId: recorded.id, billNumber: recorded.billNumber || "", description: `${billLabel};TPcs:${totalPcs}` } : e
      )
    );

    // Change given / old Udhaar paid are not stored on the sale; the receipt shows them
    setCompletedSaleInvoice({ ...recorded, changeGiven, toOldUdhaar });
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

  // "Rs X went to old Udhaar": stored paid above the bill total, or what checkout worked out
  const oldUdhaarPaid = (inv) =>
    inv ? Math.max(Number(inv.toOldUdhaar || 0), inv.customerId ? Math.max(0, Number(inv.paidAmount || 0) - Number(inv.grandTotal || 0)) : 0) : 0;

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
      if (inv.dueDate) text += `Due date: ${fmtDate(inv.dueDate)}\n`;
    }
    if (oldUdhaarPaid(inv) > 0) {
      text += `Rs ${fmt(oldUdhaarPaid(inv))} went to old Udhaar\n`;
    }
    if (Number(inv.changeGiven || 0) > 0) {
      text += `Change given: Rs ${fmt(inv.changeGiven)}\n`;
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
    // Empty while a new rate is typed (a scan of the same item then leaves the box alone)
    const newRate = String(newRateStr) === "" ? "" : Math.max(0, Number(newRateStr) || 0);
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
    let newQty = String(newQtyStr) === "" ? "" : Math.max(1, Math.floor(Number(newQtyStr)) || 1);

    // No more than in stock: the product's stock minus other lines of it on this bill
    const product = targetRow.productId ? products.find((p) => p.id === targetRow.productId) : null;
    if (product && newQty !== "") {
      const ids = targetRow.groupIds || [targetRow.id];
      const onBillElsewhere = entriesRef.current
        .filter((e) => e.type === "item" && e.parentInvoiceId === targetRow.parentInvoiceId && e.productId === product.id && !ids.includes(e.id))
        .reduce((s, e) => s + Number(e.qty || 0), 0);
      const available = Math.max(0, Number(product.quantity || 0) - onBillElsewhere);
      if (newQty > available) {
        setScanStatus({
          type: "error",
          message: available > 0
            ? `Only ${available} of ${product.name} in stock — quantity set to ${available}.`
            : `${product.name} is out of stock.`,
        });
        if (available < 1) return;
        newQty = available;
      }
    }

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
      if (submittingRef.current) {
        alert("Wait until the checkout is saved, then add the line.");
        return;
      }
      // This till's open invoice, or a new one (never a checked-out bill)
      let invId = currentInvoiceRef.current;
      if (invId && !entriesRef.current.some((e) => e.id === invId && e.type === "invoice" && !e.saleId)) invId = null;
      if (!invId) invId = createInvoice();

      const itemEntry = {
        id: uid(), type: "item", date: manualForm.date,
        description: manualForm.description,
        qty: Number(manualForm.qty) || 1, rate: Number(manualForm.rate) || 0,
        dis: manualForm.dis, deal: manualForm.deal, lp: manualForm.lp,
        debit: null, credit: null, parentInvoiceId: invId,
        deviceId: getDeviceId(),
      };
      changeEntries((prev) => updateInvoiceTotals([...prev, itemEntry], invId));
    } else if (manualForm.type === "payment") {
      changeEntries((prev) => [...prev, {
        id: uid(), type: "payment", date: manualForm.date,
        description: manualForm.description,
        qty: "", rate: "", dis: "", deal: "", lp: "",
        debit: Number(manualForm.debit) || 0, credit: Number(manualForm.credit) || 0,
      }]);
      // Payments are not part of a bill: show the day's sheet so the saved payment is in view
      setView("sheet");
      setScanStatus({ type: "success", message: "✓ Payment added — shown on Today's sheet." });
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
  // "bill": only bills not checked out yet, so a finished sale leaves a fresh, empty bill (also after refresh).
  // "sheet": the whole day — checked-out bills, returns, payments and the opening balance.
  const [view, setView] = useState("bill");
  const visibleEntries = useMemo(() => {
    if (view === "sheet") return entries;
    // Only this till's open bills (another till's open bill is shown on Today's sheet, not here)
    const openInvoiceIds = new Set(entries.filter((e) => e.type === "invoice" && !e.saleId && isMine(e)).map((e) => e.id));
    return entries.filter((e) => (e.type === "invoice" ? openInvoiceIds.has(e.id) : e.type === "item" && openInvoiceIds.has(e.parentInvoiceId)));
  }, [entries, view]);
  const shownOpening = view === "sheet" ? openingBalance : 0;

  const rows = useMemo(() => {
    const computedRows = [];
    let currentBalance = shownOpening;
    
    visibleEntries.forEach((e) => {
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
  }, [visibleEntries, shownOpening]);

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance : shownOpening;

  // Invoices that were checked out (linked to a saved sale) can no longer be edited or deleted
  const lockedInvoiceIds = new Set(entries.filter((e) => e.type === "invoice" && e.saleId).map((e) => e.id));

  // Live paid / due preview for the checkout modal (also the "This bill" total: the current invoice only)
  const checkoutTotal = entries
    .filter((e) => e.type === "item" && e.parentInvoiceId === currentInvoiceId)
    .reduce((s, e) => s + Number(e.qty || 1) * Number(e.rate || 0), 0);
  const checkoutCalc = checkoutAmounts(checkoutTotal);
  const checkoutDue = checkoutCalc.due;
  const needsCustomer = checkoutDue > 0 && !selectedCustomer;
  const paidTooMuch = checkoutCalc.tooMuch > 0;

  // Group the rows of one product on one invoice into a single line (all its IMEIs together)
  const groupedRows = useMemo(() => {
    const out = [];
    const invoiceGroups = {};
    rows.forEach((row) => {
      if (row.type === "item" && row.parentInvoiceId && row.productId) {
        const key = `${row.parentInvoiceId}_${row.productId}`;
        if (!invoiceGroups[key]) {
          // All IMEIs of the row (imeisArray), not only the first one in row.imei
          const newRow = { ...row, imeisArray: [...itemImeis(row)], groupIds: [row.id] };
          invoiceGroups[key] = newRow;
          out.push(newRow);
        } else {
          const g = invoiceGroups[key];
          g.qty = Number(g.qty) + Number(row.qty || 1);
          g.computedAmount = (g.computedAmount || 0) + (row.computedAmount || 0);
          g.imeisArray.push(...itemImeis(row));
          g.groupIds.push(row.id);
        }
      } else {
        out.push({ ...row, groupIds: [row.id] });
      }
    });
    return out;
  }, [rows]);

  // Dates: From after To would load nothing, so the two are swapped (and the user is told)
  const [rangeNote, setRangeNote] = useState("");
  const changeFrom = (v) => {
    if (!v) return;
    if (v > dateTo) {
      setDateFrom(dateTo);
      setDateTo(v);
      setRangeNote(`"From" was after "To", so the dates were swapped: ${fmtDate(dateTo)} to ${fmtDate(v)}.`);
    } else {
      setDateFrom(v);
      setRangeNote("");
    }
  };
  const changeTo = (v) => {
    if (!v) return;
    if (v < dateFrom) {
      setDateTo(dateFrom);
      setDateFrom(v);
      setRangeNote(`"To" was before "From", so the dates were swapped: ${fmtDate(v)} to ${fmtDate(dateFrom)}.`);
    } else {
      setDateTo(v);
      setRangeNote("");
    }
  };

  // Lines of the current invoice still without a rate (checkout stays blocked)
  const noRateLines = missingRateLines(entries, currentInvoiceId);
  const noRateIds = new Set(noRateLines.map((e) => e.id));
  const noRateNames = rateLineNames(noRateLines);

  const completedUdhaar = receiptUdhaar(completedSaleInvoice);

  // ── Print ─────────────────────────────────────────────────────────────────
  // The statement is a wide table: the 80 mm receipt page cut it off, so it prints on A4
  const handlePrint = () => printElement("ledger-print-area", "Billing Ledger", { paper: "a4" });

  // Modal close handlers stay the same function between renders (Modal re-focuses itself when onClose changes)
  const closeOB = useCallback(() => {
    setEditingOB(false);
    scanRef.current?.focus();
  }, []);
  const closeManual = useCallback(() => {
    setShowManual(false);
    scanRef.current?.focus();
  }, []);
  const closeCheckout = useCallback(() => {
    setShowCheckoutModal(false);
    scanRef.current?.focus();
  }, []);

  // ── Cell styles ───────────────────────────────────────────────────────────
  // Thin ruled lines on screen; the `border` class prints as a solid grid on the A4 statement
  const cell = "border border-line px-2 py-1.5 text-xs text-ink align-middle";
  const cellR = cell + " text-right tabular-nums whitespace-nowrap";
  const cellC = cell + " text-center";

  // What a row shows, shared by the table and the phone cards
  const describeRow = (row) => {
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
    } else if (isInvoice && !row.saleId && String(row.description || "").startsWith("New bill (draft)")) {
      displayDesc = String(row.description).replace(";TPcs:", " · Pcs: ");
    }
    return { isInvoice, isPayment, isActive, locked, needsRate, displayDesc };
  };

  // Current bill on a phone: one card per line, with Qty and Rate in reach
  const renderBillCards = () => {
    if (groupedRows.length === 0) {
      return (
        <div className="px-4 py-10 text-sm text-muted">
          <ScanLine size={24} className="mb-2 text-muted" aria-hidden="true" />
          <span className="block font-semibold text-ink">No bill open</span>
          <span className="block mt-1">Scan an IMEI or barcode above to start a bill, or add a manual entry.</span>
        </div>
      );
    }
    return (
      <ul className="divide-y divide-line" aria-label="Bill lines">
        {groupedRows.map((row) => {
          const { isInvoice, isActive, locked, needsRate, displayDesc } = describeRow(row);
          if (isInvoice) {
            return (
              <li key={row.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${isActive ? "bg-brand-50" : "bg-sunken/70"}`}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-brand-800 break-words">{displayDesc}</div>
                  <div className="mt-0.5 text-xs text-muted">{fmtDate(row.date)}</div>
                  {isActive && <Badge tone="brand" className="mt-1">Current</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold tabular-nums whitespace-nowrap">Rs {fmt(row.debit)}</span>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => handleDelete(row.id)}
                      aria-label="Delete bill"
                      title="Delete"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-khata-600 hover:bg-khata-50 transition-colors"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            );
          }
          const qtyEditable = !locked && !row.imei && itemImeis(row).length === 0;
          return (
            <li key={row.id} className={`px-4 py-3 ${needsRate ? "bg-saffron-50/60" : "bg-surface"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm font-medium text-ink break-words">
                  {displayDesc}
                  {needsRate && <Badge tone="saffron" className="ml-1.5 align-middle">Rate needed</Badge>}
                </div>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => row.groupIds.forEach((id) => handleDelete(id))}
                    aria-label="Delete line"
                    title="Delete"
                    className="-mr-2 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-khata-600 hover:bg-khata-50 transition-colors"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-[4.5rem_1fr_auto] items-end gap-2">
                <label className="text-xs font-semibold text-ink-soft">
                  Qty
                  {qtyEditable ? (
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={row.qty !== undefined && row.qty !== null ? row.qty : 1}
                      onChange={(e) => handleQtyChange(row, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => row.qty === "" && handleQtyChange(row, "1")}
                      className="mt-1 block w-full h-11 rounded-lg border border-line-strong bg-surface px-1 text-center text-base font-semibold text-ink tabular-nums focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                  ) : (
                    <span className="mt-1 flex h-11 items-center justify-center text-base font-semibold text-ink tabular-nums">{row.qty || 1}</span>
                  )}
                </label>
                <label className="text-xs font-semibold text-ink-soft">
                  Rate (Rs)
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={row.rate !== undefined && row.rate !== null ? row.rate : ""}
                    onChange={(e) => handleRateChange(row, e.target.value)}
                    onFocus={(e) => !locked && e.target.select()}
                    readOnly={locked}
                    placeholder="Rate"
                    className={`mt-1 block w-full h-11 rounded-lg px-2 text-right text-base font-semibold text-ink tabular-nums focus:outline-none ${needsRate ? "bg-saffron-50 border-2 border-saffron-500 focus:border-brand-500" : "bg-surface border border-line-strong focus:border-brand-500 focus:ring-2 focus:ring-brand-100"}`}
                  />
                </label>
                <div className="pb-2.5 text-right text-sm font-bold tabular-nums whitespace-nowrap">
                  Rs {fmt(row.computedAmount)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  // Save status line
  const saveTone = loadError || saveState === "error" ? "text-khata-600" : saveState === "saving" ? "text-saffron-700" : "text-paid-600";
  const saveDot = loadError || saveState === "error" ? "bg-khata-500" : saveState === "saving" ? "bg-saffron-500" : "bg-paid-500";
  const saveText = loadError
    ? `Could not load saved ledger: ${loadError}`
    : saveState === "error"
    ? "Not saved yet — retrying every 10s. Don't close this page."
    : saveState === "saving"
    ? "Saving…"
    : "All changes saved";

  const METHOD_LABELS = { Cash: "Cash", Card: "Card", "Pending Bill": "Pending bill" };

  return (
    <>
    <div className={completedSaleInvoice ? "print:hidden" : ""}>
    <Page>
      <PageHeader
        title="Billing ledger"
        description="Scan an IMEI or barcode to add it to the current bill. Every row saves on its own."
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "bill", label: "Current bill" },
                { value: "sheet", label: "Today's sheet" },
              ]}
            />
            <Button variant="secondary" icon={FileText} onClick={handleNewInvoice}>New invoice</Button>
            <Button variant="secondary" icon={Plus} onClick={() => setShowManual(true)}>Manual entry</Button>
            <Button variant="ghost" icon={Printer} onClick={handlePrint}>Print</Button>
          </>
        }
      />

      {/* ━━ IMEI / Barcode Scanner — stays in reach while the sheet scrolls ━━ */}
      {/* Sticky only from sm up: on a phone the card would cover most of the screen */}
      <div className="sm:sticky sm:top-16 z-20 print:hidden">
        <Card className="space-y-3 shadow-pop">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-2">
              <ScanLine size={18} className="text-brand-600" aria-hidden="true" />
              <label htmlFor="ledger-scan" className="text-sm font-semibold text-ink">Scan IMEI or barcode</label>
            </div>
            {currentInvoiceId && <Badge tone="brand">Invoice open</Badge>}
            <p role="status" className={`sm:ml-auto flex items-start gap-1.5 text-xs font-semibold ${saveTone}`}>
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${saveDot}`} aria-hidden="true" />
              <span>{saveText}</span>
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1 min-w-0">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                id="ledger-scan"
                ref={scanRef}
                type="text"
                inputMode="numeric"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={handleScan}
                placeholder="Scan or paste, then press Enter"
                className="w-full h-12 pl-11 pr-4 sm:pr-44 rounded-xl border-2 border-brand-200 bg-surface font-mono text-base text-ink placeholder:font-sans placeholder:text-sm placeholder:text-muted/80 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition-colors"
                autoComplete="off"
              />
              {scanInput && (
                <span className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
                  {scanInput.length} digit{scanInput.length !== 1 ? "s" : ""} — press Enter
                </span>
              )}
            </div>
            {currentInvoiceId && (
              <Button
                size="lg"
                icon={CheckCircle2}
                onClick={handleCheckoutClick}
                disabled={noRateLines.length > 0}
                title={noRateLines.length > 0 ? "Enter a rate for every item first" : undefined}
                className="w-full sm:w-auto"
              >
                Checkout · Rs {fmt(checkoutTotal)}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">Several codes at once? Paste them separated by spaces or commas.</p>

          {/* Lines without a rate block the checkout */}
          {noRateLines.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-saffron-200 bg-saffron-50 px-3 py-2 text-xs font-semibold text-saffron-700">
              <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>Rate needed before checkout: {noRateNames.join(", ")}. Type the rate in the highlighted box.</span>
            </div>
          )}

          {/* Scan status feedback */}
          {scanStatus && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                scanStatus.type === "success"
                  ? "border-paid-200 bg-paid-50 text-paid-700"
                  : "border-khata-200 bg-khata-50 text-khata-700"
              }`}
            >
              {scanStatus.type === "success" ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
              <span>{scanStatus.message}</span>
            </div>
          )}
        </Card>
      </div>

      {/* ━━ Printable Statement (ruled khata page) ━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div id="ledger-print-area" className={`bg-surface border border-line rounded-2xl shadow-card overflow-hidden ${completedSaleInvoice ? "" : "print-target"}`}>

        {/* Letterhead and dates */}
        <div className="border-b border-line px-4 pt-4 pb-3 sm:px-5">
          <div className="text-center mb-3">
            <div className="font-display text-lg font-bold text-ink">
              {shopSettings?.shopName || "AL SAEED M/Z KOHAT"}
            </div>
            <div className="text-xs font-semibold text-muted">Kohat</div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
              <div className="min-w-0 space-y-1">
                <label htmlFor="ledger-from" className="block text-xs font-semibold text-ink-soft">
                  From <span className="font-normal text-muted">{fmtDate(dateFrom)}</span>
                </label>
                <input id="ledger-from" type="date" value={dateFrom} onChange={(e) => changeFrom(e.target.value)}
                  className={`${inputClass} sm:w-44`} />
              </div>
              <div className="min-w-0 space-y-1">
                <label htmlFor="ledger-to" className="block text-xs font-semibold text-ink-soft">
                  To <span className="font-normal text-muted">{fmtDate(dateTo)}</span>
                </label>
                <input id="ledger-to" type="date" value={dateTo} onChange={(e) => changeTo(e.target.value)}
                  className={`${inputClass} sm:w-44`} />
              </div>
            </div>
            <div className="text-xs text-muted sm:text-right">Generated {genTime}</div>
          </div>
          {rangeNote && (
            <p role="status" className="mt-2 flex items-start gap-1.5 rounded-xl border border-saffron-200 bg-saffron-50 px-3 py-2 text-xs font-semibold text-saffron-700 print:hidden">
              <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>{rangeNote}</span>
            </p>
          )}
        </div>

        {/* ── Ledger Table ── */}
        {/* Phone: the current bill as stacked cards (the wide table would hide the Rate column) */}
        {view === "bill" && <div className="sm:hidden print:hidden">{renderBillCards()}</div>}

        <div className={`overflow-x-auto custom-scrollbar ${view === "bill" ? "hidden sm:block print:block" : ""}`}>
          <table className="w-full min-w-[900px] border-collapse text-xs">
            <colgroup>
              <col style={{ width: "86px" }} />
              <col style={{ width: "230px" }} />
              <col style={{ width: "64px" }} />
              <col style={{ width: "108px" }} />
              <col style={{ width: "40px" }} />
              <col style={{ width: "44px" }} />
              <col style={{ width: "36px" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "96px" }} />
              <col style={{ width: "48px" }} />
            </colgroup>

            <thead>
              <tr className="bg-sunken">
                {["Date", "Description", "Qty", "Rate", "Dis", "Deal", "LP", "Amount", "Debit", "Credit", "Balance", ""].map((h, i) => (
                  <th
                    key={i}
                    className={`${i >= 7 && i <= 10 ? cellR : i >= 2 ? cellC : cell} py-2 font-semibold text-ink-soft bg-sunken ${i === 11 ? "print:hidden" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* Data Rows */}
              {(() => {
                return groupedRows.map((row) => {
                  const { isInvoice, isPayment, isActive, locked, needsRate, displayDesc } = describeRow(row);

                  const bg = isInvoice
                    ? isActive ? "bg-brand-50" : "bg-sunken/70"
                    : isPayment
                      ? "bg-paid-50"
                      : needsRate ? "bg-saffron-50/60" : "bg-surface hover:bg-sunken/40";

                  return (
                    <tr key={row.id} className={`${bg} transition-colors`}>
                      <td className={`${cell} whitespace-nowrap text-ink-soft`}>
                        {fmtDate(row.date)}
                      </td>
                      <td className={`${cell} break-words ${isInvoice ? "font-semibold text-brand-800" : isPayment ? "font-semibold text-paid-700" : locked ? "text-ink-soft" : ""}`}>
                        {displayDesc}
                        {isActive && isInvoice && <Badge tone="brand" className="ml-1.5 align-middle print:hidden">Current</Badge>}
                        {locked && isInvoice && (
                          <Badge tone="neutral" className="ml-1.5 align-middle print:hidden">
                            <Lock size={10} aria-hidden="true" /> Checked out
                          </Badge>
                        )}
                        {needsRate && <Badge tone="saffron" className="ml-1.5 align-middle print:hidden">Rate needed</Badge>}
                      </td>
                      <td className={`${cellC} px-1 py-1`}>
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
                            aria-label="Quantity"
                            className={`w-14 h-9 rounded-lg px-1 text-center font-semibold text-ink tabular-nums focus:outline-none transition-colors ${locked ? "bg-transparent border border-transparent cursor-default" : "bg-surface border border-line-strong focus:border-brand-500 focus:ring-2 focus:ring-brand-100"}`}
                            title={locked ? "Checked out — cannot be edited" : "Edit quantity"}
                          />
                        ) : !isInvoice && !isPayment ? (
                          row.qty || 1
                        ) : (
                          ""
                        )}
                      </td>
                      <td className={`${cellR} px-1 py-1`}>
                        {!isInvoice && !isPayment ? (
                          <input
                            type="number"
                            min="0"
                            value={row.rate !== undefined && row.rate !== null ? row.rate : ""}
                            onChange={(e) => handleRateChange(row, e.target.value)}
                            onFocus={(e) => !locked && e.target.select()}
                            onKeyDown={(e) => e.key === "Enter" && focusScan()}
                            readOnly={locked}
                            aria-label="Rate"
                            className={`w-24 h-9 rounded-lg px-2 text-right font-semibold text-ink tabular-nums focus:outline-none transition-colors ${locked ? "bg-transparent border border-transparent cursor-default" : needsRate ? "bg-saffron-50 border-2 border-saffron-500 focus:border-brand-500 focus:ring-2 focus:ring-saffron-100" : "bg-surface border border-line-strong focus:border-brand-500 focus:ring-2 focus:ring-brand-100"}`}
                            placeholder="Rate"
                            title={locked ? "Checked out — cannot be edited" : needsRate ? "Rate required — enter the selling price" : "Edit rate"}
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
                      <td className={`${cellR} font-semibold`}>
                        {row.debit ? fmt(row.debit) : ""}
                      </td>
                      <td className={`${cellR} font-semibold text-paid-700`}>
                        {row.credit ? fmt(row.credit) : ""}
                      </td>
                      <td className={`${cellR} font-bold`}>
                        {fmt(row.runningBalance)}
                      </td>
                      <td className={`${cell} px-1 py-1 text-center print:hidden`}>
                        {!locked && (isAdmin || !isPayment) ? (
                          <button
                            type="button"
                            onClick={() => row.groupIds.forEach(id => handleDelete(id))}
                            aria-label="Delete row"
                            title="Delete"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-khata-600 hover:bg-khata-50 transition-colors"
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        ) : locked ? (
                          <span className="inline-flex h-9 w-9 items-center justify-center text-muted" title="Checked out — cannot be edited">
                            <Lock size={14} aria-hidden="true" />
                            <span className="sr-only">Checked out</span>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                });
              })()}

              {/* Empty state */}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="border border-line py-10 px-4 text-sm text-muted">
                    <div className="sticky left-4 w-[min(22rem,calc(100vw-4rem))] sm:w-auto sm:static sm:text-center">
                      <ScanLine size={24} className="sm:mx-auto mb-2 text-muted" aria-hidden="true" />
                      <span className="block font-semibold text-ink">{view === "bill" ? "No bill open" : "Nothing on this sheet yet"}</span>
                      <span className="block mt-1">Scan an IMEI or barcode above to start a bill, or add a manual entry.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>

            <tfoot>
              <tr className="bg-sunken">
                <td className={`${cell} font-semibold text-center text-ink-soft`} colSpan={7}>
                  <span className="mr-6">
                    Total Dr = <span className="text-ink tabular-nums">{fmt(totalDebit, 2)}</span>
                  </span>
                  <span>
                    Total Cr = <span className="text-paid-700 tabular-nums">{fmt(totalCredit, 2)}</span>
                  </span>
                </td>
                <td className={cellR}></td>
                <td className={`${cellR} font-bold`}>{fmt(totalDebit, 2)}</td>
                <td className={`${cellR} font-bold text-paid-700`}>{fmt(totalCredit, 2)}</td>
                <td className={`${cellR} font-bold text-[12px]`}>
                  Balance = {fmt(finalBalance, 2)}
                </td>
                <td className={`${cell} print:hidden`}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {view === "bill" ? (
        <div className="grid gap-3 sm:grid-cols-2 print:hidden">
          <Stat label="This bill" value={`Rs ${fmt(currentInvoiceId ? checkoutTotal : 0, 2)}`} tone="brand" hint={currentInvoiceId ? "Draft — not checked out yet" : "Scan to start a bill"} />
          <Stat label="Today's sheet" value="Finished bills, returns, payments" hint="Switch to Today's sheet above to see the whole day" onClick={() => setView("sheet")} />
        </div>
      ) : (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Opening balance</span>
            {isAdmin && (
              <IconButton
                icon={Pencil}
                label="Edit opening balance"
                className="-my-2 -mr-2"
                onClick={() => { setObInput(String(openingBalance)); setEditingOB(true); }}
              />
            )}
          </div>
          <div className="mt-1.5 font-display text-2xl font-bold leading-tight text-ink break-words">Rs {fmt(openingBalance, 2)}</div>
        </div>
        <Stat label="Total debit (Dr)" value={`Rs ${fmt(totalDebit, 2)}`} />
        <Stat label="Total credit (Cr)" value={`Rs ${fmt(totalCredit, 2)}`} tone="paid" />
        <Stat label="Closing balance" value={`Rs ${fmt(finalBalance, 2)}`} tone="brand" />
      </div>
      )}

      {/* ━━ Edit Opening Balance Modal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Modal
        open={editingOB && isAdmin}
        onClose={closeOB}
        title="Edit opening balance"
        description={`Opening balance for ${fmtDate(dateFrom)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeOB}>Cancel</Button>
            <Button onClick={saveOB} loading={savingOB}>{savingOB ? "Saving…" : "Save"}</Button>
          </>
        }
      >
        <Field label="Amount (Rs)" htmlFor="ledger-ob">
          <Input id="ledger-ob" type="number" value={obInput} onChange={(e) => setObInput(e.target.value)}
            className="h-12 text-lg font-semibold tabular-nums" placeholder="0" />
        </Field>
      </Modal>

      {/* ━━ Manual Entry Modal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Modal
        open={showManual}
        onClose={closeManual}
        title="Manual entry"
        description="Add a line by hand when there is nothing to scan."
        footer={
          <>
            <Button variant="secondary" onClick={closeManual}>Cancel</Button>
            <Button icon={Plus} onClick={handleManualAdd} disabled={!manualForm.description}>Add entry</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Entry type" hint={manualForm.type === "item" ? "Adds a line to the current invoice." : "Records a payment received (credit) or a debit."}>
            <Segmented
              options={[
                { value: "item", label: "Item on bill" },
                { value: "payment", label: "Payment" },
              ]}
              value={manualForm.type}
              onChange={(v) => setManualForm({ ...manualForm, type: v })}
            />
          </Field>

          <Field label="Date" htmlFor="manual-date">
            <Input id="manual-date" type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} />
          </Field>

          <Field label={<>Description <span className="text-khata-600">*</span></>} htmlFor="manual-desc">
            <Input id="manual-desc" type="text" value={manualForm.description} onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
              placeholder={manualForm.type === "item" ? "Product name" : "Payment description"} />
          </Field>

          {manualForm.type === "item" && (
            <>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <Field label="Qty" htmlFor="manual-qty">
                  <Input id="manual-qty" type="number" value={manualForm.qty} onChange={(e) => setManualForm({ ...manualForm, qty: e.target.value })} placeholder="1" />
                </Field>
                <Field label="Rate (Rs) *" htmlFor="manual-rate">
                  <Input
                    id="manual-rate"
                    type="number"
                    min="0"
                    value={manualForm.rate}
                    onChange={(e) => setManualForm({ ...manualForm, rate: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    className="border-2 border-saffron-400 font-semibold"
                    placeholder="Rate"
                  />
                </Field>
                <Field label="Dis %" htmlFor="manual-dis">
                  <Input id="manual-dis" type="number" value={manualForm.dis} onChange={(e) => setManualForm({ ...manualForm, dis: e.target.value })} placeholder="0" />
                </Field>
              </div>
              {manualForm.qty && manualForm.rate && (
                <div className="flex justify-between gap-3 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-700">
                  <span>Amount (qty × rate)</span>
                  <span className="tabular-nums">Rs {fmt(Number(manualForm.qty) * Number(manualForm.rate))}</span>
                </div>
              )}
            </>
          )}

          {manualForm.type === "payment" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Debit (Dr)" htmlFor="manual-debit">
                <Input id="manual-debit" type="number" value={manualForm.debit} onChange={(e) => setManualForm({ ...manualForm, debit: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Credit (Cr)" htmlFor="manual-credit">
                <Input id="manual-credit" type="number" value={manualForm.credit} onChange={(e) => setManualForm({ ...manualForm, credit: e.target.value })} placeholder="0" />
              </Field>
            </div>
          )}
        </div>
      </Modal>

      {/* ━━ Checkout Modal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Modal
        open={showCheckoutModal}
        onClose={closeCheckout}
        title="Checkout"
        description={`Bill total Rs ${fmt(checkoutTotal)}`}
        size="lg"
        closeOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={closeCheckout} className="w-full sm:w-auto">Cancel</Button>
            <Button
              size="lg"
              icon={CheckCircle2}
              onClick={finalizeCheckout}
              disabled={isSubmitting || needsCustomer || paidTooMuch || noRateLines.length > 0}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? "Saving…" : "Confirm and save bill"}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Payment Method Selection */}
          <div>
            <p className="text-xs font-semibold text-ink-soft mb-2">Payment method</p>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {["Cash", "Card", "Pending Bill"].map(method => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={paymentMethod === method}
                  onClick={() => setPaymentMethod(method)}
                  className={`min-h-[64px] rounded-xl border-2 px-2 py-2.5 text-sm font-semibold flex flex-col items-center justify-center gap-1.5 transition-colors ${
                    paymentMethod === method
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-line bg-surface text-ink-soft hover:border-brand-300"
                  }`}
                >
                  {method === "Cash" && <Banknote size={20} aria-hidden="true" />}
                  {method === "Card" && <CreditCard size={20} aria-hidden="true" />}
                  {method === "Pending Bill" && <BookOpen size={20} aria-hidden="true" />}
                  {METHOD_LABELS[method]}
                </button>
              ))}
            </div>
          </div>

          {/* Seller Selection */}
          <div>
            <p className="text-xs font-semibold text-ink-soft mb-2">Seller</p>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {SELLERS.map((sellerName) => {
                const isSelected = selectedSeller === sellerName;
                return (
                  <button
                    key={sellerName}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedSeller(sellerName)}
                    className={`h-12 px-3 rounded-xl border-2 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                      isSelected
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-line bg-surface text-ink-soft hover:border-brand-300"
                    }`}
                  >
                    <User size={16} aria-hidden="true" />
                    <span className="truncate">{sellerName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer Selection (To whom you want to sell) */}
          <div>
            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-ink-soft">
                Customer {(paymentMethod === "Pending Bill" || checkoutDue > 0) && <span className="text-khata-600">*</span>}
              </p>
              <Button
                variant="soft"
                icon={showQuickAddCustomer ? X : Plus}
                onClick={() => setShowQuickAddCustomer(!showQuickAddCustomer)}
              >
                {showQuickAddCustomer ? "Cancel" : "New customer"}
              </Button>
            </div>

            {showQuickAddCustomer ? (
              <div className="bg-sunken border border-line rounded-xl p-3 sm:p-4 space-y-3">
                <Input
                  type="text"
                  placeholder="Customer name *"
                  aria-label="Customer name"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                />
                <Input
                  type="text"
                  placeholder="Phone number (optional)"
                  aria-label="Phone number"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                />
                <Button onClick={handleQuickAddCustomer} loading={isSavingCustomer} className="w-full">
                  {isSavingCustomer ? "Saving…" : "Save and select"}
                </Button>
              </div>
            ) : (
              <div className="relative" ref={customerDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowCustomerDropdown(true)}
                  className="w-full h-12 rounded-xl border border-line-strong bg-surface px-3.5 text-left text-sm font-medium text-ink flex justify-between items-center gap-2 hover:border-brand-300 transition-colors"
                >
                  <span className="truncate">
                    {selectedCustomer
                      ? (() => {
                          const c = allCustomers.find(c => c.id === selectedCustomer);
                          return c ? `${c.name} (${c.phone || 'No Phone'})` : "Unknown";
                        })()
                      : "Walk-in customer"
                    }
                  </span>
                  <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden="true" />
                </button>

                {showCustomerDropdown && (
                  <div className="mt-2 bg-surface border border-line rounded-xl shadow-pop overflow-hidden">
                    <div className="p-2.5 border-b border-line bg-sunken">
                      <Input
                        type="text"
                        autoFocus
                        placeholder="Search by name or phone"
                        aria-label="Search customers"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar">
                      <button
                        type="button"
                        onClick={() => { setSelectedCustomer(""); setShowCustomerDropdown(false); }}
                        className="w-full text-left px-4 py-3 text-sm text-muted hover:bg-sunken"
                      >
                        Walk-in customer
                      </button>
                      {allCustomers.filter(c => (c.name || "").toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone && c.phone.includes(customerSearch))).map(c => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => { setSelectedCustomer(c.id); setShowCustomerDropdown(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-brand-50 border-t border-line ${selectedCustomer === c.id ? "bg-brand-50" : ""}`}
                        >
                          <div className="font-semibold">{c.name}</div>
                          {c.phone && <div className="text-xs text-muted mt-0.5">{c.phone}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {needsCustomer && (
              <p className="text-khata-600 text-xs font-semibold mt-2 flex items-center gap-1">
                <AlertCircle size={12} aria-hidden="true" /> Pick a registered customer to record the Udhaar.
              </p>
            )}
          </div>

          {/* Paid now — Cash/Card default to the full total, Pending Bill to 0 */}
          <Field
            label={paymentMethod === "Pending Bill" ? "Amount paid now (optional)" : "Amount received"}
            htmlFor="checkout-paid"
          >
            <Input
              id="checkout-paid"
              type="number"
              min="0"
              value={paidAmountInput}
              onChange={(e) => setPaidAmountInput(e.target.value)}
              className="h-12 text-lg font-semibold tabular-nums"
              placeholder={paymentMethod === "Pending Bill" ? "0" : `Full amount: Rs ${fmt(checkoutTotal)}`}
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold pt-0.5">
              <span className="text-muted">Bill total: Rs {fmt(checkoutTotal)}</span>
              {checkoutDue > 0 && <span className="text-khata-600">Udhaar: Rs {fmt(checkoutDue)}</span>}
            </div>
            {checkoutCalc.change > 0 && (
              <div role="status" className="mt-1 flex justify-between gap-3 rounded-xl bg-paid-50 px-3 py-2.5 text-sm font-bold text-paid-700">
                <span>Change to give back</span>
                <span className="tabular-nums">Rs {fmt(checkoutCalc.change)}</span>
              </div>
            )}
            {checkoutCalc.toOldUdhaar > 0 && !paidTooMuch && (
              <p role="status" className="mt-1 rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
                Rs {fmt(checkoutCalc.toOldUdhaar)} above this bill goes to the customer's old Udhaar
                (old Udhaar Rs {fmt(checkoutCalc.oldUdhaar)}, left after this: Rs {fmt(checkoutCalc.oldUdhaar - checkoutCalc.toOldUdhaar)}).
              </p>
            )}
            {paidTooMuch && (
              <p role="alert" className="mt-1 flex items-start gap-1.5 rounded-xl border border-khata-200 bg-khata-50 px-3 py-2 text-xs font-semibold text-khata-700">
                <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Too much: the most this customer can pay now is Rs {fmt(checkoutCalc.maxPaid)} (this bill
                  {checkoutCalc.oldUdhaar > 0 ? ` + old Udhaar Rs ${fmt(checkoutCalc.oldUdhaar)}` : ", no old Udhaar"}).
                </span>
              </p>
            )}
          </Field>

          {paymentMethod === "Pending Bill" && (
            <Field label="Due date (optional)" htmlFor="checkout-due">
              <Input id="checkout-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          )}

          {noRateLines.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-saffron-200 bg-saffron-50 px-3 py-2 text-xs font-semibold text-saffron-700">
              <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>Rate needed for: {noRateNames.join(", ")}. Close this window and type the rate in the highlighted box.</span>
            </div>
          )}
        </div>
      </Modal>

    </Page>
    </div>

      {/* ━━ Invoice Print Modal (Micro POS Thermal Receipt Slip) ━━━━━━━━━ */}
      {completedSaleInvoice && (
        <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-ink/40 backdrop-blur-[2px] sm:p-4 print:static print:p-0 print:block print:bg-transparent">
          <div className="bg-surface w-full sm:max-w-[26rem] h-full sm:h-auto sm:max-h-[95vh] sm:rounded-2xl shadow-pop flex flex-col print:block print:h-auto print:max-h-none print:shadow-none print:w-full print:max-w-none print:rounded-none">
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-line print:hidden">
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-snug">Bill saved</h2>
                <p className="text-xs text-muted mt-0.5">Print the receipt or share it on WhatsApp.</p>
              </div>
              <IconButton icon={X} label="Close" size="sm" onClick={closeReceipt} />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-sunken p-4 print:p-0 print:bg-transparent print:overflow-visible">
              <div className="mx-auto w-full max-w-sm rounded-xl border border-line bg-white shadow-card overflow-hidden print:border-0 print:shadow-none print:max-w-none print:rounded-none">
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
                  <div>Payment: {completedSaleInvoice.paymentMethod || "Cash"}</div>
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
                    {completedSaleInvoice.dueDate && (
                      <div className="flex justify-between text-sm mt-1"><span>Due date</span><span>{fmtDate(completedSaleInvoice.dueDate)}</span></div>
                    )}
                  </div>
                )}

                {completedSaleInvoice.dueAmount <= 0 && (oldUdhaarPaid(completedSaleInvoice) > 0 || Number(completedSaleInvoice.changeGiven || 0) > 0) && (
                  <div className="flex justify-between text-sm mt-2 pt-2 border-t border-dashed border-black">
                    <span>Paid</span>
                    <span>Rs. {(Number(completedSaleInvoice.paidAmount || 0) + Number(completedSaleInvoice.changeGiven || 0)).toLocaleString()}</span>
                  </div>
                )}
                {oldUdhaarPaid(completedSaleInvoice) > 0 && (
                  <div className="text-sm font-semibold">Rs. {fmt(oldUdhaarPaid(completedSaleInvoice))} went to old Udhaar</div>
                )}
                {Number(completedSaleInvoice.changeGiven || 0) > 0 && (
                  <div className="flex justify-between text-sm font-bold"><span>Change given</span><span>Rs. {fmt(completedSaleInvoice.changeGiven)}</span></div>
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
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2 p-4 border-t border-line bg-surface sm:rounded-b-2xl print:hidden">
              <Button icon={Printer} onClick={handlePrintReceipt}>Print</Button>
              <Button variant="success" icon={Smartphone} onClick={handleWhatsAppShareModal}>Share</Button>
              <Button variant="secondary" icon={CheckCircle2} onClick={closeReceipt}>Done</Button>
            </div>
          </div>
        </div>
      )}

      {shareDialog}
    </>
  );
};

export default Ledger;
