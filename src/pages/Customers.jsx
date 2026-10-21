import React, { useState, useMemo } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { Users, Phone, MapPin, Receipt, Clock, Plus, Search, DollarSign, UserCheck, Calendar, X, FileText, ArrowUpRight, Smartphone, ShoppingBag, CheckCircle2, User, Pencil, Trash2 } from "lucide-react";
import { isSettlement, saleBelongsTo, udhaarAdded } from "../utils/sales";

const Customers = () => {
  const {
    customers: ctxCustomers,
    allCustomers,
    sales: ctxSales,
    allSales,
    shopSettings,
    updateCustomer,
    deleteCustomer,
  } = useApp();

  const customers = useMemo(() => allCustomers || ctxCustomers || [], [allCustomers, ctxCustomers]);
  const sales = useMemo(() => allSales || ctxSales || [], [allSales, ctxSales]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("All");
  const [selectedLedgerCust, setSelectedLedgerCust] = useState(null);
  const [editForm, setEditForm] = useState(null); // { id, name, phone, email, address, cnic, sellerName }
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // A customer belongs to a seller by their assigned seller (exact name);
  // customers without one go by the seller of their latest sale or receipt
  const customerSellerMap = useMemo(() => {
    const map = new Map();
    customers.forEach((c) => {
      let owner = (c.sellerName || "").trim().toLowerCase();
      if (!owner) {
        let latest = null;
        sales.forEach((s) => {
          const seller = (s.sellerName || s.cashierName || "").trim();
          if (!seller || !saleBelongsTo(s, c)) return;
          if (!latest || new Date(s.createdAt) > new Date(latest.createdAt)) latest = { createdAt: s.createdAt, seller };
        });
        owner = latest ? latest.seller.toLowerCase() : "";
      }
      map.set(c.id, owner);
    });
    return map;
  }, [customers, sales]);

  const openEdit = (cust) => {
    setEditForm({
      id: cust.id,
      name: cust.name || "",
      phone: cust.phone || "",
      email: cust.email || "",
      address: cust.address || "",
      cnic: cust.cnic || "",
      sellerName: SELLERS.find((s) => s.toLowerCase() === (cust.sellerName || "").trim().toLowerCase()) || cust.sellerName || "",
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (isSavingEdit || !editForm || !editForm.name.trim()) return;
    setIsSavingEdit(true);
    try {
      // Details only — balances are changed by sales and payments, never here
      const saved = await updateCustomer(editForm.id, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        address: editForm.address.trim(),
        cnic: editForm.cnic.trim(),
        sellerName: editForm.sellerName,
      });
      if (saved) {
        if (selectedLedgerCust?.id === saved.id) setSelectedLedgerCust(saved);
        setEditForm(null);
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (cust) => {
    const pending = Number(cust.totalPending || 0);
    const warning =
      pending > 0
        ? `"${cust.name}" still owes ${shopSettings.currencySymbol} ${pending.toLocaleString()} Udhaar.\n\nDelete this customer anyway? Their sales history is kept.`
        : `Delete customer "${cust.name}"? Their sales history is kept.`;
    if (!window.confirm(warning)) return;
    const ok = await deleteCustomer(cust.id);
    if (ok && selectedLedgerCust?.id === cust.id) setSelectedLedgerCust(null);
  };

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

    if (selectedSeller !== "All" && customerSellerMap.get(c.id) !== selectedSeller.toLowerCase()) return false;

    return true;
  });

  // Quick lookup for the Aziz and Mubashir partner accounts (exact customer name)
  const findByName = (name) => customers.find((c) => (c.name || "").trim().toLowerCase() === name.toLowerCase());
  const azizCust = findByName("Aziz");
  const mubashirCust = findByName("Mubashir");

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
                {azizCust?.phone && <p className="text-xs text-indigo-300 font-semibold">{azizCust.phone}</p>}
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
                {mubashirCust?.phone && <p className="text-xs text-cyan-300 font-semibold">{mubashirCust.phone}</p>}
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
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedLedgerCust(cust)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs inline-flex items-center gap-1 transition-all"
                      >
                        <Receipt size={13} /> View Ledger
                      </button>
                      <button
                        onClick={() => openEdit(cust)}
                        title="Edit customer"
                        className="p-1.5 bg-slate-800 hover:bg-indigo-600/40 text-indigo-300 rounded-xl transition-all"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(cust)}
                        title="Delete customer"
                        className="p-1.5 bg-slate-800 hover:bg-rose-600/40 text-rose-400 rounded-xl transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
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
                  .filter((s) => saleBelongsTo(s, selectedLedgerCust))
                  .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                if (custSales.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      No transaction history found for this account.
                    </div>
                  );
                }

                // Same rule as the server: a sale adds its due amount, money paid above the bill
                // goes against the old balance, a settlement lowers it; never below 0
                let runningUdhaar = 0;
                const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                const rows = custSales.map((record) => {
                  const isPayment = isSettlement(record);
                  const added = udhaarAdded(record);
                  const isCredit = !isPayment && added > 0;

                  const grandTotal = Number(record.grandTotal || 0);
                  const paidAmount = Number(record.paidAmount || 0);

                  if (isPayment) {
                    runningUdhaar = Math.max(0, runningUdhaar - paidAmount);
                  } else {
                    runningUdhaar = Math.max(0, runningUdhaar + added - Math.max(0, paidAmount - grandTotal));
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

      {/* Edit Customer Modal */}
      {editForm && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <Pencil size={16} className="text-indigo-400" /> Edit Customer
              </h3>
              <button
                onClick={() => !isSavingEdit && setEditForm(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              {[
                { key: "name", label: "Name *", required: true },
                { key: "phone", label: "Phone" },
                { key: "address", label: "Address" },
                { key: "cnic", label: "CNIC" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-slate-400">{f.label}</label>
                  <input
                    type="text"
                    required={f.required}
                    value={editForm[f.key]}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 mt-1"
                  />
                </div>
              ))}

              <div>
                <label className="text-xs font-semibold text-slate-400">Seller</label>
                <select
                  value={editForm.sellerName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, sellerName: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 mt-1"
                >
                  <option value="">No seller</option>
                  {SELLERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  {editForm.sellerName && !SELLERS.includes(editForm.sellerName) && (
                    <option value={editForm.sellerName}>{editForm.sellerName}</option>
                  )}
                </select>
              </div>

              <p className="text-[11px] text-slate-500">
                Balances are not edited here — they change only through sales and payments.
              </p>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditForm(null)}
                  disabled={isSavingEdit}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingEdit ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
