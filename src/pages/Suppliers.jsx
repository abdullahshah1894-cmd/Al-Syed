import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, getProductStock } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { localDate } from "../utils/dates";
import {
  Truck,
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  Phone,
  Building2,
  MapPin,
  CheckCircle2,
  PackagePlus,
  Banknote,
  Wallet,
  ShoppingBag,
  Users,
  FileText,
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
  Textarea,
  Segmented,
  TableWrap,
  Th,
  Td,
  EmptyState,
  Modal,
} from "../components/ui";

// Same category names Inventory uses
const CATEGORIES = ["Smartphones", "Tablets & iPads", "Accessories", "Spare Parts", "Wearables"];
// Categories whose units are tracked by IMEI (Smartphones must have at least one)
const IMEI_CATEGORIES = ["Smartphones", "Tablets & iPads", "Wearables"];
const WARRANTY_TYPES = ["Official Brand Warranty", "Shop Warranty", "No Warranty"];

const today = () => localDate();
const num = (v) => Number(v) || 0;

// Products whose stock is counted from IMEI units rather than a plain quantity
const isImeiProduct = (p) => (p.imeis && p.imeis.length > 0) || p.category === "Smartphones";

const emptySupplierForm = { name: "", phone: "", company: "", address: "", notes: "", openingBalance: "" };

let lineSeq = 0;
const newLine = () => ({
  key: ++lineSeq,
  mode: "existing", // "existing" product or "new" product
  productId: "",
  productQuery: "",
  name: "",
  brand: "",
  model: "",
  category: "Smartphones",
  imeiText: "",
  ptaStatus: "Approved",
  quantity: "1",
  costPrice: "",
  salePrice: "",
  warrantyDuration: "12",
  warrantyType: "Official Brand Warranty",
});

// Parse the IMEI textarea: one phone per line, "imei1" or "imei1,imei2"
const parseImeiText = (text) =>
  (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/[\s,;/]+/).filter(Boolean);
      return { first: parts[0] || "", second: parts[1] || "", extra: parts.length > 2, raw: l };
    });

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(String(d).length === 10 ? `${d}T00:00:00` : d);
  return isNaN(dt.getTime())
    ? String(d)
    : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

// Units in a saved purchase item
const txItemUnits = (it) => (Array.isArray(it.imeis) && it.imeis.length > 0 ? it.imeis.length : num(it.quantity));

const itemsSummary = (tx) =>
  (tx.items || [])
    .map((it) => `${[it.brand, it.name].filter(Boolean).join(" ") || "Item"} x${txItemUnits(it)}`)
    .join(", ");


// Red error note shown above a form's buttons
const ErrorNote = ({ children }) =>
  children ? (
    <div role="alert" className="bg-khata-50 border border-khata-200 text-khata-700 text-sm px-3 py-2.5 rounded-xl">
      {children}
    </div>
  ) : null;

// Searchable product picker for a purchase line
const ProductPicker = ({ products, line, onPick, onQuery }) => {
  const q = line.productQuery.trim().toLowerCase();
  const selected = products.find((p) => p.id === line.productId);
  const matches = useMemo(() => {
    if (!q) return products.slice(0, 8);
    return products
      .filter((p) =>
        [p.name, p.brand, p.model, p.category].some((v) => (v || "").toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [products, q]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 bg-brand-50 border border-brand-100 rounded-xl pl-3 pr-1 py-1">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink truncate">{selected.name}</div>
          <div className="text-xs text-ink-soft">
            {selected.brand} · {selected.category} · Stock {getProductStock(selected)}
            {isImeiProduct(selected) ? " · IMEI tracked" : ""}
          </div>
        </div>
        <Button variant="secondary" onClick={() => onPick(null)} className="shrink-0">
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <Input
          type="text"
          aria-label="Search product"
          value={line.productQuery}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search product by name, brand, model…"
          className="pl-9"
        />
      </div>
      <div className="max-h-48 overflow-y-auto custom-scrollbar bg-surface border border-line rounded-xl divide-y divide-line">
        {matches.length === 0 ? (
          <div className="p-3 text-sm text-muted text-center">No product found. Switch to "New product" instead.</div>
        ) : (
          matches.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => onPick(p)}
              className="w-full min-h-10 text-left px-3 py-2 hover:bg-sunken flex items-center justify-between gap-2"
            >
              <span className="text-sm text-ink truncate">
                {p.name} <span className="text-muted">· {p.brand}</span>
              </span>
              <span className="text-xs text-muted shrink-0">Stock {getProductStock(p)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

const Suppliers = () => {
  const {
    suppliers,
    supplierTransactions,
    products,
    shopSettings,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    addSupplierPurchase,
    addSupplierPayment,
    updateSupplierTransaction,
    deleteSupplierTransaction,
  } = useApp();
  const { isAdmin } = useAuth();
  const curr = shopSettings.currencySymbol || "Rs.";
  const money = (v) => `${curr} ${num(v).toLocaleString()}`;
  const [searchParams, setSearchParams] = useSearchParams();

  // Search starts from ?search= and an account opens from ?open=<supplierId> (IMEI checker link)
  const urlSearch = searchParams.get("search") || "";
  const urlOpen = searchParams.get("open") || "";
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [lastUrlSearch, setLastUrlSearch] = useState(urlSearch);
  if (urlSearch !== lastUrlSearch) {
    setLastUrlSearch(urlSearch);
    setSearchTerm(urlSearch);
  }
  const [viewId, setViewId] = useState(urlOpen || null);
  const [lastUrlOpen, setLastUrlOpen] = useState(urlOpen);
  if (urlOpen !== lastUrlOpen) {
    setLastUrlOpen(urlOpen);
    if (urlOpen) setViewId(urlOpen);
  }

  // Add / Edit supplier
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [supplierError, setSupplierError] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);

  // New purchase
  const [showPurchase, setShowPurchase] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ date: today(), invoiceNumber: "", notes: "", paid: "", total: "", addToStock: true });
  const [lines, setLines] = useState([]);
  const [purchaseError, setPurchaseError] = useState("");
  const [savingPurchase, setSavingPurchase] = useState(false);

  // Pay supplier
  const [showPayment, setShowPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", date: today(), reference: "", notes: "" });
  const [paymentError, setPaymentError] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  // Edit statement entry
  const [editingTx, setEditingTx] = useState(null);
  const [txForm, setTxForm] = useState({ date: "", invoiceNumber: "", notes: "", paid: "", total: "" });
  const [txError, setTxError] = useState("");
  const [savingTx, setSavingTx] = useState(false);

  const liveProducts = useMemo(() => (products || []).filter((p) => !p.isDeleted), [products]);
  const viewSupplier = viewId ? (suppliers || []).find((s) => s.id === viewId) || null : null;

  // ── Stats ────────────────────────────────────────────────────────────────
  const totalOwed = (suppliers || []).reduce((s, x) => s + Math.max(0, x.balance), 0);
  const totalPurchased = (suppliers || []).reduce((s, x) => s + x.totalPurchased, 0);
  const totalPaid = (suppliers || []).reduce((s, x) => s + x.totalPaid, 0);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = (suppliers || []).filter(
      (s) =>
        !q ||
        [s.name, s.company, s.phone, s.address].some((v) => (v || "").toLowerCase().includes(q))
    );
    // Biggest balance first, then by name
    return [...list].sort((a, b) => b.balance - a.balance || (a.name || "").localeCompare(b.name || ""));
  }, [suppliers, searchTerm]);

  // ── Supplier add / edit / delete ─────────────────────────────────────────
  const openAddSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm(emptySupplierForm);
    setSupplierError("");
    setShowSupplierForm(true);
  };

  const openEditSupplier = (s) => {
    setEditingSupplier(s);
    setSupplierForm({
      name: s.name || "",
      phone: s.phone || "",
      company: s.company || "",
      address: s.address || "",
      notes: s.notes || "",
      openingBalance: s.openingBalance ? String(s.openingBalance) : "",
    });
    setSupplierError("");
    setShowSupplierForm(true);
  };

  // Modal close handlers are stable, so an open modal does not take focus back from its inputs on every keystroke
  const closeSupplierForm = useCallback(() => {
    setShowSupplierForm(false);
    setEditingSupplier(null);
    setSupplierError("");
  }, []);

  const handleSupplierSubmit = async (e) => {
    e.preventDefault();
    if (savingSupplier) return;
    const name = supplierForm.name.trim();
    if (!name) { setSupplierError("Supplier name is required."); return; }
    const opening = num(supplierForm.openingBalance);
    if (opening < 0) { setSupplierError("Opening balance cannot be negative."); return; }
    const duplicate = (suppliers || []).find(
      (s) => s.id !== editingSupplier?.id && (s.name || "").trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate && !window.confirm(`A supplier named "${duplicate.name}" already exists. Save anyway?`)) return;

    const data = {
      name,
      phone: supplierForm.phone.trim(),
      company: supplierForm.company.trim(),
      address: supplierForm.address.trim(),
      notes: supplierForm.notes.trim(),
      openingBalance: opening,
    };
    setSavingSupplier(true);
    try {
      const ok = editingSupplier ? await updateSupplier(editingSupplier.id, data) : await addSupplier(data);
      // Keep the form filled if the database did not save it
      if (!ok) return;
      closeSupplierForm();
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = async (s) => {
    const owed = s.balance > 0 ? `\n\nYou still owe ${money(s.balance)} to this supplier.` : "";
    if (!window.confirm(`Delete supplier "${s.name}"?${owed}\n\nTheir history is kept, but they will no longer be listed.`)) return;
    const ok = await deleteSupplier(s.id);
    if (ok && viewId === s.id) closeAccount();
  };

  // ── Account view ─────────────────────────────────────────────────────────
  const closeAccount = useCallback(() => {
    setViewId(null);
    if (searchParams.get("open")) {
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Statement: opening balance, then every entry oldest first with a running balance owed
  const statement = useMemo(() => {
    if (!viewSupplier) return [];
    const txs = (supplierTransactions || [])
      .filter((t) => t.supplierId === viewSupplier.id)
      .sort(
        (a, b) =>
          (a.date || "").localeCompare(b.date || "") ||
          new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
      );
    let bal = viewSupplier.openingBalance;
    return txs.map((t) => {
      const amount = t.type === "purchase" ? t.total : 0;
      bal += amount - t.paid;
      return { ...t, amount, running: bal };
    });
  }, [viewSupplier, supplierTransactions]);

  // ── Statement entry edit / delete ────────────────────────────────────────
  const openEditTx = (t) => {
    setEditingTx(t);
    setTxForm({
      date: t.date || today(),
      invoiceNumber: t.invoiceNumber || "",
      notes: t.notes || "",
      paid: String(t.paid || 0),
      total: String(t.total || 0),
    });
    setTxError("");
  };

  const handleTxSubmit = async (e) => {
    e.preventDefault();
    if (savingTx || !editingTx) return;
    const paid = num(txForm.paid);
    if (paid < 0) { setTxError("Amount paid cannot be negative."); return; }
    if (editingTx.type === "payment" && paid <= 0) { setTxError("Payment amount must be greater than zero."); return; }
    const data = {
      date: txForm.date || today(),
      invoiceNumber: txForm.invoiceNumber.trim(),
      notes: txForm.notes.trim(),
      paid,
    };
    if (editingTx.type === "purchase" && !editingTx.stockAdded) {
      const total = num(txForm.total);
      if (total < 0) { setTxError("Total cannot be negative."); return; }
      data.total = total;
    }
    setSavingTx(true);
    try {
      const ok = await updateSupplierTransaction(editingTx.id, data);
      if (!ok) return;
      setEditingTx(null);
    } finally {
      setSavingTx(false);
    }
  };

  const handleDeleteTx = async (t) => {
    const what = t.type === "purchase"
      ? `purchase${t.invoiceNumber ? ` (invoice ${t.invoiceNumber})` : ""} of ${money(t.total)}`
      : `payment of ${money(t.paid)}`;
    const stockNote = t.stockAdded
      ? "\n\nItems this purchase added to inventory will STAY in stock. Adjust them in Inventory if needed."
      : "";
    if (!window.confirm(`Delete this ${what} from ${viewSupplier?.name || "the supplier"}'s account?${stockNote}`)) return;
    await deleteSupplierTransaction(t.id);
  };

  // ── New purchase ─────────────────────────────────────────────────────────
  const openPurchase = () => {
    setPurchaseForm({ date: today(), invoiceNumber: "", notes: "", paid: "", total: "", addToStock: true });
    setLines([newLine()]);
    setPurchaseError("");
    setShowPurchase(true);
  };

  const setLine = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));

  const pickProduct = (key, p) => {
    if (!p) { setLine(key, { productId: "", productQuery: "" }); return; }
    setLine(key, {
      productId: p.id,
      productQuery: "",
      costPrice: p.purchasePrice ? String(p.purchasePrice) : "",
      salePrice: p.salePrice ? String(p.salePrice) : "",
    });
  };

  // How a line's units are entered: "required" IMEIs, "optional" (IMEIs or quantity) or "none" (quantity)
  const lineImeiMode = (l) => {
    if (l.mode === "existing") {
      const p = liveProducts.find((x) => x.id === l.productId);
      if (!p) return "none";
      return isImeiProduct(p) ? "required" : "none";
    }
    if (l.category === "Smartphones") return "required";
    return IMEI_CATEGORIES.includes(l.category) ? "optional" : "none";
  };

  const lineUnits = (l) => {
    const imeiMode = lineImeiMode(l);
    const imeiCount = imeiMode === "none" ? 0 : parseImeiText(l.imeiText).length;
    if (imeiCount > 0) return imeiCount;
    return imeiMode === "required" ? 0 : Math.max(0, Math.floor(num(l.quantity)));
  };

  const lineTotal = (l) => lineUnits(l) * num(l.costPrice);
  const hasItems = lines.length > 0;
  const invoiceTotal = hasItems ? lines.reduce((s, l) => s + lineTotal(l), 0) : num(purchaseForm.total);
  const paidNow = num(purchaseForm.paid);
  const toPay = invoiceTotal - paidNow;

  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    if (savingPurchase || !viewSupplier) return;
    setPurchaseError("");
    if (paidNow < 0) { setPurchaseError("Paid now cannot be negative."); return; }

    let items = [];
    if (hasItems) {
      // IMEIs already in stock anywhere, and IMEIs typed twice in this purchase
      const inStock = new Set();
      liveProducts.forEach((p) =>
        (p.imeis || []).forEach((u) => {
          if (u.status === "in_stock") [u.imei, u.imei1, u.imei2].filter(Boolean).forEach((k) => inStock.add(k));
        })
      );
      const seen = new Set();

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const n = `Line ${i + 1}`;
        const product = l.mode === "existing" ? liveProducts.find((x) => x.id === l.productId) : null;
        if (l.mode === "existing" && !product) { setPurchaseError(`${n}: pick a product, or switch to "New product".`); return; }
        if (l.mode === "new" && !l.name.trim()) { setPurchaseError(`${n}: enter the product name.`); return; }
        if (l.mode === "new" && !l.brand.trim()) { setPurchaseError(`${n}: enter the brand.`); return; }
        if (num(l.costPrice) <= 0) { setPurchaseError(`${n}: cost price must be greater than zero.`); return; }
        if (num(l.salePrice) < 0) { setPurchaseError(`${n}: sale price cannot be negative.`); return; }
        // A new product without a sale price would sell for Rs 0 at the POS
        if (l.mode === "new" && num(l.salePrice) <= 0) { setPurchaseError(`${n}: enter the sale price for the new product.`); return; }

        const imeiMode = lineImeiMode(l);
        const parsed = imeiMode === "none" ? [] : parseImeiText(l.imeiText);
        const units = [];
        for (const r of parsed) {
          if (r.extra || !/^\d{15}$/.test(r.first) || (r.second && !/^\d{15}$/.test(r.second))) {
            setPurchaseError(`${n}: "${r.raw}" is not valid. Use one phone per line: 15-digit IMEI 1, optionally ",IMEI 2".`);
            return;
          }
          for (const k of [r.first, r.second].filter(Boolean)) {
            if (seen.has(k)) { setPurchaseError(`${n}: IMEI ${k} is typed more than once.`); return; }
            if (inStock.has(k)) { setPurchaseError(`${n}: IMEI ${k} is already in stock.`); return; }
            seen.add(k);
          }
          units.push(
            r.second
              ? { imei: r.first, imei1: r.first, imei2: r.second, ptaStatus: l.ptaStatus }
              : { imei: r.first, ptaStatus: l.ptaStatus }
          );
        }
        const qty = Math.floor(num(l.quantity));
        if (imeiMode === "required" && units.length === 0) { setPurchaseError(`${n}: enter at least one IMEI.`); return; }
        if (units.length === 0 && qty < 1) { setPurchaseError(`${n}: enter IMEIs or a quantity of at least 1.`); return; }

        const base = product
          ? { productId: product.id, name: product.name, brand: product.brand, model: product.model || "", category: product.category }
          : {
              name: l.name.trim(),
              brand: l.brand.trim(),
              model: l.model.trim(),
              category: l.category,
              warrantyDuration: l.warrantyType === "No Warranty" ? 0 : Math.max(0, Math.floor(num(l.warrantyDuration))),
              warrantyType: l.warrantyType,
            };
        items.push({
          ...base,
          ...(units.length > 0 ? { imeis: units } : { quantity: qty }),
          costPrice: num(l.costPrice),
          // Left blank: an existing product keeps its sale price
          ...(String(l.salePrice).trim() !== "" ? { salePrice: num(l.salePrice) } : {}),
        });
      }
    } else if (invoiceTotal <= 0) {
      setPurchaseError("Add at least one item, or type the bill total for a purchase without items.");
      return;
    }

    if (paidNow > invoiceTotal &&
      !window.confirm(`Paid now (${money(paidNow)}) is more than the invoice total (${money(invoiceTotal)}). The extra will count as an advance. Continue?`)) return;

    setSavingPurchase(true);
    try {
      const tx = await addSupplierPurchase(viewSupplier.id, {
        date: purchaseForm.date || today(),
        invoiceNumber: purchaseForm.invoiceNumber.trim(),
        notes: purchaseForm.notes.trim(),
        paid: paidNow,
        total: hasItems ? invoiceTotal : num(purchaseForm.total),
        addToStock: hasItems ? purchaseForm.addToStock : false,
        items,
      });
      // Keep the form filled if the database did not save it
      if (!tx) return;
      setShowPurchase(false);
      setLines([]);
    } finally {
      setSavingPurchase(false);
    }
  };

  // ── Pay supplier ─────────────────────────────────────────────────────────
  const openPayment = () => {
    setPaymentForm({
      amount: viewSupplier && viewSupplier.balance > 0 ? String(viewSupplier.balance) : "",
      date: today(),
      reference: "",
      notes: "",
    });
    setPaymentError("");
    setShowPayment(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (savingPayment || !viewSupplier) return;
    const amount = num(paymentForm.amount);
    if (amount <= 0) { setPaymentError("Amount must be greater than zero."); return; }
    if (amount > viewSupplier.balance &&
      !window.confirm(`This is more than you owe (${money(Math.max(0, viewSupplier.balance))}). The extra will count as an advance. Continue?`)) return;
    setSavingPayment(true);
    try {
      const tx = await addSupplierPayment(viewSupplier.id, {
        amount,
        date: paymentForm.date || today(),
        reference: paymentForm.reference.trim(),
        notes: paymentForm.notes.trim(),
      });
      if (!tx) return;
      setShowPayment(false);
    } finally {
      setSavingPayment(false);
    }
  };


  const balanceCls = (b) => (b > 0 ? "text-khata-600" : b < 0 ? "text-paid-600" : "text-ink-soft");
  const balanceLabel = (b) => (b < 0 ? `${money(-b)} advance` : money(b));

  const closePurchase = useCallback(() => setShowPurchase(false), []);
  const closePayment = useCallback(() => setShowPayment(false), []);
  const closeTx = useCallback(() => setEditingTx(null), []);
  // Esc / backdrop on a form opened from the account closes that form only, not the account under it
  const subFormOpen = showSupplierForm || showPurchase || showPayment || !!editingTx;
  const closeAccountView = useCallback(() => {
    if (subFormOpen) return;
    closeAccount();
  }, [subFormOpen, closeAccount]);

  // Supplier accounts are the owner's only (the route is admin-only too; the server refuses cashiers)
  if (!isAdmin) {
    return (
      <Page>
        <Card>
          <EmptyState icon={Truck} title="Suppliers are managed by the owner only" description="Ask the owner to log in to see supplier accounts." />
        </Card>
      </Page>
    );
  }

  const rowActions = (s) => (
    <div className="flex gap-1 justify-end">
      <IconButton icon={Eye} label="Open account" onClick={() => setViewId(s.id)} />
      <IconButton icon={Edit3} label="Edit supplier" onClick={() => openEditSupplier(s)} />
      <IconButton icon={Trash2} label="Delete supplier" variant="danger-soft" onClick={() => handleDeleteSupplier(s)} />
    </div>
  );

  return (
    <Page>
      <PageHeader
        title="Suppliers"
        description="Purchases, payments and what the shop still owes each supplier. A purchase can add its stock straight into inventory."
        actions={<Button icon={Plus} onClick={openAddSupplier}>Add supplier</Button>}
      />

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Suppliers" icon={Users} value={(suppliers || []).length.toLocaleString()} />
        <Stat label="You owe suppliers" icon={Wallet} tone={totalOwed > 0 ? "khata" : "neutral"} value={money(totalOwed)} />
        <Stat label="Total purchased" icon={ShoppingBag} value={money(totalPurchased)} />
        <Stat label="Total paid" icon={Banknote} tone="paid" value={money(totalPaid)} />
      </div>

      {/* Supplier list */}
      <Card padded={false}>
        <div className="p-4 sm:p-5 border-b border-line flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <h2 className="text-base font-semibold">Supplier accounts ({filtered.length})</h2>
          <div className="relative sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input
              type="text"
              aria-label="Search suppliers"
              placeholder="Search name, company, phone…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={(suppliers || []).length === 0 ? "No suppliers yet" : "No supplier matches your search"}
            description={
              (suppliers || []).length === 0
                ? "Add the people you buy stock from to keep track of what you owe them."
                : "Try a different name, company or phone number."
            }
            action={(suppliers || []).length === 0 && <Button icon={Plus} onClick={openAddSupplier}>Add your first supplier</Button>}
          />
        ) : (
          <>
            {/* Phones: one card per supplier */}
            <ul className="md:hidden divide-y divide-line">
              {filtered.map((s) => (
                <li key={s.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => setViewId(s.id)} className="min-w-0 text-left">
                      <div className="font-semibold text-ink truncate">{s.name}</div>
                      {s.company && <div className="text-xs text-muted truncate">{s.company}</div>}
                    </button>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted">Balance owed</div>
                      <div className={`font-semibold tabular-nums ${balanceCls(s.balance)}`}>{balanceLabel(s.balance)}</div>
                    </div>
                  </div>
                  <p className="text-xs text-muted">
                    Purchased {money(s.totalPurchased)} · Paid {money(s.totalPaid)} · Last {s.lastActivity ? fmtDate(s.lastActivity) : "—"}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    {s.phone ? (
                      <a href={`tel:${s.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 -ml-2 font-mono text-sm text-brand-700 hover:bg-brand-50">
                        <Phone size={14} aria-hidden="true" /> {s.phone}
                      </a>
                    ) : (
                      <span className="text-sm text-muted">No phone</span>
                    )}
                    {rowActions(s)}
                  </div>
                </li>
              ))}
            </ul>

            {/* Tablet and up: table */}
            <div className="hidden md:block p-4 sm:p-5 pt-2 sm:pt-3">
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Supplier</Th>
                    <Th>Phone</Th>
                    <Th className="text-right">Balance owed</Th>
                    <Th className="text-right">Purchased</Th>
                    <Th className="text-right">Paid</Th>
                    <Th>Last activity</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-sunken/60 transition-colors">
                      <Td>
                        <button type="button" onClick={() => setViewId(s.id)} className="text-left">
                          <div className="font-semibold text-ink hover:text-brand-700">{s.name}</div>
                          {s.company && <div className="text-xs text-muted">{s.company}</div>}
                        </button>
                      </Td>
                      <Td>
                        {s.phone ? (
                          <a href={`tel:${s.phone}`} className="font-mono text-brand-700 hover:underline whitespace-nowrap">{s.phone}</a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                      <Td className={`text-right font-semibold whitespace-nowrap ${balanceCls(s.balance)}`}>{balanceLabel(s.balance)}</Td>
                      <Td className="text-right text-ink whitespace-nowrap">{money(s.totalPurchased)}</Td>
                      <Td className="text-right text-ink-soft whitespace-nowrap">{money(s.totalPaid)}</Td>
                      <Td className="text-ink-soft whitespace-nowrap">{s.lastActivity ? fmtDate(s.lastActivity) : "—"}</Td>
                      <Td>{rowActions(s)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </>
        )}
      </Card>

      {/* ── Supplier account view (rendered before the forms opened from it, so they sit on top) ── */}
      <Modal
        open={!!viewSupplier}
        onClose={closeAccountView}
        size="xl"
        title={viewSupplier?.name || "Supplier"}
        description={
          viewSupplier && (
            <span className="flex flex-wrap gap-x-3 gap-y-0.5">
              {viewSupplier.company && <span className="inline-flex items-center gap-1"><Building2 size={12} aria-hidden="true" /> {viewSupplier.company}</span>}
              {viewSupplier.phone && (
                <a href={`tel:${viewSupplier.phone}`} className="inline-flex items-center gap-1 font-mono text-brand-700 hover:underline">
                  <Phone size={12} aria-hidden="true" /> {viewSupplier.phone}
                </a>
              )}
              {viewSupplier.address && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" /> {viewSupplier.address}</span>}
            </span>
          )
        }
      >
        {viewSupplier && (
          <div className="space-y-4">
            {viewSupplier.notes && <p className="text-sm text-ink-soft">{viewSupplier.notes}</p>}

            <div className="flex flex-wrap gap-2">
              <Button icon={PackagePlus} onClick={openPurchase}>New purchase</Button>
              <Button variant="success" icon={Banknote} onClick={openPayment}>Record payment</Button>
              <Button variant="secondary" icon={Edit3} onClick={() => openEditSupplier(viewSupplier)}>Edit supplier</Button>
            </div>

            {/* Balance */}
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Opening balance", value: money(viewSupplier.openingBalance), cls: "text-ink" },
                { label: "Purchased", value: money(viewSupplier.totalPurchased), cls: "text-ink" },
                { label: "Paid", value: money(viewSupplier.totalPaid), cls: "text-paid-600" },
                { label: "Balance owed", value: balanceLabel(viewSupplier.balance), cls: balanceCls(viewSupplier.balance) },
              ].map(({ label, value, cls }) => (
                <div key={label} className="rounded-xl border border-line p-3 min-w-0">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className={`mt-0.5 font-display text-base sm:text-lg font-bold break-words ${cls}`}>{value}</dd>
                </div>
              ))}
            </dl>

            {/* Statement */}
            <div>
              <h3 className="text-base font-semibold mb-2">Account statement</h3>
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Invoice / ref</Th>
                    <Th>Items</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Paid</Th>
                    <Th className="text-right">Balance owed</Th>
                    <Th>Notes</Th>
                    <Th className="text-right"><span className="sr-only">Actions</span></Th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-sunken/50">
                    <Td className="text-muted">—</Td>
                    <Td className="font-semibold text-ink-soft" colSpan={5}>Opening balance</Td>
                    <Td className={`text-right font-semibold whitespace-nowrap ${balanceCls(viewSupplier.openingBalance)}`}>{money(viewSupplier.openingBalance)}</Td>
                    <Td colSpan={2}></Td>
                  </tr>
                  {statement.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <EmptyState
                          icon={FileText}
                          title="No purchases or payments yet"
                          description='Use "New purchase" when stock arrives and "Record payment" when you pay.'
                        />
                      </td>
                    </tr>
                  ) : (
                    statement.map((t) => (
                      <tr key={t.id} className="hover:bg-sunken/60">
                        <Td className="text-ink-soft whitespace-nowrap">{fmtDate(t.date)}</Td>
                        <Td>
                          {t.type === "purchase" ? <Badge tone="brand">Purchase</Badge> : <Badge tone="paid">Payment</Badge>}
                          {t.stockAdded && <div className="text-[11px] text-muted mt-0.5 whitespace-nowrap">Stock added</div>}
                        </Td>
                        <Td className="font-mono text-ink-soft whitespace-nowrap">{t.invoiceNumber || "—"}</Td>
                        <Td className="text-ink-soft min-w-[160px] max-w-[240px]">
                          <span className="line-clamp-2" title={itemsSummary(t)}>{itemsSummary(t) || "—"}</span>
                        </Td>
                        <Td className="text-right text-ink font-semibold whitespace-nowrap">{t.type === "purchase" ? money(t.amount) : "—"}</Td>
                        <Td className="text-right text-paid-600 whitespace-nowrap">{t.paid ? money(t.paid) : "—"}</Td>
                        <Td className={`text-right font-semibold whitespace-nowrap ${balanceCls(t.running)}`}>{balanceLabel(t.running)}</Td>
                        <Td className="text-muted min-w-[120px] max-w-[180px]"><span className="line-clamp-2">{t.notes || ""}</span></Td>
                        <Td>
                          <div className="flex gap-1 justify-end">
                            <IconButton icon={Edit3} label="Edit entry" onClick={() => openEditTx(t)} />
                            <IconButton icon={Trash2} label="Delete entry" variant="danger-soft" onClick={() => handleDeleteTx(t)} />
                          </div>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </TableWrap>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Add / Edit Supplier Modal ── */}
      <Modal
        open={showSupplierForm}
        onClose={closeSupplierForm}
        z="z-[60]"
        title={editingSupplier ? "Edit supplier" : "Add supplier"}
        footer={
          <>
            <Button variant="secondary" onClick={closeSupplierForm}>Cancel</Button>
            <Button type="submit" form="supplier-form" icon={CheckCircle2} loading={savingSupplier}>
              {savingSupplier ? "Saving…" : editingSupplier ? "Update supplier" : "Save supplier"}
            </Button>
          </>
        }
      >
        <form id="supplier-form" onSubmit={handleSupplierSubmit} className="space-y-4">
          <ErrorNote>{supplierError}</ErrorNote>
          <Field label="Supplier name *" htmlFor="sup-name">
            <Input id="sup-name" type="text" required value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
              placeholder="e.g. Ali Mobile Traders" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Phone" htmlFor="sup-phone">
              <Input id="sup-phone" type="tel" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                placeholder="03xx-xxxxxxx" />
            </Field>
            <Field label="Company" htmlFor="sup-company">
              <Input id="sup-company" type="text" value={supplierForm.company} onChange={(e) => setSupplierForm({ ...supplierForm, company: e.target.value })}
                placeholder="Optional" />
            </Field>
          </div>
          <Field label="Address" htmlFor="sup-address">
            <Input id="sup-address" type="text" value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
              placeholder="Optional" />
          </Field>
          <Field label={`Opening balance (${curr})`} htmlFor="sup-opening" hint="What you already owed this supplier before using the app.">
            <Input id="sup-opening" type="number" min="0" step="any" inputMode="decimal" value={supplierForm.openingBalance}
              onChange={(e) => setSupplierForm({ ...supplierForm, openingBalance: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Notes" htmlFor="sup-notes">
            <Textarea id="sup-notes" rows={2} value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
              placeholder="Optional notes" />
          </Field>
        </form>
      </Modal>

      {/* ── New Purchase Modal ── */}
      <Modal
        open={showPurchase && !!viewSupplier}
        onClose={closePurchase}
        z="z-[60]"
        size="xl"
        title="New purchase"
        description={viewSupplier ? `From ${viewSupplier.name}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={closePurchase}>Cancel</Button>
            <Button type="submit" form="purchase-form" icon={CheckCircle2} loading={savingPurchase}>
              {savingPurchase ? "Saving…" : "Save purchase"}
            </Button>
          </>
        }
      >
        <form id="purchase-form" onSubmit={handlePurchaseSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Date" htmlFor="pur-date">
              <Input id="pur-date" type="date" value={purchaseForm.date} onChange={(e) => setPurchaseForm({ ...purchaseForm, date: e.target.value })} />
            </Field>
            <Field label="Supplier invoice no." htmlFor="pur-invoice">
              <Input id="pur-invoice" type="text" value={purchaseForm.invoiceNumber} onChange={(e) => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })}
                placeholder="Optional" />
            </Field>
            <Field label="Notes" htmlFor="pur-notes">
              <Input id="pur-notes" type="text" value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                placeholder="Optional" />
            </Field>
          </div>

          {/* Item lines */}
          <div className="space-y-3">
            {lines.map((l, idx) => {
              const imeiMode = lineImeiMode(l);
              const units = lineUnits(l);
              const id = `line-${l.key}`;
              return (
                <div key={l.key} className="bg-sunken/60 border border-line rounded-2xl p-3 sm:p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">Item {idx + 1}</span>
                      <Segmented
                        size="sm"
                        value={l.mode}
                        onChange={(m) => setLine(l.key, { mode: m })}
                        options={[
                          { value: "existing", label: "Existing product" },
                          { value: "new", label: "New product" },
                        ]}
                      />
                    </div>
                    <IconButton icon={Trash2} label="Remove item" variant="danger-soft" onClick={() => removeLine(l.key)} />
                  </div>

                  {l.mode === "existing" ? (
                    <Field label="Product *">
                      <ProductPicker
                        products={liveProducts}
                        line={l}
                        onPick={(p) => pickProduct(l.key, p)}
                        onQuery={(v) => setLine(l.key, { productQuery: v })}
                      />
                    </Field>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <Field label="Name *" htmlFor={`${id}-name`}>
                        <Input id={`${id}-name`} type="text" value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} placeholder="e.g. Galaxy A15" />
                      </Field>
                      <Field label="Brand *" htmlFor={`${id}-brand`}>
                        <Input id={`${id}-brand`} type="text" value={l.brand} onChange={(e) => setLine(l.key, { brand: e.target.value })} placeholder="e.g. Samsung" />
                      </Field>
                      <Field label="Model" htmlFor={`${id}-model`}>
                        <Input id={`${id}-model`} type="text" value={l.model} onChange={(e) => setLine(l.key, { model: e.target.value })} placeholder="Optional" />
                      </Field>
                      <Field label="Category" htmlFor={`${id}-cat`}>
                        <Select id={`${id}-cat`} value={l.category} onChange={(e) => setLine(l.key, { category: e.target.value })}>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </Field>
                    </div>
                  )}

                  {imeiMode !== "none" && (
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                      <Field
                        label={`IMEIs ${imeiMode === "required" ? "*" : "(or use quantity)"}`}
                        htmlFor={`${id}-imeis`}
                        hint={`One phone per line: "imei1" or "imei1,imei2" · ${parseImeiText(l.imeiText).length} phone(s)`}
                      >
                        <Textarea
                          id={`${id}-imeis`}
                          rows={3}
                          value={l.imeiText}
                          onChange={(e) => setLine(l.key, { imeiText: e.target.value })}
                          className="font-mono"
                          placeholder={"358921098471201\n358921098471219,358921098471227"}
                        />
                      </Field>
                      <Field label="PTA status" htmlFor={`${id}-pta`}>
                        <Select id={`${id}-pta`} value={l.ptaStatus} onChange={(e) => setLine(l.key, { ptaStatus: e.target.value })} className="sm:w-44">
                          <option value="Approved">PTA approved</option>
                          <option value="Non-PTA">Non-PTA</option>
                          <option value="CPID">CPID approved</option>
                        </Select>
                      </Field>
                    </div>
                  )}

                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3">
                    {imeiMode !== "required" && (
                      <Field label={`Quantity${imeiMode === "optional" ? " (if no IMEIs)" : " *"}`} htmlFor={`${id}-qty`}>
                        <Input id={`${id}-qty`} type="number" min="1" step="1" inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
                      </Field>
                    )}
                    <Field label="Cost price (each) *" htmlFor={`${id}-cost`}>
                      <Input id={`${id}-cost`} type="number" min="0" step="any" inputMode="decimal" value={l.costPrice} onChange={(e) => setLine(l.key, { costPrice: e.target.value })} placeholder="0" />
                    </Field>
                    <Field label="Sale price (each)" htmlFor={`${id}-sale`}>
                      <Input id={`${id}-sale`} type="number" min="0" step="any" inputMode="decimal" value={l.salePrice} onChange={(e) => setLine(l.key, { salePrice: e.target.value })} placeholder="0" />
                    </Field>
                    {l.mode === "new" && (
                      <>
                        <Field label="Warranty (months)" htmlFor={`${id}-wmonths`}>
                          <Input id={`${id}-wmonths`} type="number" min="0" step="1" inputMode="numeric" value={l.warrantyDuration} disabled={l.warrantyType === "No Warranty"}
                            onChange={(e) => setLine(l.key, { warrantyDuration: e.target.value })} />
                        </Field>
                        <Field label="Warranty type" htmlFor={`${id}-wtype`}>
                          <Select
                            id={`${id}-wtype`}
                            value={l.warrantyType}
                            onChange={(e) => setLine(l.key, e.target.value === "No Warranty" ? { warrantyType: e.target.value, warrantyDuration: "0" } : { warrantyType: e.target.value })}
                          >
                            {WARRANTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </Select>
                        </Field>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-end gap-x-1 text-sm text-muted">
                    <span>{units} unit(s) × {money(l.costPrice)} =</span>
                    <span className="font-semibold text-ink">{money(lineTotal(l))}</span>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, newLine()])}
              className="w-full h-11 border border-dashed border-line-strong hover:border-brand-400 text-ink-soft hover:text-brand-700 hover:bg-brand-50 rounded-2xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus size={16} aria-hidden="true" /> Add item
            </button>
            {!hasItems && (
              <p className="text-xs text-muted text-center">
                No items: this saves a bill amount only (for example an old bill) and does not change inventory.
              </p>
            )}
          </div>

          {/* Totals */}
          <div className="border border-line rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:items-end">
            <Field label="Invoice total" htmlFor="pur-total">
              {hasItems ? (
                <div className="font-display text-xl font-bold text-ink">{money(invoiceTotal)}</div>
              ) : (
                <Input id="pur-total" type="number" min="0" step="any" inputMode="decimal" value={purchaseForm.total} onChange={(e) => setPurchaseForm({ ...purchaseForm, total: e.target.value })}
                  placeholder="Bill total" />
              )}
            </Field>
            <Field label="Paid now" htmlFor="pur-paid">
              <Input id="pur-paid" type="number" min="0" step="any" inputMode="decimal" value={purchaseForm.paid} onChange={(e) => setPurchaseForm({ ...purchaseForm, paid: e.target.value })}
                placeholder="0" />
            </Field>
            <Field label="Still to pay">
              <div className={`font-display text-xl font-bold ${toPay > 0 ? "text-khata-600" : "text-paid-600"}`}>
                {toPay < 0 ? `${money(-toPay)} advance` : money(toPay)}
              </div>
            </Field>
            {hasItems && (
              <label className="sm:col-span-3 flex items-start gap-2.5 text-sm text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={purchaseForm.addToStock}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, addToStock: e.target.checked })}
                  className="accent-brand-600 w-5 h-5 mt-0.5 shrink-0"
                />
                <span>
                  Add these items to inventory
                  <span className="block text-xs text-muted">New products are created; existing ones are restocked with this cost and sale price.</span>
                </span>
              </label>
            )}
          </div>

          <ErrorNote>{purchaseError}</ErrorNote>
        </form>
      </Modal>

      {/* ── Pay Supplier Modal ── */}
      <Modal
        open={showPayment && !!viewSupplier}
        onClose={closePayment}
        z="z-[60]"
        size="sm"
        title="Record payment"
        description={
          viewSupplier && (
            <>
              {viewSupplier.name} · Owed <span className={`font-semibold ${balanceCls(viewSupplier.balance)}`}>{balanceLabel(viewSupplier.balance)}</span>
            </>
          )
        }
        footer={
          <>
            <Button variant="secondary" onClick={closePayment}>Cancel</Button>
            <Button type="submit" form="payment-form" variant="success" icon={CheckCircle2} loading={savingPayment}>
              {savingPayment ? "Saving…" : "Save payment"}
            </Button>
          </>
        }
      >
        <form id="payment-form" onSubmit={handlePaymentSubmit} className="space-y-4">
          <ErrorNote>{paymentError}</ErrorNote>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
            <Field label={`Amount (${curr}) *`} htmlFor="pay-amount">
              <Input id="pay-amount" type="number" min="0" step="any" inputMode="decimal" required value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Date" htmlFor="pay-date">
              <Input id="pay-date" type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} />
            </Field>
          </div>
          <Field label="Reference" htmlFor="pay-ref">
            <Input id="pay-ref" type="text" value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
              placeholder="Cheque or transfer no. (optional)" />
          </Field>
          <Field label="Notes" htmlFor="pay-notes">
            <Textarea id="pay-notes" rows={2} value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              placeholder="Optional notes" />
          </Field>
        </form>
      </Modal>

      {/* ── Edit Statement Entry Modal ── */}
      <Modal
        open={!!editingTx}
        onClose={closeTx}
        z="z-[60]"
        size="sm"
        title={editingTx?.type === "purchase" ? "Edit purchase" : "Edit payment"}
        footer={
          <>
            <Button variant="secondary" onClick={closeTx}>Cancel</Button>
            <Button type="submit" form="tx-form" icon={CheckCircle2} loading={savingTx}>
              {savingTx ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        {editingTx && (
          <form id="tx-form" onSubmit={handleTxSubmit} className="space-y-4">
            <ErrorNote>{txError}</ErrorNote>
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
              <Field label="Date" htmlFor="tx-date">
                <Input id="tx-date" type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} />
              </Field>
              <Field label={editingTx.type === "purchase" ? "Invoice no." : "Reference"} htmlFor="tx-ref">
                <Input id="tx-ref" type="text" value={txForm.invoiceNumber} onChange={(e) => setTxForm({ ...txForm, invoiceNumber: e.target.value })} />
              </Field>
              {editingTx.type === "purchase" && (
                <Field
                  label="Invoice total"
                  htmlFor="tx-total"
                  hint={editingTx.stockAdded ? "Comes from the items added to stock." : undefined}
                >
                  {editingTx.stockAdded ? (
                    <div className="h-10 flex items-center text-sm font-semibold text-ink">{money(editingTx.total)}</div>
                  ) : (
                    <Input id="tx-total" type="number" min="0" step="any" inputMode="decimal" value={txForm.total} onChange={(e) => setTxForm({ ...txForm, total: e.target.value })} />
                  )}
                </Field>
              )}
              <Field
                label={editingTx.type === "purchase" ? "Paid at the time" : "Amount paid"}
                htmlFor="tx-paid"
                className={editingTx.type === "purchase" ? "" : "min-[420px]:col-span-2"}
              >
                <Input id="tx-paid" type="number" min="0" step="any" inputMode="decimal" value={txForm.paid} onChange={(e) => setTxForm({ ...txForm, paid: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="tx-notes">
              <Textarea id="tx-notes" rows={2} value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} />
            </Field>
          </form>
        )}
      </Modal>
    </Page>
  );
};

export default Suppliers;
