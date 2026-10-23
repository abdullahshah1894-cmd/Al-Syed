import { useState, useMemo, useCallback } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { localDate } from "../utils/dates";
import {
  Wallet, Plus, Trash2, Edit3, X, Search,
  Tag, User, TrendingDown, CheckCircle2, CreditCard,
} from "lucide-react";
import { Page, PageHeader, Card, CardHeader, Stat, Badge, Button, IconButton, Field, Input, Select, Textarea, Segmented, EmptyState, Modal } from "../components/ui";

const CATEGORIES = [
  "Transport", "Electricity", "Rent", "Salary", "Fuel",
  "Maintenance", "Food", "Shopping", "Stationery", "Other",
];

const PAYMENT_METHODS = ["Cash", "Card", "Easypaisa", "JazzCash", "Bank Transfer"];
const PERIOD_LABELS = { Today: "Today", "This Week": "This week", "This Month": "This month", "All Time": "All time" };

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
const BreakdownCard = ({ title, icon: Icon, rows, curr }) => (
  <Card>
    <CardHeader
      className="mb-3"
      title={
        <span className="flex items-center gap-2">
          <Icon size={16} className="text-muted" aria-hidden="true" /> {title}
        </span>
      }
    />
    {rows.length === 0 ? (
      <p className="text-sm text-muted py-4 text-center">No expenses in this view</p>
    ) : (
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink font-medium truncate min-w-0">
                {r.key} <span className="text-muted font-normal">({r.count})</span>
              </span>
              <span className="text-ink font-semibold shrink-0 tabular-nums">
                {curr} {r.total.toLocaleString()} <span className="text-muted font-normal text-xs">{r.percent}%</span>
              </span>
            </div>
            <div className="w-full bg-sunken rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${r.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
    )}
  </Card>
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

  // Stable so the Modal does not re-run its open effect (and steal focus) on every keystroke
  const resetForm = useCallback(() => {
    setForm({ title: "", amount: "", category: "Other", description: "", sellerName: "", paymentMethod: "Cash", expenseDate: today() });
    setFormError("");
    setEditingExpense(null);
  }, []);
  const closeForm = useCallback(() => {
    resetForm();
    setShowForm(false);
  }, [resetForm]);

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
    const amount = Math.round(Number(form.amount) * 100) / 100;
    if (!form.amount || !Number.isFinite(amount) || amount <= 0) { setFormError("Amount must be greater than zero."); return; }

    const data = {
      title: form.title.trim(),
      amount,
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
    ? PERIOD_LABELS[activePeriod] || activePeriod
    : filterDateFrom || filterDateTo
    ? `${filterDateFrom || "start"} → ${filterDateTo || "today"}`
    : "All time";

  const money = (n) => `${curr} ${num(n).toLocaleString()}`;

  return (
    <Page>
      <PageHeader
        title="Expenses"
        description="Shop costs: transport, rent, salary, bills and more."
        actions={
          <Button icon={Plus} onClick={handleOpenAdd}>
            Add expense
          </Button>
        }
      />

      {/* Period totals (click to show that period) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {Object.keys(periods).map((label) => (
          <Stat
            key={label}
            label={PERIOD_LABELS[label] || label}
            value={money(periodTotal(periods[label]))}
            onClick={() => applyPeriod(label)}
            className={activePeriod === label ? "border-brand-500 ring-2 ring-brand-100" : ""}
          />
        ))}
      </div>

      {/* Filters */}
      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
            <Input
              type="text"
              aria-label="Search expenses"
              placeholder="Search expenses"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select aria-label="Seller" value={filterSeller} onChange={(e) => setFilterSeller(e.target.value)}>
            <option value="All">All sellers</option>
            {SELLERS.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="">No seller</option>
          </Select>
          <Select aria-label="Category" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="All">All categories</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select aria-label="Payment method" value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}>
            <option value="All">All payment methods</option>
            {methodOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1 xl:col-span-1">
            <Input type="date" aria-label="From date" value={filterDateFrom} max={filterDateTo || undefined} onChange={(e) => setFilterDateFrom(e.target.value)} className="px-2" />
            <Input type="date" aria-label="To date" value={filterDateTo} min={filterDateFrom || undefined} onChange={(e) => setFilterDateTo(e.target.value)} className="px-2" />
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Segmented
            size="sm"
            options={Object.keys(periods).map((k) => ({ value: k, label: PERIOD_LABELS[k] || k }))}
            value={activePeriod}
            onChange={applyPeriod}
          />
          {filtersActive && (
            <Button variant="ghost" size="sm" icon={X} onClick={clearFilters} className="h-10 sm:h-8">
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {/* Selected range summary */}
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted">Spent in {rangeLabel}</div>
          <div className="font-display text-3xl font-bold text-ink leading-tight break-words">{money(filteredTotal)}</div>
        </div>
        <dl className="grid grid-cols-3 gap-4 text-sm sm:flex sm:gap-8">
          <div>
            <dt className="text-xs text-muted">Entries</dt>
            <dd className="font-semibold text-ink tabular-nums">{filtered.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Average per entry</dt>
            <dd className="font-semibold text-ink tabular-nums">{money(filtered.length ? Math.round(filteredTotal / filtered.length) : 0)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Average per day with expenses</dt>
            <dd className="font-semibold text-ink tabular-nums">{money(filteredDays ? Math.round(filteredTotal / filteredDays) : 0)}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BreakdownCard title="By category" icon={Tag} rows={byCategory} curr={curr} />
        <BreakdownCard title="By seller" icon={User} rows={bySeller} curr={curr} />
        <BreakdownCard title="By payment method" icon={CreditCard} rows={byMethod} curr={curr} />
      </div>

      {/* Expenses list */}
      <Card padded={false} className="overflow-hidden">
        <div className="px-4 py-3 sm:px-5 border-b border-line flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Expenses ({filtered.length})</h2>
          {filtered.length > 0 && (
            <span className="text-sm font-semibold text-ink tabular-nums">Total {money(filteredTotal)}</span>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={expenses.length === 0 ? "No expenses recorded yet" : "No expenses match these filters"}
            description={expenses.length === 0 ? "Add rent, bills, salary and other shop costs here." : "Try a different period or clear the filters."}
            action={
              expenses.length === 0 ? (
                <Button icon={Plus} onClick={handleOpenAdd}>Add your first expense</Button>
              ) : (
                filtersActive && <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((exp) => (
              <li key={exp.id} className="px-4 py-3 sm:px-5 flex items-start sm:items-center gap-3 hover:bg-sunken/60 transition-colors">
                <div className="hidden sm:flex w-9 h-9 rounded-xl bg-sunken text-muted items-center justify-center shrink-0">
                  <TrendingDown size={16} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-semibold text-ink text-sm break-words">{exp.title}</span>
                      <Badge>{exp.category}</Badge>
                      {exp.sellerName && <Badge tone="brand">{exp.sellerName}</Badge>}
                    </div>
                    <div className="font-bold text-ink text-sm tabular-nums whitespace-nowrap shrink-0">{money(exp.amount)}</div>
                  </div>
                  <div className="text-xs text-muted mt-0.5 break-words">
                    {expenseDay(exp)} · {exp.paymentMethod}
                    {exp.description && ` · ${exp.description}`}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0 -my-1">
                    <IconButton icon={Edit3} label="Edit expense" onClick={() => handleOpenEdit(exp)} />
                    <IconButton
                      icon={Trash2}
                      label="Delete expense"
                      onClick={() => handleDelete(exp.id, exp.title)}
                      className="hover:bg-khata-50 hover:text-khata-700"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Add/Edit expense modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingExpense ? "Edit expense" : "Add expense"}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm} className="flex-1 sm:flex-none">
              Cancel
            </Button>
            <Button type="submit" form="expense-form" icon={CheckCircle2} loading={saving} className="flex-1 sm:flex-none">
              {saving ? "Saving…" : editingExpense ? "Save changes" : "Save expense"}
            </Button>
          </>
        }
      >
        {formError && (
          <div role="alert" className="mb-4 bg-khata-50 border border-khata-200 text-khata-700 text-sm px-3 py-2 rounded-xl">{formError}</div>
        )}

        <form id="expense-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="What was it for? *" htmlFor="exp-title" className="sm:col-span-2">
            <Input id="exp-title" type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Electricity bill" />
          </Field>

          <Field label={`Amount (${curr}) *`} htmlFor="exp-amount">
            <Input id="exp-amount" type="number" inputMode="decimal" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
          </Field>

          <Field label="Category" htmlFor="exp-category">
            <Select id="exp-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {[...new Set([...CATEGORIES, form.category].filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>

          <Field label="Seller (optional)" htmlFor="exp-seller">
            <Select id="exp-seller" value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })}>
              <option value="">No specific seller</option>
              {[...new Set([...SELLERS, form.sellerName].filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>

          <Field label="Paid by" htmlFor="exp-method">
            <Select id="exp-method" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {[...new Set([...PAYMENT_METHODS, form.paymentMethod].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>

          <Field label="Date" htmlFor="exp-date">
            <Input id="exp-date" type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
          </Field>

          <Field label="Notes" htmlFor="exp-notes" className="sm:col-span-2">
            <Textarea id="exp-notes" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Optional" />
          </Field>
        </form>
      </Modal>
    </Page>
  );
};

export default Expenses;
