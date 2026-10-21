import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { ShieldCheck, Search, Calendar, Smartphone, User, AlertCircle, CheckCircle2, Clock, Wrench } from "lucide-react";
import MobileIssues from "./MobileIssues";

const Warranties = () => {
  const { warranties } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("All");

  const statusOptions = ["All", "Active", "Expiring Soon", "Expired", "Pending Claims"];

  const filteredWarranties = warranties.filter((w) => {
    const matchesSearch =
      w.imei.includes(searchTerm) ||
      w.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.customerPhone.includes(searchTerm);
    const matchesStatus = selectedStatusFilter === "All" || w.status === selectedStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={24} className="text-emerald-400" />
            <h1 className="text-xl font-bold text-slate-100">Mobile Warranty & Repair System</h1>
          </div>
          <p className="text-xs text-slate-400">
            Track official warranties and manage customer repair tickets
          </p>
        </div>

        <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 self-start sm:self-auto shrink-0 w-full sm:w-auto">
          <button 
             onClick={() => setSelectedStatusFilter("WARRANTIES")}
             className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all flex justify-center items-center gap-2 ${selectedStatusFilter !== "REPAIRS" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white hover:bg-slate-900"}`}
          >
            <ShieldCheck size={16} /> Warranty Tracking
          </button>
          <button 
             onClick={() => setSelectedStatusFilter("REPAIRS")}
             className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all flex justify-center items-center gap-2 ${selectedStatusFilter === "REPAIRS" ? "bg-orange-600 text-white shadow-md shadow-orange-600/30" : "text-slate-400 hover:text-white hover:bg-slate-900"}`}
          >
            <Wrench size={16} /> Repair Tickets
          </button>
        </div>
      </div>

      {selectedStatusFilter === "REPAIRS" ? (
        <div className="animate-in fade-in zoom-in-95 duration-300">
          <MobileIssues />
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {statusOptions.map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatusFilter(st)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedStatusFilter === st || (selectedStatusFilter === "WARRANTIES" && st === "All")
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            
            <div className="relative w-full sm:w-72 hidden md:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search IMEI, Phone, Customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

      {/* Warranties Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 uppercase bg-slate-950/60 rounded-xl">
              <tr>
                <th className="p-3.5 font-semibold">IMEI Number</th>
                <th className="p-3.5 font-semibold">Smartphone Model</th>
                <th className="p-3.5 font-semibold">Customer Details</th>
                <th className="p-3.5 font-semibold">Warranty Period</th>
                <th className="p-3.5 font-semibold">Warranty Type</th>
                <th className="p-3.5 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredWarranties.map((warr) => {
                const isExpiring = warr.status === "Expiring Soon";
                const isExpired = warr.status === "Expired";

                return (
                  <tr key={warr.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-cyan-400">
                      {warr.imei}
                    </td>

                    <td className="p-3.5">
                      <div className="font-bold text-slate-100">{warr.productName}</div>
                      <div className="text-[11px] text-slate-400">{warr.brand} {warr.model}</div>
                    </td>

                    <td className="p-3.5">
                      <div className="font-semibold text-slate-200">{warr.customerName}</div>
                      <div className="text-[11px] text-slate-400">{warr.customerPhone}</div>
                    </td>

                    <td className="p-3.5 text-slate-300">
                      <div>Start: {warr.warrantyStartDate}</div>
                      <div className="font-semibold text-indigo-300">Expiry: {warr.warrantyExpiryDate}</div>
                    </td>

                    <td className="p-3.5">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-950 text-indigo-300 border border-slate-800">
                        {warr.warrantyType}
                      </span>
                    </td>

                    <td className="p-3.5 text-right">
                      <span
                        className={`font-bold px-3 py-1 rounded-full text-xs ${
                          warr.status === "Active"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : isExpiring
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        }`}
                      >
                        {warr.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        </div>
      )}
    </div>
  );
};

export default Warranties;
