import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { ShieldCheck, Search, Calendar, Smartphone, User, AlertCircle, CheckCircle2, Clock, Wrench, X, FileText } from "lucide-react";
import MobileIssues from "./MobileIssues";

const Warranties = () => {
  const { warranties, addWarrantyClaim } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("warranties"); // "warranties" | "repairs"
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("All");

  // Log Claim modal state
  const [claimWarranty, setClaimWarranty] = useState(null);
  const [claimIssue, setClaimIssue] = useState("");
  const [claimType, setClaimType] = useState("Brand");
  const [claimNotes, setClaimNotes] = useState("");
  const [savingClaim, setSavingClaim] = useState(false);

  const statusOptions = ["All", "Active", "Expiring Soon", "Expired", "Pending Claims"];

  const hasPendingClaim = (w) => (w.claims || []).some((c) => c.status === "Pending");

  const filteredWarranties = warranties.filter((w) => {
    // Walk-in sales may have no phone / customer name, so guard every field
    const q = searchTerm.trim();
    const qLower = q.toLowerCase();
    const matchesSearch =
      (w.imei || "").includes(q) ||
      (w.productName || "").toLowerCase().includes(qLower) ||
      (w.customerName || "").toLowerCase().includes(qLower) ||
      (w.customerPhone || "").includes(q);
    const matchesStatus =
      selectedStatusFilter === "All" ||
      (selectedStatusFilter === "Pending Claims" ? hasPendingClaim(w) : w.status === selectedStatusFilter);
    return matchesSearch && matchesStatus;
  });

  const openClaimModal = (w) => {
    setClaimWarranty(w);
    setClaimIssue("");
    setClaimType(w.warrantyType === "Shop Warranty" ? "Shop" : "Brand");
    setClaimNotes("");
  };

  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    if (!claimWarranty || !claimIssue.trim() || savingClaim) return;
    setSavingClaim(true);
    // addWarrantyClaim alerts the user itself if the database refuses
    const saved = await addWarrantyClaim(claimWarranty.imei, {
      issue: claimIssue.trim(),
      claimType,
      status: "Pending",
      notes: claimNotes.trim(),
    });
    setSavingClaim(false);
    if (saved) setClaimWarranty(null);
  };

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
             onClick={() => setActiveTab("warranties")}
             className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all flex justify-center items-center gap-2 ${activeTab === "warranties" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white hover:bg-slate-900"}`}
          >
            <ShieldCheck size={16} /> Warranty Tracking
          </button>
          <button 
             onClick={() => setActiveTab("repairs")}
             className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all flex justify-center items-center gap-2 ${activeTab === "repairs" ? "bg-orange-600 text-white shadow-md shadow-orange-600/30" : "text-slate-400 hover:text-white hover:bg-slate-900"}`}
          >
            <Wrench size={16} /> Repair Tickets
          </button>
        </div>
      </div>

      {activeTab === "repairs" ? (
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
                    selectedStatusFilter === st
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
                <th className="p-3.5 font-semibold">Claims</th>
                <th className="p-3.5 font-semibold text-right">Status</th>
                <th className="p-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredWarranties.length === 0 && (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-500 text-xs">
                    No warranties found.
                  </td>
                </tr>
              )}
              {filteredWarranties.map((warr) => {
                const isExpiring = warr.status === "Expiring Soon";
                const claims = warr.claims || [];
                const latestClaim = claims.length > 0 ? claims[claims.length - 1] : null;

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

                    <td className="p-3.5">
                      {latestClaim ? (
                        <div>
                          <div className="font-semibold text-slate-200">{claims.length} claim(s)</div>
                          <div
                            className={`text-[11px] font-bold ${
                              latestClaim.status === "Pending" ? "text-amber-300" : "text-slate-400"
                            }`}
                            title={latestClaim.issue}
                          >
                            Latest: {latestClaim.status || "Pending"}
                            {latestClaim.claimType ? ` (${latestClaim.claimType})` : ""}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500">No claims</span>
                      )}
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

                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => openClaimModal(warr)}
                        className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-indigo-300 border border-slate-800 rounded-xl text-[11px] font-bold transition-colors whitespace-nowrap"
                        title="Log Warranty Claim"
                      >
                        Log Claim
                      </button>
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

      {/* Log Claim Modal */}
      {claimWarranty && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                  <FileText size={18} className="text-indigo-400" /> Log Warranty Claim
                </h3>
                <p className="text-[11px] text-slate-400">
                  {claimWarranty.productName} • <span className="font-mono text-cyan-400">{claimWarranty.imei}</span>
                </p>
              </div>
              <button onClick={() => setClaimWarranty(null)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleClaimSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-400">Issue *</label>
                <textarea
                  required
                  rows={3}
                  value={claimIssue}
                  onChange={(e) => setClaimIssue(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500 resize-none"
                  placeholder="Describe the fault..."
                />
              </div>

              <div>
                <label className="font-semibold text-slate-400">Claim Type</label>
                <select
                  value={claimType}
                  onChange={(e) => setClaimType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                >
                  <option value="Brand">Brand (Official Service Center)</option>
                  <option value="Shop">Shop</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-400">Notes</label>
                <textarea
                  rows={2}
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500 resize-none"
                  placeholder="Optional notes..."
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClaimWarranty(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingClaim}
                  className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 disabled:opacity-50 shadow"
                >
                  {savingClaim ? "Saving..." : "Save Claim"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Warranties;
