import { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, SELLERS } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { Receipt, Search, Printer, Eye, X, Smartphone, Pencil, Trash2, RotateCcw, AlertCircle, Undo2 } from "lucide-react";
import ReturnItemsModal from "../components/ReturnItemsModal";
import { useShareImage } from "../components/useShareImage";
import { printElement } from "../services/printReceipt";
import { Page, PageHeader, Card, Badge, Money, Button, IconButton, Field, Input, Select, Textarea, Segmented, TableWrap, Th, Td, EmptyState, Modal, inputClass } from "../components/ui";
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
  // Bill whose items are being returned (owner only)
  const [returningId, setReturningId] = useState(null);
  const returningBill = returningId ? (allSales || sales).find((s) => s.id === returningId) || null : null;
  const selectedBillModal = selectedBillId ? (allSales || sales).find((s) => s.id === selectedBillId) || null : null;
  const [openShare, shareDialog] = useShareImage();

  const [editForm, setEditForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const editingBill = editForm ? (allSales || sales).find((s) => s.id === editForm.saleId) || null : null;
  // Same function every render (Modal re-focuses itself whenever onClose changes)
  const closeEdit = useCallback(() => setEditForm(null), []);

  // List filter: all / Udhaar due / paid / returns / payment receipts
  const [filter, setFilter] = useState("all");

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
      <Badge tone="saffron">
        <RotateCcw size={10} aria-hidden="true" /> Returned
      </Badge>
    ) : null;

  // List filter (on top of the search)
  const matchesFilter = (s) => {
    if (filter === "due") return Number(s.dueAmount || 0) > 0;
    if (filter === "paid") return Number(s.dueAmount || 0) <= 0 && s.paymentStatus !== "returned" && !isSettlement(s);
    if (filter === "returns") return s.paymentStatus === "returned" || hasReturns(s);
    if (filter === "receipts") return isSettlement(s);
    return true;
  };
  const visibleSales = filteredSales.filter(matchesFilter);

  // Small pieces shared by the table (desktop) and the cards (phone)
  const itemsList = (sale) => (
    <>
      <div className="space-y-0.5">
        {(sale.items || []).map((i, idx) => {
          const returned = itemReturned(i);
          const all = returned > 0 && returned >= itemQty(i);
          return (
            <div key={idx} className="text-ink">
              <span className={all ? "line-through text-muted" : ""}>{i.productName || i.name}</span>
              {returned > 0 && (
                <span className="ml-1.5 text-xs font-semibold text-saffron-700">
                  {all ? "Returned" : `${returned} of ${itemQty(i)} returned`}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {(sale.items || []).some((i) => itemImeis(i).length > 0) && (
        <div className="font-mono text-xs text-muted mt-1 break-all">
          IMEI: {(sale.items || []).flatMap(itemImeis).join(", ")}
        </div>
      )}
    </>
  );

  const billBadges = (sale) => (
    <div className="flex flex-wrap items-center gap-1">
      <Badge tone={isSettlement(sale) ? "paid" : "neutral"}>{isSettlement(sale) ? "Payment receipt" : sale.paymentMethod}</Badge>
      {isSettlement(sale) && sale.paymentMethod && <Badge>{sale.paymentMethod}</Badge>}
      {statusBadge(sale)}
    </div>
  );

  const paidDue = (sale) => (
    <div className="space-y-0.5">
      <div className="text-paid-600 font-semibold">Paid <Money amount={sale.paidAmount} currency={currency} /></div>
      {sale.dueAmount > 0 && (
        <div className="text-khata-600 font-semibold">Udhaar <Money amount={sale.dueAmount} currency={currency} /></div>
      )}
    </div>
  );

  const rowActions = (sale) => (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="secondary" size="sm" icon={Eye} onClick={() => openBill(sale)}>View</Button>
      {isAdmin && (
        <>
          <IconButton icon={Pencil} label="Edit bill" variant="secondary" size="sm" onClick={() => openEdit(sale)} />
          <IconButton
            icon={Trash2}
            label="Delete bill"
            variant="danger-soft"
            size="sm"
            onClick={() => handleDelete(sale)}
            disabled={!!deletingId}
          />
        </>
      )}
    </div>
  );

  const FILTERS = [
    { value: "all", label: "All" },
    { value: "due", label: "Udhaar due" },
    { value: "paid", label: "Paid" },
    { value: "returns", label: "Returns" },
    { value: "receipts", label: "Payment receipts" },
  ];

  return (
    <>
    <div className={selectedBillModal ? "print:hidden" : ""}>
    <Page>
      <PageHeader
        title="Bills"
        description={`Past bills and payment receipts. Open one to print or share it${isAdmin ? ", or to edit or delete it" : ""}.`}
      />

      <Card padded={false}>
        {/* Search and filters */}
        <div className="flex flex-col gap-3 p-4 sm:p-5 border-b border-line lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input
              type="search"
              placeholder="Search bill number, customer or phone"
              aria-label="Search bills"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented options={FILTERS} value={filter} onChange={setFilter} size="sm" />
            <span className="text-xs text-muted">
              {visibleSales.length} of {sales.length} bill{sales.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {visibleSales.length === 0 ? (
          sales.length === 0 ? (
            <EmptyState icon={Receipt} title="No bills yet" description="Bills show up here after a sale. Start one from New sale or the Billing ledger." />
          ) : (
            <EmptyState
              icon={Search}
              title="No bills match"
              description="Try another bill number, name or phone, or pick All."
              action={
                (searchTerm || filter !== "all") && (
                  <Button variant="secondary" onClick={() => { setSearchTerm(""); setFilter("all"); }}>Clear search and filter</Button>
                )
              }
            />
          )
        ) : (
          <>
            {/* Desktop / tablet: table */}
            <div className="hidden md:block px-5 pb-2 pt-3">
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Bill</Th>
                    <Th>Customer</Th>
                    <Th>Items and IMEIs</Th>
                    <Th>Payment</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">Paid / Udhaar</Th>
                    <Th className="text-right"><span className="sr-only">Actions</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-sunken/50 transition-colors align-top">
                      <Td className="align-top">
                        <div className="font-mono font-semibold text-brand-700 whitespace-nowrap">{sale.billNumber}</div>
                        <div className="text-xs text-muted mt-0.5 whitespace-nowrap">{new Date(sale.createdAt).toLocaleString()}</div>
                      </Td>
                      <Td className="align-top">
                        <div className="font-semibold text-ink">{sale.customerName}</div>
                        <div className="text-xs text-muted">{sale.customerPhone || "No phone"}</div>
                      </Td>
                      <Td className="align-top min-w-[180px] max-w-[300px]">{itemsList(sale)}</Td>
                      <Td className="align-top">{billBadges(sale)}</Td>
                      <Td className="align-top text-right font-semibold text-ink">
                        <Money amount={sale.grandTotal} currency={currency} />
                      </Td>
                      <Td className="align-top text-right">{paidDue(sale)}</Td>
                      <Td className="align-top whitespace-nowrap">{rowActions(sale)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>

            {/* Phone: one card per bill */}
            <ul className="md:hidden divide-y divide-line">
              {visibleSales.map((sale) => (
                <li key={sale.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-brand-700 break-all">{sale.billNumber}</div>
                      <div className="text-xs text-muted mt-0.5">{new Date(sale.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display text-lg font-bold text-ink">
                        <Money amount={sale.grandTotal} currency={currency} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-ink">{sale.customerName}</div>
                    <div className="text-xs text-muted">{sale.customerPhone || "No phone"}</div>
                  </div>
                  <div className="text-sm">{itemsList(sale)}</div>
                  <div className="flex flex-wrap items-end justify-between gap-2 text-sm">
                    {billBadges(sale)}
                    <div className="text-right">{paidDue(sale)}</div>
                  </div>
                  {rowActions(sale)}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </Page>
    </div>

    {/* Selected Bill Printable Slip Modal - Micro Thermal Roll Format */}
    {selectedBillModal && (
      <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-ink/40 backdrop-blur-[2px] sm:p-4 print:static print:bg-transparent print:p-0 print:block">
        <div className="bg-surface w-full sm:max-w-[26rem] h-full sm:h-auto sm:max-h-[92vh] sm:rounded-2xl shadow-pop flex flex-col print:block print:h-auto print:max-h-none print:shadow-none print:w-full print:max-w-none print:rounded-none">
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-line print:hidden">
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-snug">{isSettlement(selectedBillModal) ? "Payment receipt" : "Bill"}</h2>
              <p className="text-xs text-muted mt-0.5 font-mono break-all">{selectedBillModal.billNumber}</p>
            </div>
            <IconButton icon={X} label="Close" size="sm" onClick={() => setSelectedBillId(null)} />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar bg-sunken p-4 print:p-0 print:bg-transparent print:overflow-visible">
          <div className="mx-auto w-full max-w-[340px] rounded-xl border border-line bg-white p-5 shadow-card font-mono text-xs text-black print:p-0 print:border-0 print:shadow-none print:max-w-none print:rounded-none">
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
          </div>
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-line bg-surface sm:rounded-b-2xl space-y-2 print:hidden">
            <div className="grid grid-cols-3 gap-2">
              <Button icon={Printer} onClick={() => printElement("bill-slip-content", "Sales Bill")}>Print</Button>
              <Button variant="success" icon={Smartphone} onClick={handleWhatsAppShare}>Share</Button>
              <Button variant="secondary" onClick={() => setSelectedBillId(null)}>Close</Button>
            </div>
            {isAdmin && !isSettlement(selectedBillModal) && (selectedBillModal.items || []).some((i) => Number(i.returnedQty || 0) < Math.max(1, Number(i.quantity || i.qty || 1))) && (
              <Button variant="danger-soft" icon={Undo2} onClick={() => setReturningId(selectedBillModal.id)} className="w-full">
                Return items
              </Button>
            )}
            {isAdmin && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" icon={Pencil} onClick={() => openEdit(selectedBillModal)}>
                  {isSettlement(selectedBillModal) ? "Edit receipt" : "Edit bill"}
                </Button>
                <Button
                  variant="danger-soft"
                  icon={Trash2}
                  onClick={() => handleDelete(selectedBillModal)}
                  disabled={!!deletingId}
                >
                  {deletingId === selectedBillModal.id ? "Deleting…" : isSettlement(selectedBillModal) ? "Delete receipt" : "Delete bill"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {isAdmin && returningBill && (
      <ReturnItemsModal
        sale={returningBill}
        currency={currency}
        onClose={() => setReturningId(null)}
        onDone={() => setReturningId(null)}
      />
    )}

    {/* Edit Bill Modal */}
    {isAdmin && editForm && editingBill && (() => {
      const bill = editingBill;
      const settlement = isSettlement(bill);
      const amountsLocked = hasReturns(bill);
      const preview = previewTotals(bill, editForm);
      return (
        <Modal
          open
          onClose={closeEdit}
          z="z-[60]"
          size="lg"
          closeOnBackdrop={false}
          title={
            <>
              {settlement ? "Edit payment receipt" : "Edit bill"} <span className="font-mono text-brand-700">{bill.billNumber}</span>
            </>
          }
          description="Change what you need and save. Totals and Udhaar are worked out again."
          footer={
            <>
              <Button variant="secondary" onClick={closeEdit} className="w-full sm:w-auto">Cancel</Button>
              <Button icon={Pencil} onClick={handleSaveEdit} loading={isSaving} className="w-full sm:w-auto">
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {!settlement && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Customer name" htmlFor="edit-customer">
                    <Input id="edit-customer" type="text" value={editForm.customerName} onChange={(e) => setField("customerName", e.target.value)} />
                  </Field>
                  <Field label="Phone" htmlFor="edit-phone">
                    <Input id="edit-phone" type="text" value={editForm.customerPhone} onChange={(e) => setField("customerPhone", e.target.value)} />
                  </Field>
                  <Field label="Seller" htmlFor="edit-seller">
                    <Select id="edit-seller" value={editForm.sellerName} onChange={(e) => setField("sellerName", e.target.value)}>
                      <option value="">None</option>
                      {SELLERS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      {editForm.sellerName && !SELLERS.includes(editForm.sellerName) && (
                        <option value={editForm.sellerName}>{editForm.sellerName}</option>
                      )}
                    </Select>
                  </Field>
                  <Field label="Due date" htmlFor="edit-due">
                    <Input id="edit-due" type="date" value={editForm.dueDate} onChange={(e) => setField("dueDate", e.target.value)} />
                  </Field>
                </div>
                {bill.customerId && (editForm.customerName.trim() !== (bill.customerName || "").trim() || editForm.customerPhone.trim() !== (bill.customerPhone || "").trim()) && (
                  <p className="text-xs text-muted">This changes the name / phone printed on this bill only, not the customer's account.</p>
                )}
              </>
            )}

            {amountsLocked && (
              <div className="flex items-start gap-2 rounded-xl border border-saffron-200 bg-saffron-50 px-3 py-2 text-xs font-semibold text-saffron-700">
                <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>This bill has returned items, so its amounts cannot be changed. You can still edit the customer, seller, due date and notes.</span>
              </div>
            )}

            {/* Rates per line */}
            {!settlement && (bill.items || []).length > 0 && (
              <div>
                <p className="block text-xs font-semibold text-ink-soft mb-1.5">Item rates</p>
                <div className="space-y-2">
                  {bill.items.map((item, idx) => {
                    const returned = itemReturned(item);
                    return (
                      <div key={idx} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-sunken/60 px-3 py-2">
                        <div className="flex-1 min-w-[140px]">
                          <div className="text-sm font-semibold text-ink break-words">{item.productName || item.name}</div>
                          <div className="text-xs text-muted">
                            Qty {itemQty(item)}
                            {returned > 0 && <span className="text-saffron-700"> · {returned} of {itemQty(item)} returned</span>}
                          </div>
                        </div>
                        <input
                          type="number"
                          min="0"
                          aria-label={`Rate for ${item.productName || item.name || `item ${idx + 1}`}`}
                          value={editForm.rates[idx]}
                          onChange={(e) => setRate(idx, e.target.value)}
                          disabled={amountsLocked}
                          className={`${inputClass} w-28 text-right tabular-nums`}
                        />
                        <div className="w-24 text-right text-sm font-semibold text-ink tabular-nums">
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
                <Field label="Discount (Rs)" htmlFor="edit-discount">
                  <Input id="edit-discount" type="number" min="0" value={editForm.discountAmount} onChange={(e) => setField("discountAmount", e.target.value)} disabled={amountsLocked} />
                </Field>
              )}
              <Field label={settlement ? "Amount received (Rs)" : "Paid (Rs)"} htmlFor="edit-paid" className={settlement ? "sm:col-span-2" : ""}>
                <Input id="edit-paid" type="number" min="0" value={editForm.paidAmount} onChange={(e) => setField("paidAmount", e.target.value)} disabled={amountsLocked} />
              </Field>
            </div>

            <Field label="Notes" htmlFor="edit-notes">
              <Textarea id="edit-notes" rows={2} value={editForm.notes} onChange={(e) => setField("notes", e.target.value)} />
            </Field>

            {/* Live preview */}
            {settlement ? (
              Number(editForm.paidAmount || 0) !== Number(bill.paidAmount || 0) && !amountsLocked && (
                <div className="rounded-xl border border-line bg-sunken p-3 text-sm text-ink-soft">
                  {bill.customerName}'s Udhaar will{" "}
                  {preview.paid > Number(bill.paidAmount || 0)
                    ? <span className="text-paid-600 font-semibold">go down by Rs {money(preview.paid - Number(bill.paidAmount || 0))}</span>
                    : <span className="text-khata-600 font-semibold">go up by Rs {money(Number(bill.paidAmount || 0) - preview.paid)}</span>}
                  .
                </div>
              )
            ) : (
              <div className="rounded-xl border border-line bg-sunken p-3 space-y-1 text-sm tabular-nums">
                <div className="flex justify-between text-ink-soft"><span>Subtotal</span><span>Rs {money(preview.subtotal)}</span></div>
                {preview.tax > 0 && (
                  <div className="flex justify-between text-ink-soft"><span>Tax ({bill.taxPercent}%)</span><span>+ Rs {money(preview.tax)}</span></div>
                )}
                {preview.discount > 0 && (
                  <div className="flex justify-between text-ink-soft"><span>Discount</span><span>- Rs {money(preview.discount)}</span></div>
                )}
                <div className="flex justify-between gap-2 text-ink font-bold pt-1.5 border-t border-line">
                  <span>New total</span>
                  <span className="text-right">
                    Rs {money(preview.total)}
                    {preview.total !== Number(bill.grandTotal || 0) && (
                      <span className="ml-1.5 text-xs font-semibold text-muted line-through">Rs {money(bill.grandTotal)}</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-paid-600 font-semibold"><span>Paid</span><span>Rs {money(preview.paid)}</span></div>
                <div className={`flex justify-between gap-2 font-semibold ${preview.due > 0 ? "text-khata-600" : "text-ink-soft"}`}>
                  <span>New Udhaar due</span>
                  <span className="text-right">
                    Rs {money(preview.due)}
                    {preview.due !== Number(bill.dueAmount || 0) && (
                      <span className="ml-1.5 text-xs font-semibold text-muted line-through">Rs {money(bill.dueAmount)}</span>
                    )}
                  </span>
                </div>
                {preview.extra > 0 && (
                  <div className="text-xs text-saffron-700">Rs {money(preview.extra)} paid above the bill goes against the customer's old Udhaar.</div>
                )}
                {preview.due > 0 && !bill.customerId && (
                  <div className="text-xs text-khata-600">No registered customer on this bill — it cannot be left with money due.</div>
                )}
              </div>
            )}
          </div>
        </Modal>
      );
    })()}

    {shareDialog}
    </>
  );
};

export default Bills;
