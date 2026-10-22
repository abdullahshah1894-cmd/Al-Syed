import { useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useApp, SELLERS } from "../context/AppContext";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Search,
  Truck,
  Receipt,
  HandCoins,
  ShieldCheck,
  BarChart3,
  Calculator,
  Landmark,
  Settings,
  LogOut,
  UserCheck,
  BookOpen,
  Wrench,
  Wallet,
  X,
} from "lucide-react";

// Grouped by the job the shop is doing. role "admin" items are hidden from cashiers
// (their routes and API calls are owner-only as well).
const NAV_GROUPS = [
  {
    label: "Sell",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { label: "New sale", path: "/pos", icon: ShoppingCart },
      { label: "Billing ledger", path: "/ledger", icon: BookOpen },
      { label: "Bills", path: "/bills", icon: Receipt },
    ],
  },
  {
    label: "Khata",
    items: [
      { label: "Udhaar accounts", path: "/pending-payments", icon: HandCoins },
      { label: "Sellers", path: "/sellers", icon: UserCheck },
    ],
  },
  {
    label: "Stock",
    items: [
      { label: "Inventory", path: "/inventory", icon: Boxes },
      { label: "IMEI checker", path: "/imei-checker", icon: Search },
      { label: "Suppliers", path: "/suppliers", icon: Truck, role: "admin" },
      { label: "Warranties", path: "/warranties", icon: ShieldCheck },
      { label: "Repair tickets", path: "/mobile-issues", icon: Wrench },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Expenses", path: "/expenses", icon: Wallet },
      { label: "Sales reports", path: "/reports", icon: BarChart3, role: "admin" },
      { label: "Stock value", path: "/valuation", icon: Landmark, role: "admin" },
      { label: "Zakat", path: "/zakat", icon: Calculator, role: "admin" },
    ],
  },
  {
    label: "Shop",
    items: [{ label: "Settings", path: "/settings", icon: Settings, role: "admin" }],
  },
];

// Desktop (lg+): fixed rail. Phone / tablet: slide-in drawer controlled by the layout.
const Sidebar = ({ open = false, onClose }) => {
  const { user, logout, isAdmin } = useAuth();
  const { activeSeller, setActiveSeller } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Close the drawer after moving to another page
  useEffect(() => {
    onClose?.();
  }, [pathname, onClose]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.role !== "admin" || isAdmin) })).filter(
    (g) => g.items.length > 0
  );
  const initials = (user?.name || user?.username || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      {/* Backdrop behind the phone drawer */}
      <div
        className={`fixed inset-0 z-40 bg-ink/30 lg:hidden transition-opacity print:hidden ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[264px] bg-surface border-r border-line flex flex-col transition-transform duration-200 print:hidden
          lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:z-auto ${open ? "translate-x-0 shadow-pop" : "-translate-x-full"}`}
        aria-label="Main menu"
      >
        {/* Shop name */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-line shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-display font-extrabold text-base leading-none">
              AS
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-ink leading-tight truncate">Al-Syed</div>
              <div className="text-[11px] text-muted leading-tight truncate">Mobiles & Electronics</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg text-ink-soft hover:bg-sunken"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Seller filter on phones (the header shows it from tablet width up) */}
        <label className="sm:hidden mx-3 mt-3 flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 text-xs text-muted">
          <span>Seller</span>
          <select
            value={activeSeller}
            onChange={(e) => setActiveSeller(e.target.value)}
            className="flex-1 h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm font-semibold text-ink"
          >
            <option value="All Sellers">All sellers</option>
            {SELLERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 custom-scrollbar">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1.5 text-xs font-semibold text-muted">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium transition-colors ${
                          isActive ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-sunken hover:text-ink"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon size={18} className={isActive ? "text-brand-600" : "text-muted"} aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                          {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden="true" />}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Who is logged in (switching user = log out and log in again) */}
        <div className="p-3 border-t border-line shrink-0">
          <div className="flex items-center gap-3 rounded-xl p-2">
            <div className="w-9 h-9 rounded-full bg-sunken text-ink-soft flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink truncate">{user?.name || user?.username}</div>
              <div className="text-xs text-muted">{isAdmin ? "Owner (admin)" : "Cashier"}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted hover:text-khata-600 hover:bg-khata-50"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
