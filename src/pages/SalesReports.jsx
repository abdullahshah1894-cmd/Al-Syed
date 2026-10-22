import { useState, useMemo } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { localDate, isBetween } from "../utils/dates";
import { isSettlement, realSales, saleProfit, totalProfit as sumProfit, udhaarAdded } from "../utils/sales";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Award,
  Layers,
  ArrowUpRight,
  Sparkles,
  PieChart,
  Clock,
  Wallet,
  HandCoins,
  Undo2,
  Users,
  User,
} from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TIMEFRAMES = ["Today", "Weekly", "Monthly", "Yearly"];
const TIMEFRAME_LABEL = { Today: "Today", Weekly: "Last 7 days", Monthly: "This month", Yearly: "This year" };

const num = (v) => Number(v || 0);
const sumBy = (list, fn) => (list || []).reduce((sum, x) => sum + num(fn(x)), 0);
const saleTime = (s) => s.createdAt || s.date;
const sameName = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
const sellerOf = (s) => s.sellerName || s.cashierName || "";
const itemQty = (item) => Number(item.quantity || item.qty || 1);
// Units still sold on a line (returned units taken off)
const itemNetQty = (item) => Math.max(0, itemQty(item) - num(item.returnedQty));
// Line value for the units still sold
const itemRevenue = (item) => {
  const full = Number(item.subtotal || (item.unitSalePrice || item.price || item.rate || 0) * itemQty(item));
  return itemQty(item) > 0 ? (full * itemNetQty(item)) / itemQty(item) : 0;
};
const netItems = (s) => (s.items || []).reduce((sum, i) => sum + itemNetQty(i), 0);
const expenseDay = (e) => e.expenseDate || (e.createdAt ? localDate(e.createdAt) : null);
// Return records carry the shop date ("date"); fall back to the timestamp
const returnDay = (r) => (r?.date ? String(r.date).slice(0, 10) : r?.at ? localDate(r.at) : null);
const inRange = (day, range) => !!day && (!range.from || day >= range.from) && (!range.to || day <= range.to);

// Local-date bounds (YYYY-MM-DD, inclusive) of a timeframe; never later than today (YYYY-MM-DD)
const periodRange = (timeframe, today) => {
  const now = new Date(`${today}T12:00:00`);
  if (timeframe === "Today") return { from: today, to: today };
  if (timeframe === "Weekly") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { from: localDate(start), to: today };
  }
  if (timeframe === "Monthly") return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  if (timeframe === "Yearly") return { from: `${now.getFullYear()}-01-01`, to: today };
  return { from: null, to: null };
};

// All figures for one seller (or everyone when seller is "All") inside a date range
const computeStats = (allSales, allExpenses, seller, range) => {
  const matches = (name) => seller === "All" || sameName(name, seller);
  const mine = (allSales || []).filter((s) => matches(sellerOf(s)));
  const records = mine.filter((s) => isBetween(saleTime(s), range.from, range.to));
  // Real sales that still count (fully returned bills are not sales any more)
  const sales = realSales(records).filter((s) => s.paymentStatus !== "returned");
  const settlements = records.filter(isSettlement);
  const returns = mine.flatMap((s) => (s.returns || []).filter((r) => inRange(returnDay(r), range)));
  const periodExpenses = (allExpenses || []).filter((e) => inRange(expenseDay(e), range));
  const expenses = sumBy(periodExpenses.filter((e) => matches(e.sellerName)), (e) => e.amount);
  const unassignedExpenses =
    seller === "All" ? 0 : sumBy(periodExpenses.filter((e) => !(e.sellerName || "").trim()), (e) => e.amount);
  const revenue = sumBy(sales, (s) => s.grandTotal || s.totalAmount);
  const grossProfit = sumProfit(sales);
  return {
    sales,
    bills: sales.length,
    revenue,
    grossProfit,
    expenses,
    unassignedExpenses,
    netProfit: grossProfit - expenses,
    items: sumBy(sales, netItems),
    udhaarGiven: sumBy(sales, udhaarAdded),
    udhaarCollected: sumBy(settlements, (s) => s.paidAmount),
    collections: settlements.length,
    returnsCount: returns.length,
    returnsAmount: sumBy(returns, (r) => r.amount),
    avgBill: sales.length ? Math.round(revenue / sales.length) : 0,
    salesWithoutCost: sales.filter((s) => saleProfit(s) === null).length,
  };
};

const SalesReports = () => {
  const { allSales, allExpenses, products, shopSettings, activeSeller } = useApp();
  const [timeframe, setTimeframe] = useState("Weekly");
  // The seller follows the header seller picker until one is chosen here
  const headerSeller = SELLERS.find((s) => sameName(s, activeSeller)) || "All";
  const [sellerChoice, setSeller] = useState(null);
  const seller = sellerChoice ?? headerSeller;
  const curr = shopSettings.currencySymbol || "Rs.";
  const fmt = (n) => `${curr} ${Math.round(num(n)).toLocaleString()}`;

  // Recomputed when the date changes too (the page can stay open past midnight)
  const todayStr = localDate();
  const range = useMemo(() => periodRange(timeframe, todayStr), [timeframe, todayStr]);

  const stats = useMemo(() => computeStats(allSales, allExpenses, seller, range), [allSales, allExpenses, seller, range]);
  const filteredSales = stats.sales;
  const grossMargin = stats.revenue > 0 ? ((stats.grossProfit / stats.revenue) * 100).toFixed(1) : "0.0";

  // Aziz vs Mubashir for the same timeframe (independent of the seller selector)
  const comparison = useMemo(
    () => SELLERS.map((name) => ({ name, ...computeStats(allSales, allExpenses, name, range) })),
    [allSales, allExpenses, range]
  );

  // Product name → category, for sale items saved without a category
  const productCategory = useMemo(() => {
    const map = {};
    (products || []).forEach((p) => {
      map[p.name] = p.category;
    });
    return map;
  }, [products]);

  // Top 5 products (current seller + timeframe)
  const topProducts = useMemo(() => {
    const map = {};
    filteredSales.forEach((s) => {
      (s.items || []).forEach((item) => {
        const qty = itemNetQty(item);
        if (qty <= 0) return;
        const name = item.productName || item.name || "Unnamed item";
        if (!map[name]) map[name] = { name, qty: 0, revenue: 0 };
        map[name].qty += qty;
        map[name].revenue += itemRevenue(item);
      });
    });
    const top5 = Object.values(map).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 5);
    const maxQty = top5.length > 0 ? top5[0].qty : 1;
    return top5.map((p) => ({ ...p, revenue: Math.round(p.revenue), percent: Math.round((p.qty / maxQty) * 100) }));
  }, [filteredSales]);

  // Share of item revenue per category (category from the sale item, else the product)
  const categorySplit = useMemo(() => {
    const map = {};
    let total = 0;
    filteredSales.forEach((s) => {
      (s.items || []).forEach((item) => {
        const cat = item.category || productCategory[item.productName] || "Uncategorised";
        const rev = itemRevenue(item);
        if (!map[cat]) map[cat] = { name: cat, revenue: 0, qty: 0 };
        map[cat].revenue += rev;
        map[cat].qty += itemNetQty(item);
        total += rev;
      });
    });
    return Object.values(map)
      .filter((c) => c.qty > 0 || c.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .map((c) => ({ ...c, revenue: Math.round(c.revenue), percent: total > 0 ? Math.round((c.revenue / total) * 100) : 0 }));
  }, [filteredSales, productCategory]);

  // Sales trend buckets from the real sales, in local time
  const graphData = useMemo(() => {
    let buckets;
    let bucketOf;
    const now = new Date(`${range.to}T12:00:00`);
    if (timeframe === "Today") {
      // 2-hour slots covering 8 AM - 10 PM, widened to include any earlier / later sale
      const hours = filteredSales.map((s) => new Date(saleTime(s)).getHours()).filter(Number.isFinite);
      const first = Math.min(8, ...hours.map((h) => h - (h % 2)));
      const last = Math.max(22, ...hours.map((h) => h - (h % 2)));
      const slots = [];
      for (let h = first; h <= last; h += 2) slots.push(h);
      buckets = slots.map((h) => ({ label: `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}` }));
      bucketOf = (d) => slots.indexOf(d.getHours() - (d.getHours() % 2));
    } else if (timeframe === "Weekly") {
      // Last 7 local dates, oldest first
      const keys = [];
      buckets = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        keys.push(localDate(d));
        buckets.push({ label: i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" }) });
      }
      bucketOf = (d) => keys.indexOf(localDate(d));
    } else if (timeframe === "Monthly") {
      // Weeks of this month: days 1-7, 8-14, 15-21, 22-28, 29-end
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const weeks = Math.ceil(daysInMonth / 7);
      buckets = Array.from({ length: weeks }, (_, i) => {
        const startDay = i * 7 + 1;
        const endDay = Math.min(daysInMonth, startDay + 6);
        return { label: `${startDay}-${endDay} ${MONTHS[now.getMonth()]}` };
      });
      bucketOf = (d) => Math.floor((d.getDate() - 1) / 7);
    } else {
      // Annual: months of the current year
      buckets = MONTHS.map((label) => ({ label }));
      bucketOf = (d) => d.getMonth();
    }

    const data = buckets.map((b) => ({ ...b, revenue: 0, profit: 0, bills: 0 }));
    filteredSales.forEach((s) => {
      const idx = bucketOf(new Date(saleTime(s)));
      if (idx < 0 || !data[idx]) return;
      data[idx].revenue += num(s.grandTotal || s.totalAmount);
      data[idx].profit += saleProfit(s) || 0;
      data[idx].bills += 1;
    });
    return data.map((d) => ({ ...d, revenue: Math.round(d.revenue), profit: Math.round(d.profit) }));
  }, [timeframe, filteredSales, range]);

  const maxGraphRevenue = Math.max(1, ...graphData.map((g) => g.revenue), ...graphData.map((g) => g.profit));
  const scopeLabel = `${seller === "All" ? "All sellers" : seller} • ${TIMEFRAME_LABEL[timeframe]}`;

  const compareRows = [
    { label: "Bills", key: "bills", format: (v) => v.toLocaleString() },
    { label: "Revenue", key: "revenue", format: fmt },
    { label: "Gross Profit", key: "grossProfit", format: fmt },
    { label: "Items Sold", key: "items", format: (v) => v.toLocaleString() },
    { label: "Udhaar Given", key: "udhaarGiven", format: fmt, lowerIsBetter: true },
    { label: "Udhaar Collected", key: "udhaarCollected", format: fmt },
    { label: "Returns", key: "returnsAmount", format: fmt, lowerIsBetter: true, sub: (r) => `${r.returnsCount} return(s)` },
  ];

  return (
    <div className="p-6 space-y-6 text-slate-100 min-h-screen pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl text-indigo-400">
              <BarChart3 size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Sales & Performance Analytics</h1>
              <p className="text-xs text-slate-400">
                Revenue, profit, Udhaar, returns and top products — {scopeLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 self-start lg:self-auto">
          {/* Seller selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            {["All", ...SELLERS].map((s) => (
              <button
                key={s}
                onClick={() => setSeller(s)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
                  seller === s
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                {s === "All" ? <Users size={13} /> : <User size={13} />}
                {s === "All" ? "All Sellers" : s}
              </button>
            ))}
          </div>

          {/* Timeframe Filter Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                  timeframe === tf
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Sales Revenue</span>
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight">{fmt(stats.revenue)}</div>
          <div className="flex items-center gap-1 mt-2 text-xs text-emerald-400 font-medium">
            <ArrowUpRight size={14} />
            <span>{stats.bills} bill(s)</span>
          </div>
        </div>

        {/* Gross Profit */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-indigo-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Gross Profit</span>
            <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-indigo-400 tracking-tight">{fmt(stats.grossProfit)}</div>
          <div className="flex items-center gap-1 mt-2 text-xs text-indigo-300 font-medium">
            <Sparkles size={14} />
            <span>{grossMargin}% gross margin</span>
          </div>
          {stats.salesWithoutCost > 0 && (
            <div className="mt-1 text-[11px] text-amber-400 font-medium">
              {stats.salesWithoutCost} sale(s) without cost data
            </div>
          )}
        </div>

        {/* Expenses */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Expenses</span>
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
              <Wallet size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-400 tracking-tight">{fmt(stats.expenses)}</div>
          <div className="mt-2 text-xs text-amber-300 font-medium">
            {seller === "All" ? "All expenses in this period" : `Expenses saved under ${seller}`}
          </div>
          {stats.unassignedExpenses > 0 && (
            <div className="mt-1 text-[11px] text-slate-400">
              + {fmt(stats.unassignedExpenses)} with no seller (not included)
            </div>
          )}
        </div>

        {/* Net Profit (gross profit minus expenses) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-rose-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Net Profit</span>
            <div className="p-2 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className={`text-2xl font-extrabold tracking-tight ${stats.netProfit < 0 ? "text-rose-400" : "text-white"}`}>
            {fmt(stats.netProfit)}
          </div>
          <div className="mt-2 text-xs text-rose-300 font-medium">
            Gross profit − {fmt(stats.expenses)} expenses
          </div>
        </div>

        {/* Units Sold */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-cyan-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Items Sold</span>
            <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
              <ShoppingBag size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight">
            {stats.items.toLocaleString()} <span className="text-sm font-normal text-slate-400">Items</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-xs text-cyan-400 font-medium">
            <Layers size={14} />
            <span>
              {categorySplit.length} categor{categorySplit.length === 1 ? "y" : "ies"} • avg bill {fmt(stats.avgBill)}
            </span>
          </div>
        </div>

        {/* Udhaar Given */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-rose-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Udhaar Given</span>
            <div className="p-2 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
              <Clock size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-rose-400 tracking-tight">{fmt(stats.udhaarGiven)}</div>
          <div className="mt-2 text-xs text-slate-400 font-medium">
            Credit on {stats.sales.filter((s) => udhaarAdded(s) > 0).length} bill(s) in this period
          </div>
        </div>

        {/* Udhaar Collected */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Udhaar Collected</span>
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
              <HandCoins size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 tracking-tight">{fmt(stats.udhaarCollected)}</div>
          <div className="mt-2 text-xs text-slate-400 font-medium">{stats.collections} payment(s) received</div>
        </div>

        {/* Returns */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-orange-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-xl group-hover:bg-orange-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Returns</span>
            <div className="p-2 bg-orange-500/10 rounded-xl text-orange-400 border border-orange-500/20">
              <Undo2 size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-orange-300 tracking-tight">{fmt(stats.returnsAmount)}</div>
          <div className="mt-2 text-xs text-slate-400 font-medium">{stats.returnsCount} return(s) in this period</div>
        </div>
      </div>

      {/* Main Grid: Sales Trend Graph & Top 5 Best-Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Performance Chart (2 cols wide on desktop) */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-100 text-lg">Sales & Profit Trend</h2>
                  <p className="text-xs text-slate-400">{scopeLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />
                  <span className="text-slate-300">Revenue</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
                  <span className="text-slate-300">Profit</span>
                </div>
              </div>
            </div>

            {/* Custom Bar Chart Visualization */}
            <div className="h-64 flex items-end justify-between gap-2 sm:gap-4 pt-6 pb-2 px-2 border-b border-slate-800/80">
              {graphData.map((item, index) => {
                const revHeightPercent = item.revenue > 0 ? Math.max(2, Math.round((item.revenue / maxGraphRevenue) * 100)) : 0;
                const profitHeightPercent = item.profit > 0 ? Math.max(2, Math.round((item.profit / maxGraphRevenue) * 100)) : 0;
                return (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                    {/* Bar pair container */}
                    <div className="w-full flex items-end justify-center gap-1.5 h-full relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-14 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950 border border-slate-700 text-[10px] p-2 rounded-xl shadow-2xl z-20 pointer-events-none whitespace-nowrap">
                        <div className="text-indigo-400 font-bold">Rev: {fmt(item.revenue)}</div>
                        <div className="text-emerald-400 font-bold">Profit: {fmt(item.profit)}</div>
                        <div className="text-slate-400">{item.bills} bill(s)</div>
                      </div>

                      {/* Revenue Bar */}
                      <div
                        style={{ height: `${revHeightPercent}%` }}
                        className="w-1/2 max-w-[28px] bg-gradient-to-t from-indigo-700 to-indigo-500 rounded-t-lg transition-all duration-500 group-hover:brightness-125"
                      />
                      {/* Profit Bar */}
                      <div
                        style={{ height: `${profitHeightPercent}%` }}
                        className="w-1/2 max-w-[28px] bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-lg transition-all duration-500 group-hover:brightness-125"
                      />
                    </div>
                    {/* Label */}
                    <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-100 transition-colors text-center">
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-400 pt-2">
            <span>Showing <strong>{scopeLabel}</strong></span>
            <span className="text-indigo-400 font-semibold">{filteredSales.length} bill(s) recorded</span>
          </div>
        </div>

        {/* Top 5 Best Selling Products Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                <Award size={20} />
              </div>
              <div>
                <h2 className="font-bold text-slate-100 text-base">Top 5 Best-Selling Products</h2>
                <p className="text-xs text-slate-400">Ranked by quantity sold (returns taken off)</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {topProducts.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">No sales recorded in this period.</div>
            ) : (
              topProducts.map((item, index) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 max-w-[65%] truncate">
                      <span
                        className={`w-5 h-5 rounded-lg flex items-center justify-center font-black text-[10px] ${
                          index === 0
                            ? "bg-amber-500 text-slate-950"
                            : index === 1
                            ? "bg-slate-300 text-slate-950"
                            : index === 2
                            ? "bg-amber-700 text-white"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        #{index + 1}
                      </span>
                      <span className="font-semibold text-slate-200 truncate">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-emerald-400">{fmt(item.revenue)}</span>
                      <span className="text-slate-400 text-[10px] ml-1.5">({item.qty} pcs)</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        index === 0
                          ? "bg-gradient-to-r from-amber-500 to-amber-300"
                          : index === 1
                          ? "bg-gradient-to-r from-indigo-500 to-indigo-300"
                          : "bg-gradient-to-r from-cyan-500 to-emerald-400"
                      }`}
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Category split & seller comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
              <PieChart size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-100 text-base">Sales by Category</h2>
              <p className="text-xs text-slate-400">Share of item revenue</p>
            </div>
          </div>
          {categorySplit.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">No sales recorded in this period.</div>
          ) : (
            <div className="space-y-3">
              {categorySplit.map((c) => (
                <div key={c.name}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200 truncate">
                      {c.name} <span className="text-slate-500 font-normal">({c.qty} pcs)</span>
                    </span>
                    <span className="font-bold text-slate-100 shrink-0">
                      {fmt(c.revenue)} <span className="text-slate-500 font-normal">{c.percent}%</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 mt-1 overflow-hidden border border-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${c.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <Users size={20} />
              </div>
              <div>
                <h2 className="font-bold text-slate-100 text-base">{SELLERS.join(" vs ")}</h2>
                <p className="text-xs text-slate-400">{TIMEFRAME_LABEL[timeframe]} • side by side</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 uppercase">
                <tr>
                  <th className="p-3 font-semibold">Figure</th>
                  {comparison.map((c) => (
                    <th key={c.name} className="p-3 font-semibold text-right">{c.name}</th>
                  ))}
                  <th className="p-3 font-semibold w-1/3">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {compareRows.map((row) => {
                  const values = comparison.map((c) => num(c[row.key]));
                  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
                  const best = values.some((v) => v !== values[0])
                    ? row.lowerIsBetter
                      ? Math.min(...values)
                      : Math.max(...values)
                    : null;
                  return (
                    <tr key={row.key}>
                      <td className="p-3 font-semibold text-slate-300">{row.label}</td>
                      {comparison.map((c, i) => (
                        <td key={c.name} className={`p-3 text-right font-bold ${values[i] === best ? "text-emerald-400" : "text-slate-200"}`}>
                          {row.format(values[i])}
                          {row.sub && <div className="text-[10px] text-slate-500 font-normal">{row.sub(c)}</div>}
                        </td>
                      ))}
                      <td className="p-3">
                        {total > 0 ? (
                          <div className="flex h-2 rounded-full overflow-hidden bg-slate-950 border border-slate-800">
                            {values.map((v, i) => (
                              <div
                                key={comparison[i].name}
                                className={i === 0 ? "bg-indigo-500" : "bg-amber-400"}
                                style={{ width: `${(Math.max(0, v) / total) * 100}%` }}
                                title={`${comparison[i].name}: ${Math.round((Math.max(0, v) / total) * 100)}%`}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            {comparison.map((c, i) => (
              <span key={c.name} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full inline-block ${i === 0 ? "bg-indigo-500" : "bg-amber-400"}`} />
                {c.name}
              </span>
            ))}
            <span className="text-slate-500">Green = better figure</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesReports;
