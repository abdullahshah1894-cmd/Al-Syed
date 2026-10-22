import { useMemo } from "react";
import { useApp, getProductStock } from "../context/AppContext";
import { localDate } from "../utils/dates";
import { isSettlement, realSales, totalProfit, itemCount, udhaarAdded, saleProfit } from "../utils/sales";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Boxes,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Calculator,
  ShoppingCart,
  Search,
  ArrowUpRight,
  Receipt,
  Wrench,
  HandCoins,
  Undo2,
  Truck,
  Wallet,
  BarChart3,
  Users,
} from "lucide-react";

// ── Helpers (all dates are local shop dates, YYYY-MM-DD) ──────────────────────
const num = (v) => Number(v || 0);
const sumBy = (list, fn) => (list || []).reduce((sum, x) => sum + num(fn(x)), 0);
const saleDay = (s) => (s?.createdAt ? localDate(s.createdAt) : null);
const expenseDay = (e) => e.expenseDate || (e.createdAt ? localDate(e.createdAt) : null);
// Return records carry the shop date ("date"); fall back to the timestamp
const returnDay = (r) => (r?.date ? String(r.date).slice(0, 10) : r?.at ? localDate(r.at) : null);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDate(d);
};
// Bills that still count as a sale (fully returned bills are not)
const liveBills = (list) => realSales(list).filter((s) => s.paymentStatus !== "returned");
const byNewest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

// Everything that happened on one local day, from the (seller-filtered) records
const dayStats = (records, expenses, day) => {
  const dayRecords = records.filter((s) => saleDay(s) === day);
  const bills = liveBills(dayRecords);
  const revenue = sumBy(bills, (s) => s.grandTotal);
  const grossProfit = totalProfit(bills);
  const spent = sumBy(expenses.filter((e) => expenseDay(e) === day), (e) => e.amount);
  const returns = records.flatMap((s) => (s.returns || []).filter((r) => returnDay(r) === day));
  return {
    bills: bills.length,
    revenue,
    grossProfit,
    expenses: spent,
    netProfit: grossProfit - spent,
    udhaarGiven: sumBy(bills, udhaarAdded),
    udhaarCollected: sumBy(dayRecords.filter(isSettlement), (s) => s.paidAmount),
    returnsCount: returns.length,
    returnsAmount: sumBy(returns, (r) => r.amount),
  };
};

const ISSUE_STATUSES = [
  { status: "Pending", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  { status: "Under Inspection", cls: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" },
  { status: "Repaired", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
];

// "+12% vs yesterday" from real figures; null when there is nothing to compare with
const changeVs = (now, before) => {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
};

const Dashboard = () => {
  const {
    products,
    sales,
    allCustomers,
    warranties,
    expenses,
    issues,
    suppliers,
    supplierTransactions,
    shopSettings,
    activeSeller,
  } = useApp();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const curr = shopSettings.currencySymbol || "Rs.";
  const fmt = (n) => `${curr} ${Math.round(num(n)).toLocaleString()}`;
  const sellerFiltered = activeSeller && activeSeller !== "All Sellers" && activeSeller !== "All";

  const records = useMemo(() => sales || [], [sales]);
  const spentList = useMemo(() => expenses || [], [expenses]);
  const todayStr = localDate();

  const today = useMemo(() => dayStats(records, spentList, todayStr), [records, spentList, todayStr]);
  const yesterday = useMemo(() => dayStats(records, spentList, daysAgo(1)), [records, spentList]);
  const revenueChange = changeVs(today.revenue, yesterday.revenue);

  // Last 7 local days, oldest first
  const trend = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const day = daysAgo(i);
      const bills = liveBills(records.filter((s) => saleDay(s) === day));
      days.push({
        day,
        label: new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }),
        revenue: sumBy(bills, (s) => s.grandTotal),
        profit: sumBy(bills, (s) => saleProfit(s) || 0),
        bills: bills.length,
      });
    }
    return days;
  }, [records]);
  const trendMax = Math.max(1, ...trend.map((d) => d.revenue));
  const trendTotal = sumBy(trend, (d) => d.revenue);

  // Stock
  const liveProducts = useMemo(() => (products || []).filter((p) => !p.isDeleted), [products]);
  const inventoryCost = sumBy(liveProducts, (p) => num(p.purchasePrice) * getProductStock(p));
  const inventoryRetail = sumBy(liveProducts, (p) => num(p.salePrice) * getProductStock(p));
  const inventoryUnits = sumBy(liveProducts, (p) => getProductStock(p));
  const lowStockProducts = useMemo(
    () =>
      liveProducts
        .filter((p) => getProductStock(p) <= num(p.minStockAlert))
        .sort((a, b) => getProductStock(a) - getProductStock(b)),
    [liveProducts]
  );
  const outOfStock = lowStockProducts.filter((p) => getProductStock(p) === 0).length;

  // Udhaar outstanding (shop-wide, from customer balances)
  const debtors = useMemo(
    () => (allCustomers || []).filter((c) => num(c.totalPending) > 0).sort((a, b) => num(b.totalPending) - num(a.totalPending)),
    [allCustomers]
  );
  const totalUdhaarPending = sumBy(debtors, (c) => c.totalPending);

  // Suppliers
  const supplierOwed = sumBy(suppliers, (s) => Math.max(0, num(s.balance)));
  const suppliersOwedCount = (suppliers || []).filter((s) => num(s.balance) > 0).length;
  const monthStart = `${todayStr.slice(0, 7)}-01`;
  const purchasedThisMonth = sumBy(
    (supplierTransactions || []).filter((t) => t.type === "purchase" && t.date && String(t.date).slice(0, 10) >= monthStart),
    (t) => t.total
  );

  // Repair tickets
  const issueCounts = ISSUE_STATUSES.map((s) => ({
    ...s,
    count: (issues || []).filter((i) => i.status === s.status).length,
  }));
  const openTickets = sumBy(issueCounts, (s) => s.count);

  // Warranties expiring soon, nearest expiry first
  const expiringWarranties = useMemo(
    () =>
      (warranties || [])
        .filter((w) => w.status === "Expiring Soon")
        .sort((a, b) => String(a.warrantyExpiryDate || "").localeCompare(String(b.warrantyExpiryDate || ""))),
    [warranties]
  );

  // Estimated Zakat (2.5%) on inventory + receivables only; cash / bank are entered on the Zakat page
  const estimatedZakat = Math.round((inventoryCost + totalUdhaarPending) * 0.025);

  const recentBills = useMemo(() => [...realSales(records)].sort(byNewest).slice(0, 5), [records]);

  const card = "bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm transition-all";
  const clickable = "cursor-pointer hover:border-indigo-500/50 hover:shadow-indigo-500/10";

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 rounded-3xl p-6 border border-indigo-800/50 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
              {user?.role === "admin" ? "Owner / Administrator" : "Cashier Portal"}
            </span>
            <span className="text-xs text-slate-400">• {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</span>
            {sellerFiltered && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Sales & expenses: {activeSeller} only
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Welcome back, {user?.name}!
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            {shopSettings.shopName} Dashboard Overview
          </p>
        </div>

        {/* Quick Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/pos")}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
          >
            <ShoppingCart size={18} />
            <span>Open POS Terminal</span>
          </button>
          <button
            onClick={() => navigate("/imei-checker")}
            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-2xl text-sm flex items-center gap-2 border border-slate-700 transition-all"
          >
            <Search size={18} className="text-indigo-400" />
            <span className="hidden sm:inline">IMEI Lookup</span>
          </button>
          <button
            onClick={() => navigate("/mobile-issues")}
            className="px-4 py-3 bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 font-semibold rounded-2xl text-sm flex items-center gap-2 border border-orange-500/30 transition-all"
          >
            <Wrench size={18} />
            <span className="hidden sm:inline">Mobile Issue</span>
          </button>
        </div>
      </div>

      {/* Today */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Today</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Today's Sales */}
          <div onClick={() => navigate(isAdmin ? "/reports" : "/bills")} className={`${card} ${clickable}`}>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Today's Sales</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <DollarSign size={18} />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-100">{fmt(today.revenue)}</div>
            <div className="text-[11px] text-slate-400 mt-1">{today.bills} bill(s) today</div>
            <div className="text-[11px] mt-0.5 font-medium flex items-center gap-1">
              {revenueChange === null ? (
                <span className="text-slate-500">Yesterday: {fmt(yesterday.revenue)}</span>
              ) : (
                <span className={`flex items-center gap-1 ${revenueChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {revenueChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {revenueChange >= 0 ? "+" : ""}
                  {revenueChange}% vs yesterday ({fmt(yesterday.revenue)})
                </span>
              )}
            </div>
          </div>

          {/* Today's Profit (Admin) */}
          <div
            onClick={() => (isAdmin ? navigate("/reports") : null)}
            className={`${card} ${isAdmin ? clickable : ""}`}
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Today's Profit</span>
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <TrendingUp size={18} />
              </div>
            </div>
            <div className={`text-xl font-bold ${isAdmin && today.netProfit < 0 ? "text-rose-400" : "text-slate-100"}`}>
              {isAdmin ? fmt(today.netProfit) : "••••••"}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {isAdmin ? `Gross ${fmt(today.grossProfit)} − Expenses ${fmt(today.expenses)}` : "Restricted for Cashier"}
            </div>
          </div>

          {/* Udhaar Given Today */}
          <div onClick={() => navigate("/pending-payments")} className={`${card} ${clickable}`}>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Udhaar Given</span>
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Clock size={18} />
              </div>
            </div>
            <div className="text-xl font-bold text-rose-400">{fmt(today.udhaarGiven)}</div>
            <div className="text-[11px] text-slate-400 mt-1">Unpaid amount on today's bills</div>
          </div>

          {/* Udhaar Collected Today */}
          <div onClick={() => navigate("/pending-payments")} className={`${card} ${clickable}`}>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Udhaar Collected</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <HandCoins size={18} />
              </div>
            </div>
            <div className="text-xl font-bold text-emerald-400">{fmt(today.udhaarCollected)}</div>
            <div className="text-[11px] text-slate-400 mt-1">Payments received today</div>
          </div>

          {/* Returns Today */}
          <div onClick={() => navigate("/bills")} className={`${card} ${clickable}`}>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Returns</span>
              <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <Undo2 size={18} />
              </div>
            </div>
            <div className="text-xl font-bold text-orange-300">{fmt(today.returnsAmount)}</div>
            <div className="text-[11px] text-slate-400 mt-1">{today.returnsCount} return(s) today</div>
          </div>

          {/* Expenses Today */}
          <div onClick={() => navigate("/expenses")} className={`${card} ${clickable}`}>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Expenses</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Wallet size={18} />
              </div>
            </div>
            <div className="text-xl font-bold text-amber-400">{fmt(today.expenses)}</div>
            <div className="text-[11px] text-slate-400 mt-1">Yesterday: {fmt(yesterday.expenses)}</div>
          </div>
        </div>
      </div>

      {/* Shop position */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Shop Position</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Inventory Value */}
          <div onClick={() => navigate("/valuation")} className={`${card} cursor-pointer hover:border-cyan-500/50 hover:shadow-cyan-500/10`}>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Stock Value</span>
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Boxes size={18} />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-100">
              {isAdmin ? fmt(inventoryCost) : `${inventoryUnits.toLocaleString()} Units`}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {isAdmin ? `Cost • ${inventoryUnits.toLocaleString()} units` : `${liveProducts.length} products`}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Retail: {fmt(inventoryRetail)}</div>
          </div>

          {/* Low Stock */}
          <div onClick={() => navigate("/inventory")} className={`${card} cursor-pointer hover:border-amber-500/50 hover:shadow-amber-500/10`}>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Low Stock</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertTriangle size={18} />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-100">{lowStockProducts.length} Items</div>
            <div className={`text-[11px] mt-1 font-medium ${lowStockProducts.length ? "text-amber-400" : "text-slate-400"}`}>
              {lowStockProducts.length ? `${outOfStock} out of stock` : "All above minimum"}
            </div>
          </div>

          {/* Udhaar Outstanding */}
          <div onClick={() => navigate("/pending-payments")} className={`${card} cursor-pointer hover:border-rose-500/50 hover:shadow-rose-500/10`}>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Udhaar Pending</span>
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Clock size={18} />
              </div>
            </div>
            <div className="text-xl font-bold text-rose-400">{fmt(totalUdhaarPending)}</div>
            <div className="text-[11px] text-slate-400 mt-1">
              Across {debtors.length} customer(s){sellerFiltered ? " • all sellers" : ""}
            </div>
          </div>

          {/* Owed to Suppliers (Admin) */}
          <div className={card}>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Owed to Suppliers</span>
              <div className="p-2 rounded-xl bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20">
                <Truck size={18} />
              </div>
            </div>
            <div className="text-xl font-bold text-fuchsia-300">{isAdmin ? fmt(supplierOwed) : "••••••"}</div>
            <div className="text-[11px] text-slate-400 mt-1">
              {isAdmin
                ? `${suppliersOwedCount} supplier(s) • Bought this month ${fmt(purchasedThisMonth)}`
                : "Admin view only"}
            </div>
          </div>

          {/* Open Repair Tickets */}
          <div onClick={() => navigate("/mobile-issues")} className={`${card} cursor-pointer hover:border-orange-500/50 hover:shadow-orange-500/10`}>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Open Repairs</span>
              <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <Wrench size={18} />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-100">{openTickets} Ticket(s)</div>
            <div className="text-[11px] text-slate-400 mt-1">
              {issueCounts.find((s) => s.status === "Repaired").count} ready for pickup
            </div>
          </div>

          {/* Estimated Zakat (Admin) */}
          <div
            onClick={() => (isAdmin ? navigate("/zakat") : null)}
            className={`${card} ${isAdmin ? "cursor-pointer hover:border-purple-500/50 hover:shadow-purple-500/10" : ""}`}
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Est. Zakat (2.5%)</span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Calculator size={18} />
              </div>
            </div>
            <div className="text-xl font-bold text-purple-300">{isAdmin ? fmt(estimatedZakat) : "••••••"}</div>
            <div className="text-[11px] text-purple-400 mt-1 font-medium">
              {isAdmin ? "Stock cost + receivables only" : "Admin view only"}
            </div>
          </div>
        </div>
      </div>

      {/* 7-day trend & top debtors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={20} className="text-indigo-400" />
              <h2 className="font-bold text-slate-100 text-base">Last 7 Days</h2>
            </div>
            <span className="text-xs text-slate-400">
              Total <strong className="text-slate-200">{fmt(trendTotal)}</strong> •{" "}
              {sumBy(trend, (d) => d.bills)} bill(s)
            </span>
          </div>
          <div className="h-48 flex items-end justify-between gap-2 sm:gap-4 pt-6 border-b border-slate-800/80">
            {trend.map((d) => {
              const h = d.revenue > 0 ? Math.max(3, Math.round((d.revenue / trendMax) * 100)) : 0;
              const isTodayBar = d.day === todayStr;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <div className="w-full flex items-end justify-center h-full relative">
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950 border border-slate-700 text-[10px] p-2 rounded-xl shadow-2xl z-20 pointer-events-none whitespace-nowrap">
                      <div className="text-indigo-400 font-bold">{fmt(d.revenue)} • {d.bills} bill(s)</div>
                      {isAdmin && <div className="text-emerald-400 font-bold">Profit: {fmt(d.profit)}</div>}
                    </div>
                    <div
                      style={{ height: `${h}%` }}
                      className={`w-2/3 max-w-[36px] rounded-t-lg transition-all duration-500 group-hover:brightness-125 ${
                        isTodayBar ? "bg-gradient-to-t from-emerald-600 to-emerald-400" : "bg-gradient-to-t from-indigo-700 to-indigo-500"
                      }`}
                    />
                  </div>
                  <span className={`text-[11px] font-bold ${isTodayBar ? "text-emerald-400" : "text-slate-400"}`}>
                    {isTodayBar ? "Today" : d.label}
                  </span>
                </div>
              );
            })}
          </div>
          {trendTotal === 0 && <p className="text-xs text-slate-500 text-center">No sales in the last 7 days</p>}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Users size={20} className="text-rose-400" />
              <h2 className="font-bold text-slate-100 text-base">Top Udhaar</h2>
            </div>
            <span className="text-xs bg-rose-500/20 text-rose-300 font-bold px-2 py-0.5 rounded-full border border-rose-500/30">
              {debtors.length}
            </span>
          </div>
          {debtors.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No outstanding Udhaar</p>
          ) : (
            <div className="space-y-2">
              {debtors.slice(0, 5).map((c) => (
                <div key={c.id} className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-200 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {c.phone || "No phone"}
                      {c.sellerName ? ` • ${c.sellerName}` : ""}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-rose-400 shrink-0">{fmt(c.totalPending)}</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => navigate("/pending-payments")}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors border border-slate-700"
          >
            Collect Payments
          </button>
        </div>
      </div>

      {/* Recent bills & low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt size={20} className="text-indigo-400" />
              <h2 className="font-bold text-slate-100 text-base">Recent Bills</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                Latest {recentBills.length}
              </span>
            </div>
            <button
              onClick={() => navigate("/bills")}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors"
            >
              <span>View All Bills</span>
              <ArrowUpRight size={14} />
            </button>
          </div>

          {recentBills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500 gap-2">
              <Receipt size={32} className="opacity-30" />
              <p className="text-sm font-medium">No bills created yet</p>
              <button
                onClick={() => navigate("/pos")}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold mt-1"
              >
                Go to POS Terminal →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentBills.map((sale) => {
                const returned = sale.paymentStatus === "returned";
                const due = num(sale.dueAmount);
                return (
                  <div
                    key={sale.id}
                    className="flex items-center gap-4 p-4 bg-slate-950/50 border border-slate-800 rounded-2xl hover:border-slate-700 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-indigo-400">{sale.billNumber}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            returned
                              ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                              : due > 0
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          }`}
                        >
                          {returned ? "Returned" : due > 0 ? `Due ${fmt(due)}` : sale.paymentMethod}
                        </span>
                        {(sale.returns || []).length > 0 && !returned && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20">
                            Part returned
                          </span>
                        )}
                        {(sale.sellerName || sale.cashierName) && (
                          <span className="text-[10px] text-slate-500">{sale.sellerName || sale.cashierName}</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-200 mt-0.5 truncate">{sale.customerName}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {(sale.items || []).map((i) => i.productName || i.name).join(", ")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-slate-100">{fmt(sale.grandTotal)}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {itemCount(sale)} item(s) •{" "}
                        {new Date(sale.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-400" />
              <h2 className="font-bold text-slate-100 text-base">Low Stock Warnings</h2>
            </div>
            <span className="text-xs bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
              {lowStockProducts.length}
            </span>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {lowStockProducts.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">Every product is above its minimum stock</p>
            )}
            {lowStockProducts.map((prod) => {
              const stock = getProductStock(prod);
              return (
                <div
                  key={prod.id}
                  className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-200 truncate">{prod.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{[prod.brand, prod.category].filter(Boolean).join(" • ")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                        stock === 0
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {stock === 0 ? "Out of stock" : `${stock} left`}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Min Alert: {prod.minStockAlert}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => navigate("/inventory")}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors border border-slate-700"
          >
            Manage Inventory Stock
          </button>
        </div>
      </div>

      {/* Repairs & warranties */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Wrench size={20} className="text-orange-400" />
              <h2 className="font-bold text-slate-100 text-base">Open Repair Tickets</h2>
            </div>
            <button
              onClick={() => navigate("/mobile-issues")}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
            >
              <span>Open Repairs</span>
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {issueCounts.map((s) => (
              <div key={s.status} className={`p-3 rounded-2xl border text-center ${s.cls}`}>
                <div className="text-2xl font-black">{s.count}</div>
                <div className="text-[11px] font-semibold mt-0.5">{s.status === "Repaired" ? "Ready for pickup" : s.status}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            {(issues || []).filter((i) => i.status === "Delivered").length} delivered •{" "}
            {(issues || []).filter((i) => i.status === "Rejected").length} rejected (closed)
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-cyan-400" />
              <h2 className="font-bold text-slate-100 text-base">Warranties Expiring Soon</h2>
            </div>
            <span className="text-xs bg-cyan-500/20 text-cyan-300 font-bold px-2 py-0.5 rounded-full border border-cyan-500/30">
              {expiringWarranties.length}
            </span>
          </div>
          {expiringWarranties.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No warranty expires in the next 30 days</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {expiringWarranties.slice(0, 6).map((w) => (
                <div key={w.id} className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-200 truncate">{w.productName || "Product"}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {w.customerName || "Customer"} • <span className="font-mono">{w.imei}</span>
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-amber-400 shrink-0">Expires {w.warrantyExpiryDate}</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => navigate("/warranties")}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors border border-slate-700"
          >
            View Warranties
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
