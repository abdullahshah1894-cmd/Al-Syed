import React from "react";
import { useApp } from "../context/AppContext";
import { DollarSign, TrendingUp, Boxes, Layers, PieChart } from "lucide-react";

const InventoryValuation = () => {
  const { products, shopSettings } = useApp();

  const totalQty = products.reduce((sum, p) => {
    const qty = p.imeis && p.imeis.length > 0 ? p.imeis.filter((i) => i.status === "in_stock").length : (p.quantity || 0);
    return sum + qty;
  }, 0);

  const totalCostValuation = products.reduce((sum, p) => {
    const qty = p.imeis && p.imeis.length > 0 ? p.imeis.filter((i) => i.status === "in_stock").length : (p.quantity || 0);
    return sum + p.purchasePrice * qty;
  }, 0);

  const totalSellingValuation = products.reduce((sum, p) => {
    const qty = p.imeis && p.imeis.length > 0 ? p.imeis.filter((i) => i.status === "in_stock").length : (p.quantity || 0);
    return sum + p.salePrice * qty;
  }, 0);

  const expectedProfit = totalSellingValuation - totalCostValuation;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign size={24} className="text-cyan-400" />
          <h1 className="text-xl font-bold text-slate-100">Inventory Valuation & Gross Cost Analysis</h1>
        </div>
        <p className="text-xs text-slate-400">
          Real-time wholesale purchase cost valuation, potential retail revenue, and expected gross profit margin
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-2">
          <span className="text-slate-400 text-xs font-bold uppercase">Total Items in Stock</span>
          <div className="text-2xl font-extrabold text-slate-100">{totalQty} Units</div>
          <p className="text-[11px] text-slate-400">Across {products.length} Products</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-2">
          <span className="text-slate-400 text-xs font-bold uppercase">Wholesale Purchase Cost</span>
          <div className="text-2xl font-extrabold text-amber-400">
            {shopSettings.currencySymbol} {totalCostValuation.toLocaleString()}
          </div>
          <p className="text-[11px] text-amber-300 font-medium">Total Invested Capital</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-2">
          <span className="text-slate-400 text-xs font-bold uppercase">Potential Selling Value</span>
          <div className="text-2xl font-extrabold text-cyan-400">
            {shopSettings.currencySymbol} {totalSellingValuation.toLocaleString()}
          </div>
          <p className="text-[11px] text-cyan-300 font-medium">Retail Revenue Potential</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-2">
          <span className="text-slate-400 text-xs font-bold uppercase">Expected Gross Profit</span>
          <div className="text-2xl font-extrabold text-emerald-400">
            {shopSettings.currencySymbol} {expectedProfit.toLocaleString()}
          </div>
          <p className="text-[11px] text-emerald-300 font-medium">Expected Net Margin</p>
        </div>
      </div>

      {/* Category Breakdown Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm overflow-hidden">
        <h2 className="font-bold text-slate-100 text-base mb-4">Category Valuation Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 uppercase bg-slate-950/60 rounded-xl">
              <tr>
                <th className="p-3.5 font-semibold">Category</th>
                <th className="p-3.5 font-semibold">Products Count</th>
                <th className="p-3.5 font-semibold">Total Quantity</th>
                <th className="p-3.5 font-semibold">Cost Valuation</th>
                <th className="p-3.5 font-semibold">Retail Valuation</th>
                <th className="p-3.5 font-semibold text-right">Profit Potential</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {["Smartphones", "Tablets & iPads", "Accessories", "Spare Parts", "Wearables"].map((cat) => {
                const catProds = products.filter((p) => p.category === cat);
                const catQty = catProds.reduce((sum, p) => sum + (p.imeis && p.imeis.length > 0 ? p.imeis.filter((i) => i.status === "in_stock").length : (p.quantity || 0)), 0);
                const catCost = catProds.reduce((sum, p) => sum + p.purchasePrice * (p.imeis && p.imeis.length > 0 ? p.imeis.filter((i) => i.status === "in_stock").length : (p.quantity || 0)), 0);
                const catRetail = catProds.reduce((sum, p) => sum + p.salePrice * (p.imeis && p.imeis.length > 0 ? p.imeis.filter((i) => i.status === "in_stock").length : (p.quantity || 0)), 0);

                return (
                  <tr key={cat} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5 font-bold text-slate-100">{cat}</td>
                    <td className="p-3.5 text-slate-300">{catProds.length} item(s)</td>
                    <td className="p-3.5 font-semibold text-indigo-400">{catQty} units</td>
                    <td className="p-3.5 font-semibold text-amber-400">Rs. {catCost.toLocaleString()}</td>
                    <td className="p-3.5 font-semibold text-cyan-400">Rs. {catRetail.toLocaleString()}</td>
                    <td className="p-3.5 font-extrabold text-emerald-400 text-right">
                      Rs. {(catRetail - catCost).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventoryValuation;
