import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Smartphone,
  Search,
  Users,
  Receipt,
  Clock,
  ShieldCheck,
  BarChart3,
  Calculator,
  DollarSign,
  Settings,
  LogOut,
  UserCheck,
  Sparkles,
  BookOpen,
  Wrench,
  Wallet,
} from "lucide-react";

const Sidebar = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navItems = [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, role: "all" },
    { label: "POS / New Sale", path: "/pos", icon: ShoppingCart, role: "all", badge: "POS" },
    { label: "Inventory", path: "/inventory", icon: Boxes, role: "all" },
    { label: "IMEI Checker", path: "/imei-checker", icon: Search, role: "all", highlight: true },
    { label: "Customers", path: "/customers", icon: Users, role: "all" },
    { label: "Bills & Invoices", path: "/bills", icon: Receipt, role: "all" },
    { label: "Billing Ledger", path: "/ledger", icon: BookOpen, role: "all", badge: "ERP" },
    { label: "Pending Payments", path: "/pending-payments", icon: Clock, role: "all", badge: "Udhaar" },
    { label: "Sellers", path: "/sellers", icon: UserCheck, role: "all" },
    { label: "Expenses", path: "/expenses", icon: Wallet, role: "all", badge: "NEW" },
    { label: "Warranty & Repairs", path: "/warranties", icon: ShieldCheck, role: "all" },
    { label: "Mobile Issues", path: "/mobile-issues", icon: Wrench, role: "all" },
    // Admin Only Navigation Items
    { label: "Sales Reports", path: "/reports", icon: BarChart3, role: "admin" },
    { label: "Inventory Valuation", path: "/valuation", icon: DollarSign, role: "admin" },
    { label: "Zakat Calculator", path: "/zakat", icon: Calculator, role: "admin", highlight: true },
    { label: "Settings", path: "/settings", icon: Settings, role: "admin" },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 h-screen sticky top-0 select-none z-30 print:hidden">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center gap-3 bg-slate-950/40">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
          <Smartphone size={22} />
        </div>
        <div>
          <h1 className="font-bold text-slate-100 text-base leading-tight tracking-wide">
            AL-SYED POS
          </h1>
          <p className="text-xs text-indigo-400 font-medium">Mobile & Electronics</p>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
        <div className="px-3 pb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Main Menu
        </div>

        {navItems.map((item) => {
          const isRestricted = item.role === "admin" && !isAdmin;
          const Icon = item.icon;

          if (isRestricted) {
            return (
              <div
                key={item.path}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-slate-600 cursor-not-allowed opacity-60 text-sm font-medium"
                title="Admin Access Required"
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} />
                  <span>{item.label}</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-bold uppercase">
                  Admin
                </span>
              </div>
            );
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "hover:bg-slate-800/70 text-slate-300 hover:text-white"
                }`
              }
            >
              <div className="flex items-center gap-3">
                <Icon size={18} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {item.badge}
                </span>
              )}
              {item.highlight && !item.badge && (
                <Sparkles size={14} className="text-amber-400 animate-pulse" />
              )}
            </NavLink>
          );
        })}
      </div>

      {/* User Profile Footer (switching role = log out and log in as the other user) */}
      <div className="p-3 bg-slate-950/60 border-t border-slate-800 space-y-3">
        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <img
              src={user?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=User"}
              alt="Avatar"
              className="w-9 h-9 rounded-lg bg-slate-800 object-cover border border-slate-700"
            />
            <div className="truncate">
              <div className="text-xs font-semibold text-slate-100 truncate">{user?.name}</div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isAdmin ? "bg-emerald-400 animate-ping" : "bg-amber-400"
                  }`}
                ></span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {user?.role}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
