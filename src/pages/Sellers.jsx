import React, { useState, useMemo } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { User, DollarSign, Clock, Users, Receipt, Search, Eye, Filter } from "lucide-react";

const Sellers = () => {
  const { allSales, allCustomers, shopSettings } = useApp();
  const [selectedSeller, setSelectedSeller] = useState(SELLERS[0] || "");
  const [searchTerm, setSearchTerm] = useState("");

  const sellerSales = useMemo(() => {
    return allSales.filter(s => (s.sellerName || s.cashierName) === selectedSeller);
  }, [allSales, selectedSeller]);

  const sellerCustomers = useMemo(() => {
    return allCustomers.filter(c => c.sellerName === selectedSeller);
  }, [allCustomers, selectedSeller]);

  const totalSales = sellerSales.reduce((acc, s) => acc + s.grandTotal, 0);
  const totalPaid = sellerSales.reduce((acc, s) => acc + s.paidAmount, 0);
  const totalPending = sellerSales.reduce((acc, s) => acc + s.dueAmount, 0);

  const cleanSearch = searchTerm.replace(/[-\s]/g, "").toLowerCase();

  const filteredTransactions = sellerSales.filter(
    (s) =>
      (s.billNumber || "").replace(/[-\s]/g, "").toLowerCase().includes(cleanSearch) ||
      (s.customerName || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <User size={24} className="text-indigo-400" />
            <h1 className="text-xl font-bold text-slate-100">Sellers Management</h1>
          </div>
          <p className="text-xs text-slate-400">
            View performance, udhaar, and customers for each seller
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-400">Select Seller:</span>
          <div className="flex gap-2">
            {SELLERS.map((seller) => (
              <button
                key={seller}
                onClick={() => setSelectedSeller(seller)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  selectedSeller === seller
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                }`}
              >
                {seller}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 bg-indigo-950/50 rounded-2xl flex items-center justify-center text-indigo-400 shrink-0 border border-indigo-900/50">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Sales</p>
            <p className="text-xl font-black text-slate-100">
              {shopSettings.currencySymbol} {totalSales.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 bg-emerald-950/50 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0 border border-emerald-900/50">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Paid</p>
            <p className="text-xl font-black text-slate-100">
              {shopSettings.currencySymbol} {totalPaid.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 bg-rose-950/50 rounded-2xl flex items-center justify-center text-rose-400 shrink-0 border border-rose-900/50">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pending Udhaar</p>
            <p className="text-xl font-black text-slate-100">
              {shopSettings.currencySymbol} {totalPending.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 bg-cyan-950/50 rounded-2xl flex items-center justify-center text-cyan-400 shrink-0 border border-cyan-900/50">
            <Users size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Customers</p>
            <p className="text-xl font-black text-slate-100">
              {sellerCustomers.length}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Customers List */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col h-[600px]">
          <h2 className="text-sm font-bold text-slate-100 mb-4 flex items-center gap-2">
            <Users size={16} className="text-indigo-400" /> Customers for {selectedSeller}
          </h2>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {sellerCustomers.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">No customers yet</div>
            ) : (
              sellerCustomers.map(c => (
                <div key={c.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="font-bold text-slate-100 text-sm">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.phone || "No phone"}</div>
                  <div className="mt-2 flex justify-between items-center text-xs">
                    <span className="text-slate-500">Udhaar:</span>
                    <span className={c.totalPending > 0 ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                      Rs. {c.totalPending.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Recent Transactions */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Receipt size={16} className="text-indigo-400" /> Recent Transactions
            </h2>
            <div className="relative w-64">
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
                  <th className="p-3 font-semibold">Method</th>
                  <th className="p-3 font-semibold">Total</th>
                  <th className="p-3 font-semibold">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-500">No transactions found</td>
                  </tr>
                ) : (
                  filteredTransactions.map(sale => (
                    <tr key={sale.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono text-indigo-400">{sale.billNumber}</td>
                      <td className="p-3 font-semibold text-slate-200">{sale.customerName}</td>
                      <td className="p-3 text-slate-400">{new Date(sale.createdAt).toLocaleDateString()}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-300">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-200">Rs. {sale.grandTotal.toLocaleString()}</td>
                      <td className="p-3">
                        {sale.dueAmount > 0 ? (
                          <span className="text-rose-400 font-bold">Rs. {sale.dueAmount.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))
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

// Dummy component just to have the icon used for the checkmark
const CheckCircle2 = ({ size }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
);
