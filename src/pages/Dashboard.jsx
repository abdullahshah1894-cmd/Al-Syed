import { useMemo } from "react";
import { useApp, getProductStock } from "../context/AppContext";
import { localDate } from "../utils/dates";
import { realSales, totalProfit, itemCount, udhaarAdded, udhaarCollected, saleProfit } from "../utils/sales";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  Boxes,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Calculator,
  ShoppingCart,
  Search,
  ArrowRight,
  Receipt,
  Wrench,
  HandCoins,
  Undo2,
  Truck,
  Wallet,
  Users,
  Banknote,
} from "lucide-react";
import { Page, PageHeader, Card, CardHeader, Stat, Badge, Button, EmptyState } from "../components/ui";

// ── Helpers (all dates are local shop dates, YYYY-MM-DD) ──────────────────────
const num = (v) => Number(v || 0);
const sumBy = (list, fn) => (list || []).reduce((sum, x) => sum + num(fn(x)), 0);
const saleDay = (s) => (s?.createdAt ? localDate(s.createdAt) : null);
const expenseDay = (e) => e.expenseDate || (e.createdAt ? localDate(e.createdAt) : null);
// Return records carry the shop date ("date"); fall back to the timestamp
const returnDay = (r) => (r?.date ? String(r.date).slice(0, 10) : r?.at ? localDate(r.at) : null);
// The local date n days before a YYYY-MM-DD day (noon avoids daylight-saving edges)
const daysBefore = (day, n) => {
  const d = new Date(`${day}T12:00:00`);
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
    udhaarCollected: sumBy(dayRecords, udhaarCollected),
    returnsCount: returns.length,
    returnsAmount: sumBy(returns, (r) => r.amount),
  };
};

const ISSUE_STATUSES = [
  { status: "Pending", cls: "bg-saffron-50 text-saffron-700" },
  { status: "Under Inspection", cls: "bg-brand-50 text-brand-700" },
  { status: "Repaired", cls: "bg-paid-50 text-paid-700" },
];

// A small "See all" link-button for card headers
const MoreLink = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-10 items-center gap-1 rounded-lg px-2 -mr-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
  >
    {children}
    <ArrowRight size={15} aria-hidden="true" />
  </button>
);

// One cell of the "Shop position" ledger strip; a button when it leads somewhere
const PositionCell = ({ icon: Icon, label, value, hint, valueClass = "text-ink", onClick }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`bg-surface p-4 text-left min-w-0 ${onClick ? "hover:bg-sunken transition-colors" : ""}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon size={14} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1 font-display text-lg font-bold leading-tight break-words ${valueClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Tag>
  );
};

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
  // Recomputed when the date changes too (the page can stay open past midnight)
  const yesterday = useMemo(() => dayStats(records, spentList, daysBefore(todayStr, 1)), [records, spentList, todayStr]);
  const revenueChange = changeVs(today.revenue, yesterday.revenue);

  // Last 7 local days, oldest first
  const trend = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const day = daysBefore(todayStr, i);
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
  }, [records, todayStr]);
  const trendMax = Math.max(1, ...trend.map((d) => d.revenue));
  const trendTotal = sumBy(trend, (d) => d.revenue);

  // Stock
  const liveProducts = useMemo(() => (products || []).filter((p) => !p.isDeleted), [products]);
  // Units in the shop (a negative count is 0); a sale price of 0 means "not priced", not a Rs 0 sale
  const unitsOf = (p) => Math.max(0, getProductStock(p) || 0);
  const inventoryCost = sumBy(liveProducts, (p) => num(p.purchasePrice) * unitsOf(p));
  const inventoryRetail = sumBy(liveProducts, (p) => (num(p.salePrice) > 0 ? num(p.salePrice) * unitsOf(p) : 0));
  const inventoryUnits = sumBy(liveProducts, unitsOf);
  const unpricedProducts = liveProducts.filter((p) => num(p.salePrice) <= 0 && unitsOf(p) > 0).length;
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

  const readyForPickup = issueCounts.find((s) => s.status === "Repaired").count;
  const trendBills = sumBy(trend, (d) => d.bills);

  return (
    <Page>
      <PageHeader
        title={`Welcome back, ${user?.name || ""}`}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{shopSettings.shopName}</span>
            <span aria-hidden="true">·</span>
            <span>{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "short", day: "numeric" })}</span>
            <Badge tone="brand">{user?.role === "admin" ? "Owner" : "Cashier"}</Badge>
            {sellerFiltered && <Badge tone="saffron">Sales and expenses: {activeSeller} only</Badge>}
          </span>
        }
        actions={
          <>
            <Button icon={ShoppingCart} onClick={() => navigate("/pos")}>New sale</Button>
            <Button variant="secondary" icon={Search} onClick={() => navigate("/imei-checker")}>Check IMEI</Button>
            <Button variant="secondary" icon={Wrench} onClick={() => navigate("/mobile-issues")}>Repair ticket</Button>
          </>
        }
      />

      {/* Today: what the owner checks first */}
      <section aria-labelledby="today-heading" className="space-y-3">
        <h2 id="today-heading" className="text-base font-semibold">Today</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Stat
            className="p-5 sm:p-6"
            icon={Banknote}
            label="Today's sales"
            onClick={() => navigate(isAdmin ? "/reports" : "/bills")}
            value={<span className="text-3xl sm:text-4xl">{fmt(today.revenue)}</span>}
            hint={
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span>{today.bills} bill(s) today</span>
                <span aria-hidden="true">·</span>
                {revenueChange === null ? (
                  <span>Yesterday {fmt(yesterday.revenue)}</span>
                ) : (
                  <span className={`inline-flex items-center gap-1 font-medium ${revenueChange >= 0 ? "text-paid-600" : "text-saffron-700"}`}>
                    {revenueChange >= 0 ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
                    {revenueChange >= 0 ? "+" : ""}
                    {revenueChange}% vs yesterday ({fmt(yesterday.revenue)})
                  </span>
                )}
              </span>
            }
          />
          <Stat
            className="p-5 sm:p-6"
            icon={Clock}
            label="Udhaar given today"
            tone={today.udhaarGiven > 0 ? "khata" : "neutral"}
            onClick={() => navigate("/pending-payments")}
            value={<span className="text-3xl sm:text-4xl">{fmt(today.udhaarGiven)}</span>}
            hint={<span className="text-sm">Unpaid amount on today's bills</span>}
          />
        </div>

        <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={HandCoins}
            label="Udhaar collected"
            tone={today.udhaarCollected > 0 ? "paid" : "neutral"}
            onClick={() => navigate("/pending-payments")}
            value={<span className="text-xl">{fmt(today.udhaarCollected)}</span>}
            hint="Payments received today"
          />
          <Stat
            icon={TrendingUp}
            label="Today's profit"
            tone={isAdmin && today.netProfit < 0 ? "saffron" : "neutral"}
            onClick={isAdmin ? () => navigate("/reports") : undefined}
            value={<span className="text-xl">{isAdmin ? fmt(today.netProfit) : "••••••"}</span>}
            hint={isAdmin ? `Gross ${fmt(today.grossProfit)} − expenses ${fmt(today.expenses)}` : "Owner only"}
          />
          <Stat
            icon={Undo2}
            label="Returns"
            onClick={() => navigate("/bills")}
            value={<span className="text-xl">{fmt(today.returnsAmount)}</span>}
            hint={`${today.returnsCount} return(s) today`}
          />
          <Stat
            icon={Wallet}
            label="Expenses"
            onClick={() => navigate("/expenses")}
            value={<span className="text-xl">{fmt(today.expenses)}</span>}
            hint={`Yesterday ${fmt(yesterday.expenses)}`}
          />
        </div>
      </section>

      {/* Shop position: one ledger strip instead of six identical cards */}
      <Card padded={false} className="overflow-hidden">
        <div className="px-4 pt-4 sm:px-5 sm:pt-5">
          <CardHeader title="Shop position" description="Stock, Udhaar and what the shop owes, right now" className="mb-3" />
        </div>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-px bg-line border-t border-line">
          <PositionCell
            icon={Boxes}
            label="Stock value"
            onClick={() => navigate(isAdmin ? "/valuation" : "/inventory")}
            value={isAdmin ? fmt(inventoryCost) : `${inventoryUnits.toLocaleString()} units`}
            hint={
              <>
                {isAdmin ? `At cost · ${inventoryUnits.toLocaleString()} units` : `${liveProducts.length} products`}
                <br />
                Retail {fmt(inventoryRetail)}
                {unpricedProducts > 0 && (
                  <>
                    <br />
                    <span className="text-saffron-700">
                      {unpricedProducts} product{unpricedProducts === 1 ? " has" : "s have"} no sale price
                    </span>
                  </>
                )}
              </>
            }
          />
          <PositionCell
            icon={AlertTriangle}
            label="Low stock"
            onClick={() => navigate("/inventory")}
            value={`${lowStockProducts.length} item(s)`}
            valueClass={lowStockProducts.length ? "text-saffron-700" : "text-ink"}
            hint={lowStockProducts.length ? `${outOfStock} out of stock` : "All above minimum"}
          />
          <PositionCell
            icon={Clock}
            label="Udhaar pending"
            onClick={() => navigate("/pending-payments")}
            value={fmt(totalUdhaarPending)}
            valueClass={totalUdhaarPending > 0 ? "text-khata-600" : "text-ink"}
            hint={`Across ${debtors.length} customer(s)${sellerFiltered ? " · all sellers" : ""}`}
          />
          <PositionCell
            icon={Truck}
            label="Owed to suppliers"
            value={isAdmin ? fmt(supplierOwed) : "••••••"}
            hint={isAdmin ? `${suppliersOwedCount} supplier(s) · bought this month ${fmt(purchasedThisMonth)}` : "Owner only"}
          />
          <PositionCell
            icon={Wrench}
            label="Open repairs"
            onClick={() => navigate("/mobile-issues")}
            value={`${openTickets} ticket(s)`}
            hint={`${readyForPickup} ready for pickup`}
          />
          <PositionCell
            icon={Calculator}
            label="Zakat estimate (2.5%)"
            onClick={isAdmin ? () => navigate("/zakat") : undefined}
            value={isAdmin ? fmt(estimatedZakat) : "••••••"}
            hint={isAdmin ? "Stock cost + receivables only" : "Owner only"}
          />
        </div>
      </Card>

      {/* 7-day trend & top debtors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="lg:col-span-2 min-w-0">
          <CardHeader
            title="Sales, last 7 days"
            description={`Total ${fmt(trendTotal)} · ${trendBills} bill(s)`}
            actions={
              <span className="flex items-center gap-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-200" aria-hidden="true" />Earlier days</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" aria-hidden="true" />Today</span>
              </span>
            }
          />
          <div className="relative h-52">
            {/* Light grid: quarter lines of the highest day */}
            <div className="absolute inset-x-0 top-0 bottom-7 flex flex-col justify-between pointer-events-none" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="border-t border-dashed border-line" />
              ))}
              <div className="border-t border-line-strong" />
            </div>
            <div className="absolute inset-0 flex items-stretch justify-between gap-1.5 sm:gap-4">
              {trend.map((d, i) => {
                const h = d.revenue > 0 ? Math.max(3, Math.round((d.revenue / trendMax) * 100)) : 0;
                const isTodayBar = d.day === todayStr;
                const tip = `${isTodayBar ? "Today" : d.label}: ${fmt(d.revenue)}, ${d.bills} bill(s)${isAdmin ? `, profit ${fmt(d.profit)}` : ""}`;
                return (
                  <div
                    key={d.day}
                    tabIndex={0}
                    aria-label={tip}
                    className="relative flex-1 min-w-0 flex flex-col items-center group outline-none"
                  >
                    <div className="relative w-full flex-1 flex items-end justify-center">
                      <div
                        role="tooltip"
                        className={`absolute ${i < 2 ? "left-0" : i > 4 ? "right-0" : "left-1/2 -translate-x-1/2"} opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity bg-surface border border-line text-xs px-2.5 py-1.5 rounded-lg shadow-pop z-20 pointer-events-none whitespace-nowrap`}
                        style={{ bottom: `calc(${h}% + 6px)` }}
                      >
                        <div className="font-semibold text-ink">{fmt(d.revenue)} · {d.bills} bill(s)</div>
                        {isAdmin && <div className="text-ink-soft">Profit {fmt(d.profit)}</div>}
                      </div>
                      <div
                        style={{ height: `${h}%` }}
                        className={`w-2/3 max-w-[40px] rounded-t transition-colors ${
                          isTodayBar ? "bg-brand-500 group-hover:bg-brand-600" : "bg-brand-200 group-hover:bg-brand-300"
                        }`}
                      />
                    </div>
                    <span className={`h-7 pt-1.5 text-xs ${isTodayBar ? "font-semibold text-ink" : "text-muted"}`}>
                      {isTodayBar ? "Today" : d.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {trendTotal === 0 && <p className="mt-3 text-sm text-muted text-center">No sales in the last 7 days.</p>}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Top Udhaar"
            description="Customers who owe the most"
            actions={<Badge tone={debtors.length ? "khata" : "neutral"}>{debtors.length} customer(s)</Badge>}
          />
          {debtors.length === 0 ? (
            <EmptyState icon={Users} title="No Udhaar outstanding" description="Every customer has paid in full." />
          ) : (
            <ul className="divide-y divide-line -mt-1 flex-1">
              {debtors.slice(0, 5).map((c) => (
                <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{c.name}</p>
                    <p className="text-xs text-muted truncate">
                      {c.phone || "No phone"}
                      {c.sellerName ? ` · ${c.sellerName}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-khata-600 shrink-0 tabular-nums">{fmt(c.totalPending)}</span>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" icon={HandCoins} className="w-full mt-4" onClick={() => navigate("/pending-payments")}>
            Collect payments
          </Button>
        </Card>
      </div>

      {/* Recent bills & low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="lg:col-span-2 min-w-0">
          <CardHeader
            title="Recent bills"
            description={`Latest ${recentBills.length}`}
            actions={<MoreLink onClick={() => navigate("/bills")}>All bills</MoreLink>}
          />
          {recentBills.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No bills yet"
              description="Bills show up here as soon as you make a sale."
              action={<Button icon={ShoppingCart} onClick={() => navigate("/pos")}>Start a sale</Button>}
            />
          ) : (
            <ul className="divide-y divide-line -mt-1">
              {recentBills.map((sale) => {
                const returned = sale.paymentStatus === "returned";
                const due = num(sale.dueAmount);
                return (
                  <li key={sale.id} className="py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-brand-700">{sale.billNumber}</span>
                        <Badge tone={returned ? "saffron" : due > 0 ? "khata" : "paid"}>
                          {returned ? "Returned" : due > 0 ? `Due ${fmt(due)}` : sale.paymentMethod}
                        </Badge>
                        {(sale.returns || []).length > 0 && !returned && <Badge tone="saffron">Part returned</Badge>}
                        {(sale.sellerName || sale.cashierName) && (
                          <span className="text-xs text-muted">{sale.sellerName || sale.cashierName}</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-ink mt-1 truncate">{sale.customerName}</p>
                      <p className="text-xs text-muted truncate">
                        {(sale.items || []).map((i) => i.productName || i.name).join(", ")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display text-base font-bold text-ink tabular-nums">{fmt(sale.grandTotal)}</div>
                      <div className="text-xs text-muted mt-0.5">{itemCount(sale)} item(s)</div>
                      <div className="text-xs text-muted">
                        {sale.createdAt
                          ? new Date(sale.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                          : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Low stock"
            description="At or below the minimum you set"
            actions={<Badge tone={lowStockProducts.length ? "saffron" : "neutral"}>{lowStockProducts.length}</Badge>}
          />
          {lowStockProducts.length === 0 ? (
            <EmptyState icon={Boxes} title="Stock looks good" description="Every product is above its minimum stock." />
          ) : (
            <ul className="divide-y divide-line -mt-1 max-h-80 overflow-y-auto custom-scrollbar pr-1 flex-1">
              {lowStockProducts.map((prod) => {
                const stock = getProductStock(prod);
                return (
                  <li key={prod.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{prod.name}</p>
                      <p className="text-xs text-muted truncate">{[prod.brand, prod.category].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {stock === 0 ? (
                        <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold bg-saffron-600 text-white">Out of stock</span>
                      ) : (
                        <Badge tone="saffron">{stock} left</Badge>
                      )}
                      <p className="text-xs text-muted mt-0.5">Min {prod.minStockAlert}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Button variant="secondary" icon={Boxes} className="w-full mt-4" onClick={() => navigate("/inventory")}>
            Manage stock
          </Button>
        </Card>
      </div>

      {/* Repairs & warranties */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <Card>
          <CardHeader
            title="Repair tickets"
            description="Phones in the shop for repair"
            actions={<MoreLink onClick={() => navigate("/mobile-issues")}>Open repairs</MoreLink>}
          />
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {issueCounts.map((s) => (
              <div key={s.status} className={`p-3 rounded-xl text-center ${s.cls}`}>
                <div className="font-display text-2xl font-bold">{s.count}</div>
                <div className="text-xs font-semibold mt-0.5 leading-tight">
                  {s.status === "Repaired" ? "Ready for pickup" : s.status === "Under Inspection" ? "Under inspection" : s.status}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            {(issues || []).filter((i) => i.status === "Delivered").length} delivered ·{" "}
            {(issues || []).filter((i) => i.status === "Rejected").length} rejected (closed)
          </p>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Warranties expiring soon"
            description="Within the next 30 days"
            actions={<Badge tone={expiringWarranties.length ? "saffron" : "neutral"}>{expiringWarranties.length}</Badge>}
          />
          {expiringWarranties.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Nothing expiring" description="No warranty expires in the next 30 days." />
          ) : (
            <ul className="divide-y divide-line -mt-1 max-h-64 overflow-y-auto custom-scrollbar pr-1 flex-1">
              {expiringWarranties.slice(0, 6).map((w) => (
                <li key={w.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{w.productName || "Product"}</p>
                    <p className="text-xs text-muted truncate">
                      {w.customerName || "Customer"} · <span className="font-mono">{w.imei}</span>
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-saffron-700 shrink-0">Expires {w.warrantyExpiryDate}</span>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" icon={ShieldCheck} className="w-full mt-4" onClick={() => navigate("/warranties")}>
            View warranties
          </Button>
        </Card>
      </div>
    </Page>
  );
};

export default Dashboard;
