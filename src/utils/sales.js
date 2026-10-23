// Shared rules for reading sales records

// "Udhaar Settlement" records are payments received against a balance, not sales
export const isSettlement = (s) => s?.paymentMethod === "Udhaar Settlement";

// Real sales only (no settlement receipts)
export const realSales = (sales) => (sales || []).filter((s) => !isSettlement(s));

const itemQty = (i) => Number(i.quantity || i.qty || 1);

// Profit of one sale. Uses the stored netProfit when present, otherwise
// revenue minus item cost. Returns null when no item has a recorded cost.
export const saleProfit = (s) => {
  if (!s || isSettlement(s)) return 0;
  const items = s.items || [];
  const hasCost = items.some((i) => i.unitPurchasePrice !== undefined && i.unitPurchasePrice !== null);
  // After a return the server keeps netProfit up to date (it can legitimately be 0)
  if ((s.returns || []).length > 0) return hasCost ? Number(s.netProfit || 0) : null;
  if (Number(s.netProfit)) return Number(s.netProfit);
  if (!hasCost) return null;
  const cost = items.reduce((sum, i) => sum + Number(i.unitPurchasePrice || 0) * itemQty(i), 0);
  return Number(s.grandTotal || 0) - cost;
};

// Sum of profit over sales; sales with unknown cost add nothing
export const totalProfit = (sales) => (sales || []).reduce((sum, s) => sum + (saleProfit(s) || 0), 0);

// Units still sold on the bill (returned units are not counted)
export const itemCount = (s) =>
  (s?.items || []).reduce((sum, i) => sum + Math.max(0, itemQty(i) - Number(i.returnedQty || 0)), 0);

// Does this sale belong to this customer? A sale with a customerId only matches that customer;
// name / phone matching is only used for old sales saved without a customerId, and never for a
// walk-in bill (a walk-in who gave a customer's phone number is not that customer's khata).
export const saleBelongsTo = (s, cust) => {
  if (!s || !cust) return false;
  const sid = s.customerId || s.customer;
  if (sid) return sid === cust.id;
  const saleName = (s.customerName || "").trim().toLowerCase();
  if (!saleName || saleName === "walk-in customer") return false;
  if (cust.phone && s.customerPhone && s.customerPhone.trim() === cust.phone.trim()) return true;
  return !!(cust.name && s.customerName && s.customerName.trim().toLowerCase() === cust.name.trim().toLowerCase());
};

// Udhaar a sale added to the customer's balance (any sale with money still due)
export const udhaarAdded = (s) => (isSettlement(s) ? 0 : Math.max(0, Number(s.dueAmount || 0)));

// All IMEIs of a sale item
export const itemImeis = (i) =>
  (i?.imeisArray && i.imeisArray.length > 0 ? i.imeisArray : [i?.imei]).filter(Boolean);

// Money received against Udhaar on one record: a payment receipt, or the part of a customer's sale
// paid above its total (that extra pays off their old balance). The upfront cash on a credit sale
// is sale money, not Udhaar collected. Every page uses this one rule.
export const udhaarCollected = (s) => {
  if (!s) return 0;
  const paid = Number(s.paidAmount || 0);
  if (isSettlement(s)) return Math.max(0, paid);
  if (!(s.customerId || s.customer)) return 0;
  return Math.max(0, paid - Number(s.grandTotal || 0));
};

// Number of records that collected Udhaar
export const isUdhaarCollection = (s) => udhaarCollected(s) > 0;
