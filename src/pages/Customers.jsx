import React, { useState } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { Users, Phone, MapPin, Receipt, Clock, Plus, Search, DollarSign, UserCheck, Calendar, X, FileText, ArrowUpRight, Smartphone, ShoppingBag, CheckCircle2, User } from "lucide-react";

const Customers = () => {
  const {
    customers: ctxCustomers,
    allCustomers,
    sales: ctxSales,
    allSales,
    shopSettings,
  } = useApp();

  const customers = allCustomers || ctxCustomers || [];
  const sales = allSales || ctxSales || [];
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("All");
  const [selectedLedgerCust, setSelectedLedgerCust] = useState(null);

  const filteredCustomers = customers.filter((c) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (c.name || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.cnic || "").includes(q) ||
      (c.address || "").toLowerCase().includes(q) ||
      (c.sellerName || "").toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (selectedSeller !== "All") {
      const sLower = selectedSeller.toLowerCase();
      const isSeller =
        (c.sellerName || "").toLowerCase().includes(sLower) ||
        (c.name || "").toLowerCase().includes(sLower);
      if (!isSeller) return false;
    }

    return true;
  });

  // Quick lookup for Aziz and Mubashir accounts
  const azizCust = customers.find((c) => c.name && c.name.toLowerCase().includes("aziz"));
  const mubashirCust = customers.find((c) => c.name && c.name.toLowerCase().includes("mubashir"));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users size={24} className="text-indigo-400" />
            <h1 className="text-xl font-bold text-slate-100">Customer Accounts & Udhaar Profiles</h1>
          </div>
          <p className="text-xs text-slate-400">
            Dedicated account ledgers, cash vs. udhar balance tracking, and complete bill history
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-stretch sm:items-center">
          {/* Seller Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800 flex-wrap sm:flex-nowrap">
            <button
              onClick={() => setSelectedSeller("All")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedSeller === "All"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All
            </button>
            {SELLERS.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSeller(selectedSeller === s ? "All" : s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                  selectedSeller === s
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <User size={12} /> {s}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, phone, CNIC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Featured Partner Accounts: Aziz & Mubashir */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Aziz Account Card */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-3xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-black text-lg">
                A
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">{azizCust ? azizCust.name : "Aziz"}</h2>
                <p className="text-xs text-indigo-300 font-semibold">{azizCust ? azizCust.phone : "0300-1111111"}</p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold rounded-full uppercase">
              Partner Account
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 my-4 text-center">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Total Udhaar</span>
              <span className="text-sm font-black text-rose-400">
                {shopSettings.currencySymbol} {(azizCust?.totalPending || 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Total Cash</span>
              <span className="text-sm font-black text-emerald-400">
                {shopSettings.currencySymbol} {(azizCust?.totalPaid || 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Purchases</span>
              <span className="text-sm font-black text-indigo-300">
                {shopSettings.currencySymbol} {(azizCust?.totalPurchases || 0).toLocaleString()}
              </span>
            </div>
          </div>

          <button
            onClick={() => azizCust && setSelectedLedgerCust(azizCust)}
            disabled={!azizCust}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-all"
          >
            <FileText size={14} /> View Aziz's Full Account Ledger
          </button>
        </div>

        {/* Mubashir Account Card */}
        <div className="bg-gradient-to-br from-slate-900 to-cyan-950/40 border border-cyan-500/30 rounded-3xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-black text-lg">
                M
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">{mubashirCust ? mubashirCust.name : "Mubashir"}</h2>
                <p className="text-xs text-cyan-300 font-semibold">{mubashirCust ? mubashirCust.phone : "0300-2222222"}</p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold rounded-full uppercase">
              Partner Account
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 my-4 text-center">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Total Udhaar</span>
              <span className="text-sm font-black text-rose-400">
                {shopSettings.currencySymbol} {(mubashirCust?.totalPending || 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Total Cash</span>
              <span className="text-sm font-black text-emerald-400">
                {shopSettings.currencySymbol} {(mubashirCust?.totalPaid || 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Purchases</span>
              <span className="text-sm font-black text-cyan-300">
                {shopSettings.currencySymbol} {(mubashirCust?.totalPurchases || 0).toLocaleString()}
              </span>
            </div>
          </div>

          <button
            onClick={() => mubashirCust && setSelectedLedgerCust(mubashirCust)}
            disabled={!mubashirCust}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-cyan-600/20 transition-all"
          >
            <FileText size={14} /> View Mubashir's Full Account Ledger
          </button>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm overflow-hidden space-y-4">
        <h3 className="font-bold text-slate-200 text-sm">All Customer Ledgers</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 uppercase bg-slate-950/60 rounded-xl">
              <tr>
                <th className="p-3.5 font-semibold">Customer Details</th>
                <th className="p-3.5 font-semibold">Address / City</th>
                <th className="p-3.5 font-semibold">Total Purchases</th>
                <th className="p-3.5 font-semibold">Total Paid (Cash)</th>
                <th className="p-3.5 font-semibold">Udhaar Balance</th>
                <th className="p-3.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredCustomers.map((cust) => (
                <tr key={cust.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3.5">
                    <div className="font-bold text-slate-100">{cust.name}</div>
                    <div className="text-slate-400 flex items-center gap-1 text-[11px] mt-0.5">
                      <Phone size={12} className="text-indigo-400" />
                      <span>{cust.phone || "No Phone"}</span>
                    </div>
                  </td>

                  <td className="p-3.5 text-slate-300">
                    <div>{cust.address || "N/A"}</div>
                    <div className="text-[11px] text-slate-500">{cust.city || ""}</div>
                  </td>

                  <td className="p-3.5 font-semibold text-slate-200">
                    {shopSettings.currencySymbol} {cust.totalPurchases.toLocaleString()}
                  </td>

                  <td className="p-3.5 font-semibold text-emerald-400">
                    {shopSettings.currencySymbol} {cust.totalPaid.toLocaleString()}
                  </td>

                  <td className="p-3.5">
                    <span
                      className={`font-bold px-2.5 py-1 rounded-full ${
                        cust.totalPending > 0
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-slate-950 text-slate-400"
                      }`}
                    >
                      {shopSettings.currencySymbol} {cust.totalPending.toLocaleString()}
                    </span>
                  </td>

                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => setSelectedLedgerCust(cust)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs inline-flex items-center gap-1 transition-all"
                    >
                      <Receipt size={13} /> View Ledger
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Full Account Ledger Modal */}
      {selectedLedgerCust && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <h3 className="font-bold text-slate-100 text-lg flex items-center gap-2">
                  <span>Account Ledger:</span>
                  <span className="text-indigo-400 font-black">{selectedLedgerCust.name}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Phone: <strong className="text-slate-200">{selectedLedgerCust.phone || "N/A"}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedLedgerCust(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800"
              >
                <X size={20} />
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Total Purchases</span>
                <p className="text-base font-black text-slate-100 mt-0.5">
                  Rs. {selectedLedgerCust.totalPurchases.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Total Cash Paid</span>
                <p className="text-base font-black text-emerald-400 mt-0.5">
                  Rs. {selectedLedgerCust.totalPaid.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] font-bold text-rose-400 uppercase">Current Udhaar Loan</span>
                <p className="text-base font-black text-rose-400 mt-0.5">
                  Rs. {selectedLedgerCust.totalPending.toLocaleString()}
                </p>
              </div>
            </div>

            {/* History Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Transaction History</h4>
              {(() => {
                const custSales = sales
                  .filter((s) => {
                    if (s.customerId && s.customerId === selectedLedgerCust.id) return true;
                    if (s.customer && s.customer === selectedLedgerCust.id) return true;
                    if (selectedLedgerCust.phone && s.customerPhone && s.customerPhone.trim() === selectedLedgerCust.phone.trim()) return true;
                    if (selectedLedgerCust.name && s.customerName && s.customerName.trim().toLowerCase() === selectedLedgerCust.name.trim().toLowerCase()) return true;
                    return false;
                  })
                  .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                if (custSales.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      No transaction history found for this account.
                    </div>
                  );
                }

                let runningUdhaar = 0;
                const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                const rows = custSales.map((record) => {
                  const isPayment = record.paymentMethod === "Udhaar Settlement";
                  const isCredit =
                    (record.paymentMethod || "").toLowerCase().includes("credit") ||
                    (record.paymentMethod || "").toLowerCase().includes("udhaar") ||
                    record.paymentMethod === "Pending Bill";

                  const grandTotal = Number(record.grandTotal || 0);
                  const paidAmount = Number(record.paidAmount || 0);
                  const dueAmount = Number(record.dueAmount || 0);

                  if (isPayment) {
                    runningUdhaar = Math.max(0, runningUdhaar - paidAmount);
                  } else if (isCredit) {
                    const netAdded = dueAmount > 0 ? dueAmount : Math.max(0, grandTotal - paidAmount);
                    runningUdhaar += netAdded;
                  }

                  const d = new Date(record.createdAt);
                  const dayName = !isNaN(d.getTime()) ? dayNames[d.getDay()] : "—";
                  const formattedDate = !isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
                  const formattedTime = !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }) : "";

                  return { ...record, isPayment, isCredit, runningUdhaar, dayName, formattedDate, formattedTime };
                });

                return rows.reverse().map((record) => (
                  <div
                    key={record.id}
                    className={`p-3.5 border rounded-2xl flex flex-col gap-2.5 ${
                      record.isPayment
                        ? "bg-emerald-950/20 border-emerald-900/30"
                        : record.isCredit
                        ? "bg-rose-950/20 border-rose-900/30"
                        : "bg-slate-950/50 border-slate-800/80"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded text-[10px] font-black uppercase">
                          {record.dayName}
                        </span>
                        <span className="text-[11px] font-bold text-slate-300">
                          {record.formattedDate} <span className="text-slate-500 font-normal">at {record.formattedTime}</span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            record.isPayment
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : record.isCredit
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                          }`}
                        >
                          {record.isPayment ? "Payment Received" : record.isCredit ? "Udhaar Sale / Bill" : "Cash Sale"}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          {record.billNumber}
                        </span>
                      </div>

                      <div className="text-right">
                        <div className={`text-sm font-black ${record.isPayment ? "text-emerald-400" : record.isCredit ? "text-rose-400" : "text-slate-200"}`}>
                          {record.isPayment ? `+Rs. ${Number(record.paidAmount || 0).toLocaleString()}` : `Rs. ${Number(record.grandTotal || 0).toLocaleString()}`}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Balance: <strong className={record.runningUdhaar > 0 ? "text-rose-400" : "text-slate-300"}>Rs. {record.runningUdhaar.toLocaleString()}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Items or Payment Note */}
                    {record.isPayment ? (
                      <p className="text-xs text-emerald-300/90 font-medium bg-emerald-950/30 p-2 rounded-xl border border-emerald-900/30">
                        {record.notes || "Received payment towards pending balance"}
                      </p>
                    ) : record.items && record.items.length > 0 ? (
                      <div className="space-y-1 pt-1 border-t border-slate-800/60">
                        {record.items.map((it, itIdx) => (
                          <div key={itIdx} className="flex justify-between items-center text-xs text-slate-300">
                            <span>
                              {it.quantity || 1}x {it.productName || it.name}
                              {it.imei && <span className="ml-2 font-mono text-[10px] text-indigo-300">IMEI: {it.imei}</span>}
                            </span>
                            <span className="font-semibold text-slate-200">
                              Rs. {(Number(it.subtotal || (it.quantity || 1) * (it.unitPrice || it.price || 0))).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">{record.notes || "Sale recorded without items."}</p>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
