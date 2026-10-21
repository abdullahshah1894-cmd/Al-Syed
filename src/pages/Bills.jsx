import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Receipt, Search, Printer, Eye, Calendar, User, X, Smartphone, CheckCircle2 } from "lucide-react";
import html2canvas from "html2canvas";
import { formatWAPhone } from "./POS";
import { printElement } from "../services/printReceipt";
import { itemImeis } from "../utils/sales";

const billSeller = (bill) => bill.sellerName || bill.cashierName || "Store";

const Bills = () => {
  const { sales, shopSettings } = useApp();
  const [searchParams] = useSearchParams();
  // Search box starts from /bills?search=..., and follows the URL when it changes
  const urlSearch = searchParams.get("search") || "";
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  if (urlSearch !== prevUrlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearchTerm(urlSearch);
  }
  const [selectedBillModal, setSelectedBillModal] = useState(null);
  const [isCapturingImage, setIsCapturingImage] = useState(false);

  const cleanSearch = searchTerm.replace(/[-\s]/g, "").toLowerCase();

  const filteredSales = sales.filter(
    (s) =>
      (s.billNumber || "").replace(/[-\s]/g, "").toLowerCase().includes(cleanSearch) ||
      (s.customerName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.customerPhone || "").replace(/[-\s]/g, "").includes(cleanSearch)
  );

  const getBillWAText = (bill) => {
    const currency = shopSettings.currencySymbol || "Rs";
    let text = `🧾 *${shopSettings.shopName || "MOBILE SHOP"}*\n`;
    text += `📍 ${shopSettings.address || shopSettings.shopAddress || "Main Market"}\n`;
    text += `📞 ${shopSettings.phone || shopSettings.shopPhone || "+92 300 0000000"}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Receipt #:* ${bill.billNumber || "INV"}\n`;
    text += `*Date:* ${new Date(bill.createdAt || Date.now()).toLocaleDateString()}\n`;
    text += `*Customer:* ${bill.customerName || "Walk-in Customer"}\n`;
    if (bill.customerPhone) text += `*Phone:* ${bill.customerPhone}\n`;
    text += `*Seller:* ${billSeller(bill)}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (bill.items && bill.items.length > 0) {
      text += `*ITEMS:*\n`;
      bill.items.forEach((item, index) => {
        const qty = item.quantity || item.qty || 1;
        const price = item.unitSalePrice || item.price || 0;
        const sub = item.subtotal || qty * price;
        text += `${index + 1}. *${item.productName || item.name}* (x${qty}) - ${currency} ${Number(sub).toLocaleString()}\n`;
        const imeis = itemImeis(item);
        if (imeis.length > 0) text += `   IMEI: ${imeis.join(", ")}\n`;
      });
      text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    }
    if (Number(bill.taxAmount || 0) > 0) {
      text += `*Tax${bill.taxPercent ? ` (${bill.taxPercent}%)` : ""}:* ${currency} ${Number(bill.taxAmount).toLocaleString()}\n`;
    }
    text += `*Total:* ${currency} ${Number(bill.grandTotal || 0).toLocaleString()}\n`;
    text += `*Paid:* ${currency} ${Number(bill.paidAmount || 0).toLocaleString()}\n`;
    if (Number(bill.dueAmount || 0) > 0) {
      text += `*⚠️ Balance Due:* ${currency} ${Number(bill.dueAmount).toLocaleString()}\n`;
    }
    text += `*Payment:* ${bill.paymentMethod || "Cash"}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Thank you for your business! 🙏`;
    return text;
  };

  const handleWhatsAppShare = async () => {
    if (!selectedBillModal) return;
    const receiptElement = document.getElementById("bill-slip-content");
    const waText = getBillWAText(selectedBillModal);
    const formattedPhone = formatWAPhone(selectedBillModal.customerPhone);
    const waUrl = formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(waText)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(waText)}`;

    setIsCapturingImage(true);

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // 1. Mobile native share attempt
    if (isMobile && receiptElement && navigator.canShare) {
      try {
        const canvas = await html2canvas(receiptElement, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          allowTaint: true,
          logging: false,
        });

        const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
        if (blob) {
          const file = new File([blob], `Bill_${selectedBillModal.billNumber || "INV"}.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Invoice ${selectedBillModal.billNumber}`,
              text: waText,
            });
            setIsCapturingImage(false);
            return;
          }
        }
      } catch (shareErr) {
        if (shareErr.name === "AbortError") {
          setIsCapturingImage(false);
          return;
        }
        console.warn("Native share fallback to WhatsApp link:", shareErr);
      }
    }

    // 2. Desktop Flow: copy image to clipboard & download image
    if (receiptElement) {
      try {
        const canvas = await html2canvas(receiptElement, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          allowTaint: true,
          logging: false,
        });

        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
              }
            } catch (clipErr) {
              console.log("Clipboard copy not supported:", clipErr);
            }

            try {
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `Bill_${selectedBillModal.billNumber || "INV"}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (dlErr) {
              console.log("Download fallback skipped:", dlErr);
            }
          }
        }, "image/png");
      } catch (canvasErr) {
        console.warn("Canvas capture warning:", canvasErr);
      }
    }

    // 3. Always open WhatsApp with pre-filled message
    setTimeout(() => {
      window.open(waUrl, "_blank");
      setIsCapturingImage(false);
    }, 300);
  };

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
            View past transactions, payment status, logged IMEIs, and reprint invoices
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
                    <div className="text-slate-200">
                      {(sale.items || []).map((i) => i.productName).join(", ")}
                    </div>
                    {(sale.items || []).some((i) => itemImeis(i).length > 0) && (
                      <div className="font-mono text-[10px] text-cyan-400 mt-0.5">
                        IMEI: {(sale.items || []).flatMap(itemImeis).join(", ")}
                      </div>
                    )}
                  </td>

                  <td className="p-3.5">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-950 text-indigo-300 border border-slate-800">
                      {sale.paymentMethod}
                    </span>
                  </td>

                  <td className="p-3.5 font-extrabold text-slate-100">
                    {shopSettings.currencySymbol} {Number(sale.grandTotal || 0).toLocaleString()}
                  </td>

                  <td className="p-3.5">
                    <div className="text-emerald-400 font-bold">Paid: {shopSettings.currencySymbol} {Number(sale.paidAmount || 0).toLocaleString()}</div>
                    {sale.dueAmount > 0 && (
                      <div className="text-rose-400 font-bold text-[11px]">Due: {shopSettings.currencySymbol} {Number(sale.dueAmount).toLocaleString()}</div>
                    )}
                  </td>

                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => setSelectedBillModal(sale)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold flex items-center gap-1 ml-auto"
                    >
                      <Eye size={14} />
                      <span>View</span>
                    </button>
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
        <div className="bg-white text-slate-900 w-full max-w-[340px] rounded-2xl p-5 shadow-2xl relative font-mono text-xs print:p-0 print:shadow-none print:w-full print:max-w-none print:rounded-none">
          <button
            onClick={() => setSelectedBillModal(null)}
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
                {selectedBillModal.paymentMethod === "Udhaar Settlement" ? "Payment Slip" : "Sales Slip"}
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
                <span className="font-bold text-slate-800">{selectedBillModal.paymentMethod}</span>
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
                  {selectedBillModal.items.map((item, index) => (
                    <div key={index} className="text-[11px] leading-tight">
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>{item.productName || item.name}</span>
                      </div>
                      {itemImeis(item).length > 0 && (
                        <div className="text-[9.5px] text-slate-600 bg-slate-50 p-1 rounded font-mono border border-slate-100 my-0.5">
                          IMEI: {itemImeis(item).join(", ")}
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600 text-[10.5px]">
                        <span>{item.quantity || item.qty || 1} x Rs {(item.unitSalePrice || item.price || 0).toLocaleString()}</span>
                        <span className="font-bold text-slate-900">Rs {(item.subtotal || ((item.quantity || item.qty || 1) * (item.unitSalePrice || item.price || 0))).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Financial Summary */}
            {selectedBillModal.paymentMethod === "Udhaar Settlement" ? (
              <div className="space-y-1 text-[11px] pt-1">
                <div className="flex justify-between text-slate-950 font-black text-sm pt-1 border-t border-slate-900">
                  <span>AMOUNT RECEIVED:</span>
                  <span>Rs {Number(selectedBillModal.paidAmount || 0).toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-[11px] pt-1">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>
                    Rs {Number(
                      selectedBillModal.subtotalAmount ||
                        (selectedBillModal.items || []).reduce(
                          (sum, i) => sum + Number(i.subtotal || (i.quantity || i.qty || 1) * (i.unitSalePrice || i.price || 0)),
                          0
                        )
                    ).toLocaleString()}
                  </span>
                </div>
                {Number(selectedBillModal.taxAmount || 0) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax{selectedBillModal.taxPercent ? ` (${selectedBillModal.taxPercent}%)` : ""}:</span>
                    <span>+ Rs {Number(selectedBillModal.taxAmount).toLocaleString()}</span>
                  </div>
                )}
                {Number(selectedBillModal.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Discount:</span>
                    <span>- Rs {Number(selectedBillModal.discountAmount).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-950 font-black text-sm pt-1 border-t border-slate-900">
                  <span>GRAND TOTAL:</span>
                  <span>Rs {Number(selectedBillModal.grandTotal || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span>Paid:</span>
                  <span className="font-bold">Rs {Number(selectedBillModal.paidAmount || 0).toLocaleString()}</span>
                </div>
                {Number(selectedBillModal.dueAmount || 0) > 0 && (
                  <div className="flex justify-between text-slate-950 font-bold">
                    <span>BALANCE DUE:</span>
                    <span>Rs {Number(selectedBillModal.dueAmount).toLocaleString()}</span>
                  </div>
                )}
                {selectedBillModal.dueDate && (
                  <div className="flex justify-between text-slate-600">
                    <span>Due Date:</span>
                    <span>{new Date(selectedBillModal.dueDate).toLocaleDateString()}</span>
                  </div>
                )}
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
                disabled={isCapturingImage}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow disabled:opacity-60"
              >
                {isCapturingImage ? (
                  <><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Preparing...</>
                ) : (
                  <><Smartphone size={14} /> WhatsApp</>
                )}
              </button>
              <button
                onClick={() => setSelectedBillModal(null)}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Bills;
