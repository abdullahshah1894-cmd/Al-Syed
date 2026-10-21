import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, SELLERS } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import {
  Search,
  Bell,
  ShoppingCart,
  PlusCircle,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";

const Header = () => {
  const { products, customers, activeSeller, setActiveSeller } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  const lowStockItems = products.filter(
    (p) => (p.imeis && p.imeis.length > 0 ? p.imeis.filter((i) => i.status === "in_stock").length : (p.quantity || 0)) <= p.minStockAlert
  );

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const query = searchTerm.trim();
    if (!query) return;

    // Check if input looks like a 15 digit IMEI
    if (/^\d{15}$/.test(query)) {
      navigate(`/imei-checker?imei=${query}`);
      return;
    }

    // Check if query matches a customer name or phone
    const isCustomer = (customers || []).some(
      (c) =>
        (c.name || "").toLowerCase().includes(query.toLowerCase()) ||
        (c.phone || "").includes(query)
    );

    if (isCustomer) {
      navigate(`/pending-payments?search=${encodeURIComponent(query)}`);
      return;
    }

    navigate(`/inventory?search=${encodeURIComponent(query)}`);
  };

  return (
    <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-6 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-sm print:hidden">
      {/* Global Quick Search */}
      <form onSubmit={handleSearchSubmit} className="relative w-96">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search products, customers, IMEIs, bills..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
        />
      </form>

      {/* Header Actions */}
      <div className="flex items-center gap-3">
        
        {/* Global Seller Selector */}
        <div className="relative group flex items-center">
          <span className="text-xs font-bold text-slate-500 mr-2 uppercase tracking-wide">Seller:</span>
          <select 
            value={activeSeller} 
            onChange={(e) => setActiveSeller(e.target.value)}
            className="appearance-none bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl pl-3 pr-8 py-1.5 focus:outline-none focus:border-indigo-500 font-semibold cursor-pointer shadow-sm hover:bg-slate-700 transition-colors"
          >
            <option value="All Sellers">All Sellers</option>
            {SELLERS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        
        <div className="w-px h-6 bg-slate-800 mx-1"></div>
        {/* Quick Action: New Sale POS */}
        <button
          onClick={() => navigate("/pos")}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20 active:scale-95"
        >
          <ShoppingCart size={16} />
          <span>New Sale (POS)</span>
        </button>

        {/* Low Stock Alerts Notification */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl relative transition-all border border-slate-700/60"
            title="Low Stock Alerts"
          >
            <Bell size={18} />
            {lowStockItems.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-full flex items-center justify-center border-2 border-slate-900 shadow">
                {lowStockItems.length}
              </span>
            )}
          </button>

          {/* Low Stock Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-3 w-80 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
              <div className="p-4 bg-slate-900 border-b border-slate-700/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-400" />
                  <h3 className="font-semibold text-slate-100 text-sm">Low Stock Alerts</h3>
                </div>
                <span className="text-xs bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  {lowStockItems.length} Item(s)
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-700/50">
                {lowStockItems.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    All inventory levels are healthy!
                  </div>
                ) : (
                  lowStockItems.map((item) => {
                    const currentStock = item.imeis
                      ? item.imeis.filter((i) => i.status === "in_stock").length
                      : item.quantity;

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setShowNotifications(false);
                          navigate("/inventory");
                        }}
                        className="p-3 hover:bg-slate-700/50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="text-xs font-semibold text-slate-200">{item.name}</p>
                          <p className="text-[11px] text-slate-400">{item.brand} • {item.category}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-amber-400">
                            {currentStock} Left
                          </span>
                          <p className="text-[10px] text-slate-400">Min: {item.minStockAlert}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-2.5 bg-slate-900 border-t border-slate-700/80 text-center">
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    navigate("/inventory");
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  View Full Inventory →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
