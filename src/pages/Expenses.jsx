import React, { useState, useMemo } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import {
  Wallet, Plus, Trash2, Edit3, X, Search, Filter,
  Calendar, Tag, User, TrendingDown, DollarSign, CheckCircle2,
} from "lucide-react";

const CATEGORIES = [
  "Transport", "Electricity", "Rent", "Salary", "Fuel",
  "Maintenance", "Food", "Shopping", "Stationery", "Other",
];

const PAYMENT_METHODS = ["Cash", "Card", "Easypaisa", "JazzCash", "Bank Transfer"];

const today = () => new Date().toISOString().slice(0, 10);

const Expenses = () => {
  const { expenses, addExpense, updateExpense, deleteExpense, shopSettings } = useApp();
  const curr = shopSettings.currencySymbol || "Rs.";

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSeller, setFilterSeller] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
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

  const resetForm = () => {
    setForm({ title: "", amount: "", category: "Other", description: "", sellerName: "", paymentMethod: "Cash", expenseDate: today() });
    setFormError("");
    setEditingExpense(null);
  };

  const handleOpenAdd = () => { resetForm(); setShowForm(true); };
  const handleOpenEdit = (exp) => {
    setEditingExpense(exp);
    setForm({
      title: exp.title,
      amount: String(exp.amount),
      category: exp.category,
      description: exp.description || "",
      sellerName: exp.sellerName || "",
      paymentMethod: exp.paymentMethod || "Cash",
      expenseDate: exp.expenseDate || today(),
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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

    if (editingExpense) {
      await updateExpense(editingExpense.id, data);
    } else {
      await addExpense(data);
    }

    resetForm();
    setShowForm(false);
  };

  const handleDelete = (id, title) => {
    if (window.confirm(`Delete expense "${title}"?`)) {
      deleteExpense(id);
    }
  };

  // Filtered expenses
  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (searchTerm && !(e.title || "").toLowerCase().includes(searchTerm.toLowerCase()) &&
        !(e.description || "").toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterSeller !== "All" && (e.sellerName || "") !== filterSeller) return false;
      if (filterCategory !== "All" && e.category !== filterCategory) return false;
      if (filterDateFrom && e.expenseDate < filterDateFrom) return false;
      if (filterDateTo && e.expenseDate > filterDateTo) return false;
      return true;
    });
  }, [expenses, searchTerm, filterSeller, filterCategory, filterDateFrom, filterDateTo]);

  // Summary stats
  const todayStr = today();
  const startOfWeek = (() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  })();
  const startOfMonth = new Date().toISOString().slice(0, 7) + "-01";

  const totalAll = expenses.reduce((s, e) => s + e.amount, 0);
  const totalToday = expenses.filter((e) => e.expenseDate === todayStr).reduce((s, e) => s + e.amount, 0);
  const totalWeek = expenses.filter((e) => e.expenseDate >= startOfWeek).reduce((s, e) => s + e.amount, 0);
  const totalMonth = expenses.filter((e) => e.expenseDate >= startOfMonth).reduce((s, e) => s + e.amount, 0);

  // Per-seller totals
  const sellerTotals = SELLERS.map((seller) => ({
    seller,
    total: expenses.filter((e) => e.sellerName === seller).reduce((s, e) => s + e.amount, 0),
  }));

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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Today", value: totalToday, color: "from-rose-600 to-rose-500" },
          { label: "This Week", value: totalWeek, color: "from-amber-600 to-amber-500" },
          { label: "This Month", value: totalMonth, color: "from-orange-600 to-orange-500" },
          { label: "All Time", value: totalAll, color: "from-slate-700 to-slate-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className={`bg-gradient-to-br ${color} rounded-2xl p-4 shadow`}>
            <div className="text-xs text-white/70 font-semibold uppercase mb-1">{label}</div>
            <div className="text-xl font-black text-white">{curr} {value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Seller-wise Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sellerTotals.map(({ seller, total }) => (
          <div key={seller} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center">
                <User size={18} className="text-indigo-400" />
              </div>
              <div>
                <div className="font-bold text-slate-100 text-sm">{seller}</div>
                <div className="text-xs text-slate-400">Seller Expenses</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-extrabold text-amber-400 text-lg">{curr} {total.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
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
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" />
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" />
        </div>
      </div>

      {/* Expenses List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-slate-100 text-sm">
            Expenses ({filtered.length})
          </h2>
          {filtered.length > 0 && (
            <span className="text-xs font-bold text-amber-400">
              Total: {curr} {filtered.reduce((s, e) => s + e.amount, 0).toLocaleString()}
            </span>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Wallet size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No expenses found</p>
            <button onClick={handleOpenAdd} className="mt-3 text-xs text-amber-400 hover:underline">Add your first expense</button>
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
                    {exp.expenseDate} · {exp.paymentMethod}
                    {exp.description && ` · ${exp.description}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-extrabold text-amber-400 text-sm">{curr} {exp.amount.toLocaleString()}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleOpenEdit(exp)} className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"><Edit3 size={14} /></button>
                  <button onClick={() => handleDelete(exp.id, exp.title)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"><Trash2 size={14} /></button>
                </div>
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
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Seller (Optional)</label>
                  <select value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500">
                    <option value="">No specific seller</option>
                    {SELLERS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Payment Method</label>
                  <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500">
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
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
                <button type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} />
                  {editingExpense ? "Update Expense" : "Save Expense"}
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
