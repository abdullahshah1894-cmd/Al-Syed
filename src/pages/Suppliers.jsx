import React, { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, getProductStock } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { localDate } from "../utils/dates";
import {
  Truck,
  Plus,
  Search,
  X,
  Edit3,
  Trash2,
  Eye,
  Phone,
  Building2,
  MapPin,
  CheckCircle2,
  PackagePlus,
  DollarSign,
  Wallet,
  ShoppingBag,
  Users,
  FileText,
} from "lucide-react";

// Same category names Inventory uses
const CATEGORIES = ["Smartphones", "Tablets & iPads", "Accessories", "Spare Parts", "Wearables"];
// Categories whose units are tracked by IMEI (Smartphones must have at least one)
const IMEI_CATEGORIES = ["Smartphones", "Tablets & iPads", "Wearables"];
const WARRANTY_TYPES = ["Official Brand Warranty", "Shop Warranty", "No Warranty"];

const today = () => localDate();
const num = (v) => Number(v) || 0;

// Products whose stock is counted from IMEI units rather than a plain quantity
const isImeiProduct = (p) => (p.imeis && p.imeis.length > 0) || p.category === "Smartphones";

const inputCls =
  "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 mt-1 focus:outline-none focus:border-fuchsia-500";
const smallInputCls =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-100 mt-1 focus:outline-none focus:border-fuchsia-500";
const labelCls = "text-xs font-semibold text-slate-300";
const smallLabelCls = "text-[11px] font-semibold text-slate-400";

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
      <div className="flex items-center justify-between gap-2 bg-slate-950 border border-fuchsia-500/30 rounded-lg px-3 py-2 mt-1">
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-100 truncate">{selected.name}</div>
          <div className="text-[10px] text-slate-400">
            {selected.brand} • {selected.category} • Stock: {getProductStock(selected)}
            {isImeiProduct(selected) ? " • IMEI tracked" : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="text-[11px] text-fuchsia-300 hover:text-fuchsia-200 font-bold shrink-0"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 mt-0.5" />
        <input
          type="text"
          value={line.productQuery}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search product by name, brand, model..."
          className={`${smallInputCls} pl-7`}
        />
      </div>
      <div className="mt-1 max-h-40 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg divide-y divide-slate-800/70">
        {matches.length === 0 ? (
          <div className="p-2 text-[11px] text-slate-500 text-center">No product found — use "New product" instead.</div>
        ) : (
          matches.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => onPick(p)}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-800/70 flex items-center justify-between gap-2"
            >
              <span className="text-xs text-slate-200 truncate">
                {p.name} <span className="text-slate-500">• {p.brand}</span>
              </span>
              <span className="text-[10px] text-slate-500 shrink-0">Stock {getProductStock(p)}</span>
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

  const closeSupplierForm = () => {
    setShowSupplierForm(false);
    setEditingSupplier(null);
    setSupplierError("");
  };

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
  const closeAccount = () => {
    setViewId(null);
    if (searchParams.get("open")) {
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    }
  };

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

  const balanceCls = (b) => (b > 0 ? "text-rose-400" : b < 0 ? "text-emerald-400" : "text-slate-300");
  const balanceLabel = (b) => (b < 0 ? `${money(-b)} advance` : money(b));

  // Supplier accounts are the owner's only (the route is admin-only too; the server refuses cashiers)
  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center text-slate-400">
          <Truck size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold text-slate-200">Suppliers are managed by the owner only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Truck size={24} className="text-fuchsia-400" />
            <h1 className="text-xl font-bold text-slate-100">Suppliers</h1>
          </div>
          <p className="text-xs text-slate-400">
            Supplier accounts — purchases, payments and what the shop still owes. Purchases can add stock straight into inventory.
          </p>
        </div>
        <button
          onClick={openAddSupplier}
          className="flex items-center gap-2 px-5 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold rounded-2xl shadow-lg shadow-fuchsia-600/20 transition-all text-sm"
        >
          <Plus size={16} /> Add Supplier
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Suppliers", value: (suppliers || []).length.toLocaleString(), icon: Users, color: "from-slate-700 to-slate-600" },
          { label: "Total Owed", value: money(totalOwed), icon: Wallet, color: "from-rose-600 to-rose-500" },
          { label: "Total Purchased", value: money(totalPurchased), icon: ShoppingBag, color: "from-fuchsia-600 to-fuchsia-500" },
          { label: "Total Paid", value: money(totalPaid), icon: DollarSign, color: "from-emerald-600 to-emerald-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={`bg-gradient-to-br ${color} rounded-2xl p-4 shadow`}>
            <div className="flex items-center justify-between text-xs text-white/70 font-semibold uppercase mb-1">
              <span>{label}</span>
              <Icon size={14} />
            </div>
            <div className="text-xl font-black text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search suppliers by name, company, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-fuchsia-500"
          />
        </div>
      </div>

      {/* Supplier List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-slate-100 text-sm">Suppliers ({filtered.length})</h2>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Truck size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">{(suppliers || []).length === 0 ? "No suppliers yet" : "No supplier matches your search"}</p>
            {(suppliers || []).length === 0 && (
              <button onClick={openAddSupplier} className="mt-3 text-xs text-fuchsia-400 hover:underline">Add your first supplier</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3.5 font-semibold">Supplier</th>
                  <th className="p-3.5 font-semibold">Phone</th>
                  <th className="p-3.5 font-semibold text-right">Balance Owed</th>
                  <th className="p-3.5 font-semibold text-right">Purchased</th>
                  <th className="p-3.5 font-semibold text-right">Paid</th>
                  <th className="p-3.5 font-semibold">Last Activity</th>
                  <th className="p-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5">
                      <button onClick={() => setViewId(s.id)} className="text-left">
                        <div className="font-bold text-slate-100 text-sm hover:text-fuchsia-300">{s.name}</div>
                        {s.company && <div className="text-[11px] text-slate-400">{s.company}</div>}
                      </button>
                    </td>
                    <td className="p-3.5">
                      {s.phone ? (
                        <a href={`tel:${s.phone}`} className="font-mono text-cyan-300 hover:underline">{s.phone}</a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className={`p-3.5 text-right font-extrabold ${balanceCls(s.balance)}`}>{balanceLabel(s.balance)}</td>
                    <td className="p-3.5 text-right text-slate-200">{money(s.totalPurchased)}</td>
                    <td className="p-3.5 text-right text-emerald-300">{money(s.totalPaid)}</td>
                    <td className="p-3.5 text-slate-400">{s.lastActivity ? fmtDate(s.lastActivity) : "—"}</td>
                    <td className="p-3.5">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setViewId(s.id)} title="View account" className="p-1.5 text-slate-400 hover:text-fuchsia-300 hover:bg-slate-800 rounded-lg transition-colors"><Eye size={14} /></button>
                        <button onClick={() => openEditSupplier(s)} title="Edit" className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"><Edit3 size={14} /></button>
                        <button onClick={() => handleDeleteSupplier(s)} title="Delete" className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Supplier Account View ── */}
      {viewSupplier && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-800 pb-4 mb-4 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-fuchsia-600/20 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-300 font-black text-lg">
                  {viewSupplier.name?.charAt(0)?.toUpperCase() || "S"}
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-xl">{viewSupplier.name}</h3>
                  <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {viewSupplier.company && <span className="flex items-center gap-1"><Building2 size={11} /> {viewSupplier.company}</span>}
                    {viewSupplier.phone && (
                      <a href={`tel:${viewSupplier.phone}`} className="flex items-center gap-1 font-mono text-cyan-300 hover:underline">
                        <Phone size={11} /> {viewSupplier.phone}
                      </a>
                    )}
                    {viewSupplier.address && <span className="flex items-center gap-1"><MapPin size={11} /> {viewSupplier.address}</span>}
                  </div>
                  {viewSupplier.notes && <p className="text-[11px] text-slate-500 mt-0.5">{viewSupplier.notes}</p>}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto">
                <button
                  onClick={openPurchase}
                  className="px-3.5 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-fuchsia-600/20"
                >
                  <PackagePlus size={14} /> New Purchase
                </button>
                <button
                  onClick={openPayment}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
                >
                  <DollarSign size={14} /> Pay Supplier
                </button>
                <button onClick={() => openEditSupplier(viewSupplier)} title="Edit supplier" className="p-2 text-slate-400 hover:text-indigo-300 rounded-xl hover:bg-slate-800">
                  <Edit3 size={16} />
                </button>
                <button onClick={closeAccount} className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Balance cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Opening Balance", value: money(viewSupplier.openingBalance), cls: "text-slate-200" },
                { label: "Purchased", value: money(viewSupplier.totalPurchased), cls: "text-fuchsia-300" },
                { label: "Paid", value: money(viewSupplier.totalPaid), cls: "text-emerald-300" },
                { label: "Balance Owed", value: balanceLabel(viewSupplier.balance), cls: balanceCls(viewSupplier.balance) },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-slate-950 border border-slate-800 rounded-2xl p-3">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">{label}</div>
                  <div className={`text-base font-extrabold ${cls}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* Statement */}
            <div className="flex-1 overflow-y-auto border border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0">
                  <tr>
                    <th className="p-3 font-semibold">Date</th>
                    <th className="p-3 font-semibold">Type</th>
                    <th className="p-3 font-semibold">Invoice / Ref</th>
                    <th className="p-3 font-semibold">Items</th>
                    <th className="p-3 font-semibold text-right">Amount</th>
                    <th className="p-3 font-semibold text-right">Paid</th>
                    <th className="p-3 font-semibold text-right">Balance Owed</th>
                    <th className="p-3 font-semibold">Notes</th>
                    <th className="p-3 font-semibold text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  <tr className="bg-slate-950/40">
                    <td className="p-3 text-slate-500">—</td>
                    <td className="p-3 text-slate-400 font-semibold" colSpan={5}>Opening balance</td>
                    <td className={`p-3 text-right font-bold ${balanceCls(viewSupplier.openingBalance)}`}>{money(viewSupplier.openingBalance)}</td>
                    <td className="p-3" colSpan={2}></td>
                  </tr>
                  {statement.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500">
                        <FileText size={32} className="mx-auto mb-2 opacity-30" />
                        No purchases or payments yet. Use "New Purchase" or "Pay Supplier".
                      </td>
                    </tr>
                  ) : (
                    statement.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/40">
                        <td className="p-3 text-slate-300 whitespace-nowrap">{fmtDate(t.date)}</td>
                        <td className="p-3">
                          {t.type === "purchase" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
                              Purchase
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              Payment
                            </span>
                          )}
                          {t.stockAdded && <div className="text-[9px] text-slate-500 mt-0.5">Stock added</div>}
                        </td>
                        <td className="p-3 font-mono text-slate-300">{t.invoiceNumber || "—"}</td>
                        <td className="p-3 text-slate-300 max-w-[220px]">
                          <span className="line-clamp-2" title={itemsSummary(t)}>{itemsSummary(t) || "—"}</span>
                        </td>
                        <td className="p-3 text-right text-slate-100 font-semibold whitespace-nowrap">{t.type === "purchase" ? money(t.amount) : "—"}</td>
                        <td className="p-3 text-right text-emerald-300 whitespace-nowrap">{t.paid ? money(t.paid) : "—"}</td>
                        <td className={`p-3 text-right font-bold whitespace-nowrap ${balanceCls(t.running)}`}>{balanceLabel(t.running)}</td>
                        <td className="p-3 text-slate-400 max-w-[160px]"><span className="line-clamp-2">{t.notes || ""}</span></td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => openEditTx(t)} title="Edit" className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded-lg"><Edit3 size={13} /></button>
                            <button onClick={() => handleDeleteTx(t)} title="Delete" className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Supplier Modal ── */}
      {showSupplierForm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base">{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</h3>
              <button onClick={closeSupplierForm} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            {supplierError && (
              <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-xs px-3 py-2 rounded-xl">{supplierError}</div>
            )}

            <form onSubmit={handleSupplierSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Supplier Name *</label>
                  <input type="text" required value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                    className={inputCls} placeholder="e.g. Ali Mobile Traders" />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input type="text" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className={inputCls} placeholder="03xx-xxxxxxx" />
                </div>
                <div>
                  <label className={labelCls}>Company</label>
                  <input type="text" value={supplierForm.company} onChange={(e) => setSupplierForm({ ...supplierForm, company: e.target.value })}
                    className={inputCls} placeholder="Optional" />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Address</label>
                  <input type="text" value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                    className={inputCls} placeholder="Optional" />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Opening Balance ({curr})</label>
                  <input type="number" min="0" step="any" value={supplierForm.openingBalance} onChange={(e) => setSupplierForm({ ...supplierForm, openingBalance: e.target.value })}
                    className={inputCls} placeholder="0" />
                  <p className="text-[10px] text-slate-500 mt-1">Amount you already owed this supplier before using the app.</p>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Notes</label>
                  <textarea rows={2} value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                    className={`${inputCls} resize-none`} placeholder="Optional notes..." />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeSupplierForm} className="flex-1 py-2.5 bg-slate-800 text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={savingSupplier}
                  className="flex-1 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-60 text-white text-sm font-bold rounded-xl shadow-lg shadow-fuchsia-600/20 flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} />
                  {savingSupplier ? "Saving..." : editingSupplier ? "Update Supplier" : "Save Supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Purchase Modal ── */}
      {showPurchase && viewSupplier && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[60] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[94vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-slate-100 text-base">New Purchase</h3>
                <p className="text-[11px] text-slate-400">From {viewSupplier.name}</p>
              </div>
              <button onClick={() => setShowPurchase(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            <form onSubmit={handlePurchaseSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={purchaseForm.date} onChange={(e) => setPurchaseForm({ ...purchaseForm, date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Supplier Invoice No.</label>
                  <input type="text" value={purchaseForm.invoiceNumber} onChange={(e) => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })}
                    className={inputCls} placeholder="Optional" />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className={labelCls}>Notes</label>
                  <input type="text" value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                    className={inputCls} placeholder="Optional" />
                </div>
              </div>

              {/* Item lines */}
              <div className="space-y-3">
                {lines.map((l, idx) => {
                  const imeiMode = lineImeiMode(l);
                  const units = lineUnits(l);
                  return (
                    <div key={l.key} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-300">Item {idx + 1}</span>
                          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                            {[["existing", "Existing product"], ["new", "New product"]].map(([m, label]) => (
                              <button
                                type="button"
                                key={m}
                                onClick={() => setLine(l.key, { mode: m })}
                                className={`px-2.5 py-1 rounded-md font-semibold ${l.mode === m ? "bg-fuchsia-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button type="button" onClick={() => removeLine(l.key)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg" title="Remove item">
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {l.mode === "existing" ? (
                        <div>
                          <label className={smallLabelCls}>Product *</label>
                          <ProductPicker
                            products={liveProducts}
                            line={l}
                            onPick={(p) => pickProduct(l.key, p)}
                            onQuery={(v) => setLine(l.key, { productQuery: v })}
                          />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="col-span-2 md:col-span-1">
                            <label className={smallLabelCls}>Name *</label>
                            <input type="text" value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} className={smallInputCls} placeholder="e.g. Galaxy A15" />
                          </div>
                          <div>
                            <label className={smallLabelCls}>Brand *</label>
                            <input type="text" value={l.brand} onChange={(e) => setLine(l.key, { brand: e.target.value })} className={smallInputCls} placeholder="e.g. Samsung" />
                          </div>
                          <div>
                            <label className={smallLabelCls}>Model</label>
                            <input type="text" value={l.model} onChange={(e) => setLine(l.key, { model: e.target.value })} className={smallInputCls} placeholder="Optional" />
                          </div>
                          <div>
                            <label className={smallLabelCls}>Category</label>
                            <select value={l.category} onChange={(e) => setLine(l.key, { category: e.target.value })} className={smallInputCls}>
                              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {imeiMode !== "none" && (
                          <div className="col-span-2">
                            <div className="flex items-center justify-between">
                              <label className={smallLabelCls}>
                                IMEIs {imeiMode === "required" ? "*" : "(or use quantity)"} — one phone per line, "imei1" or "imei1,imei2"
                              </label>
                            </div>
                            <textarea
                              rows={3}
                              value={l.imeiText}
                              onChange={(e) => setLine(l.key, { imeiText: e.target.value })}
                              className={`${smallInputCls} font-mono resize-y`}
                              placeholder={"358921098471201\n358921098471219,358921098471227"}
                            />
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[10px] text-slate-500">{parseImeiText(l.imeiText).length} phone(s)</span>
                              <select
                                value={l.ptaStatus}
                                onChange={(e) => setLine(l.key, { ptaStatus: e.target.value })}
                                className="bg-slate-950 border border-slate-800 rounded-lg p-1 text-[11px] text-cyan-400 font-bold"
                              >
                                <option value="Approved">PTA Approved</option>
                                <option value="Non-PTA">Non-PTA</option>
                                <option value="CPID">CPID Approved</option>
                              </select>
                            </div>
                          </div>
                        )}
                        {imeiMode !== "required" && (
                          <div>
                            <label className={smallLabelCls}>Quantity{imeiMode === "optional" ? " (if no IMEIs)" : " *"}</label>
                            <input type="number" min="1" step="1" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} className={smallInputCls} />
                          </div>
                        )}
                        <div>
                          <label className={smallLabelCls}>Cost Price (each) *</label>
                          <input type="number" min="0" step="any" value={l.costPrice} onChange={(e) => setLine(l.key, { costPrice: e.target.value })} className={smallInputCls} placeholder="0" />
                        </div>
                        <div>
                          <label className={smallLabelCls}>Sale Price (each)</label>
                          <input type="number" min="0" step="any" value={l.salePrice} onChange={(e) => setLine(l.key, { salePrice: e.target.value })} className={smallInputCls} placeholder="0" />
                        </div>
                        {l.mode === "new" && (
                          <>
                            <div>
                              <label className={smallLabelCls}>Warranty (months)</label>
                              <input type="number" min="0" step="1" value={l.warrantyDuration} disabled={l.warrantyType === "No Warranty"}
                                onChange={(e) => setLine(l.key, { warrantyDuration: e.target.value })} className={`${smallInputCls} disabled:opacity-50`} />
                            </div>
                            <div>
                              <label className={smallLabelCls}>Warranty Type</label>
                              <select
                                value={l.warrantyType}
                                onChange={(e) => setLine(l.key, e.target.value === "No Warranty" ? { warrantyType: e.target.value, warrantyDuration: "0" } : { warrantyType: e.target.value })}
                                className={smallInputCls}
                              >
                                {WARRANTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex justify-end text-xs text-slate-400">
                        {units} unit(s) × {money(l.costPrice)} ={" "}
                        <span className="ml-1 font-extrabold text-slate-100">{money(lineTotal(l))}</span>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setLines((prev) => [...prev, newLine()])}
                  className="w-full py-2.5 border border-dashed border-slate-700 hover:border-fuchsia-500 text-slate-400 hover:text-fuchsia-300 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} /> Add Item
                </button>
                {!hasItems && (
                  <p className="text-[11px] text-slate-500 text-center">
                    No items: this saves a bill amount only (e.g. an old bill) and does not change inventory.
                  </p>
                )}
              </div>

              {/* Totals */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className={labelCls}>Invoice Total</label>
                  {hasItems ? (
                    <div className="text-lg font-black text-slate-100 mt-1">{money(invoiceTotal)}</div>
                  ) : (
                    <input type="number" min="0" step="any" value={purchaseForm.total} onChange={(e) => setPurchaseForm({ ...purchaseForm, total: e.target.value })}
                      className={inputCls} placeholder="Bill total" />
                  )}
                </div>
                <div>
                  <label className={labelCls}>Paid Now</label>
                  <input type="number" min="0" step="any" value={purchaseForm.paid} onChange={(e) => setPurchaseForm({ ...purchaseForm, paid: e.target.value })}
                    className={inputCls} placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>What I have to pay</label>
                  <div className={`text-lg font-black mt-1 ${toPay > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                    {toPay < 0 ? `${money(-toPay)} advance` : money(toPay)}
                  </div>
                </div>
                {hasItems && (
                  <label className="md:col-span-3 flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={purchaseForm.addToStock}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, addToStock: e.target.checked })}
                      className="accent-fuchsia-500 w-4 h-4"
                    />
                    Add these items to inventory
                    <span className="text-slate-500">(new products are created; existing ones are restocked with this cost and sale price)</span>
                  </label>
                )}
              </div>

              {purchaseError && (
                <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-xs px-3 py-2 rounded-xl">{purchaseError}</div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowPurchase(false)} className="flex-1 py-2.5 bg-slate-800 text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={savingPurchase}
                  className="flex-1 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-60 text-white text-sm font-bold rounded-xl shadow-lg shadow-fuchsia-600/20 flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} />
                  {savingPurchase ? "Saving..." : "Save Purchase"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Pay Supplier Modal ── */}
      {showPayment && viewSupplier && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-base">Pay Supplier</h3>
                <p className="text-[11px] text-slate-400">
                  {viewSupplier.name} • Owed: <span className={balanceCls(viewSupplier.balance)}>{balanceLabel(viewSupplier.balance)}</span>
                </p>
              </div>
              <button onClick={() => setShowPayment(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            {paymentError && (
              <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-xs px-3 py-2 rounded-xl">{paymentError}</div>
            )}

            <form onSubmit={handlePaymentSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Amount ({curr}) *</label>
                  <input type="number" min="0" step="any" required value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className={inputCls} placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Reference</label>
                  <input type="text" value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                    className={inputCls} placeholder="Cheque / transfer no. (optional)" />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Notes</label>
                  <textarea rows={2} value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    className={`${inputCls} resize-none`} placeholder="Optional notes..." />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPayment(false)} className="flex-1 py-2.5 bg-slate-800 text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={savingPayment}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} />
                  {savingPayment ? "Saving..." : "Save Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Statement Entry Modal ── */}
      {editingTx && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base">Edit {editingTx.type === "purchase" ? "Purchase" : "Payment"}</h3>
              <button onClick={() => setEditingTx(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            {txError && (
              <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-xs px-3 py-2 rounded-xl">{txError}</div>
            )}

            <form onSubmit={handleTxSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{editingTx.type === "purchase" ? "Invoice No." : "Reference"}</label>
                  <input type="text" value={txForm.invoiceNumber} onChange={(e) => setTxForm({ ...txForm, invoiceNumber: e.target.value })} className={inputCls} />
                </div>
                {editingTx.type === "purchase" && (
                  <div>
                    <label className={labelCls}>Invoice Total</label>
                    {editingTx.stockAdded ? (
                      <>
                        <div className="text-sm font-bold text-slate-200 mt-2.5">{money(editingTx.total)}</div>
                        <p className="text-[10px] text-slate-500 mt-1">Comes from the items added to stock.</p>
                      </>
                    ) : (
                      <input type="number" min="0" step="any" value={txForm.total} onChange={(e) => setTxForm({ ...txForm, total: e.target.value })} className={inputCls} />
                    )}
                  </div>
                )}
                <div className={editingTx.type === "purchase" ? "" : "col-span-2"}>
                  <label className={labelCls}>{editingTx.type === "purchase" ? "Paid at the time" : "Amount Paid"}</label>
                  <input type="number" min="0" step="any" value={txForm.paid} onChange={(e) => setTxForm({ ...txForm, paid: e.target.value })} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Notes</label>
                  <textarea rows={2} value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} className={`${inputCls} resize-none`} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingTx(null)} className="flex-1 py-2.5 bg-slate-800 text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={savingTx}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} />
                  {savingTx ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
