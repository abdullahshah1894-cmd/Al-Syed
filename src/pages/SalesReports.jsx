import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { localDate, isBetween } from "../utils/dates";
import { realSales, saleProfit, totalProfit as sumProfit, itemCount } from "../utils/sales";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Award,
  Calendar,
  Layers,
  ArrowUpRight,
  Sparkles,
  PieChart,
  Clock,
  Wallet,
} from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOUR_SLOTS = [8, 10, 12, 14, 16, 18, 20, 22];

const saleTime = (s) => s.createdAt || s.date;
const itemQty = (item) => Number(item.quantity || item.qty || 1);
const itemRevenue = (item) =>
  Number(item.subtotal || (item.unitSalePrice || item.price || item.rate || 0) * itemQty(item));

// Local-date bounds (YYYY-MM-DD, inclusive) of a timeframe; never later than today
const periodRange = (timeframe) => {
  const now = new Date();
  const today = localDate(now);
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

const SalesReports = () => {
  const { sales, expenses, products, shopSettings } = useApp();
  const [timeframe, setTimeframe] = useState("Weekly");

  const range = useMemo(() => periodRange(timeframe), [timeframe]);

  // Real sales (no Udhaar settlement receipts) inside the timeframe, by local date
  const filteredSales = useMemo(
    () => realSales(sales).filter((s) => isBetween(saleTime(s), range.from, range.to)),
    [sales, range]
  );

  // Expenses in the same timeframe, by expenseDate
  const periodExpenses = useMemo(
    () =>
      expenses
        .filter((e) => {
          const day = e.expenseDate || (e.createdAt ? localDate(e.createdAt) : null);
          return !!day && (!range.from || day >= range.from) && (!range.to || day <= range.to);
        })
        .reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [expenses, range]
  );

  // Aggregate metrics
  const totalRevenue = useMemo(
    () => filteredSales.reduce((sum, s) => sum + Number(s.grandTotal || s.totalAmount || 0), 0),
    [filteredSales]
  );

  const grossProfit = useMemo(() => sumProfit(filteredSales), [filteredSales]);
  const netProfit = grossProfit - periodExpenses;
  const grossMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : "0.0";
  const salesWithoutCost = filteredSales.filter((s) => saleProfit(s) === null).length;

  const totalUnitsSold = useMemo(
    () => filteredSales.reduce((sum, s) => sum + itemCount(s), 0),
    [filteredSales]
  );

  const avgBillValue = filteredSales.length > 0 ? Math.round(totalRevenue / filteredSales.length) : 0;

  // Top 5 Products Calculation (current timeframe only)
  const topProducts = useMemo(() => {
    const map = {};
    filteredSales.forEach((s) => {
      (s.items || []).forEach((item) => {
        const name = item.productName || item.name || "Unknown Smartphone";
        if (!map[name]) {
          map[name] = { name, qty: 0, revenue: 0, category: item.category || "Smartphones" };
        }
        map[name].qty += itemQty(item);
        map[name].revenue += itemRevenue(item);
      });
    });

    const sorted = Object.values(map).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
    const top5 = sorted.slice(0, 5);
    const maxQty = top5.length > 0 ? top5[0].qty : 1;
    return top5.map((p) => ({ ...p, percent: Math.round((p.qty / maxQty) * 100) }));
  }, [filteredSales]);

  // Biggest category's share of item revenue (category from the sale item, else the product)
  const topCategory = useMemo(() => {
    const productCategory = {};
    products.forEach((p) => {
      productCategory[p.name] = p.category;
    });
    const map = {};
    let total = 0;
    filteredSales.forEach((s) => {
      (s.items || []).forEach((item) => {
        const cat = item.category || productCategory[item.productName] || "Other";
        const rev = itemRevenue(item);
        map[cat] = (map[cat] || 0) + rev;
        total += rev;
      });
    });
    const [name, rev] = Object.entries(map).sort((a, b) => b[1] - a[1])[0] || [];
    return name && total > 0 ? { name, percent: Math.round((rev / total) * 100) } : null;
  }, [filteredSales, products]);

  // Sales trend buckets from the real sales, in local time
  const graphData = useMemo(() => {
    let buckets;
    let bucketOf;
    if (timeframe === "Today") {
      // 2-hour slots from 8 AM to 10 PM; earlier / later hours go to the nearest slot
      buckets = HOUR_SLOTS.map((h) => ({ label: `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}` }));
      bucketOf = (d) => Math.min(HOUR_SLOTS.length - 1, Math.max(0, Math.floor((d.getHours() - 8) / 2)));
    } else if (timeframe === "Weekly") {
      // Last 7 local dates, oldest first
      const keys = [];
      buckets = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        keys.push(localDate(d));
        buckets.push({ label: d.toLocaleDateString("en-US", { weekday: "short" }) });
      }
      bucketOf = (d) => keys.indexOf(localDate(d));
    } else if (timeframe === "Monthly") {
      buckets = ["Week 1", "Week 2", "Week 3", "Week 4"].map((label) => ({ label }));
      bucketOf = (d) => Math.min(3, Math.floor((d.getDate() - 1) / 7));
    } else {
      // Annual: months of the current year
      buckets = MONTHS.map((label) => ({ label }));
      bucketOf = (d) => d.getMonth();
    }

    const data = buckets.map((b) => ({ ...b, revenue: 0, profit: 0 }));
    filteredSales.forEach((s) => {
      const idx = bucketOf(new Date(saleTime(s)));
      if (idx < 0 || !data[idx]) return;
      data[idx].revenue += Number(s.grandTotal || s.totalAmount || 0);
      data[idx].profit += saleProfit(s) || 0;
    });
    return data.map((d) => ({ ...d, revenue: Math.round(d.revenue), profit: Math.round(d.profit) }));
  }, [timeframe, filteredSales]);

  const maxGraphRevenue = Math.max(...graphData.map((g) => g.revenue), 1000);

  return (
    <div className="p-6 space-y-6 text-slate-100 min-h-screen pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl text-indigo-400">
              <BarChart3 size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Sales & Performance Analytics</h1>
              <p className="text-xs text-slate-400">
                Real-time sales revenue, net profits, top-selling inventory ranking, and period trends
              </p>
            </div>
          </div>
        </div>

        {/* Timeframe Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 self-start md:self-auto">
          {["Today", "Weekly", "Monthly", "Yearly"].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                timeframe === tf
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-105"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Total Revenue */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Total Sales Revenue</span>
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight">
            {shopSettings.currencySymbol} {totalRevenue.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 mt-2 text-xs text-emerald-400 font-medium">
            <ArrowUpRight size={14} />
            <span>{filteredSales.length} Total Sales Bills ({timeframe})</span>
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
          <div className="text-2xl font-extrabold text-indigo-400 tracking-tight">
            {shopSettings.currencySymbol} {grossProfit.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 mt-2 text-xs text-indigo-300 font-medium">
            <Sparkles size={14} />
            <span>{grossMargin}% Gross Margin</span>
          </div>
          {salesWithoutCost > 0 && (
            <div className="mt-1 text-[11px] text-amber-400 font-medium">
              {salesWithoutCost} sale(s) without cost data
            </div>
          )}
        </div>

        {/* Net Profit (gross profit minus expenses) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-rose-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Net Profit</span>
            <div className="p-2 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
              <Wallet size={16} />
            </div>
          </div>
          <div className={`text-2xl font-extrabold tracking-tight ${netProfit < 0 ? "text-rose-400" : "text-white"}`}>
            {shopSettings.currencySymbol} {netProfit.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 mt-2 text-xs text-rose-300 font-medium">
            <span>After {shopSettings.currencySymbol} {periodExpenses.toLocaleString()} expenses</span>
          </div>
        </div>

        {/* Units Sold */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-cyan-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Units Sold</span>
            <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
              <ShoppingBag size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight">
            {totalUnitsSold} <span className="text-sm font-normal text-slate-400">Items</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-xs text-cyan-400 font-medium">
            <Layers size={14} />
            <span>Smartphones & Accessories</span>
          </div>
        </div>

        {/* Average Bill Value */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all" />
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Avg Bill Value</span>
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
              <Clock size={16} />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-400 tracking-tight">
            {shopSettings.currencySymbol} {avgBillValue.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 mt-2 text-xs text-amber-300 font-medium">
            <span>Average per customer sale</span>
          </div>
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
                  <h2 className="font-bold text-slate-100 text-lg">Sales & Profit Trend ({timeframe})</h2>
                  <p className="text-xs text-slate-400">Revenue and profit visual bar chart comparison</p>
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
                      <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950 border border-slate-700 text-[10px] p-2 rounded-xl shadow-2xl z-20 pointer-events-none whitespace-nowrap">
                        <div className="text-indigo-400 font-bold">Rev: {shopSettings.currencySymbol} {item.revenue.toLocaleString()}</div>
                        <div className="text-emerald-400 font-bold">Profit: {shopSettings.currencySymbol} {item.profit.toLocaleString()}</div>
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
                    <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-100 transition-colors">
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-400 pt-2">
            <span>Showing breakdown for <strong>{timeframe}</strong> period</span>
            <span className="text-indigo-400 font-semibold cursor-pointer hover:underline">
              Total {filteredSales.length} Invoices Recorded
            </span>
          </div>
        </div>

        {/* Top 5 Best Selling Products Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                  <Award size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-100 text-base">Top 5 Best-Selling Products</h2>
                  <p className="text-xs text-slate-400">Ranked by total quantity sold</p>
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
                        <span className="font-extrabold text-emerald-400">
                          {shopSettings.currencySymbol} {item.revenue.toLocaleString()}
                        </span>
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

          {topCategory && (
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1 text-slate-300">
                <PieChart size={14} className="text-indigo-400" />
                <span>{topCategory.name}: {topCategory.percent}% of sales revenue</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesReports;
