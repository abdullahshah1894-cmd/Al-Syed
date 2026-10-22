import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, SELLERS } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { Receipt, Search, Printer, Eye, X, Smartphone, Pencil, Trash2, RotateCcw, AlertCircle } from "lucide-react";
import { useShareImage } from "../components/useShareImage";
import { printElement } from "../services/printReceipt";
import { itemImeis, isSettlement } from "../utils/sales";

const billSeller = (bill) => bill.sellerName || bill.cashierName || "Store";

const itemQty = (i) => Number(i.quantity || i.qty || 1);
const itemRate = (i) => Number(i.unitSalePrice || i.price || 0);
const itemSubtotal = (i) => Number(i.subtotal || itemQty(i) * itemRate(i));
const itemReturned = (i) => Math.min(itemQty(i), Number(i.returnedQty || 0));
const hasReturns = (bill) => (bill.returns || []).length > 0 || (bill.items || []).some((i) => itemReturned(i) > 0);

// "2026-10-22T00:00:00Z" / "2026-10-22" -> "2026-10-22" (date input value)
const dateOnly = (d) => (d ? String(d).slice(0, 10) : "");
// Due dates are plain dates; read them as local midnight (new Date("2026-10-22") is UTC midnight)
const showDate = (d) => (dateOnly(d) ? new Date(`${dateOnly(d)}T00:00:00`).toLocaleDateString() : "");
const money = (n) => Number(n || 0).toLocaleString();

// Form values for the edit modal, taken from the bill
const editFormFor = (bill) => ({
  saleId: bill.id,
  customerName: bill.customerName || "",
  customerPhone: bill.customerPhone || "",
  sellerName: bill.sellerName || "",
  notes: bill.notes || "",
  dueDate: dateOnly(bill.dueDate),
  discountAmount: String(bill.discountAmount || 0),
  paidAmount: String(bill.paidAmount || 0),
  rates: (bill.items || []).map((i) => String(itemRate(i))),
});

// New totals for the edit preview; same rules as the server (tax on the subtotal, discount capped)
const previewTotals = (bill, form) => {
  const subtotal = (bill.items || []).length > 0
    ? (bill.items || []).reduce((sum, item, idx) => {
        const rate = form.rates[idx];
        return sum + (Number(rate) !== itemRate(item) ? Math.max(0, Number(rate) || 0) * itemQty(item) : itemSubtotal(item));
      }, 0)
    : Number(bill.subtotalAmount || 0);
  const tax = Math.round((subtotal * Number(bill.taxPercent || 0)) / 100);
  const discount = Math.min(Math.max(0, Number(form.discountAmount) || 0), subtotal + tax);
  const total = subtotal + tax - discount;
  const paid = Math.max(0, Number(form.paidAmount) || 0);
  return { subtotal, tax, discount, total, paid, due: Math.max(0, total - paid), extra: Math.max(0, paid - total) };
};

const Bills = () => {
  const { sales, allSales, shopSettings, updateSale, deleteSale } = useApp();
  // Editing or deleting a bill can reverse money, so only the owner (admin) sees these actions
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  // Search box starts from /bills?search=..., and follows the URL when it changes
  const urlSearch = searchParams.get("search") || "";
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  if (urlSearch !== prevUrlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearchTerm(urlSearch);
  }
  // The open bill is looked up by id, so it shows the saved changes after an edit and closes after a delete
  const [selectedBillId, setSelectedBillId] = useState(null);
  const selectedBillModal = selectedBillId ? (allSales || sales).find((s) => s.id === selectedBillId) || null : null;
  const [openShare, shareDialog] = useShareImage();

  const [editForm, setEditForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const editingBill = editForm ? (allSales || sales).find((s) => s.id === editForm.saleId) || null : null;

  const currency = shopSettings.currencySymbol || "Rs";
  const cleanSearch = searchTerm.replace(/[-\s]/g, "").toLowerCase();

  const filteredSales = sales.filter(
    (s) =>
      (s.billNumber || "").replace(/[-\s]/g, "").toLowerCase().includes(cleanSearch) ||
      (s.customerName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.customerPhone || "").replace(/[-\s]/g, "").includes(cleanSearch)
  );

  const openBill = (bill) => {
    setSelectedBillId(bill.id);
  };

  const getBillWAText = (bill) => {
    let text = `🧾 *${shopSettings.shopName || "MOBILE SHOP"}*\n`;
    text += `📍 ${shopSettings.address || shopSettings.shopAddress || "Main Market"}\n`;
    text += `📞 ${shopSettings.phone || shopSettings.shopPhone || "+92 300 0000000"}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Receipt #:* ${bill.billNumber || "INV"}\n`;
    if (bill.createdAt) text += `*Date:* ${new Date(bill.createdAt).toLocaleDateString()}\n`;
    text += `*Customer:* ${bill.customerName || "Walk-in Customer"}\n`;
    if (bill.customerPhone) text += `*Phone:* ${bill.customerPhone}\n`;
    text += `*Seller:* ${billSeller(bill)}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (bill.items && bill.items.length > 0) {
      text += `*ITEMS:*\n`;
      bill.items.forEach((item, index) => {
        const returned = itemReturned(item);
        text += `${index + 1}. *${item.productName || item.name}* (x${itemQty(item)}) - ${currency} ${money(itemSubtotal(item))}`;
        if (returned > 0) text += ` _(${returned} of ${itemQty(item)} returned)_`;
        text += `\n`;
        const imeis = itemImeis(item);
        if (imeis.length > 0) text += `   IMEI: ${imeis.join(", ")}\n`;
      });
      text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    }
    if (Number(bill.taxAmount || 0) > 0) {
      text += `*Tax${bill.taxPercent ? ` (${bill.taxPercent}%)` : ""}:* ${currency} ${money(bill.taxAmount)}\n`;
    }
    text += `*Total:* ${currency} ${money(bill.grandTotal)}\n`;
    text += `*Paid:* ${currency} ${money(bill.paidAmount)}\n`;
    if (Number(bill.dueAmount || 0) > 0) {
      text += `*⚠️ Balance Due:* ${currency} ${money(bill.dueAmount)}\n`;
    }
    text += `*Payment:* ${bill.paymentMethod || "Cash"}${bill.paymentStatus === "returned" ? " (Returned)" : ""}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Thank you for your business! 🙏`;
    return text;
  };

  // Share the bill as a picture: preview, then WhatsApp / any app / copy / download
  const handleWhatsAppShare = () => {
    if (!selectedBillModal) return;
    openShare({
      element: document.getElementById("bill-slip-content"),
      fileName: `Invoice_${selectedBillModal.billNumber || "INV"}.png`,
      phone: selectedBillModal.customerPhone,
      text: getBillWAText(selectedBillModal),
      title: "Share Invoice",
    });
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const openEdit = (bill) => isAdmin && setEditForm(editFormFor(bill));
  const setField = (field, value) => setEditForm((f) => ({ ...f, [field]: value }));
  const setRate = (idx, value) => setEditForm((f) => ({ ...f, rates: f.rates.map((r, i) => (i === idx ? value : r)) }));

  const handleSaveEdit = async () => {
    if (!isAdmin || !editForm || !editingBill || isSaving) return;
    const bill = editingBill;
    const settlement = isSettlement(bill);
    const amountsLocked = hasReturns(bill);
    const data = {};

    // Only the fields that changed are sent
    if (editForm.notes.trim() !== (bill.notes || "").trim()) data.notes = editForm.notes.trim();
    if (!settlement) {
      if (!editForm.customerName.trim()) {
        alert("Customer name cannot be empty.");
        return;
      }
      if (editForm.customerName.trim() !== (bill.customerName || "").trim()) data.customerName = editForm.customerName.trim();
      if (editForm.customerPhone.trim() !== (bill.customerPhone || "").trim()) data.customerPhone = editForm.customerPhone.trim();
      if (editForm.sellerName !== (bill.sellerName || "")) data.sellerName = editForm.sellerName;
      if (editForm.dueDate !== dateOnly(bill.dueDate)) data.dueDate = editForm.dueDate || null;
    }

    if (!amountsLocked) {
      if (editForm.paidAmount === "" || Number(editForm.paidAmount) < 0) {
        alert("Enter the amount paid (0 or more).");
        return;
      }
      if (Number(editForm.paidAmount) !== Number(bill.paidAmount || 0)) data.paidAmount = Number(editForm.paidAmount);
      if (!settlement) {
        const badRate = (bill.items || []).findIndex((_, idx) => editForm.rates[idx] === "" || Number(editForm.rates[idx]) < 0);
        if (badRate >= 0) {
          const item = bill.items[badRate];
          alert(`Enter a rate for ${item.productName || item.name || `item ${badRate + 1}`}.`);
          return;
        }
        const rates = (bill.items || [])
          .map((item, index) => ({ index, unitSalePrice: Number(editForm.rates[index]) }))
          .filter((r) => r.unitSalePrice !== itemRate(bill.items[r.index]));
        if (rates.length > 0) data.rates = rates;
        if (Number(editForm.discountAmount) !== Number(bill.discountAmount || 0)) {
          data.discountAmount = Math.max(0, Number(editForm.discountAmount) || 0);
        }

        // Money still due goes on a customer's Udhaar, so a walk-in bill cannot be left with a balance
        const moneyChanged = data.rates || data.discountAmount !== undefined || data.paidAmount !== undefined;
        const preview = previewTotals(bill, editForm);
        if (moneyChanged && preview.due > 0 && !bill.customerId) {
          alert(`This bill has no registered customer, so Rs ${money(preview.due)} cannot be left due. Set Paid to Rs ${money(preview.total)}.`);
          return;
        }
      }
    }

    if (Object.keys(data).length === 0) {
      setEditForm(null);
      return;
    }

    setIsSaving(true);
    try {
      const saved = await updateSale(bill.id, data);
      if (saved) setEditForm(null);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (bill) => {
    if (!isAdmin || !bill || deletingId) return;
    const who = bill.customerName || "Walk-in Customer";
    let message;
    if (isSettlement(bill)) {
      message =
        `Delete payment receipt ${bill.billNumber}?\n\n` +
        `• Rs ${money(bill.paidAmount)} goes back on ${who}'s Udhaar\n` +
        `• The receipt is removed\n\nThis cannot be undone.`;
    } else {
      const toStock = (bill.items || []).reduce((sum, i) => sum + (itemQty(i) - itemReturned(i)), 0);
      const extra = Math.max(0, Number(bill.paidAmount || 0) - Number(bill.grandTotal || 0));
      const lines = [
        toStock > 0 ? `• Items go back to stock (${toStock} pcs)` : "• All items were already returned to stock",
        Number(bill.dueAmount || 0) > 0
          ? `• Rs ${money(bill.dueAmount)} Udhaar is removed from ${who}`
          : `• No Udhaar on this bill for ${who}`,
      ];
      if (Number(bill.paidAmount || 0) > 0) lines.push(`• The Rs ${money(bill.paidAmount)} payment is reversed`);
      if (extra > 0) lines.push(`• Rs ${money(extra)} that was paid towards old Udhaar goes back on ${who}'s Udhaar`);
      lines.push("• The bill is removed");
      message = `Delete bill ${bill.billNumber}?\n\n${lines.join("\n")}\n\nThis cannot be undone.`;
    }
    if (!window.confirm(message)) return;

    setDeletingId(bill.id);
    try {
      const ok = await deleteSale(bill.id);
      if (ok && selectedBillId === bill.id) setSelectedBillId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const statusBadge = (bill) =>
    bill.paymentStatus === "returned" ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
        <RotateCcw size={10} /> Returned
      </span>
    ) : null;

  return (
    <>
    <div className={`p-6 space-y-6 ${selectedBillModal ? "print:hidden" : ""}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Receipt size={24} className="text-indigo-400" />
            <h1 className="text-xl font-bold text-slate-100">Bills & Customer Invoices History</h1>
          </div>
          <p className="text-xs text-slate-400">
            View past transactions, payment status, logged IMEIs, and reprint, edit or delete invoices
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search Bill #, Customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Bills Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 uppercase bg-slate-950/60 rounded-xl">
              <tr>
                <th className="p-3.5 font-semibold">Bill Number</th>
                <th className="p-3.5 font-semibold">Customer</th>
                <th className="p-3.5 font-semibold">Items & IMEIs</th>
                <th className="p-3.5 font-semibold">Payment Method</th>
                <th className="p-3.5 font-semibold">Grand Total</th>
                <th className="p-3.5 font-semibold">Paid / Due</th>
                <th className="p-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-indigo-400">
                    {sale.billNumber}
                    <div className="text-[10px] text-slate-500 font-sans font-normal mt-0.5">
                      {new Date(sale.createdAt).toLocaleString()}
                    </div>
                  </td>

                  <td className="p-3.5">
                    <div className="font-bold text-slate-100">{sale.customerName}</div>
                    <div className="text-[11px] text-slate-400">{sale.customerPhone || "N/A"}</div>
                  </td>

                  <td className="p-3.5">
                    <div className="text-slate-200 space-y-0.5">
                      {(sale.items || []).map((i, idx) => {
                        const returned = itemReturned(i);
                        const all = returned > 0 && returned >= itemQty(i);
                        return (
                          <div key={idx}>
                            <span className={all ? "line-through text-slate-500" : ""}>{i.productName || i.name}</span>
                            {returned > 0 && (
                              <span className="ml-1.5 text-[10px] font-bold text-rose-300">
                                {all ? "Returned" : `${returned} of ${itemQty(i)} returned`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {(sale.items || []).some((i) => itemImeis(i).length > 0) && (
                      <div className="font-mono text-[10px] text-cyan-400 mt-0.5">
                        IMEI: {(sale.items || []).flatMap(itemImeis).join(", ")}
                      </div>
                    )}
                  </td>

                  <td className="p-3.5 space-y-1">
                    <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-950 text-indigo-300 border border-slate-800">
                      {sale.paymentMethod}
                    </span>
                    {statusBadge(sale) && <div>{statusBadge(sale)}</div>}
                  </td>

                  <td className="p-3.5 font-extrabold text-slate-100">
                    {shopSettings.currencySymbol} {money(sale.grandTotal)}
                  </td>

                  <td className="p-3.5">
                    <div className="text-emerald-400 font-bold">Paid: {shopSettings.currencySymbol} {money(sale.paidAmount)}</div>
                    {sale.dueAmount > 0 && (
                      <div className="text-rose-400 font-bold text-[11px]">Due: {shopSettings.currencySymbol} {money(sale.dueAmount)}</div>
                    )}
                  </td>

                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openBill(sale)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold flex items-center gap-1"
                      >
                        <Eye size={14} />
                        <span>View</span>
                      </button>
                      {isAdmin && (<>
                      <button
                        onClick={() => openEdit(sale)}
                        title="Edit this bill"
                        className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded-xl font-semibold flex items-center gap-1"
                      >
                        <Pencil size={14} />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(sale)}
                        disabled={!!deletingId}
                        title="Delete this bill"
                        className="px-2.5 py-1.5 bg-rose-600/15 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        <span className="sr-only">Delete</span>
                      </button>
                      </>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    {/* Selected Bill Printable Slip Modal - Micro Thermal Roll Format */}
    {selectedBillModal && (
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto print:static print:bg-transparent print:p-0 print:block">
        <div className="bg-white text-slate-900 w-full max-w-[340px] rounded-2xl p-5 shadow-2xl relative font-mono text-xs print:p-0 print:shadow-none print:w-full print:max-w-none print:rounded-none my-auto">
          <button
            onClick={() => setSelectedBillId(null)}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-800 print:hidden p-1 rounded-full hover:bg-slate-100 z-10"
          >
            <X size={18} />
          </button>

          <div id="bill-slip-content" className="p-0 bg-white text-black print-target space-y-4">

            {/* Thermal Receipt Header */}
            <div className="text-center pb-2 border-b border-dashed border-slate-300">
              <h2 className="text-base font-black text-slate-950 tracking-tight uppercase">
                {shopSettings.shopName || "MOBILE SHOP"}
              </h2>
              <p className="text-[10px] text-slate-600 mt-0.5">{shopSettings.address || shopSettings.shopAddress || "Main Market"}</p>
              <p className="text-[10px] text-slate-600">Ph: {shopSettings.phone || shopSettings.shopPhone || "+92 300 0000000"}</p>
              <div className="mt-1.5 inline-block text-[9px] font-bold px-2 py-0.5 bg-slate-100 rounded border border-slate-200 uppercase tracking-widest text-slate-700">
                {isSettlement(selectedBillModal) ? "Payment Slip" : "Sales Slip"}
              </div>
            </div>

            {/* Bill Details */}
            <div className="text-[11px] leading-tight space-y-1 border-b border-dashed border-slate-300 pb-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Bill #:</span>
                <span className="font-bold text-slate-900">{selectedBillModal.billNumber || "INV-001"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span className="text-slate-900">{new Date(selectedBillModal.createdAt).toLocaleDateString()} {new Date(selectedBillModal.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900">{selectedBillModal.customerName || "Walk-in"}</span>
              </div>
              {selectedBillModal.customerPhone && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <span className="text-slate-900">{selectedBillModal.customerPhone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Payment:</span>
                <span className="font-bold text-slate-800">
                  {selectedBillModal.paymentMethod}
                  {selectedBillModal.paymentStatus === "returned" && (
                    <span className="ml-1 px-1 py-px rounded bg-rose-100 text-rose-700 border border-rose-200 text-[9px] uppercase">Returned</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Seller:</span>
                <span className="text-slate-900">{billSeller(selectedBillModal)}</span>
              </div>
            </div>

            {/* Items Table */}
            {selectedBillModal.items && selectedBillModal.items.length > 0 && (
              <div className="border-b border-dashed border-slate-300 pb-2">
                <div className="flex justify-between font-bold text-[10px] text-slate-500 uppercase border-b border-slate-200 pb-1 mb-1">
                  <span>Item / Qty</span>
                  <span className="text-right">Subtotal</span>
                </div>
                <div className="space-y-1.5">
                  {selectedBillModal.items.map((item, index) => {
                    const returned = itemReturned(item);
                    const all = returned > 0 && returned >= itemQty(item);
                    const returnedImeis = item.returnedImeis || [];
                    return (
                      <div key={index} className="text-[11px] leading-tight">
                        <div className="flex justify-between items-start gap-1 font-bold text-slate-900">
                          <span className={all ? "line-through text-slate-500" : ""}>{item.productName || item.name}</span>
                          {returned > 0 && (
                            <span className="shrink-0 px-1 py-px rounded bg-rose-100 text-rose-700 border border-rose-200 text-[9px] uppercase">
                              {all ? "Returned" : `${returned} of ${itemQty(item)} returned`}
                            </span>
                          )}
                        </div>
                        {itemImeis(item).length > 0 && (
                          <div className="text-[9.5px] text-slate-600 bg-slate-50 p-1 rounded font-mono border border-slate-100 my-0.5">
                            IMEI:{" "}
                            {itemImeis(item).map((imei, i) => (
                              <span key={imei} className={returnedImeis.includes(imei) ? "line-through text-slate-400" : ""}>
                                {imei}{i < itemImeis(item).length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex justify-between text-slate-600 text-[10.5px]">
                          <span>{itemQty(item)} x Rs {money(itemRate(item))}</span>
                          <span className={`font-bold text-slate-900 ${all ? "line-through text-slate-500" : ""}`}>Rs {money(itemSubtotal(item))}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Financial Summary */}
            {isSettlement(selectedBillModal) ? (
              <div className="space-y-1 text-[11px] pt-1">
                <div className="flex justify-between text-slate-950 font-black text-sm pt-1 border-t border-slate-900">
                  <span>AMOUNT RECEIVED:</span>
                  <span>Rs {money(selectedBillModal.paidAmount)}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-[11px] pt-1">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>
                    Rs {money(
                      selectedBillModal.subtotalAmount ||
                        (selectedBillModal.items || []).reduce((sum, i) => sum + itemSubtotal(i), 0)
                    )}
                  </span>
                </div>
                {Number(selectedBillModal.taxAmount || 0) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax{selectedBillModal.taxPercent ? ` (${selectedBillModal.taxPercent}%)` : ""}:</span>
                    <span>+ Rs {money(selectedBillModal.taxAmount)}</span>
                  </div>
                )}
                {Number(selectedBillModal.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Discount:</span>
                    <span>- Rs {money(selectedBillModal.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-950 font-black text-sm pt-1 border-t border-slate-900">
                  <span>GRAND TOTAL:</span>
                  <span>Rs {money(selectedBillModal.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span>Paid:</span>
                  <span className="font-bold">Rs {money(selectedBillModal.paidAmount)}</span>
                </div>
                {Number(selectedBillModal.dueAmount || 0) > 0 && (
                  <div className="flex justify-between text-slate-950 font-bold">
                    <span>BALANCE DUE:</span>
                    <span>Rs {money(selectedBillModal.dueAmount)}</span>
                  </div>
                )}
                {selectedBillModal.dueDate && (
                  <div className="flex justify-between text-slate-600">
                    <span>Due Date:</span>
                    <span>{showDate(selectedBillModal.dueDate)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Return history */}
            {(selectedBillModal.returns || []).length > 0 && (
              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1.5 text-[10.5px]">
                <div className="font-bold text-[10px] text-rose-700 uppercase tracking-wider">Returns</div>
                {selectedBillModal.returns.map((r, idx) => (
                  <div key={idx} className="bg-rose-50 border border-rose-100 rounded p-1.5 space-y-0.5">
                    <div className="flex justify-between text-slate-600">
                      <span>{r.date ? new Date(r.date).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}</span>
                      <span className="font-bold text-slate-900">Rs {money(r.amount)}</span>
                    </div>
                    {(r.items || []).map((ri, j) => (
                      <div key={j} className="text-slate-800">
                        {ri.productName || "Item"} x{ri.qty || 1}
                        {(ri.imeis || []).length > 0 && <span className="text-slate-500"> ({ri.imeis.join(", ")})</span>}
                      </div>
                    ))}
                    {Number(r.dueReduced || 0) > 0 && (
                      <div className="text-slate-600">Udhaar reduced: Rs {money(r.dueReduced)}</div>
                    )}
                    {Number(r.cashBack || 0) > 0 && (
                      <div className="text-slate-600">Cash given back: Rs {money(r.cashBack)}</div>
                    )}
                    {r.note && <div className="text-slate-500 italic">{r.note}</div>}
                  </div>
                ))}
              </div>
            )}

            {selectedBillModal.notes && (
              <div className="text-[10px] text-slate-600 border-t border-dashed border-slate-300 pt-2">
                Note: {selectedBillModal.notes}
              </div>
            )}

            {/* Footer */}
            <div className="text-center pt-2 border-t border-dashed border-slate-300 space-y-1.5">
              <p className="text-[9px] text-slate-400 font-mono tracking-widest uppercase">
                *{selectedBillModal.billNumber || "INV-001"}*
              </p>
              <p className="text-[10px] text-slate-600 font-medium">Thank you for your business!</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 print:hidden">
              <button
                onClick={() => printElement("bill-slip-content", "Sales Bill")}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow"
              >
                <Printer size={14} />
                <span>Print</span>
              </button>
              <button
                onClick={handleWhatsAppShare}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow"
              >
                <Smartphone size={14} /> Share
              </button>
              <button
                onClick={() => setSelectedBillId(null)}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl"
              >
                Close
              </button>
            </div>
          {isAdmin && (
          <div className="flex gap-2 pt-2 print:hidden">
            <button
              onClick={() => openEdit(selectedBillModal)}
              className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-indigo-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
            >
              <Pencil size={14} />
              <span>Edit Bill</span>
            </button>
            <button
              onClick={() => handleDelete(selectedBillModal)}
              disabled={!!deletingId}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Trash2 size={14} />
              <span>{deletingId === selectedBillModal.id ? "Deleting…" : "Delete Bill"}</span>
            </button>
          </div>
          )}
          </div>
        </div>
      )}

    {/* Edit Bill Modal */}
    {isAdmin && editForm && editingBill && (() => {
      const bill = editingBill;
      const settlement = isSettlement(bill);
      const amountsLocked = hasReturns(bill);
      const preview = previewTotals(bill, editForm);
      const input = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50";
      const label = "text-[11px] font-semibold text-slate-400 uppercase mb-1 block";
      return (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[60] flex items-center justify-center p-4 print:hidden">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex justify-between items-center p-5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Pencil size={18} className="text-indigo-400" />
                <div>
                  <h2 className="text-base font-bold text-slate-100">
                    {settlement ? "Edit Payment Receipt" : "Edit Bill"} <span className="font-mono text-indigo-400">{bill.billNumber}</span>
                  </h2>
                  <p className="text-[11px] text-slate-400">Change what you need and press Save. Totals and Udhaar are recalculated.</p>
                </div>
              </div>
              <button onClick={() => setEditForm(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
              {!settlement && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={label}>Customer Name</label>
                      <input type="text" value={editForm.customerName} onChange={(e) => setField("customerName", e.target.value)} className={input} />
                    </div>
                    <div>
                      <label className={label}>Phone</label>
                      <input type="text" value={editForm.customerPhone} onChange={(e) => setField("customerPhone", e.target.value)} className={input} />
                    </div>
                    <div>
                      <label className={label}>Seller</label>
                      <select value={editForm.sellerName} onChange={(e) => setField("sellerName", e.target.value)} className={input}>
                        <option value="">-- None --</option>
                        {SELLERS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                        {editForm.sellerName && !SELLERS.includes(editForm.sellerName) && (
                          <option value={editForm.sellerName}>{editForm.sellerName}</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Due Date</label>
                      <input type="date" value={editForm.dueDate} onChange={(e) => setField("dueDate", e.target.value)} className={input} />
                    </div>
                  </div>
                  {bill.customerId && (editForm.customerName.trim() !== (bill.customerName || "").trim() || editForm.customerPhone.trim() !== (bill.customerPhone || "").trim()) && (
                    <p className="text-[11px] text-slate-400">This changes the name / phone printed on this bill only, not the customer's account.</p>
                  )}
                </>
              )}

              {amountsLocked && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-xs font-semibold border bg-amber-500/10 text-amber-300 border-amber-500/30">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>This bill has returned items, so its amounts cannot be changed. You can still edit the customer, seller, due date and notes.</span>
                </div>
              )}

              {/* Rates per line */}
              {!settlement && (bill.items || []).length > 0 && (
                <div>
                  <label className={label}>Item Rates</label>
                  <div className="space-y-2">
                    {bill.items.map((item, idx) => {
                      const returned = itemReturned(item);
                      return (
                        <div key={idx} className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-200 truncate">{item.productName || item.name}</div>
                            <div className="text-[10px] text-slate-500">
                              Qty {itemQty(item)}
                              {returned > 0 && <span className="text-rose-300"> · {returned} of {itemQty(item)} returned</span>}
                            </div>
                          </div>
                          <input
                            type="number"
                            min="0"
                            value={editForm.rates[idx]}
                            onChange={(e) => setRate(idx, e.target.value)}
                            disabled={amountsLocked}
                            className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-right text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                          />
                          <div className="w-24 text-right text-xs font-bold text-slate-300">
                            Rs {money(Number(editForm.rates[idx]) !== itemRate(item) ? Math.max(0, Number(editForm.rates[idx]) || 0) * itemQty(item) : itemSubtotal(item))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!settlement && (
                  <div>
                    <label className={label}>Discount (Rs)</label>
                    <input type="number" min="0" value={editForm.discountAmount} onChange={(e) => setField("discountAmount", e.target.value)} disabled={amountsLocked} className={input} />
                  </div>
                )}
                <div className={settlement ? "sm:col-span-2" : ""}>
                  <label className={label}>{settlement ? "Amount Received (Rs)" : "Paid (Rs)"}</label>
                  <input type="number" min="0" value={editForm.paidAmount} onChange={(e) => setField("paidAmount", e.target.value)} disabled={amountsLocked} className={input} />
                </div>
              </div>

              <div>
                <label className={label}>Notes</label>
                <textarea rows={2} value={editForm.notes} onChange={(e) => setField("notes", e.target.value)} className={`${input} resize-none`} />
              </div>

              {/* Live preview */}
              {settlement ? (
                Number(editForm.paidAmount || 0) !== Number(bill.paidAmount || 0) && !amountsLocked && (
                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 text-xs text-slate-300">
                    {bill.customerName}'s Udhaar will{" "}
                    {preview.paid > Number(bill.paidAmount || 0)
                      ? <span className="text-emerald-400 font-bold">go down by Rs {money(preview.paid - Number(bill.paidAmount || 0))}</span>
                      : <span className="text-rose-400 font-bold">go up by Rs {money(Number(bill.paidAmount || 0) - preview.paid)}</span>}
                    .
                  </div>
                )
              ) : (
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>Rs {money(preview.subtotal)}</span></div>
                  {preview.tax > 0 && (
                    <div className="flex justify-between text-slate-400"><span>Tax ({bill.taxPercent}%)</span><span>+ Rs {money(preview.tax)}</span></div>
                  )}
                  {preview.discount > 0 && (
                    <div className="flex justify-between text-slate-400"><span>Discount</span><span>- Rs {money(preview.discount)}</span></div>
                  )}
                  <div className="flex justify-between text-slate-100 font-extrabold text-sm pt-1 border-t border-slate-800">
                    <span>New Total</span>
                    <span>
                      Rs {money(preview.total)}
                      {preview.total !== Number(bill.grandTotal || 0) && (
                        <span className="ml-1.5 text-[10px] font-semibold text-slate-500 line-through">Rs {money(bill.grandTotal)}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-400 font-bold"><span>Paid</span><span>Rs {money(preview.paid)}</span></div>
                  <div className={`flex justify-between font-bold ${preview.due > 0 ? "text-rose-400" : "text-slate-400"}`}>
                    <span>New Due (Udhaar)</span>
                    <span>
                      Rs {money(preview.due)}
                      {preview.due !== Number(bill.dueAmount || 0) && (
                        <span className="ml-1.5 text-[10px] font-semibold text-slate-500 line-through">Rs {money(bill.dueAmount)}</span>
                      )}
                    </span>
                  </div>
                  {preview.extra > 0 && (
                    <div className="text-[11px] text-amber-300">Rs {money(preview.extra)} paid above the bill goes against the customer's old Udhaar.</div>
                  )}
                  {preview.due > 0 && !bill.customerId && (
                    <div className="text-[11px] text-rose-300">No registered customer on this bill — it cannot be left with money due.</div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 p-5 border-t border-slate-800">
              <button
                onClick={() => setEditForm(null)}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow disabled:opacity-60"
              >
                <Pencil size={14} />
                {isSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {shareDialog}
    </>
  );
};

export default Bills;
