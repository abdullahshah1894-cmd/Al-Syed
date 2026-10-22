import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { Wrench, Plus, X, Search, FileText, Info, Trash2 } from "lucide-react";

const STATUSES = ["Pending", "Under Inspection", "Repaired", "Delivered", "Rejected"];

// "12 Oct 2026" in local time; "—" when the date is missing or unreadable
const formatDay = (d) => {
  const date = d ? new Date(d) : null;
  return date && !isNaN(date.getTime())
    ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
};

const MobileIssues = () => {
  const { issues, addIssue, updateIssueStatus, deleteIssue } = useApp();
  // Deleting a ticket is for the owner only (the server refuses it for cashiers)
  const { isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState(null); // ticket whose status change / delete is being saved

  // Form State
  const [customerName, setCustomerName] = useState("");
  const [imei, setImei] = useState("");
  const [phoneIssue, setPhoneIssue] = useState("");
  const [companyName, setCompanyName] = useState("");

  const closeAddModal = () => {
    if (isSaving) return;
    setShowAddModal(false);
  };

  const handleAddIssue = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    const name = customerName.trim();
    const issueText = phoneIssue.trim();
    const company = companyName.trim();
    if (!name || !imei || !issueText || !company) {
      alert("Please fill all required fields.");
      return;
    }
    if (!/^\d{15}$/.test(imei)) {
      alert("IMEI must be exactly 15 digits.");
      return;
    }

    setIsSaving(true);
    try {
      // addIssue alerts the user itself on failure; the form keeps what was typed
      const newIssue = await addIssue({ customerName: name, imei, phoneIssue: issueText, companyName: company });
      if (newIssue) {
        setShowAddModal(false);
        setCustomerName("");
        setImei("");
        setPhoneIssue("");
        setCompanyName("");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // updateIssueStatus alerts on failure; the select then shows the saved status again
  const handleStatusChange = async (id, newStatus) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await updateIssueStatus(id, newStatus);
    } finally {
      setBusyId(null);
    }
  };

  // deleteIssue alerts the user itself if the database refuses
  const handleDelete = async (issue) => {
    if (!isAdmin || busyId) return;
    if (!window.confirm(`Delete repair ticket ${issue.ticketNumber || ""} for ${issue.customerName || "customer"}?`)) return;
    setBusyId(issue.id);
    try {
      await deleteIssue(issue.id);
    } finally {
      setBusyId(null);
    }
  };

  const filteredIssues = (issues || []).filter((issue) => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return true;
    return [issue.ticketNumber, issue.customerName, issue.imei, issue.companyName, issue.phoneIssue].some((v) =>
      String(v || "").toLowerCase().includes(s)
    );
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case "Pending": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "Under Inspection": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      case "Repaired": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      case "Delivered": return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
      case "Rejected": return "bg-rose-500/20 text-rose-300 border-rose-500/30";
      default: return "bg-slate-500/20 text-slate-300 border-slate-500/30";
    }
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-200px)]">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <Wrench size={22} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Mobile Repair Tickets</h2>
            <p className="text-[11px] text-slate-400">Manage customer repair issues</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search Ticket, IMEI, Customer, Company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-lg shadow-orange-600/20 shrink-0"
          >
            <Plus size={16} /> <span className="hidden sm:inline">Mobile Issue</span>
          </button>
        </div>
      </div>

      {/* Issues Table */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-950/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800">Ticket No.</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800">Customer</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800">Mobile Details</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800">Issue Description</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800">Date Registered</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredIssues.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-slate-500 text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <FileText size={32} className="opacity-30" />
                      <p>No mobile issues found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredIssues.map((issue) => (
                  <tr key={issue.id} className="hover:bg-slate-950/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-orange-400">{issue.ticketNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-slate-200">{issue.customerName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-slate-200">{issue.companyName}</div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">IMEI: {issue.imei}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="text-xs text-slate-300 truncate" title={issue.phoneIssue}>
                        {issue.phoneIssue}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-slate-400">{formatDay(issue.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={issue.status || "Pending"}
                        disabled={!!busyId}
                        onChange={(e) => handleStatusChange(issue.id, e.target.value)}
                        className={`text-[10px] font-bold px-2 py-1 rounded border outline-none cursor-pointer disabled:opacity-60 disabled:cursor-wait ${getStatusBadge(issue.status)} bg-slate-950`}
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                        {issue.status && !STATUSES.includes(issue.status) && (
                          <option value={issue.status}>{issue.status}</option>
                        )}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin ? (
                        <button
                          onClick={() => handleDelete(issue)}
                          disabled={!!busyId}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete Ticket"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Issue Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-800/20">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Wrench size={20} className="text-orange-400" /> Register Mobile Issue
              </h2>
              <button onClick={closeAddModal} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddIssue} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Enter company name"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase">IMEI Number *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={15}
                    minLength={15}
                    pattern="\d{15}"
                    value={imei}
                    onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))}
                    placeholder="15-digit IMEI"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase">Phone Issue / Description *</label>
                <textarea
                  required
                  value={phoneIssue}
                  onChange={(e) => setPhoneIssue(e.target.value)}
                  placeholder="Describe the mobile problem..."
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-orange-500 resize-none"
                ></textarea>
              </div>

              <div className="flex items-center gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <Info size={16} className="text-indigo-400 shrink-0" />
                <p className="text-[11px] text-indigo-300">
                  The current date and a unique Ticket ID will be automatically generated upon saving.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-orange-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSaving ? "Saving…" : "Save Issue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileIssues;
