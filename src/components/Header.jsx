import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useApp, SELLERS, getProductStock } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { Search, Bell, ShoppingCart, Menu, PackageX } from "lucide-react";

const PAGE_TITLES = {
  "/dashboard": "Dashboard",
  "/pos": "New sale",
  "/ledger": "Billing ledger",
  "/bills": "Bills",
  "/pending-payments": "Udhaar accounts",
  "/sellers": "Sellers",
  "/inventory": "Inventory",
  "/imei-checker": "IMEI checker",
  "/suppliers": "Suppliers",
  "/warranties": "Warranties",
  "/mobile-issues": "Repair tickets",
  "/expenses": "Expenses",
  "/reports": "Sales reports",
  "/valuation": "Stock value",
  "/zakat": "Zakat",
  "/settings": "Settings",
};

const Header = ({ onMenu }) => {
  const { products, customers, suppliers, activeSeller, setActiveSeller } = useApp();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false); // phone: search opens under the bar
  const bellRef = useRef(null);

  const lowStockItems = (products || []).filter(
    (p) => p && !p.isDeleted && getProductStock(p) <= Number(p.minStockAlert || 0)
  );

  // Close the low-stock list when clicking elsewhere
  useEffect(() => {
    if (!showNotifications) return;
    const close = (e) => bellRef.current && !bellRef.current.contains(e.target) && setShowNotifications(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showNotifications]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const query = searchTerm.trim();
    if (!query) return;
    setShowSearch(false);

    // A 15 digit IMEI (scanners / copies may add spaces or dashes)
    const digits = query.replace(/[\s-]/g, "");
    if (/^\d{15}$/.test(digits)) {
      navigate(`/imei-checker?imei=${digits}`);
      return;
    }

    // A product barcode or part of an IMEI in stock goes straight to Inventory
    // (otherwise a number could match part of a customer's phone first)
    if (/^\d{5,}$/.test(digits)) {
      const isProductCode = (products || []).some(
        (p) =>
          String(p.barcode || "") === digits ||
          (p.imeis || []).some((i) => [i?.imei, i?.imei1, i?.imei2].some((k) => k && String(k).includes(digits)))
      );
      if (isProductCode) {
        navigate(`/inventory?search=${encodeURIComponent(digits)}`);
        return;
      }
    }

    // Bill / payment receipt numbers go to the Bills page
    if (/^(INV|PAY)-/i.test(query)) {
      navigate(`/bills?search=${encodeURIComponent(query)}`);
      return;
    }

    // Customer name or phone -> their Udhaar account
    const isCustomer = (customers || []).some(
      (c) => (c.name || "").toLowerCase().includes(query.toLowerCase()) || (c.phone || "").includes(query)
    );
    if (isCustomer) {
      navigate(`/pending-payments?search=${encodeURIComponent(query)}`);
      return;
    }

    // Supplier name / company / phone (owner only)
    const isSupplier =
      isAdmin &&
      (suppliers || []).some(
        (s) =>
          (s.name || "").toLowerCase().includes(query.toLowerCase()) ||
          (s.company || "").toLowerCase().includes(query.toLowerCase()) ||
          (s.phone || "").includes(query)
      );
    if (isSupplier) {
      navigate(`/suppliers?search=${encodeURIComponent(query)}`);
      return;
    }

    navigate(`/inventory?search=${encodeURIComponent(query)}`);
  };

  const searchForm = (className) => (
    <form onSubmit={handleSearchSubmit} className={`relative ${className}`} role="search">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        type="search"
        placeholder="Search IMEI, product, customer or bill no."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        aria-label="Search"
        className="w-full h-10 pl-9 pr-3 rounded-xl bg-sunken border border-transparent text-sm text-ink placeholder:text-muted focus:outline-none focus:bg-surface focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </form>
  );

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-line print:hidden">
      <div className="h-16 px-4 sm:px-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onMenu}
          className="lg:hidden h-10 w-10 -ml-1 inline-flex items-center justify-center rounded-lg text-ink-soft hover:bg-sunken"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <div className="font-display font-bold text-lg text-ink truncate lg:hidden">{PAGE_TITLES[pathname] || "Al-Syed"}</div>

        {searchForm("hidden md:block flex-1 max-w-md")}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-lg text-ink-soft hover:bg-sunken"
            aria-label="Search"
          >
            <Search size={19} />
          </button>

          {/* Seller filter for the whole app */}
          <label className="hidden sm:flex items-center gap-2 text-xs text-muted">
            <span>Seller</span>
            <select
              value={activeSeller}
              onChange={(e) => setActiveSeller(e.target.value)}
              className="h-10 rounded-xl border border-line-strong bg-surface pl-3 pr-8 text-sm font-semibold text-ink focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="All Sellers">All sellers</option>
              {SELLERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {/* Low stock */}
          <div className="relative" ref={bellRef}>
            <button
              type="button"
              onClick={() => setShowNotifications((v) => !v)}
              className="relative h-10 w-10 inline-flex items-center justify-center rounded-xl border border-line text-ink-soft hover:bg-sunken"
              aria-label={`Low stock: ${lowStockItems.length} product(s)`}
              aria-expanded={showNotifications}
            >
              <Bell size={18} />
              {lowStockItems.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-saffron-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-surface">
                  {lowStockItems.length}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] bg-surface border border-line rounded-2xl shadow-pop overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                  <h3 className="font-sans text-sm font-semibold">Low stock</h3>
                  <span className="text-xs text-muted">{lowStockItems.length} product(s)</span>
                </div>
                <div className="max-h-72 overflow-y-auto custom-scrollbar">
                  {lowStockItems.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted">Every product is above its low-stock level.</div>
                  ) : (
                    lowStockItems.map((item) => {
                      const left = getProductStock(item);
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            setShowNotifications(false);
                            navigate(`/inventory?search=${encodeURIComponent(item.name || "")}`);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-sunken flex items-center justify-between gap-3 border-b border-line last:border-0"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink truncate">{item.name}</p>
                            <p className="text-xs text-muted truncate">
                              {item.brand} {item.category ? `· ${item.category}` : ""}
                            </p>
                          </div>
                          <span className={`text-xs font-semibold whitespace-nowrap ${left <= 0 ? "text-khata-600" : "text-saffron-700"}`}>
                            {left <= 0 ? "Out of stock" : `${left} left`}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowNotifications(false);
                    navigate("/inventory");
                  }}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 border-t border-line flex items-center justify-center gap-2"
                >
                  <PackageX size={15} /> Open inventory
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate("/pos")}
            className="h-10 px-3 sm:px-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-sm"
          >
            <ShoppingCart size={16} aria-hidden="true" />
            <span className="hidden sm:inline">New sale</span>
          </button>
        </div>
      </div>

      {/* Phone search row */}
      {showSearch && <div className="px-4 pb-3 md:hidden">{searchForm("w-full")}</div>}

    </header>
  );
};

export default Header;
