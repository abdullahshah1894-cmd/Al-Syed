import { useState, useMemo } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { localDate } from "../utils/dates";
import {
  Wallet, Plus, Trash2, Edit3, X, Search,
  Tag, User, TrendingDown, CheckCircle2, CreditCard,
} from "lucide-react";

const CATEGORIES = [
  "Transport", "Electricity", "Rent", "Salary", "Fuel",
  "Maintenance", "Food", "Shopping", "Stationery", "Other",
];

const PAYMENT_METHODS = ["Cash", "Card", "Easypaisa", "JazzCash", "Bank Transfer"];

const today = () => localDate();
const num = (v) => Number(v || 0);
const sumAmount = (list) => list.reduce((s, e) => s + num(e.amount), 0);
const expenseDay = (e) => e.expenseDate || (e.createdAt ? localDate(e.createdAt) : "");
const sameName = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

// Local-date bounds of the quick periods (week starts on Sunday)
const periodBounds = () => {
  const todayStr = today();
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return {
    Today: { from: todayStr, to: todayStr },
    "This Week": { from: localDate(d), to: todayStr },
    "This Month": { from: `${todayStr.slice(0, 7)}-01`, to: todayStr },
    "All Time": { from: "", to: "" },
  };
};

// Totals per key, biggest first, with share of the total
const breakdown = (list, keyOf) => {
  const map = {};
  list.forEach((e) => {
    const key = keyOf(e);
    if (!map[key]) map[key] = { key, total: 0, count: 0 };
    map[key].total += num(e.amount);
    map[key].count += 1;
  });
  const total = sumAmount(list);
  return Object.values(map)
    .sort((a, b) => b.total - a.total)
    .map((r) => ({ ...r, percent: total > 0 ? Math.round((r.total / total) * 100) : 0 }));
};

// One breakdown list (category / seller / payment method)
const BreakdownCard = ({ title, icon: Icon, rows, bar, curr }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
    <div className="flex items-center gap-2 mb-3">
      <Icon size={16} className="text-amber-400" />
      <h3 className="font-bold text-slate-100 text-sm">{title}</h3>
    </div>
    {rows.length === 0 ? (
      <p className="text-xs text-slate-500 py-4 text-center">No expenses</p>
    ) : (
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold truncate">
                {r.key} <span className="text-slate-500 font-normal">({r.count})</span>
              </span>
              <span className="text-slate-100 font-bold shrink-0">
                {curr} {r.total.toLocaleString()} <span className="text-slate-500 font-normal">{r.percent}%</span>
              </span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-1.5 mt-1 overflow-hidden border border-slate-800">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${r.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const Expenses = () => {
  const { allExpenses, activeSeller, addExpense, updateExpense, deleteExpense, shopSettings } = useApp();
  // Anyone can add an expense; only the owner (admin) can edit or delete one
  const { isAdmin } = useAuth();
  const curr = shopSettings.currencySymbol || "Rs.";
  const expenses = useMemo(() => allExpenses || [], [allExpenses]);

  // Filters. The seller filter follows the header seller picker until changed here.
  const headerSeller = activeSeller && activeSeller !== "All Sellers" && activeSeller !== "All" ? activeSeller : "All";
  const [searchTerm, setSearchTerm] = useState("");
  const [sellerChoice, setSellerChoice] = useState(null);
  const filterSeller = sellerChoice ?? headerSeller;
  const setFilterSeller = setSellerChoice;
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterMethod, setFilterMethod] = useState("All");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Add/Edit form
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: "Other",
    description: "",
    sellerName: "",
    paymentMethod: "Cash",
    expenseDate: today(),
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setForm({ title: "", amount: "", category: "Other", description: "", sellerName: "", paymentMethod: "Cash", expenseDate: today() });
    setFormError("");
    setEditingExpense(null);
  };

  const handleOpenAdd = () => { resetForm(); setShowForm(true); };
  const handleOpenEdit = (exp) => {
    if (!isAdmin) return;
    setFormError("");
    setEditingExpense(exp);
    setForm({
      title: exp.title,
      amount: String(exp.amount),
      category: exp.category || "Other",
      description: exp.description || "",
      sellerName: exp.sellerName || "",
      paymentMethod: exp.paymentMethod || "Cash",
      expenseDate: exp.expenseDate || today(),
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (editingExpense && !isAdmin) return;
    if (!form.title.trim()) { setFormError("Expense title is required."); return; }
    if (!form.amount || Number(form.amount) <= 0) { setFormError("Amount must be greater than zero."); return; }

    const data = {
      title: form.title.trim(),
      amount: Number(form.amount),
      category: form.category,
      description: form.description.trim() || null,
      sellerName: form.sellerName || null,
      paymentMethod: form.paymentMethod,
      expenseDate: form.expenseDate || today(),
    };

    setSaving(true);
    const ok = editingExpense
      ? await updateExpense(editingExpense.id, data)
      : await addExpense(data);
    setSaving(false);
    // Keep the form filled if the database did not save it
    if (!ok) return;

    resetForm();
    setShowForm(false);
  };

  const handleDelete = (id, title) => {
    if (!isAdmin) return;
    if (window.confirm(`Delete expense "${title}"?`)) {
      deleteExpense(id);
    }
  };

  // Everything except the date range (used for the period cards)
  const baseFiltered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return expenses.filter((e) => {
      if (q && !(e.title || "").toLowerCase().includes(q) && !(e.description || "").toLowerCase().includes(q)) return false;
      if (filterSeller !== "All" && !sameName(e.sellerName, filterSeller)) return false;
      if (filterCategory !== "All" && e.category !== filterCategory) return false;
      if (filterMethod !== "All" && (e.paymentMethod || "Cash") !== filterMethod) return false;
      return true;
    });
  }, [expenses, searchTerm, filterSeller, filterCategory, filterMethod]);

  // Filtered expenses (all filters), newest first
  const filtered = useMemo(() => {
    return baseFiltered
      .filter((e) => {
        const day = expenseDay(e);
        if (filterDateFrom && day < filterDateFrom) return false;
        if (filterDateTo && day > filterDateTo) return false;
        return true;
      })
      .sort((a, b) => expenseDay(b).localeCompare(expenseDay(a)) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [baseFiltered, filterDateFrom, filterDateTo]);

  // Summary stats (local dates)
  const periods = periodBounds();
  const periodTotal = ({ from, to }) =>
    sumAmount(baseFiltered.filter((e) => {
      const day = expenseDay(e);
      return (!from || day >= from) && (!to || day <= to);
    }));
  const activePeriod = Object.keys(periods).find(
    (k) => periods[k].from === filterDateFrom && periods[k].to === filterDateTo
  );
  const applyPeriod = (k) => {
    setFilterDateFrom(periods[k].from);
    setFilterDateTo(periods[k].to);
  };

  const filteredTotal = sumAmount(filtered);
  const filteredDays = new Set(filtered.map(expenseDay)).size;
  const byCategory = useMemo(() => breakdown(filtered, (e) => e.category || "Other"), [filtered]);
  const bySeller = useMemo(() => breakdown(filtered, (e) => e.sellerName || "No seller"), [filtered]);
  const byMethod = useMemo(() => breakdown(filtered, (e) => e.paymentMethod || "Cash"), [filtered]);

  // Filter options: the standard lists plus anything already saved
  const categoryOptions = [...new Set([...CATEGORIES, ...expenses.map((e) => e.category).filter(Boolean)])];
  const methodOptions = [...new Set([...PAYMENT_METHODS, ...expenses.map((e) => e.paymentMethod).filter(Boolean)])];

  const filtersActive =
    searchTerm || filterSeller !== "All" || filterCategory !== "All" || filterMethod !== "All" || filterDateFrom || filterDateTo;
  const clearFilters = () => {
    setSearchTerm("");
    setFilterSeller("All");
    setFilterCategory("All");
    setFilterMethod("All");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const rangeLabel = activePeriod
    ? activePeriod
    : filterDateFrom || filterDateTo
    ? `${filterDateFrom || "start"} → ${filterDateTo || "today"}`
    : "All Time";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={24} className="text-amber-400" />
            <h1 className="text-xl font-bold text-slate-100">Expenses</h1>
          </div>
          <p className="text-xs text-slate-400">Track business expenses — transport, rent, salary, utilities, and more</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-all text-sm"
        >
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {/* Summary Cards (click to show that period) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Today", color: "from-rose-600 to-rose-500" },
          { label: "This Week", color: "from-amber-600 to-amber-500" },
          { label: "This Month", color: "from-orange-600 to-orange-500" },
          { label: "All Time", color: "from-slate-700 to-slate-600" },
        ].map(({ label, color }) => (
          <button
            key={label}
            onClick={() => applyPeriod(label)}
            className={`text-left bg-gradient-to-br ${color} rounded-2xl p-4 shadow transition-all ${
              activePeriod === label ? "ring-2 ring-white/70" : "opacity-90 hover:opacity-100"
            }`}
          >
            <div className="text-xs text-white/70 font-semibold uppercase mb-1">{label}</div>
            <div className="text-xl font-black text-white">{curr} {periodTotal(periods[label]).toLocaleString()}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
          <div className="relative sm:col-span-2 md:col-span-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search expenses..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500" />
          </div>
          <select value={filterSeller} onChange={(e) => setFilterSeller(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="All">All Sellers</option>
            {SELLERS.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="">No Seller</option>
          </select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="All">All Categories</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500">
            <option value="All">All Payment Methods</option>
            {methodOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="date" value={filterDateFrom} max={filterDateTo || undefined} onChange={(e) => setFilterDateFrom(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" />
          <input type="date" value={filterDateTo} min={filterDateFrom || undefined} onChange={(e) => setFilterDateTo(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.keys(periods).map((k) => (
              <button
                key={k}
                onClick={() => applyPeriod(k)}
                className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                  activePeriod === k ? "bg-amber-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          {filtersActive && (
            <button onClick={clearFilters} className="text-slate-400 hover:text-amber-400 font-semibold flex items-center gap-1">
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Selected range summary & breakdowns */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-400 font-semibold uppercase">Selected: {rangeLabel}</div>
          <div className="text-2xl font-black text-amber-400">{curr} {filteredTotal.toLocaleString()}</div>
        </div>
        <div className="flex gap-6 text-xs">
          <div>
            <div className="text-slate-500">Entries</div>
            <div className="font-bold text-slate-100">{filtered.length}</div>
          </div>
          <div>
            <div className="text-slate-500">Avg per entry</div>
            <div className="font-bold text-slate-100">{curr} {(filtered.length ? Math.round(filteredTotal / filtered.length) : 0).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-slate-500">Avg per day with expenses</div>
            <div className="font-bold text-slate-100">{curr} {(filteredDays ? Math.round(filteredTotal / filteredDays) : 0).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BreakdownCard title="By Category" icon={Tag} rows={byCategory} bar="bg-gradient-to-r from-amber-500 to-orange-400" curr={curr} />
        <BreakdownCard title="By Seller" icon={User} rows={bySeller} bar="bg-gradient-to-r from-indigo-500 to-indigo-300" curr={curr} />
        <BreakdownCard title="By Payment Method" icon={CreditCard} rows={byMethod} bar="bg-gradient-to-r from-cyan-500 to-emerald-400" curr={curr} />
      </div>

      {/* Expenses List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-slate-100 text-sm">
            Expenses ({filtered.length})
          </h2>
          {filtered.length > 0 && (
            <span className="text-xs font-bold text-amber-400">
              Total: {curr} {filteredTotal.toLocaleString()}
            </span>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Wallet size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">{expenses.length === 0 ? "No expenses recorded yet" : "No expenses match these filters"}</p>
            {expenses.length === 0 ? (
              <button onClick={handleOpenAdd} className="mt-3 text-xs text-amber-400 hover:underline">Add your first expense</button>
            ) : (
              filtersActive && <button onClick={clearFilters} className="mt-3 text-xs text-amber-400 hover:underline">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map((exp) => (
              <div key={exp.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-800/40 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <TrendingDown size={16} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-100 text-sm">{exp.title}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">{exp.category}</span>
                    {exp.sellerName && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-800/50">{exp.sellerName}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {expenseDay(exp)} · {exp.paymentMethod}
                    {exp.description && ` · ${exp.description}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-extrabold text-amber-400 text-sm">{curr} {num(exp.amount).toLocaleString()}</div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleOpenEdit(exp)} title="Edit expense" className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"><Edit3 size={14} /></button>
                    <button onClick={() => handleDelete(exp.id, exp.title)} title="Delete expense" className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Expense Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base">
                {editingExpense ? "Edit Expense" : "Add New Expense"}
              </h3>
              <button onClick={() => { resetForm(); setShowForm(false); }} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            {formError && (
              <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-xs px-3 py-2 rounded-xl">{formError}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-300">Expense Title *</label>
                  <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500" placeholder="e.g. Electricity bill" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Amount (Rs.) *</label>
                  <input type="number" min="1" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500" placeholder="0" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500">
                    {[...new Set([...CATEGORIES, form.category].filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Seller (Optional)</label>
                  <select value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500">
                    <option value="">No specific seller</option>
                    {[...new Set([...SELLERS, form.sellerName].filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Payment Method</label>
                  <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500">
                    {[...new Set([...PAYMENT_METHODS, form.paymentMethod].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Date</label>
                  <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500" />
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-300">Description / Notes</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500 resize-none"
                    placeholder="Optional notes..." />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { resetForm(); setShowForm(false); }}
                  className="flex-1 py-2.5 bg-slate-800 text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 disabled:opacity-60 bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} />
                  {saving ? "Saving…" : editingExpense ? "Update Expense" : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
