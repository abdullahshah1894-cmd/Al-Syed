import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { itemImeis } from "../utils/sales";
import {
  Search,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Smartphone,
  User,
  FileText,
  Calendar,
  QrCode,
  Truck,
  Building2,
  Phone,
} from "lucide-react";

// Helper: Luhn Algorithm Validation for 15-digit IMEI
const validateLuhnIMEI = (imeiStr) => {
  if (!/^\d{15}$/.test(imeiStr)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let digit = parseInt(imeiStr.charAt(i), 10);
    // Double every second digit from left (0-indexed 1, 3, 5...)
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
};

const ImeiChecker = () => {
  const { products, allSales, warranties, shopSettings } = useApp();
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const [imeiInput, setImeiInput] = useState(searchParams.get("imei") || "");
  const [searchResult, setSearchResult] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const performLookup = useCallback((targetImei) => {
    if (!targetImei.trim()) return;
    setHasSearched(true);

    const isLuhnValid = validateLuhnIMEI(targetImei.trim());

    // Search through all products and their IMEIs (supports single & dual SIM IMEIs)
    let matchedProduct = null;
    let matchedImeiObj = null;

    for (const prod of products) {
      if (prod.imeis && prod.imeis.length > 0) {
        const found = prod.imeis.find(
          (i) => i.imei === targetImei.trim() || i.imei1 === targetImei.trim() || i.imei2 === targetImei.trim()
        );
        if (found) {
          matchedProduct = prod;
          matchedImeiObj = found;
          break;
        }
      }
    }

    // Every IMEI of the matched unit (a dual-SIM phone may be billed / warrantied under either one)
    const keys = matchedImeiObj
      ? [matchedImeiObj.imei, matchedImeiObj.imei1, matchedImeiObj.imei2].filter(Boolean)
      : [targetImei.trim()];

    // Search all sales (not only the selected seller's) to find bill details if sold:
    // the unit's own sale link first, then any bill item carrying one of its IMEIs
    let matchedSale = null;
    if (matchedImeiObj?.soldInSale) {
      matchedSale = (allSales || []).find((s) => s.id === matchedImeiObj.soldInSale) || null;
    }
    if (!matchedSale) {
      matchedSale =
        (allSales || []).find((s) =>
          (s.items || []).some((item) =>
            [...itemImeis(item), item.imei1, item.imei2].some((k) => k && keys.includes(k))
          )
        ) || null;
    }

    // Search warranty records
    const matchedWarranty = (warranties || []).find((w) => keys.includes(w.imei)) || null;

    setSearchResult({
      imei: targetImei.trim(),
      isLuhnValid,
      matchedProduct,
      matchedImeiObj,
      matchedSale,
      matchedWarranty,
    });
  }, [products, allSales, warranties]);

  // Rerun the ?imei= lookup once products / sales / warranties have loaded
  useEffect(() => {
    const urlImei = searchParams.get("imei");
    if (urlImei) {
      setImeiInput(urlImei);
      performLookup(urlImei);
    }
  }, [searchParams, performLookup]);

  const warrantyBadge = (status) =>
    status === "Active"
      ? "bg-emerald-500/20 text-emerald-300"
      : status === "Expiring Soon"
      ? "bg-amber-500/20 text-amber-300"
      : "bg-rose-500/20 text-rose-300";

  // Bill details block (shared by the product-found and product-deleted views)
  const renderSaleDetails = (sale) => (
    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">Bill Number:</span>
        <span className="font-mono font-bold text-indigo-400">{sale.billNumber}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">Customer Name:</span>
        <span className="font-bold text-slate-200">{sale.customerName || "Walk-in Customer"}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">Phone:</span>
        <span className="text-slate-200">{sale.customerPhone || "N/A"}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">Sale Date:</span>
        <span className="text-slate-200">{new Date(sale.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  );

  // Warranty status block — shown whenever a warranty exists for this IMEI
  const renderWarranty = (w) => (
    <div className="bg-indigo-950/30 p-3 rounded-2xl border border-indigo-900/50 space-y-1">
      <div className="flex justify-between text-xs items-center">
        <span className="font-bold text-indigo-300">Warranty Status:</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${warrantyBadge(w.status)}`}>
          {w.status}
        </span>
      </div>
      {w.warrantyType && <p className="text-xs text-slate-400">Type: {w.warrantyType}</p>}
      <p className="text-xs text-slate-400">Expiry Date: {w.warrantyExpiryDate}</p>
      {(w.claims || []).length > 0 && (
        <p className="text-xs text-slate-400">
          Claims: {w.claims.length} (latest: {w.claims[w.claims.length - 1].status || "Pending"})
        </p>
      )}
    </div>
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    performLookup(imeiInput);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-indigo-600/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
            <Search size={28} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Dedicated IMEI Checker Utility</h1>
            <p className="text-xs text-slate-400">
              Input or scan any 15-digit IMEI to check Supplier Name, PTA approval status, Luhn checksum & sales history
            </p>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
          <div className="relative flex-1">
            <Smartphone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              maxLength={15}
              placeholder="Enter or scan 15-digit IMEI (e.g. 358921098471201)..."
              value={imeiInput}
              onChange={(e) => setImeiInput(e.target.value.replace(/\D/g, ""))}
              className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-indigo-600/30"
          >
            Check IMEI
          </button>
        </form>

        {/* Quick Sample IMEI Fillers */}
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <span>Try sample IMEIs:</span>
          <button
            type="button"
            onClick={() => { setImeiInput("358921098471201"); performLookup("358921098471201"); }}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 font-mono text-indigo-300 rounded-lg"
          >
            In-Stock iPhone
          </button>
          <button
            type="button"
            onClick={() => { setImeiInput("354112091234504"); performLookup("354112091234504"); }}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 font-mono text-emerald-300 rounded-lg"
          >
            Sold Samsung S24
          </button>
        </div>
      </div>

      {/* Results Display Panel */}
      {hasSearched && searchResult && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          {/* Luhn Algorithm Validation Banner */}
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between ${
              searchResult.isLuhnValid
                ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-300"
                : "bg-rose-950/30 border-rose-800/50 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-3">
              {searchResult.isLuhnValid ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
              <div>
                <h3 className="font-bold text-sm">
                  Luhn Algorithm Check: {searchResult.isLuhnValid ? "Valid IMEI Structure" : "Invalid IMEI Checksum"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  IMEI Target: {searchResult.imei}
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-3 py-1 bg-slate-900 rounded-lg border border-slate-800">
              15 Digits
            </span>
          </div>

          {/* Database Match Status */}
          {searchResult.matchedProduct ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Product Specifications, Supplier & Status Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-xs font-bold uppercase text-slate-400">Inventory Status</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      searchResult.matchedImeiObj?.status === "in_stock"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : searchResult.matchedImeiObj?.status === "sold"
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "bg-rose-500/20 text-rose-300"
                    }`}
                  >
                    {searchResult.matchedImeiObj?.status === "in_stock" ? "IN CURRENT STOCK" : "SOLD TO CUSTOMER"}
                  </span>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-slate-100">{searchResult.matchedProduct.name}</h2>
                  <p className="text-xs text-indigo-400 font-semibold">{searchResult.matchedProduct.brand} • {searchResult.matchedProduct.category}</p>
                </div>

                {/* ── SUPPLIER NAME DISPLAY (Emerald Green & Mint) ── */}
                <div className="bg-emerald-950/40 p-4 rounded-2xl border border-emerald-500/30 space-y-1.5 shadow-lg shadow-emerald-950/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Truck size={18} className="text-emerald-400" />
                      <span className="text-[11px] uppercase font-extrabold tracking-wider text-emerald-300">Supplier / Vendor Name</span>
                    </div>
                    {(searchResult.matchedProduct.supplier?.phone || searchResult.matchedProduct.supplier_phone) && (
                      <span className="text-[10px] font-mono text-emerald-300 bg-emerald-900/60 px-2.5 py-0.5 rounded-full border border-emerald-500/40 flex items-center gap-1">
                        <Phone size={10} />
                        <span>{searchResult.matchedProduct.supplier?.phone || searchResult.matchedProduct.supplier_phone}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-base font-extrabold text-emerald-100 pl-6 tracking-wide">
                    {searchResult.matchedProduct.supplier?.name ||
                      searchResult.matchedProduct.supplierName ||
                      searchResult.matchedProduct.supplier_name ||
                      "Direct Vendor / Unknown Supplier"}
                  </div>
                </div>

                {/* Pricing & PTA Status */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Sale Price</span>
                    <span className="font-extrabold text-slate-100 text-sm">
                      {shopSettings.currencySymbol} {searchResult.matchedProduct.salePrice.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">PTA Status</span>
                    <span className="font-bold text-cyan-400 text-sm">
                      {searchResult.matchedImeiObj?.ptaStatus || "Approved"}
                    </span>
                  </div>
                </div>

                {/* Dual SIM IMEIs if present */}
                {(searchResult.matchedImeiObj?.imei1 || searchResult.matchedImeiObj?.imei2) && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1 text-xs">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Dual SIM IMEIs</span>
                    <div className="font-mono text-cyan-300 text-xs flex flex-wrap gap-2">
                      <span>SIM 1: {searchResult.matchedImeiObj.imei1 || searchResult.matchedImeiObj.imei}</span>
                      {searchResult.matchedImeiObj.imei2 && <span>| SIM 2: {searchResult.matchedImeiObj.imei2}</span>}
                    </div>
                  </div>
                )}

                {/* Specs list */}
                {searchResult.matchedProduct.specs && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <span className="text-xs font-bold text-slate-400 uppercase">Hardware Specifications</span>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                      <div>RAM: <span className="text-slate-100 font-semibold">{searchResult.matchedProduct.specs.ram || "N/A"}</span></div>
                      <div>Storage: <span className="text-slate-100 font-semibold">{searchResult.matchedProduct.specs.storage || "N/A"}</span></div>
                      <div>Color: <span className="text-slate-100 font-semibold">{searchResult.matchedProduct.specs.color || "N/A"}</span></div>
                      <div>OS: <span className="text-slate-100 font-semibold">{searchResult.matchedProduct.specs.os || "N/A"}</span></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bill & Warranty Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-xs font-bold uppercase text-slate-400">Sale & Customer Bill Record</span>
                  <FileText size={18} className="text-indigo-400" />
                </div>

                <div className="space-y-3">
                  {searchResult.matchedSale ? (
                    renderSaleDetails(searchResult.matchedSale)
                  ) : (
                    <div className="text-center p-6 text-slate-400 text-xs space-y-2">
                      <AlertCircle size={32} className="mx-auto text-slate-600" />
                      <p>
                        {searchResult.matchedImeiObj?.status === "sold"
                          ? "This IMEI is marked sold, but its bill record could not be found."
                          : "This IMEI is currently unsold in shop inventory. No bill or customer log associated yet."}
                      </p>
                    </div>
                  )}

                  {/* Warranty Status */}
                  {searchResult.matchedWarranty && renderWarranty(searchResult.matchedWarranty)}
                </div>
              </div>
            </div>
          ) : searchResult.matchedSale || searchResult.matchedWarranty ? (
            /* Sold phone whose product was removed from inventory: still show its bill & warranty */
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold uppercase text-slate-400">Sale & Warranty Record</span>
                <FileText size={18} className="text-indigo-400" />
              </div>
              {searchResult.matchedWarranty?.productName && (
                <div>
                  <h2 className="text-xl font-bold text-slate-100">{searchResult.matchedWarranty.productName}</h2>
                  <p className="text-xs text-indigo-400 font-semibold">
                    {searchResult.matchedWarranty.brand} {searchResult.matchedWarranty.model}
                  </p>
                </div>
              )}
              <p className="text-[11px] text-amber-400">
                This IMEI is no longer linked to a product in inventory (the product may have been deleted).
              </p>
              {searchResult.matchedSale && renderSaleDetails(searchResult.matchedSale)}
              {searchResult.matchedWarranty && renderWarranty(searchResult.matchedWarranty)}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 space-y-3">
              <AlertCircle size={40} className="mx-auto text-amber-500" />
              <h3 className="font-bold text-slate-200 text-base">IMEI Not Found in Shop Database</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No inventory or sales record exists for IMEI <span className="font-mono text-amber-400">{searchResult.imei}</span>. You can add it under Products/Inventory.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImeiChecker;
