import { useState, useMemo } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { localDate, isBetween } from "../utils/dates";
import { realSales, saleProfit, totalProfit as sumProfit, udhaarAdded, udhaarCollected, isUdhaarCollection } from "../utils/sales";
import { BarChart3, TrendingUp, DollarSign, ShoppingBag, Award, PieChart, Clock, Wallet, HandCoins, Undo2 } from "lucide-react";
import { Page, PageHeader, Card, CardHeader, Stat, Segmented, TableWrap, Th, Td, EmptyState } from "../components/ui";

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
// Smallest "round" step (1, 1.5, 2, 2.5 ... x 10^n) times 4 that covers the value, for even axis steps
const niceCeil = (value) => {
  const step = Math.max(4, value) / 4;
  const mag = 10 ** Math.floor(Math.log10(step));
  const nice = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * mag >= step) || 10;
  return nice * mag * 4;
};
// Axis labels: 2.5k, 1.2M
const shortMoney = (n) => {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n)}`;
};

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
    udhaarCollected: sumBy(records, udhaarCollected),
    collections: records.filter(isUdhaarCollection).length,
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
  const scopeLabel = `${seller === "All" ? "All sellers" : seller} · ${TIMEFRAME_LABEL[timeframe]}`;
  // Round the chart top up to a readable number so the axis shows clean steps
  const chartMax = niceCeil(maxGraphRevenue);
  const chartTicks = [4, 3, 2, 1, 0].map((i) => (chartMax * i) / 4);

  const compareRows = [
    { label: "Bills", key: "bills", format: (v) => v.toLocaleString() },
    { label: "Revenue", key: "revenue", format: fmt },
    { label: "Gross profit", key: "grossProfit", format: fmt },
    { label: "Items sold", key: "items", format: (v) => v.toLocaleString() },
    { label: "Udhaar given", key: "udhaarGiven", format: fmt, lowerIsBetter: true },
    { label: "Udhaar collected", key: "udhaarCollected", format: fmt },
    { label: "Returns", key: "returnsAmount", format: fmt, lowerIsBetter: true, sub: (r) => `${r.returnsCount} return(s)` },
  ];
  const SHARE_COLORS = ["bg-brand-500", "bg-saffron-400"];

  return (
    <Page>
      <PageHeader title="Sales reports" description={`Revenue, profit, Udhaar, returns and top products · ${scopeLabel}`} />

      {/* Timeframe and seller */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Segmented
          options={TIMEFRAMES.map((tf) => ({ value: tf, label: TIMEFRAME_LABEL[tf] }))}
          value={timeframe}
          onChange={setTimeframe}
          className="self-start"
        />
        <Segmented
          options={["All", ...SELLERS].map((s) => ({ value: s, label: s === "All" ? "All sellers" : s }))}
          value={seller}
          onChange={setSeller}
          className="self-start"
        />
      </div>

      {/* Figures */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Sales revenue" icon={DollarSign} value={fmt(stats.revenue)} hint={`${stats.bills} bill(s)`} />
        <Stat
          label="Gross profit"
          icon={TrendingUp}
          tone={stats.grossProfit < 0 ? "saffron" : "paid"}
          value={fmt(stats.grossProfit)}
          hint={
            <>
              {grossMargin}% gross margin
              {stats.salesWithoutCost > 0 && (
                <span className="block text-saffron-700">{stats.salesWithoutCost} sale(s) without cost data</span>
              )}
            </>
          }
        />
        <Stat
          label="Expenses"
          icon={Wallet}
          value={fmt(stats.expenses)}
          hint={
            <>
              {seller === "All" ? "All expenses in this period" : `Expenses saved under ${seller}`}
              {stats.unassignedExpenses > 0 && (
                <span className="block">+ {fmt(stats.unassignedExpenses)} with no seller (not included)</span>
              )}
            </>
          }
        />
        <Stat
          label="Net profit"
          icon={TrendingUp}
          tone={stats.netProfit < 0 ? "saffron" : "neutral"}
          value={fmt(stats.netProfit)}
          hint={`Gross profit − ${fmt(stats.expenses)} expenses`}
        />
        <Stat
          label="Items sold"
          icon={ShoppingBag}
          value={stats.items.toLocaleString()}
          hint={`${categorySplit.length} categor${categorySplit.length === 1 ? "y" : "ies"} · average bill ${fmt(stats.avgBill)}`}
        />
        <Stat
          label="Udhaar given"
          icon={Clock}
          tone={stats.udhaarGiven > 0 ? "khata" : "neutral"}
          value={fmt(stats.udhaarGiven)}
          hint={`Credit on ${stats.sales.filter((s) => udhaarAdded(s) > 0).length} bill(s) in this period`}
        />
        <Stat
          label="Udhaar collected"
          icon={HandCoins}
          tone="paid"
          value={fmt(stats.udhaarCollected)}
          hint={`${stats.collections} payment(s) received`}
        />
        <Stat
          label="Returns"
          icon={Undo2}
          tone={stats.returnsCount > 0 ? "saffron" : "neutral"}
          value={fmt(stats.returnsAmount)}
          hint={`${stats.returnsCount} return(s) in this period`}
        />
      </div>

      {/* Trend chart and top products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col min-w-0">
          <CardHeader
            title="Sales and profit"
            description={scopeLabel}
            actions={
              <div className="flex items-center gap-4 text-xs font-medium text-ink-soft">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-brand-500 inline-block" aria-hidden="true" /> Revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-paid-400 inline-block" aria-hidden="true" /> Profit
                </span>
              </div>
            }
          />

          {filteredSales.length === 0 ? (
            <EmptyState icon={BarChart3} title="No sales in this period" description="Pick a longer period or another seller to see the trend." />
          ) : (
            <div className="flex gap-2 sm:gap-3">
              {/* Y axis */}
              <div className="relative h-64 w-10 sm:w-12 shrink-0 text-[11px] text-muted tabular-nums" aria-hidden="true">
                {chartTicks.map((t, i) => (
                  <span key={i} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${(i / 4) * 100}%` }}>
                    {shortMoney(t)}
                  </span>
                ))}
              </div>

              <div className="flex-1 min-w-0 overflow-x-auto custom-scrollbar">
                <div style={{ minWidth: `${graphData.length * 40}px` }}>
                  {/* Plot with grid lines */}
                  <div className="relative h-64">
                    {chartTicks.map((t, i) => (
                      <div
                        key={i}
                        className={`absolute inset-x-0 border-t ${i === 4 ? "border-line-strong" : "border-line border-dashed"}`}
                        style={{ top: `${(i / 4) * 100}%` }}
                        aria-hidden="true"
                      />
                    ))}
                    <div className="absolute inset-0 flex items-end gap-1 sm:gap-3 px-1">
                      {graphData.map((item, index) => {
                        const revHeightPercent = item.revenue > 0 ? Math.max(1, (item.revenue / chartMax) * 100) : 0;
                        const profitHeightPercent = item.profit > 0 ? Math.max(1, (item.profit / chartMax) * 100) : 0;
                        return (
                          <div
                            key={index}
                            className="group relative flex-1 h-full flex items-end justify-center gap-0.5 sm:gap-1"
                          >
                            <span className="sr-only">{`${item.label}: revenue ${fmt(item.revenue)}, profit ${fmt(item.profit)}, ${item.bills} bill(s)`}</span>
                            {/* Hover details */}
                            <div
                              className={`pointer-events-none absolute top-1 z-20 hidden group-hover:block ${
                                index === 0 ? "left-0" : index === graphData.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"
                              } whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] shadow-pop`}
                            >
                              <div className="font-semibold text-ink">{item.label}</div>
                              <div className="text-ink-soft">Revenue {fmt(item.revenue)}</div>
                              <div className="text-ink-soft">Profit {fmt(item.profit)}</div>
                              <div className="text-muted">{item.bills} bill(s)</div>
                            </div>
                            <div
                              style={{ height: `${revHeightPercent}%` }}
                              className="w-1/2 max-w-[22px] rounded-t bg-brand-500 group-hover:bg-brand-600 transition-colors"
                            />
                            <div
                              style={{ height: `${profitHeightPercent}%` }}
                              className="w-1/2 max-w-[22px] rounded-t bg-paid-400 group-hover:bg-paid-500 transition-colors"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* X axis labels */}
                  <div className="flex gap-1 sm:gap-3 px-1 pt-2">
                    {graphData.map((item, index) => (
                      <span key={index} className="flex-1 text-center text-[11px] font-medium text-ink-soft leading-tight">
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              Showing <span className="font-semibold text-ink-soft">{scopeLabel}</span>
            </span>
            <span className="font-semibold text-ink-soft">{filteredSales.length} bill(s) recorded</span>
          </div>
        </Card>

        {/* Top 5 products */}
        <Card>
          <CardHeader title="Top 5 products" description="By quantity sold, returns taken off" />
          {topProducts.length === 0 ? (
            <EmptyState icon={Award} title="No sales in this period" description="Best sellers will show here once bills are made." />
          ) : (
            <ol className="space-y-4">
              {topProducts.map((item, index) => (
                <li key={item.name} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-xs font-bold ${
                          index === 0 ? "bg-brand-600 text-white" : "bg-sunken text-ink-soft"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="font-medium text-ink truncate">{item.name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-semibold text-ink tabular-nums">{fmt(item.revenue)}</span>
                      <span className="block text-xs text-muted">{item.qty} pcs</span>
                    </div>
                  </div>
                  <div className="w-full bg-sunken rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${item.percent}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* Category split and seller comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader title="Sales by category" description="Share of item revenue" />
          {categorySplit.length === 0 ? (
            <EmptyState icon={PieChart} title="No sales in this period" />
          ) : (
            <ul className="space-y-3">
              {categorySplit.map((c) => (
                <li key={c.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-ink truncate min-w-0">
                      {c.name} <span className="text-muted font-normal">({c.qty} pcs)</span>
                    </span>
                    <span className="font-semibold text-ink shrink-0 tabular-nums">
                      {fmt(c.revenue)} <span className="text-muted font-normal text-xs">{c.percent}%</span>
                    </span>
                  </div>
                  <div className="w-full bg-sunken rounded-full h-1.5 mt-1.5 overflow-hidden">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${c.percent}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2 min-w-0">
          <CardHeader title={SELLERS.join(" vs ")} description={`${TIMEFRAME_LABEL[timeframe]} · side by side`} />
          <TableWrap>
            <thead>
              <tr>
                <Th>Figure</Th>
                {comparison.map((c) => (
                  <Th key={c.name} className="text-right">
                    {c.name}
                  </Th>
                ))}
                <Th className="w-1/3 min-w-[7rem]">Share</Th>
              </tr>
            </thead>
            <tbody>
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
                    <Td className="font-medium text-ink-soft whitespace-nowrap">{row.label}</Td>
                    {comparison.map((c, i) => (
                      <Td
                        key={c.name}
                        className={`text-right tabular-nums whitespace-nowrap ${values[i] === best ? "text-paid-600 font-bold" : "text-ink font-semibold"}`}
                      >
                        {row.format(values[i])}
                        {row.sub && <div className="text-[11px] text-muted font-normal">{row.sub(c)}</div>}
                      </Td>
                    ))}
                    <Td>
                      {total > 0 ? (
                        <div className="flex h-2 rounded-full overflow-hidden bg-sunken">
                          {values.map((v, i) => (
                            <div
                              key={comparison[i].name}
                              className={SHARE_COLORS[i % SHARE_COLORS.length]}
                              style={{ width: `${(Math.max(0, v) / total) * 100}%` }}
                              title={`${comparison[i].name}: ${Math.round((Math.max(0, v) / total) * 100)}%`}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
            {comparison.map((c, i) => (
              <span key={c.name} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full inline-block ${SHARE_COLORS[i % SHARE_COLORS.length]}`} aria-hidden="true" />
                {c.name}
              </span>
            ))}
            <span className="text-muted">Green figure = the better one</span>
          </div>
        </Card>
      </div>
    </Page>
  );
};

export default SalesReports;
