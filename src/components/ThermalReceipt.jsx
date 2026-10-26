import React from "react";

/**
 * ══════════════════════════════════════════════════════════════════
 * ThermalReceipt — 80mm Continuous Roll Paper Receipt Component
 * ══════════════════════════════════════════════════════════════════
 *
 * Safe Printable Area: Strictly 68mm (with 2mm edge padding)
 * Pure white background, crisp black text, zero trailing blank feed
 * Fixed-layout table summing to 100% width:
 *   SN: 8% | Item / IMEI: 46% | Qty: 12% | Price: 16% | Amt: 18%
 */
export const ThermalReceipt = ({
  data,
  shopSettings,
  id = "thermal-receipt",
  className = "",
  isPortal = false,
}) => {
  if (!data) return null;

  const currency = shopSettings?.currencySymbol || "Rs.";
  const shopName = shopSettings?.shopName || "AL-SYED MOBILES & ELECTRONICS";
  const address =
    shopSettings?.address ||
    shopSettings?.shopAddress ||
    "Shop #42, Main Hafeez Center, Gulberg III, Lahore";
  const phone =
    shopSettings?.phone || shopSettings?.shopPhone || "Tel: 0300-9876543";
  const ntn =
    shopSettings?.ntn || shopSettings?.taxNumber || "NTN/STRN: 8291044-7";

  const billNo =
    data.billNumber ||
    data.invoiceNumber ||
    data.voucherNumber ||
    data.receiptNumber ||
    "INV-20260930-001";

  const rawDate = data.createdAt || data.date || Date.now();
  const dateStr = new Date(rawDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = new Date(rawDate).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const isPaymentSlip =
    data.isPaymentReceipt ||
    data.type === "payment" ||
    (data.paymentMethod === "Udhaar Settlement" && (!data.items || data.items.length === 0));

  const items = data.items || [];
  const totalQty = items.reduce(
    (sum, item) => sum + Number(item.quantity || item.qty || 1),
    0
  );

  const subtotal = Number(
    data.subtotalAmount ??
      data.subtotal ??
      items.reduce(
        (sum, it) =>
          sum +
          Number(
            it.subtotal ||
              (it.quantity || 1) * (it.unitSalePrice || it.price || 0)
          ),
        0
      )
  );

  const discount = Number(data.discountAmount || data.discount || 0);
  const taxRate = Number(data.taxRate || shopSettings?.taxRate || 0);
  const taxAmount = Number(
    data.taxAmount ??
      (taxRate > 0 ? (subtotal - discount) * (taxRate / 100) : 0)
  );
  const grandTotal = Number(
    data.grandTotal ?? data.total ?? subtotal - discount + taxAmount
  );
  const paidAmount = Number(data.paidAmount ?? grandTotal);
  const dueAmount = Number(
    data.dueAmount ??
      data.remainingBalance ??
      data.totalPending ??
      (grandTotal - paidAmount > 0 ? grandTotal - paidAmount : 0)
  );

  const customerName = data.customerName || "Walk-in Customer";
  const paymentMethod =
    data.paymentMethod === "Pending Bill"
      ? "Credit (Udhaar)"
      : data.paymentMethod || (dueAmount > 0 ? "Credit (Udhaar)" : "Cash");

  return (
    <div
      id={id}
      className={`thermal-receipt-container font-mono text-[11px] leading-tight select-none ${className} ${
        isPortal ? "print:block hidden" : "block"
      }`}
      style={{
        width: "68mm",
        maxWidth: "68mm",
        minWidth: "68mm",
        boxSizing: "border-box",
        margin: "0 auto",
        padding: "2mm 2mm 0mm 2mm",
        color: "#000000",
        backgroundColor: "#ffffff",
        overflow: "hidden",
      }}
    >
      {/* ── 1. Store Header ────────────────────────────────────── */}
      <div className="text-center">
        <div className="text-[10px] font-bold tracking-widest uppercase m-0 p-0 text-black">
          {isPaymentSlip ? "*** PAYMENT SLIP ***" : "*** RECEIPT SLIP ***"}
        </div>
        <h1
          className="text-[13px] font-black uppercase tracking-tight leading-tight mt-1 mb-0.5 p-0 text-black"
          style={{ letterSpacing: "-0.01em" }}
        >
          {shopName}
        </h1>
        {address && <p className="text-[9.5px] m-0 text-black">{address}</p>}
        {phone && <p className="text-[9.5px] m-0 text-black">{phone}</p>}
        {ntn && (
          <p className="text-[9px] font-semibold m-0 tracking-wider text-black">
            {ntn}
          </p>
        )}
      </div>

      {/* ── Section Separator ──────────────────────────────────── */}
      <div
        className="receipt-divider"
        style={{ borderTop: "1px dashed #000000", margin: "4px 0" }}
      />

      {/* ── 2. Metadata Section ────────────────────────────────── */}
      <div className="bill-meta-row flex justify-between items-start text-[10.5px]">
        <div style={{ textAlign: "left" }}>
          <div>
            <span className="font-semibold text-black">
              {isPaymentSlip ? "Rcpt No:" : "Bill No:"}
            </span>{" "}
            <span className="font-bold text-black">{billNo}</span>
          </div>
          <div>
            <span className="font-semibold text-black">Customer:</span>{" "}
            <span className="text-black">{customerName}</span>
          </div>
          {data.customerPhone && (
            <div className="text-[9.5px] text-black">
              <span className="font-semibold">Phone:</span> {data.customerPhone}
            </div>
          )}
          <div>
            <span className="font-semibold text-black">Payment:</span>{" "}
            <span className="text-black">{paymentMethod}</span>
          </div>
          {data.sellerName && (
            <div className="text-[9.5px] text-black">
              <span className="font-semibold">Seller:</span> {data.sellerName}
            </div>
          )}
        </div>
        <div
          style={{ textAlign: "right", paddingRight: "1.5mm" }}
          className="text-[10px] text-black"
        >
          <div className="font-semibold">Date/Time:</div>
          <div>{dateStr}</div>
          <div>{timeStr}</div>
        </div>
      </div>

      {/* ── Section Separator ──────────────────────────────────── */}
      <div
        className="receipt-divider"
        style={{ borderTop: "1px dashed #000000", margin: "4px 0" }}
      />

      {/* ── 3. Body: Either Payment Card or Itemized Table ────── */}
      {isPaymentSlip ? (
        /* Payment Slip Box */
        <div className="my-2 text-center">
          <p className="text-[10.5px] font-bold uppercase tracking-wider mb-0.5 text-black">
            Amount Received
          </p>
          <p className="text-[18px] font-black tracking-tight text-black m-0">
            {currency} {paidAmount.toLocaleString()}
          </p>
          {data.notes && (
            <p className="text-[9.5px] mt-1 italic text-black m-0">
              Note: {data.notes}
            </p>
          )}

          {dueAmount > 0 && (
            <div
              className="mt-2 pt-1 flex justify-between items-center text-[11px] font-bold text-black"
              style={{ borderTop: "1px dashed #000000" }}
            >
              <span>REMAINING BALANCE:</span>
              <span className="summary-val">
                {currency} {dueAmount.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      ) : (
        /* Itemized Table — Fixed column widths summing to 100% */
        <>
          <table
            style={{
              width: "100%",
              maxWidth: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              fontSize: "10.5px",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px dashed #000000" }}>
                <th
                  style={{
                    width: "8%",
                    textAlign: "left",
                    padding: "2px 0",
                  }}
                >
                  SN
                </th>
                <th
                  style={{
                    width: "46%",
                    textAlign: "left",
                    padding: "2px 0",
                    wordBreak: "break-word",
                  }}
                >
                  Item / IMEI
                </th>
                <th
                  style={{
                    width: "12%",
                    textAlign: "center",
                    padding: "2px 0",
                  }}
                >
                  Qty
                </th>
                <th
                  style={{
                    width: "16%",
                    textAlign: "right",
                    padding: "2px 0",
                  }}
                >
                  Price
                </th>
                <th
                  className="col-amt"
                  style={{
                    width: "18%",
                    textAlign: "right",
                    padding: "2px 0",
                  }}
                >
                  Amt
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const qty = Number(item.quantity || item.qty || 1);
                const price = Number(
                  item.unitSalePrice || item.price || item.unitPrice || 0
                );
                const amt = Number(item.subtotal || qty * price);
                const imeis =
                  item.imeisArray || (item.imei ? [item.imei] : []);

                return (
                  <tr
                    key={idx}
                    style={{
                      breakInside: "avoid",
                      pageBreakInside: "avoid",
                      borderBottom:
                        idx < items.length - 1
                          ? "0.5px dotted #cccccc"
                          : "none",
                    }}
                  >
                    <td
                      style={{
                        width: "8%",
                        verticalAlign: "top",
                        textAlign: "left",
                        padding: "2.5px 0",
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      style={{
                        width: "46%",
                        verticalAlign: "top",
                        textAlign: "left",
                        padding: "2.5px 1mm 2.5px 0",
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                      }}
                    >
                      <div className="font-semibold text-black leading-tight">
                        {item.productName || item.name || "Item"}
                      </div>
                      {price > 0 && (
                        <div className="text-[9px] text-black">
                          @ {currency} {price.toLocaleString()} each
                        </div>
                      )}
                      {imeis.length > 0 && (
                        <div className="text-[9px] text-black font-mono">
                          IMEI: {imeis.join(", ")}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        width: "12%",
                        verticalAlign: "top",
                        textAlign: "center",
                        padding: "2.5px 0",
                      }}
                    >
                      {qty}
                    </td>
                    <td
                      style={{
                        width: "16%",
                        verticalAlign: "top",
                        textAlign: "right",
                        padding: "2.5px 0",
                      }}
                    >
                      {price.toLocaleString()}
                    </td>
                    <td
                      className="col-amt"
                      style={{
                        width: "18%",
                        verticalAlign: "top",
                        textAlign: "right",
                        padding: "2.5px 0",
                        fontWeight: "bold",
                      }}
                    >
                      {amt.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Section Separator ──────────────────────────────────── */}
          <div
            className="receipt-divider"
            style={{ borderTop: "1px dashed #000000", margin: "4px 0" }}
          />

          {/* ── 4. Summary & Tax Section ───────────────────────────── */}
          <div className="space-y-0.5 text-[10.5px]">
            {/* Subtotal row */}
            <div className="summary-row flex justify-between items-center">
              <span>Subtotal (Qty: {totalQty}):</span>
              <span className="summary-val font-semibold">
                {currency} {subtotal.toLocaleString()}
              </span>
            </div>

            {/* Discount row */}
            {discount > 0 && (
              <div className="summary-row flex justify-between items-center text-[10px]">
                <span>Discount:</span>
                <span className="summary-val">
                  −{currency} {discount.toLocaleString()}
                </span>
              </div>
            )}

            {/* Itemized tax rows */}
            {taxAmount > 0 ? (
              <div className="tax-row flex justify-between items-center text-[10px]">
                <span>GST / Sales Tax ({taxRate}%):</span>
                <span className="tax-amt">
                  +{currency} {taxAmount.toLocaleString()}
                </span>
              </div>
            ) : (
              <div className="tax-row flex justify-between items-center text-[9.5px] opacity-75">
                <span>GST / Tax (0%):</span>
                <span className="tax-amt">{currency} 0</span>
              </div>
            )}

            {/* Grand TOTAL in bold, readable font size */}
            <div
              className="summary-row flex justify-between items-center text-[13px] font-black pt-1 mt-1 text-black"
              style={{ borderTop: "1px dashed #000000" }}
            >
              <span>TOTAL AMOUNT:</span>
              <span className="total-val">
                {currency} {grandTotal.toLocaleString()}
              </span>
            </div>

            {/* Paid / Balance due rows */}
            <div className="summary-row flex justify-between items-center text-[10.5px] pt-0.5">
              <span>PAID AMOUNT:</span>
              <span className="summary-val font-semibold">
                {currency} {paidAmount.toLocaleString()}
              </span>
            </div>

            <div className="summary-row flex justify-between items-center text-[11px] font-black text-black">
              <span>BALANCE DUE ({dueAmount > 0 ? "Udhaar" : "Settled"}):</span>
              <span className="summary-val">
                {currency} {dueAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Section Separator ──────────────────────────────────── */}
      <div
        className="receipt-divider"
        style={{ borderTop: "1px dashed #000000", margin: "4px 0" }}
      />

      {/* ── 5. Footer (Zero Bottom Margin) ────────────────────── */}
      <div
        className="receipt-footer text-center"
        style={{
          margin: "0 !important",
          padding: "0 !important",
          marginBottom: "0 !important",
          paddingBottom: "0 !important",
        }}
      >
        <div className="font-bold text-[11px] uppercase tracking-wide text-black">
          *** THANK YOU FOR YOUR BUSINESS ***
        </div>
        <div className="text-[9.5px] mt-0.5 text-black">
          Please check products and warranty terms before leaving.
        </div>
      </div>
    </div>
  );
};

export default ThermalReceipt;
