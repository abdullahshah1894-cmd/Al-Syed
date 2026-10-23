import { useState, useMemo } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import {
  User, DollarSign, Clock, Users, Receipt, Search, TrendingUp, ShoppingBag, HandCoins, Undo2, CalendarDays,
} from "lucide-react";
import { Page, PageHeader, Card, CardHeader, Badge, Input, Segmented, TableWrap, Th, Td, EmptyState } from "../components/ui";
import { isSettlement, realSales, saleBelongsTo, totalProfit, udhaarAdded, udhaarCollected, isUdhaarCollection } from "../utils/sales";
import { localDate, isBetween } from "../utils/dates";

const sameName = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
const sellerOf = (s) => s.sellerName || s.cashierName || "";
const num = (v) => Number(v || 0);
const sumBy = (list, fn) => (list || []).reduce((sum, x) => sum + num(fn(x)), 0);
// Return records carry the shop date ("date"); fall back to the timestamp
const returnDay = (r) => (r?.date ? String(r.date).slice(0, 10) : r?.at ? localDate(r.at) : null);
// Units still sold on a bill (returned units taken off)
const netItems = (s) =>
  (s.items || []).reduce((sum, i) => sum + Math.max(0, Number(i.quantity || i.qty || 1) - num(i.returnedQty)), 0);
const inRange = (day, range) => !!day && (!range.from || day >= range.from) && (!range.to || day <= range.to);

const RANGES = ["Today", "This Week", "This Month", "All Time", "Custom"];
const RANGE_LABELS = { Today: "Today", "This Week": "This week", "This Month": "This month", "All Time": "All time", Custom: "Custom" };

// Local-date bounds (YYYY-MM-DD, inclusive) of a range preset
const rangeOf = (preset, customFrom, customTo, today = localDate()) => {
  const now = new Date();
  if (preset === "Today") return { from: today, to: today };
  if (preset === "This Week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return { from: localDate(start), to: today };
  }
  if (preset === "This Month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === "Custom") {
    // From after To: use the two dates the right way round (the page shows a warning)
    if (customFrom && customTo && customFrom > customTo) return { from: customTo, to: customFrom };
    return { from: customFrom || null, to: customTo || null };
  }
  return { from: null, to: null };
};

// Every figure for one seller inside a date range
const sellerStats = (allSales, seller, range) => {
  const mine = (allSales || []).filter((s) => sameName(sellerOf(s), seller));
  const records = mine.filter((s) => isBetween(s.createdAt, range.from, range.to));
  const bills = realSales(records).filter((s) => s.paymentStatus !== "returned");
  const returns = mine.flatMap((s) =>
    (s.returns || []).filter((r) => inRange(returnDay(r), range)).map((r) => ({ ...r, sale: s }))
  );
  const revenue = sumBy(bills, (s) => s.grandTotal);
  const customerKeys = new Set();
  let walkIns = 0;
  bills.forEach((s) => {
    const id = s.customerId || s.customer;
    const name = (s.customerName || "").trim().toLowerCase();
    if (id) customerKeys.add(`id:${id}`);
    else if (name && name !== "walk-in customer") customerKeys.add(`name:${name}`);
    else walkIns += 1;
  });
  const lastSale = bills.reduce(
    (latest, s) => (!latest || new Date(s.createdAt) > new Date(latest.createdAt) ? s : latest),
    null
  );
  return {
    records,
    bills: bills.length,
    revenue,
    profit: totalProfit(bills),
    items: sumBy(bills, netItems),
    udhaarGiven: sumBy(bills, udhaarAdded),
    udhaarCollected: sumBy(records, udhaarCollected),
    collections: records.filter(isUdhaarCollection).length,
    returnsCount: returns.length,
    returnsAmount: sumBy(returns, (r) => r.amount),
    customers: customerKeys.size,
    walkIns,
    avgBill: bills.length ? Math.round(revenue / bills.length) : 0,
    lastSale,
  };
};

const Sellers = () => {
  const { allSales, allCustomers, shopSettings, activeSeller } = useApp();
  const { isAdmin } = useAuth();
  const curr = shopSettings.currencySymbol || "Rs.";
  const fmt = (n) => `${curr} ${Math.round(num(n)).toLocaleString()}`;

  // The header seller filter: when one seller is picked there, this page shows only that seller
  const headerSeller =
    activeSeller && activeSeller !== "All Sellers" && activeSeller !== "All"
      ? SELLERS.find((n) => sameName(n, activeSeller)) || activeSeller
      : null;
  const visibleSellers = useMemo(() => (headerSeller ? [headerSeller] : SELLERS), [headerSeller]);
  const [pickedSeller, setSelectedSeller] = useState(SELLERS[0] || "");
  const selectedSeller = headerSeller || pickedSeller;
  const [searchTerm, setSearchTerm] = useState("");
  const [preset, setPreset] = useState("This Month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // "today" is part of the key so Today / This Week / This Month move on after midnight
  const today = localDate();
  const rangeSwapped = preset === "Custom" && !!customFrom && !!customTo && customFrom > customTo;
  const range = useMemo(() => rangeOf(preset, customFrom, customTo, today), [preset, customFrom, customTo, today]);
  const rangeLabel =
    preset === "Custom"
      ? `${range.from || "start"} → ${range.to || "today"}`
      : RANGE_LABELS[preset] || preset;

  const stats = useMemo(
    () => Object.fromEntries(visibleSellers.map((seller) => [seller, sellerStats(allSales, seller, range)])),
    [allSales, range, visibleSellers]
  );
  const current = stats[selectedSeller] || sellerStats(allSales, selectedSeller, range);

  // Bills in the range saved under no / another seller name
  const otherBills = useMemo(
    () =>
      realSales(allSales).filter(
        (s) => isBetween(s.createdAt, range.from, range.to) && !SELLERS.some((n) => sameName(sellerOf(s), n))
      ).length,
    [allSales, range]
  );

  // Customers of this seller, biggest balance first (current balances). A customer without an
  // assigned seller belongs to the seller of their latest bill / receipt (same rule as Udhaar page).
  const sellerCustomers = useMemo(() => {
    const ownerOf = (c) => {
      if ((c.sellerName || "").trim()) return c.sellerName;
      let latest = null;
      (allSales || []).forEach((s) => {
        if (!sellerOf(s) || !saleBelongsTo(s, c)) return;
        if (!latest || new Date(s.createdAt) > new Date(latest.createdAt)) latest = s;
      });
      return latest ? sellerOf(latest) : "";
    };
    return (allCustomers || [])
      .filter((c) => sameName(ownerOf(c), selectedSeller))
      .sort((a, b) => num(b.totalPending) - num(a.totalPending));
  }, [allCustomers, allSales, selectedSeller]);
  const sellerCustomersPending = sumBy(sellerCustomers, (c) => c.totalPending);

  const cleanSearch = searchTerm.replace(/[-\s]/g, "").toLowerCase();
  const filteredTransactions = useMemo(
    () =>
      [...current.records]
        .filter(
          (s) =>
            !cleanSearch ||
            (s.billNumber || "").replace(/[-\s]/g, "").toLowerCase().includes(cleanSearch) ||
            (s.customerName || "").toLowerCase().includes(searchTerm.trim().toLowerCase())
        )
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [current.records, cleanSearch, searchTerm]
  );

  const metricRows = (st) => [
    { label: "Bills", value: st.bills.toLocaleString(), icon: Receipt },
    { label: "Revenue", value: fmt(st.revenue), icon: DollarSign, tone: "text-ink" },
    ...(isAdmin ? [{ label: "Profit", value: fmt(st.profit), icon: TrendingUp, tone: st.profit < 0 ? "text-saffron-700" : "text-paid-600" }] : []),
    { label: "Items sold", value: st.items.toLocaleString(), icon: ShoppingBag },
    { label: "Average bill", value: fmt(st.avgBill), icon: DollarSign },
    { label: "Udhaar given", value: fmt(st.udhaarGiven), icon: Clock, tone: st.udhaarGiven > 0 ? "text-khata-600" : undefined },
    { label: "Udhaar collected", value: fmt(st.udhaarCollected), sub: `${st.collections} payment(s)`, icon: HandCoins, tone: "text-paid-600" },
    { label: "Returns", value: fmt(st.returnsAmount), sub: `${st.returnsCount} return(s)`, icon: Undo2, tone: st.returnsCount > 0 ? "text-saffron-700" : undefined },
    { label: "Customers", value: st.customers.toLocaleString(), sub: st.walkIns ? `+ ${st.walkIns} walk-in bill(s)` : "", icon: Users },
  ];

  const typeBadge = (sale, settlement, returned) =>
    settlement ? (
      <Badge tone="paid">Udhaar payment</Badge>
    ) : returned ? (
      <Badge tone="saffron">Returned</Badge>
    ) : (
      <Badge>{sale.paymentMethod}</Badge>
    );
  const saleDate = (sale) =>
    new Date(sale.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <Page>
      <PageHeader
        title="Sellers"
        description={`Bills, revenue, Udhaar, returns and customers for each seller · ${rangeLabel}`}
      />

      {/* Date filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Segmented options={RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] || r }))} value={preset} onChange={setPreset} className="self-start" />
        {preset === "Custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <CalendarDays size={16} className="text-muted" aria-hidden="true" />
            <Input
              type="date"
              aria-label="From date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-auto min-w-[9.5rem]"
            />
            <span>to</span>
            <Input
              type="date"
              aria-label="To date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-auto min-w-[9.5rem]"
            />
            {rangeSwapped && (
              <span role="alert" className="basis-full text-xs font-semibold text-saffron-700">
                &quot;From&quot; is after &quot;To&quot;, so the dates were swapped: showing {range.from} to {range.to}.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Seller cards (click to select) */}
      {headerSeller && (
        <p className="text-sm text-ink-soft bg-brand-50 border border-brand-100 rounded-xl px-3 py-2">
          Showing {headerSeller} only (seller picked at the top). Choose &quot;All sellers&quot; there to compare sellers.
        </p>
      )}
      <div className={`grid grid-cols-1 gap-4 ${visibleSellers.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {visibleSellers.map((seller) => {
          const st = stats[seller];
          const active = seller === selectedSeller;
          return (
            <button
              type="button"
              key={seller}
              onClick={() => setSelectedSeller(seller)}
              aria-pressed={active}
              className={`text-left w-full bg-surface border rounded-2xl p-4 sm:p-5 shadow-card transition-colors ${
                active ? "border-brand-500 ring-2 ring-brand-100" : "border-line hover:border-brand-200"
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${
                      active ? "bg-brand-600 text-white" : "bg-sunken text-ink-soft"
                    }`}
                  >
                    <User size={18} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold text-ink leading-tight">{seller}</div>
                    <div className="text-xs text-muted">
                      {st.lastSale
                        ? `Last sale ${new Date(st.lastSale.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                        : "No sales in this period"}
                    </div>
                  </div>
                </div>
                {active && <Badge tone="brand">Selected</Badge>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {metricRows(st).map(({ label, value, sub, icon: Icon, tone }) => (
                  <div key={label} className="p-3 bg-sunken rounded-xl min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
                      <Icon size={13} aria-hidden="true" /> {label}
                    </div>
                    <div className={`mt-1 text-sm sm:text-base font-bold tabular-nums break-words ${tone || "text-ink"}`}>{value}</div>
                    {sub && <div className="text-[11px] text-muted">{sub}</div>}
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {otherBills > 0 && (
        <p className="text-sm text-saffron-700 bg-saffron-50 border border-saffron-100 rounded-xl px-3 py-2">
          {otherBills} bill(s) in this period have no seller or a different seller name and are not counted above.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customers list */}
        <Card className="lg:col-span-1 flex flex-col lg:h-[600px]">
          <CardHeader
            className="mb-3"
            title={`Customers of ${selectedSeller}`}
            description={`${sellerCustomers.length} customer(s) · Udhaar owed today ${fmt(sellerCustomersPending)} (current balances, not limited to ${rangeLabel})`}
          />
          <div className="flex-1 max-h-[420px] lg:max-h-none overflow-y-auto -mx-1 px-1 custom-scrollbar">
            {sellerCustomers.length === 0 ? (
              <EmptyState icon={Users} title="No customers yet" description={`Customers who buy from ${selectedSeller} will show here.`} />
            ) : (
              <ul className="divide-y divide-line">
                {sellerCustomers.map((c) => (
                  <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink text-sm truncate">{c.name}</div>
                      <div className="text-xs text-muted">{c.phone || "No phone"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-muted">Udhaar</div>
                      <span className={`text-sm font-semibold tabular-nums ${num(c.totalPending) > 0 ? "text-khata-600" : "text-paid-600"}`}>
                        {fmt(c.totalPending)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Transactions in the range */}
        <Card className="lg:col-span-2 flex flex-col lg:h-[600px]">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h2 className="text-base font-semibold">{selectedSeller}&apos;s bills and payments</h2>
              <Badge>
                {filteredTransactions.length} · {rangeLabel}
              </Badge>
            </div>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
              <Input
                type="text"
                aria-label="Search bill or customer"
                placeholder="Search bill or customer"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <EmptyState icon={Receipt} title="No bills in this period" description="Pick another date range or seller." />
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              {/* Phones: cards */}
              <ul className="sm:hidden divide-y divide-line">
                {filteredTransactions.map((sale) => {
                  const settlement = isSettlement(sale);
                  const returned = sale.paymentStatus === "returned";
                  const returnedAmount = sumBy(sale.returns, (r) => r.amount);
                  return (
                    <li key={sale.id} className="py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-ink text-sm truncate">{sale.customerName}</div>
                          <div className="font-mono text-xs text-brand-700">{sale.billNumber}</div>
                        </div>
                        <div className={`text-sm font-bold tabular-nums shrink-0 ${settlement ? "text-paid-600" : "text-ink"}`}>
                          {fmt(settlement ? sale.paidAmount : sale.grandTotal)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          {typeBadge(sale, settlement, returned)}
                          {!settlement && !returned && returnedAmount > 0 && (
                            <span className="text-saffron-700">Returned {fmt(returnedAmount)}</span>
                          )}
                        </div>
                        {!settlement && num(sale.dueAmount) > 0 && (
                          <span className="text-khata-600 font-semibold">Due {fmt(sale.dueAmount)}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted">{saleDate(sale)}</div>
                    </li>
                  );
                })}
              </ul>

              {/* Tablet and up: table */}
              <div className="hidden sm:block">
                <TableWrap>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <Th>Bill #</Th>
                      <Th>Customer</Th>
                      <Th>Date</Th>
                      <Th>Type</Th>
                      <Th className="text-right">Amount</Th>
                      <Th className="text-right">Due</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((sale) => {
                      const settlement = isSettlement(sale);
                      const returned = sale.paymentStatus === "returned";
                      const returnedAmount = sumBy(sale.returns, (r) => r.amount);
                      return (
                        <tr key={sale.id} className="hover:bg-sunken/60 transition-colors">
                          <Td className="font-mono text-xs text-brand-700 whitespace-nowrap">{sale.billNumber}</Td>
                          <Td className="font-semibold text-ink">{sale.customerName}</Td>
                          <Td className="text-xs text-muted whitespace-nowrap">{saleDate(sale)}</Td>
                          <Td>
                            {typeBadge(sale, settlement, returned)}
                            {!settlement && !returned && returnedAmount > 0 && (
                              <div className="text-[11px] text-saffron-700 mt-0.5 whitespace-nowrap">Returned {fmt(returnedAmount)}</div>
                            )}
                          </Td>
                          <Td className={`text-right font-semibold tabular-nums whitespace-nowrap ${settlement ? "text-paid-600" : "text-ink"}`}>
                            {fmt(settlement ? sale.paidAmount : sale.grandTotal)}
                          </Td>
                          <Td className="text-right whitespace-nowrap">
                            {!settlement && num(sale.dueAmount) > 0 ? (
                              <span className="text-khata-600 font-semibold tabular-nums">{fmt(sale.dueAmount)}</span>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
};

export default Sellers;
