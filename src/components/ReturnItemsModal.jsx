import { useState } from "react";
import { Undo2, AlertCircle } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Modal, Button, Field, Input, Textarea, Badge } from "./ui";
import { itemImeis } from "../utils/sales";

const qtyOf = (i) => Math.max(1, Number(i.quantity || i.qty || 1));
const priceOf = (i) => Number(i.unitSalePrice || i.price || 0) || Number(i.subtotal || 0) / qtyOf(i);

// What can still be returned from one bill line
const lineInfo = (item) => {
  const sold = qtyOf(item);
  const returnedQty = Number(item.returnedQty || 0);
  const returnedImeis = item.returnedImeis || [];
  const imeisLeft = itemImeis(item).filter((k) => !returnedImeis.includes(k));
  return { sold, returnedQty, left: Math.max(0, sold - returnedQty), imeisLeft, isPhone: itemImeis(item).length > 0 };
};

/**
 * Return items from any bill (walk-in or customer). The server puts the items back in stock,
 * voids phone warranties, lowers the bill and the customer's Udhaar (cash back for the rest).
 * props: sale (normalized), currency, onClose(), onDone(updatedSale)
 */
const ReturnItemsModal = ({ sale, currency = "Rs.", onClose, onDone }) => {
  const { returnSaleItems } = useApp();
  const [picked, setPicked] = useState({}); // index -> { imeis: [], qty: "" }
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const items = sale?.items || [];
  const fmt = (n) => Number(n || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });

  const toggleImei = (index, imei) =>
    setPicked((p) => {
      const cur = p[index]?.imeis || [];
      return { ...p, [index]: { ...p[index], imeis: cur.includes(imei) ? cur.filter((k) => k !== imei) : [...cur, imei] } };
    });
  const setQty = (index, value) => setPicked((p) => ({ ...p, [index]: { ...p[index], qty: value } }));

  const requests = items
    .map((item, index) => {
      const info = lineInfo(item);
      const sel = picked[index] || {};
      if (info.isPhone) {
        const imeis = (sel.imeis || []).filter((k) => info.imeisLeft.includes(k));
        return imeis.length ? { index, qty: imeis.length, imeis, amount: priceOf(item) * imeis.length } : null;
      }
      const qty = Math.floor(Number(sel.qty) || 0);
      return qty > 0 ? { index, qty: Math.min(qty, info.left), amount: priceOf(item) * Math.min(qty, info.left) } : null;
    })
    .filter(Boolean);
  const refund = requests.reduce((s, r) => s + r.amount, 0);
  const hasDiscount = Number(sale?.discountAmount || 0) > 0 || Number(sale?.taxAmount || 0) > 0;

  const submit = async () => {
    if (saving) return;
    if (requests.length === 0) {
      setError("Choose at least one item to return.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const updated = await returnSaleItems(
        sale.id,
        requests.map(({ index, qty, imeis }) => ({ index, qty, ...(imeis ? { imeis } : {}) })),
        note.trim()
      );
      if (updated) onDone?.(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      z="z-[70]"
      size="lg"
      closeOnBackdrop={false}
      title={`Return items from ${sale.billNumber}`}
      description="Returned items go back into stock and can be sold again. The bill and any Udhaar on it go down."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="danger" icon={Undo2} onClick={submit} loading={saving} disabled={requests.length === 0}>
            {saving ? "Returning…" : `Return items${refund > 0 ? ` · ${currency} ${fmt(refund)}` : ""}`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {items.map((item, index) => {
          const info = lineInfo(item);
          const name = item.productName || item.name || "Item";
          return (
            <div key={index} className="rounded-xl border border-line p-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-ink text-sm">{name}</div>
                  <div className="text-xs text-muted">
                    {info.sold} sold at {currency} {fmt(priceOf(item))} each
                    {info.returnedQty > 0 && ` · ${info.returnedQty} already returned`}
                  </div>
                </div>
                {info.left === 0 && <Badge tone="neutral">Fully returned</Badge>}
              </div>

              {info.left > 0 && info.isPhone && (
                <div className="flex flex-wrap gap-2">
                  {info.imeisLeft.map((imei) => {
                    const on = (picked[index]?.imeis || []).includes(imei);
                    return (
                      <label
                        key={imei}
                        className={`inline-flex items-center gap-2 h-10 px-3 rounded-lg border text-xs font-mono cursor-pointer ${
                          on ? "border-khata-300 bg-khata-50 text-khata-700" : "border-line-strong text-ink-soft hover:bg-sunken"
                        }`}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggleImei(index, imei)} className="accent-khata-600" />
                        {imei}
                      </label>
                    );
                  })}
                </div>
              )}

              {info.left > 0 && !info.isPhone && (
                <Field label={`How many to return (up to ${info.left})`} htmlFor={`ret-qty-${index}`}>
                  <Input
                    id={`ret-qty-${index}`}
                    type="number"
                    min="0"
                    max={info.left}
                    inputMode="numeric"
                    value={picked[index]?.qty ?? ""}
                    onChange={(e) => setQty(index, e.target.value)}
                    className="max-w-[10rem]"
                  />
                </Field>
              )}
            </div>
          );
        })}

        <Field label="Note (optional)" htmlFor="ret-note">
          <Textarea id="ret-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. faulty screen" />
        </Field>

        {refund > 0 && (
          <div className="rounded-xl bg-sunken p-3 text-sm text-ink-soft">
            Refund about <span className="font-semibold text-ink">{currency} {fmt(refund)}</span>.
            {" "}It comes off this bill&apos;s Udhaar first; anything above that is cash back to the customer.
            {hasDiscount && " The bill's discount or tax is shared over its items, so the final amount can differ slightly."}
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm text-khata-700">
            <AlertCircle size={15} /> {error}
          </p>
        )}
      </div>
    </Modal>
  );
};

export default ReturnItemsModal;
