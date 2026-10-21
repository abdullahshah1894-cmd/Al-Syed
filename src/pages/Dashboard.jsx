import React from "react";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  DollarSign,
  TrendingUp,
  Boxes,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Calculator,
  ShoppingCart,
  Search,
  ArrowUpRight,
  Receipt,
  UserCheck,
  Wrench,
} from "lucide-react";

const Dashboard = () => {
  const { products, sales, customers, warranties, shopSettings } = useApp();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  // Metrics Calculations
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((s) => s.createdAt.slice(0, 10) === todayStr);

  const todayTotalRevenue = todaySales.reduce((sum, s) => sum + s.grandTotal, 0);
  const todayTotalProfit = todaySales.reduce((sum, s) => sum + (s.netProfit || (s.grandTotal - (s.items || []).reduce((acc, i) => acc + i.unitPurchasePrice * i.quantity, 0))), 0);

  // Total Inventory Purchase Valuation & Potential Sales Value
  const totalInventoryPurchaseCost = products.reduce((sum, p) => {
    const qty = p.imeis && p.imeis.length > 0 ? p.imeis.filter((i) => i.status === "in_stock").length : (p.quantity || 0);
    return sum + p.purchasePrice * qty;
  }, 0);

  const totalInventoryRetailValue = products.reduce((sum, p) => {
    const qty = p.imeis && p.imeis.length > 0 ? p.imeis.filter((i) => i.status === "in_stock").length : (p.quantity || 0);
    return sum + p.salePrice * qty;
  }, 0);

  const lowStockCount = products.filter(
    (p) => (p.imeis && p.imeis.length > 0 ? p.imeis.filter((i) => i.status === "in_stock").length : (p.quantity || 0)) <= p.minStockAlert
  ).length;

  const totalUdhaarPending = customers.reduce((sum, c) => sum + c.totalPending, 0);
  const activeWarrantiesCount = warranties.filter((w) => w.status === "Active" || w.status === "Expiring Soon").length;

  // Estimated Zakat calculation (2.5% on Net Assets)
  const cashInHand = 150000;
  const bankBalance = 350000;
  const netAssets = cashInHand + bankBalance + totalInventoryPurchaseCost + totalUdhaarPending;
  const estimatedZakat = Math.round(netAssets * 0.025);

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 rounded-3xl p-6 border border-indigo-800/50 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
              {user?.role === "admin" ? "Owner / Administrator" : "Cashier Portal"}
            </span>
            <span className="text-xs text-slate-400">• {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Welcome back, {user?.name}!
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            {shopSettings.shopName} Dashboard Overview
          </p>
        </div>

        {/* Quick Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/pos")}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
          >
            <ShoppingCart size={18} />
            <span>Open POS Terminal</span>
          </button>
          <button
            onClick={() => navigate("/imei-checker")}
            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-2xl text-sm flex items-center gap-2 border border-slate-700 transition-all"
          >
            <Search size={18} className="text-indigo-400" />
            <span className="hidden sm:inline">IMEI Lookup</span>
          </button>
          <button
            onClick={() => navigate("/warranties")}
            className="px-4 py-3 bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 font-semibold rounded-2xl text-sm flex items-center gap-2 border border-orange-500/30 transition-all"
          >
            <Wrench size={18} />
            <span className="hidden sm:inline">Mobile Issue</span>
          </button>
        </div>
      </div>

      {/* Summary Cards Grid (Requirement 11) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Today's Sales */}
        <div 
          onClick={() => navigate("/sales-reports")}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-indigo-500/50 hover:shadow-indigo-500/10 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Today's Sales</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-100">{shopSettings.currencySymbol} {todayTotalRevenue.toLocaleString()}</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1 font-medium">
            <TrendingUp size={12} />
            <span>{todaySales.length} Bill(s) Today</span>
          </div>
        </div>

        {/* Card 2: Today's Profit (Admin viewable) */}
        <div 
          onClick={() => isAdmin ? navigate("/sales-reports") : null}
          className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm transition-all ${isAdmin ? "cursor-pointer hover:border-indigo-500/50 hover:shadow-indigo-500/10" : ""}`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Today's Profit</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-100">
            {isAdmin ? `${shopSettings.currencySymbol} ${todayTotalProfit.toLocaleString()}` : "••••••"}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {isAdmin ? "Net profit margin" : "Restricted for Cashier"}
          </div>
        </div>

        {/* Card 3: Inventory Value */}
        <div 
          onClick={() => navigate("/inventory-valuation")}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-cyan-500/50 hover:shadow-cyan-500/10 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Inventory Value</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Boxes size={18} />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-100">
            {isAdmin ? `${shopSettings.currencySymbol} ${totalInventoryPurchaseCost.toLocaleString()}` : `${products.length} Products`}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Retail: {shopSettings.currencySymbol} {totalInventoryRetailValue.toLocaleString()}
          </div>
        </div>

        {/* Card 4: Low Stock Alert */}
        <div 
          onClick={() => navigate("/inventory")}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-amber-500/50 hover:shadow-amber-500/10 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Low Stock</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-100">{lowStockCount} Items</div>
          <div className="text-[11px] text-amber-400 mt-1 font-medium">
            Requires restocking
          </div>
        </div>

        {/* Card 5: Udhaar Pending */}
        <div 
          onClick={() => navigate("/pending-payments")}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-rose-500/50 hover:shadow-rose-500/10 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Udhaar Pending</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Clock size={18} />
            </div>
          </div>
          <div className="text-xl font-bold text-rose-400">
            {shopSettings.currencySymbol} {totalUdhaarPending.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Across {customers.filter((c) => c.totalPending > 0).length} customer(s)
          </div>
        </div>

        {/* Card 6: Estimated Zakat (Admin) */}
        <div 
          onClick={() => isAdmin ? navigate("/zakat-calculator") : null}
          className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm transition-all ${isAdmin ? "cursor-pointer hover:border-purple-500/50 hover:shadow-purple-500/10" : ""}`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Est. Zakat (2.5%)</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Calculator size={18} />
            </div>
          </div>
          <div className="text-xl font-bold text-purple-300">
            {isAdmin ? `${shopSettings.currencySymbol} ${estimatedZakat.toLocaleString()}` : "••••••"}
          </div>
          <div className="text-[11px] text-purple-400 mt-1 font-medium">
            {isAdmin ? "Calculated on Net Assets" : "Admin view only"}
          </div>
        </div>
      </div>

      {/* Main Content Split: Recent Sales Table & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Bills — Latest 3 */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt size={20} className="text-indigo-400" />
              <h2 className="font-bold text-slate-100 text-base">Recent Bills</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                Latest 3
              </span>
            </div>
            <button
              onClick={() => navigate("/bills")}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors"
            >
              <span>View All Bills</span>
              <ArrowUpRight size={14} />
            </button>
          </div>

          {sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500 gap-2">
              <Receipt size={32} className="opacity-30" />
              <p className="text-sm font-medium">No bills created yet</p>
              <button
                onClick={() => navigate("/pos")}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold mt-1"
              >
                Go to POS Terminal →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sales.slice(0, 3).map((sale, idx) => (
                <div
                  key={sale.id}
                  className="flex items-center gap-4 p-4 bg-slate-950/50 border border-slate-800 rounded-2xl hover:border-slate-700 transition-all group"
                >
                  {/* Bill index badge */}
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-extrabold text-indigo-300">#{idx + 1}</span>
                  </div>

                  {/* Bill info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-indigo-400">{sale.billNumber}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          sale.paymentMethod === "Credit (Udhaar)"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        }`}
                      >
                        {sale.paymentMethod}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-200 mt-0.5 truncate">{sale.customerName}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {sale.items.map((i) => i.productName).join(", ")}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold text-slate-100">
                      {shopSettings.currencySymbol} {sale.grandTotal.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {sale.items.reduce((s, i) => s + i.quantity, 0)} item(s)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock & Stock Warning Widget */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-400" />
              <h2 className="font-bold text-slate-100 text-base">Low Stock Warnings</h2>
            </div>
            <span className="text-xs bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
              {lowStockCount}
            </span>
          </div>

          <div className="space-y-3">
            {products
              .filter((p) => (p.imeis && p.imeis.length > 0 ? p.imeis.filter((i) => i.status === "in_stock").length : (p.quantity || 0)) <= p.minStockAlert)
              .map((prod) => {
                const stock = prod.imeis && prod.imeis.length > 0 ? prod.imeis.filter((i) => i.status === "in_stock").length : (prod.quantity || 0);
                return (
                  <div
                    key={prod.id}
                    className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-200">{prod.name}</p>
                      <p className="text-[11px] text-slate-400">{prod.brand} • {prod.category}</p>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {stock} left
                      </span>
                      <p className="text-[10px] text-slate-500 mt-0.5">Min Alert: {prod.minStockAlert}</p>
                    </div>
                  </div>
                );
              })}
          </div>

          <button
            onClick={() => navigate("/inventory")}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors border border-slate-700"
          >
            Manage Inventory Stock
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
