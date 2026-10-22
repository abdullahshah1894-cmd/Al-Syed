import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { itemImeis } from "../utils/sales";
import { formatWAPhone } from "../utils/shareImage";
import {
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Smartphone,
  FileText,
  Truck,
  Phone,
  MessageCircle,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { Page, PageHeader, Card, Badge, Button, EmptyState, inputClass } from "../components/ui";


// Keep only the digits of a typed / scanned / pasted IMEI (spaces and dashes are dropped)
const cleanImei = (v) => String(v || "").replace(/\D/g, "").slice(0, 15);

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
  const { products, allSales, warranties, shopSettings, allCustomers, suppliers } = useApp();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const curr = shopSettings.currencySymbol || "Rs.";
  const [searchParams, setSearchParams] = useSearchParams();

  // The IMEI being looked up comes from ?imei= (header search) or the form, and follows the URL
  const urlImei = cleanImei(searchParams.get("imei"));
  const [imeiInput, setImeiInput] = useState(urlImei);
  const [query, setQuery] = useState(urlImei);
  const [lastUrlImei, setLastUrlImei] = useState(urlImei);
  if (urlImei !== lastUrlImei) {
    setLastUrlImei(urlImei);
    if (urlImei) {
      setImeiInput(urlImei);
      setQuery(urlImei);
    }
  }

  // The result is worked out from the live data, so it is right once products / sales load or change
  const searchResult = useMemo(() => {
    const target = String(query || "").trim();
    if (!target) return null;

    const isLuhnValid = validateLuhnIMEI(target);

    // Search through all products and their IMEIs (supports single & dual SIM IMEIs).
    // The same IMEI can be on two products (sold from one, bought back into another): prefer the unit in stock.
    let matchedProduct = null;
    let matchedImeiObj = null;

    for (const prod of products || []) {
      if (prod.isDeleted || !Array.isArray(prod.imeis)) continue;
      const found = prod.imeis.find(
        (i) => i && [i.imei, i.imei1, i.imei2].some((k) => k && String(k) === target)
      );
      if (found && (!matchedImeiObj || (found.status === "in_stock" && matchedImeiObj.status !== "in_stock"))) {
        matchedProduct = prod;
        matchedImeiObj = found;
      }
    }

    // Every IMEI of the matched unit (a dual-SIM phone may be billed / warrantied under either one)
    const keys = matchedImeiObj
      ? [matchedImeiObj.imei, matchedImeiObj.imei1, matchedImeiObj.imei2].filter(Boolean).map(String)
      : [target];

    // Search all sales (not only the selected seller's) to find bill details if sold:
    // the unit's own sale link first, then any bill item carrying one of its IMEIs
    // (newest first, preferring a bill where the unit was not returned)
    const itemHasKey = (item) => [...itemImeis(item), item.imei1, item.imei2].some((k) => k && keys.includes(k));
    let matchedSale = null;
    if (matchedImeiObj?.soldInSale) {
      matchedSale = (allSales || []).find((s) => s.id === matchedImeiObj.soldInSale) || null;
    }
    if (!matchedSale) {
      const candidates = (allSales || [])
        .filter((s) => (s.items || []).some(itemHasKey))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const notReturned = candidates.find((s) =>
        (s.items || []).some((item) => itemHasKey(item) && !(item.returnedImeis || []).some((k) => keys.includes(k)))
      );
      matchedSale = notReturned || candidates[0] || null;
    }
    const matchedItem = matchedSale ? (matchedSale.items || []).find(itemHasKey) || null : null;

    // Returned: the bill line lists it as returned, or the unit came back into stock after a return
    const returnedOnBill = !!matchedItem && (matchedItem.returnedImeis || []).some((k) => keys.includes(k));
    const unitReturned = matchedImeiObj?.status === "in_stock" && !!matchedImeiObj?.returnedAt;
    let returnedDate = null;
    if (returnedOnBill || unitReturned) {
      const entry = (matchedSale?.returns || []).find((r) =>
        (r.items || []).some((ri) => (ri.imeis || []).some((k) => keys.includes(k)))
      );
      returnedDate = entry?.date || entry?.at || matchedImeiObj?.returnedAt || null;
    }

    // Search warranty records: a phone sold again after a return has several, so take the newest live one
    const unitWarranties = (warranties || [])
      .filter((w) => w.imei && keys.includes(String(w.imei)))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const matchedWarranty = unitWarranties.find((w) => w.status !== "Void") || unitWarranties[0] || null;

    return {
      imei: target,
      isLuhnValid,
      matchedProduct,
      matchedImeiObj,
      matchedSale,
      matchedItem,
      isReturned: returnedOnBill || unitReturned,
      returnedDate,
      matchedWarranty,
    };
  }, [query, products, allSales, warranties]);
  const hasSearched = !!searchResult;


  const warrantyTone = (status) => (status === "Active" ? "paid" : status === "Expiring Soon" ? "saffron" : "neutral");

  const fmtDate = (d) => {
    if (!d) return "—";
    // A plain YYYY-MM-DD is a local calendar day (new Date() would read it as UTC midnight)
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? new Date(`${d}T00:00:00`) : new Date(d);
    return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString();
  };

  // Price this unit was billed at
  const unitPrice = (item) => {
    if (!item) return null;
    const qty = Number(item.quantity || item.qty || 1) || 1;
    const p = item.unitSalePrice ?? item.price ?? (item.subtotal !== undefined ? Number(item.subtotal) / qty : null);
    return p === null || p === undefined ? null : Number(p);
  };

  const row = (label, value, valueClass = "text-ink") => (
    <div className="flex justify-between gap-3 py-2 text-sm">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className={`text-right min-w-0 break-words ${valueClass}`}>{value}</dd>
    </div>
  );

  // "Sold to" block (shared by the product-found and product-deleted views)
  const renderSaleDetails = (result) => {
    const sale = result.matchedSale;
    const customer = sale.customerId ? (allCustomers || []).find((c) => c.id === sale.customerId) : null;
    const phone = sale.customerPhone || customer?.phone || "";
    const price = unitPrice(result.matchedItem);
    const udhaar = customer ? Number(customer.totalPending || 0) : null;

    return (
      <div className="space-y-2">
        {result.isReturned ? (
          <div className="flex items-center gap-2 text-saffron-700 text-sm font-semibold bg-saffron-50 rounded-xl px-3 py-2.5">
            <RotateCcw size={16} aria-hidden="true" />
            <span>Returned on {fmtDate(result.returnedDate)}</span>
          </div>
        ) : (
          <h3 className="text-sm font-semibold text-ink-soft">Sold to</h3>
        )}
        <dl className="divide-y divide-line">
          {row(result.isReturned ? "Was sold to" : "Customer", sale.customerName || "Walk-in customer", "font-semibold text-ink")}
          <div className="flex justify-between gap-3 py-1 text-sm items-center">
            <dt className="text-muted">Phone</dt>
            <dd>
              {phone ? (
                <span className="flex items-center gap-1">
                  <a
                    href={`tel:${phone}`}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 font-mono text-brand-700 hover:bg-brand-50"
                  >
                    <Phone size={14} aria-hidden="true" /> {phone}
                  </a>
                  {formatWAPhone(phone) && (
                    <a
                      href={`https://wa.me/${formatWAPhone(phone)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-paid-600 hover:bg-paid-50"
                      title="WhatsApp"
                      aria-label="Message on WhatsApp"
                    >
                      <MessageCircle size={18} aria-hidden="true" />
                    </a>
                  )}
                </span>
              ) : (
                <span className="text-ink">Not saved</span>
              )}
            </dd>
          </div>
          {row("Bill", sale.billNumber, "font-mono font-semibold text-brand-700")}
          {row("Sale date", fmtDate(sale.createdAt))}
          {row("Seller", sale.sellerName || "—")}
          {row("Sold for", price !== null ? `${curr} ${price.toLocaleString()}` : "—", "font-semibold text-ink")}
          {row("Payment", sale.paymentMethod || "—")}
          {udhaar !== null &&
            row(
              "Customer Udhaar now",
              `${curr} ${udhaar.toLocaleString()}`,
              udhaar > 0 ? "font-semibold text-khata-600" : "font-semibold text-paid-600"
            )}
        </dl>
      </div>
    );
  };

  // Supplier block: from the unit (set by supplier purchases) and the product's supplier
  const renderSupplier = (product, unit) => {
    const name = unit?.supplierName || product?.supplier?.name || product?.supplierName || product?.supplier_name || "";
    const lower = name.trim().toLowerCase();
    const supplier =
      (unit?.supplierId && (suppliers || []).find((s) => s.id === unit.supplierId)) ||
      (lower && (suppliers || []).find((s) => (s.name || "").trim().toLowerCase() === lower)) ||
      null;
    const phone = supplier?.phone || product?.supplier?.phone || product?.supplier_phone || "";

    return (
      <div className="bg-sunken rounded-xl p-4 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted">
            <Truck size={15} aria-hidden="true" />
            <span>Supplier</span>
          </div>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 -mr-2 text-sm font-mono text-brand-700 hover:bg-brand-50"
            >
              <Phone size={14} aria-hidden="true" />
              <span>{phone}</span>
            </a>
          )}
        </div>
        <div className="text-base font-semibold text-ink">{supplier?.name || name || "Unknown supplier"}</div>
        {supplier?.company && <p className="text-xs text-muted">{supplier.company}</p>}
        {unit?.purchaseDate && <p className="text-xs text-muted">Bought on {fmtDate(unit.purchaseDate)}</p>}
        {/* Supplier accounts are owner-only */}
        {isAdmin && supplier && (
          <div className="pt-2">
            <Button variant="soft" icon={ExternalLink} onClick={() => navigate(`/suppliers?open=${supplier.id}`)}>
              Open supplier account
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Warranty status block — shown whenever a warranty exists for this IMEI
  const renderWarranty = (w) => (
    <div className="border-t border-line pt-4 space-y-2">
      <div className="flex justify-between items-center gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
          <ShieldCheck size={16} aria-hidden="true" /> Warranty
        </h3>
        <Badge tone={warrantyTone(w.status)}>{w.status}</Badge>
      </div>
      <dl className="divide-y divide-line">
        {w.warrantyType && row("Type", w.warrantyType)}
        {row("Expires", w.warrantyExpiryDate)}
        {(w.claims || []).length > 0 &&
          row("Claims", `${w.claims.length} (latest: ${w.claims[w.claims.length - 1].status || "Pending"})`)}
      </dl>
    </div>
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const target = cleanImei(imeiInput);
    if (!target) return;
    setImeiInput(target);
    setQuery(target);
    // Keep ?imei= in step with what is shown, so a later header search for the same IMEI still works
    if (urlImei && urlImei !== target) {
      const next = new URLSearchParams(searchParams);
      next.set("imei", target);
      setSearchParams(next, { replace: true });
    }
  };

  // Where the unit is now: in stock / in stock after a return / sold
  const unitStatus = (result) => {
    const st = result.matchedImeiObj?.status;
    if (st === "in_stock") return result.isReturned ? { tone: "saffron", label: "In stock (returned)" } : { tone: "paid", label: "In stock" };
    return { tone: st === "sold" ? "brand" : "neutral", label: "Sold to customer" };
  };

  return (
    <Page>
      <div className="max-w-5xl space-y-6">
        <PageHeader
          title="IMEI checker"
          description="Type or scan a 15-digit IMEI to see if the phone is in stock, who bought it, the supplier and its warranty."
        />

        {/* Search */}
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Smartphone size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="text"
                inputMode="numeric"
                aria-label="IMEI number"
                autoComplete="off"
                placeholder="15-digit IMEI, e.g. 358921098471201"
                value={imeiInput}
                onChange={(e) => setImeiInput(cleanImei(e.target.value))}
                className={`${inputClass} h-14 pl-12 text-lg font-mono tracking-wide`}
              />
            </div>
            <Button type="submit" size="lg" icon={Search} className="h-14 sm:px-8">
              Check IMEI
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted">{imeiInput.length}/15 digits · spaces and dashes are removed for you</p>
        </Card>

        {/* Result */}
        {hasSearched && searchResult && (
          <div className="space-y-4">
            {/* Checksum check */}
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ${
                searchResult.isLuhnValid ? "bg-paid-50 text-paid-700" : "bg-saffron-50 text-saffron-700"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {searchResult.isLuhnValid ? <CheckCircle2 size={20} aria-hidden="true" /> : <XCircle size={20} aria-hidden="true" />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {searchResult.isLuhnValid ? "Valid IMEI number (checksum matches)" : "This IMEI's check digit does not match — check for a typo"}
                  </p>
                  <p className="text-xs font-mono break-all">{searchResult.imei}</p>
                </div>
              </div>
              <span className="text-xs font-semibold">{searchResult.imei.length} digits</span>
            </div>

            {searchResult.matchedProduct ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Product, status and supplier */}
                <Card className="space-y-4 min-w-0">
                  <div className="space-y-2">
                    {(() => {
                      const s = unitStatus(searchResult);
                      return <Badge tone={s.tone} className="text-sm px-3 py-1">{s.label}</Badge>;
                    })()}
                    <h2 className="text-xl font-bold leading-snug">{searchResult.matchedProduct.name}</h2>
                    <p className="text-sm text-muted">
                      {searchResult.matchedProduct.brand} · {searchResult.matchedProduct.category}
                    </p>
                  </div>

                  {renderSupplier(searchResult.matchedProduct, searchResult.matchedImeiObj)}

                  <dl className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-line p-3">
                      <dt className="text-xs text-muted">Sale price</dt>
                      <dd className="mt-0.5 font-display text-base font-bold text-ink">
                        {shopSettings.currencySymbol} {Number(searchResult.matchedProduct.salePrice || 0).toLocaleString()}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-line p-3">
                      <dt className="text-xs text-muted">PTA status</dt>
                      <dd className="mt-0.5 text-base font-semibold text-ink">{searchResult.matchedImeiObj?.ptaStatus || "Approved"}</dd>
                    </div>
                  </dl>

                  {/* Dual SIM IMEIs if present */}
                  {(searchResult.matchedImeiObj?.imei1 || searchResult.matchedImeiObj?.imei2) && (
                    <div className="rounded-xl border border-line p-3 space-y-1">
                      <span className="text-xs text-muted block">Dual SIM IMEIs</span>
                      <div className="font-mono text-sm text-ink flex flex-col gap-0.5">
                        <span className="break-all">SIM 1: {searchResult.matchedImeiObj.imei1 || searchResult.matchedImeiObj.imei}</span>
                        {searchResult.matchedImeiObj.imei2 && <span className="break-all">SIM 2: {searchResult.matchedImeiObj.imei2}</span>}
                      </div>
                    </div>
                  )}

                  {/* Specs list */}
                  {searchResult.matchedProduct.specs && (
                    <div className="space-y-2 pt-3 border-t border-line">
                      <h3 className="text-sm font-semibold text-ink-soft">Specifications</h3>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        {[
                          ["RAM", searchResult.matchedProduct.specs.ram],
                          ["Storage", searchResult.matchedProduct.specs.storage],
                          ["Colour", searchResult.matchedProduct.specs.color],
                          ["OS", searchResult.matchedProduct.specs.os],
                        ].map(([k, v]) => (
                          <div key={k} className="flex gap-1.5 min-w-0">
                            <dt className="text-muted">{k}</dt>
                            <dd className="font-semibold text-ink truncate">{v || "N/A"}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </Card>

                {/* Bill & warranty */}
                <Card className="space-y-4 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-muted" aria-hidden="true" />
                    <h2 className="text-base font-semibold">Bill and customer</h2>
                  </div>

                  {searchResult.matchedSale ? (
                    renderSaleDetails(searchResult)
                  ) : (
                    <EmptyState
                      icon={AlertCircle}
                      title={searchResult.matchedImeiObj?.status === "sold" ? "Bill not found" : "Not sold yet"}
                      description={
                        searchResult.matchedImeiObj?.status === "sold"
                          ? "This IMEI is marked sold, but its bill record could not be found."
                          : "This phone is still in shop stock. No bill or customer is linked to it yet."
                      }
                    />
                  )}

                  {searchResult.matchedWarranty && renderWarranty(searchResult.matchedWarranty)}
                </Card>
              </div>
            ) : searchResult.matchedSale || searchResult.matchedWarranty ? (
              /* Sold phone whose product was removed from inventory: still show its bill & warranty */
              <Card className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-muted" aria-hidden="true" />
                  <h2 className="text-base font-semibold">Sale and warranty record</h2>
                </div>
                {searchResult.matchedWarranty?.productName && (
                  <div>
                    <h2 className="text-xl font-bold leading-snug">{searchResult.matchedWarranty.productName}</h2>
                    <p className="text-sm text-muted">
                      {searchResult.matchedWarranty.brand} {searchResult.matchedWarranty.model}
                    </p>
                  </div>
                )}
                <p className="text-sm text-saffron-700 bg-saffron-50 rounded-xl px-3 py-2.5">
                  This IMEI is no longer linked to a product in stock (the product may have been deleted).
                </p>
                {searchResult.matchedSale && renderSaleDetails(searchResult)}
                {searchResult.matchedWarranty && renderWarranty(searchResult.matchedWarranty)}
              </Card>
            ) : (
              <Card>
                <EmptyState
                  icon={AlertCircle}
                  title="This IMEI is not in the shop records"
                  description={
                    <>
                      No stock or sale record exists for IMEI <span className="font-mono text-ink">{searchResult.imei}</span>.
                      {isAdmin ? " You can add it under Inventory." : " Ask the owner to add it to inventory."}
                    </>
                  }
                />
              </Card>
            )}
          </div>
        )}
      </div>
    </Page>
  );
};

export default ImeiChecker;
