import { useState, useMemo } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import {
  User, DollarSign, Clock, Users, Receipt, Search, TrendingUp, ShoppingBag, HandCoins, Undo2, CalendarDays,
} from "lucide-react";
import { isSettlement, realSales, totalProfit, udhaarAdded } from "../utils/sales";
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

// Local-date bounds (YYYY-MM-DD, inclusive) of a range preset
const rangeOf = (preset, customFrom, customTo) => {
  const now = new Date();
  const today = localDate(now);
  if (preset === "Today") return { from: today, to: today };
  if (preset === "This Week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return { from: localDate(start), to: today };
  }
  if (preset === "This Month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === "Custom") return { from: customFrom || null, to: customTo || null };
  return { from: null, to: null };
};

// Every figure for one seller inside a date range
const sellerStats = (allSales, seller, range) => {
  const mine = (allSales || []).filter((s) => sameName(sellerOf(s), seller));
  const records = mine.filter((s) => isBetween(s.createdAt, range.from, range.to));
  const bills = realSales(records).filter((s) => s.paymentStatus !== "returned");
  const settlements = records.filter(isSettlement);
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
    udhaarCollected: sumBy(settlements, (s) => s.paidAmount),
    collections: settlements.length,
    returnsCount: returns.length,
    returnsAmount: sumBy(returns, (r) => r.amount),
    customers: customerKeys.size,
    walkIns,
    avgBill: bills.length ? Math.round(revenue / bills.length) : 0,
    lastSale,
  };
};

const Sellers = () => {
  const { allSales, allCustomers, shopSettings } = useApp();
  const { isAdmin } = useAuth();
  const curr = shopSettings.currencySymbol || "Rs.";
  const fmt = (n) => `${curr} ${Math.round(num(n)).toLocaleString()}`;

  const [selectedSeller, setSelectedSeller] = useState(SELLERS[0] || "");
  const [searchTerm, setSearchTerm] = useState("");
  const [preset, setPreset] = useState("This Month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(() => rangeOf(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const rangeLabel =
    preset === "Custom"
      ? `${range.from || "start"} → ${range.to || "today"}`
      : preset;

  const stats = useMemo(
    () => Object.fromEntries(SELLERS.map((seller) => [seller, sellerStats(allSales, seller, range)])),
    [allSales, range]
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

  // Customers assigned to this seller, biggest balance first (current balances)
  const sellerCustomers = useMemo(
    () =>
      (allCustomers || [])
        .filter((c) => sameName(c.sellerName, selectedSeller))
        .sort((a, b) => num(b.totalPending) - num(a.totalPending)),
    [allCustomers, selectedSeller]
  );
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
    { label: "Bills", value: st.bills.toLocaleString(), icon: Receipt, color: "text-indigo-400" },
    { label: "Revenue", value: fmt(st.revenue), icon: DollarSign, color: "text-emerald-400" },
    ...(isAdmin ? [{ label: "Profit", value: fmt(st.profit), icon: TrendingUp, color: st.profit < 0 ? "text-rose-400" : "text-indigo-300" }] : []),
    { label: "Items Sold", value: st.items.toLocaleString(), icon: ShoppingBag, color: "text-cyan-400" },
    { label: "Avg Bill", value: fmt(st.avgBill), icon: DollarSign, color: "text-amber-400" },
    { label: "Udhaar Given", value: fmt(st.udhaarGiven), icon: Clock, color: "text-rose-400" },
    { label: "Udhaar Collected", value: fmt(st.udhaarCollected), sub: `${st.collections} payment(s)`, icon: HandCoins, color: "text-emerald-400" },
    { label: "Returns", value: fmt(st.returnsAmount), sub: `${st.returnsCount} return(s)`, icon: Undo2, color: "text-orange-400" },
    { label: "Customers", value: st.customers.toLocaleString(), sub: st.walkIns ? `+ ${st.walkIns} walk-in bill(s)` : "", icon: Users, color: "text-cyan-300" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <User size={24} className="text-indigo-400" />
            <h1 className="text-xl font-bold text-slate-100">Sellers Performance</h1>
          </div>
          <p className="text-xs text-slate-400">
            Bills, revenue, Udhaar, returns and customers for each seller — {rangeLabel}
          </p>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-2">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 flex-wrap">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setPreset(r)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  preset === r ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {preset === "Custom" && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <CalendarDays size={14} className="text-indigo-400" />
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <span>to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Seller cards (click to select) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SELLERS.map((seller) => {
          const st = stats[seller];
          const active = seller === selectedSeller;
          return (
            <div
              key={seller}
              onClick={() => setSelectedSeller(seller)}
              className={`bg-slate-900 border rounded-3xl p-5 shadow-sm cursor-pointer transition-all ${
                active ? "border-indigo-500/70 shadow-indigo-500/10" : "border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${active ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-300"}`}>
                    <User size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-100">{seller}</div>
                    <div className="text-[11px] text-slate-500">
                      {st.lastSale
                        ? `Last sale ${new Date(st.lastSale.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                        : "No sales in this period"}
                    </div>
                  </div>
                </div>
                {active && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Selected
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {metricRows(st).map(({ label, value, sub, icon: Icon, color }) => (
                  <div key={label} className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <Icon size={12} className={color} /> {label}
                    </div>
                    <div className={`text-sm font-black mt-1 ${color}`}>{value}</div>
                    {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {otherBills > 0 && (
        <p className="text-xs text-amber-400">
          {otherBills} bill(s) in this period have no seller or a different seller name and are not counted above.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Customers List */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col h-[600px]">
          <h2 className="text-sm font-bold text-slate-100 mb-1 flex items-center gap-2">
            <Users size={16} className="text-indigo-400" /> Customers of {selectedSeller}
          </h2>
          <p className="text-[11px] text-slate-500 mb-4">
            {sellerCustomers.length} customer(s) • current Udhaar {fmt(sellerCustomersPending)}
          </p>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {sellerCustomers.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">No customers yet</div>
            ) : (
              sellerCustomers.map((c) => (
                <div key={c.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="font-bold text-slate-100 text-sm">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.phone || "No phone"}</div>
                  <div className="mt-2 flex justify-between items-center text-xs">
                    <span className="text-slate-500">Udhaar:</span>
                    <span className={num(c.totalPending) > 0 ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                      {fmt(c.totalPending)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Transactions in the range */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col h-[600px]">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Receipt size={16} className="text-indigo-400" /> {selectedSeller}'s Transactions
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {filteredTransactions.length} • {rangeLabel}
              </span>
            </h2>
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search bill or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 uppercase bg-slate-950 sticky top-0 z-10">
                <tr>
                  <th className="p-3 font-semibold">Bill #</th>
                  <th className="p-3 font-semibold">Customer</th>
                  <th className="p-3 font-semibold">Date</th>
                  <th className="p-3 font-semibold">Type</th>
                  <th className="p-3 font-semibold">Amount</th>
                  <th className="p-3 font-semibold">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-500">No transactions in this period</td>
                  </tr>
                ) : (
                  filteredTransactions.map((sale) => {
                    const settlement = isSettlement(sale);
                    const returned = sale.paymentStatus === "returned";
                    const returnedAmount = sumBy(sale.returns, (r) => r.amount);
                    return (
                      <tr key={sale.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3 font-mono text-indigo-400">{sale.billNumber}</td>
                        <td className="p-3 font-semibold text-slate-200">{sale.customerName}</td>
                        <td className="p-3 text-slate-400">
                          {new Date(sale.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] ${
                              settlement
                                ? "bg-emerald-500/15 text-emerald-300"
                                : returned
                                ? "bg-orange-500/15 text-orange-300"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {settlement ? "Udhaar Payment" : returned ? "Returned" : sale.paymentMethod}
                          </span>
                          {!settlement && !returned && returnedAmount > 0 && (
                            <div className="text-[10px] text-orange-300 mt-0.5">Returned {fmt(returnedAmount)}</div>
                          )}
                        </td>
                        <td className={`p-3 font-bold ${settlement ? "text-emerald-400" : "text-slate-200"}`}>
                          {fmt(settlement ? sale.paidAmount : sale.grandTotal)}
                        </td>
                        <td className="p-3">
                          {!settlement && num(sale.dueAmount) > 0 ? (
                            <span className="text-rose-400 font-bold">{fmt(sale.dueAmount)}</span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sellers;
