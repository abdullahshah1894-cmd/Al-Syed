import React from "react";
import { useApp, getProductStock } from "../context/AppContext";
import { DollarSign } from "lucide-react";

const CATEGORIES = ["Smartphones", "Tablets & iPads", "Accessories", "Spare Parts", "Wearables"];

// Units actually in the shop (sold IMEIs never count; a negative quantity counts as 0)
const unitsInStock = (p) => Math.max(0, getProductStock(p) || 0);

// Quantity, cost and retail value of a list of products
const valuate = (list) =>
  list.reduce(
    (acc, p) => {
      const qty = unitsInStock(p);
      acc.qty += qty;
      acc.cost += (Number(p.purchasePrice) || 0) * qty;
      acc.retail += (Number(p.salePrice) || 0) * qty;
      return acc;
    },
    { qty: 0, cost: 0, retail: 0 }
  );

const InventoryValuation = () => {
  const { products, shopSettings } = useApp();
  const curr = shopSettings.currencySymbol || "Rs.";

  // Deleted products are not part of the shop's stock
  const liveProducts = (products || []).filter((p) => p && !p.isDeleted);

  const { qty: totalQty, cost: totalCostValuation, retail: totalSellingValuation } = valuate(liveProducts);
  const expectedProfit = totalSellingValuation - totalCostValuation;

  // Products with a category outside the standard list still count, under "Other"
  const otherProducts = liveProducts.filter((p) => !CATEGORIES.includes(p.category));
  const categoryRows = [
    ...CATEGORIES.map((cat) => ({ cat, list: liveProducts.filter((p) => p.category === cat) })),
    ...(otherProducts.length > 0 ? [{ cat: "Other", list: otherProducts }] : []),
  ];

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
          <div className="text-2xl font-extrabold text-slate-100">{totalQty.toLocaleString()} Units</div>
          <p className="text-[11px] text-slate-400">Across {liveProducts.length} Products</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-2">
          <span className="text-slate-400 text-xs font-bold uppercase">Wholesale Purchase Cost</span>
          <div className="text-2xl font-extrabold text-amber-400">
            {curr} {totalCostValuation.toLocaleString()}
          </div>
          <p className="text-[11px] text-amber-300 font-medium">Total Invested Capital</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-2">
          <span className="text-slate-400 text-xs font-bold uppercase">Potential Selling Value</span>
          <div className="text-2xl font-extrabold text-cyan-400">
            {curr} {totalSellingValuation.toLocaleString()}
          </div>
          <p className="text-[11px] text-cyan-300 font-medium">Retail Revenue Potential</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-2">
          <span className="text-slate-400 text-xs font-bold uppercase">Expected Gross Profit</span>
          <div className="text-2xl font-extrabold text-emerald-400">
            {curr} {expectedProfit.toLocaleString()}
          </div>
          <p className="text-[11px] text-emerald-300 font-medium">Expected Gross Margin</p>
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
              {categoryRows.map(({ cat, list }) => {
                const { qty: catQty, cost: catCost, retail: catRetail } = valuate(list);

                return (
                  <tr key={cat} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5 font-bold text-slate-100">{cat}</td>
                    <td className="p-3.5 text-slate-300">{list.length} item(s)</td>
                    <td className="p-3.5 font-semibold text-indigo-400">{catQty.toLocaleString()} units</td>
                    <td className="p-3.5 font-semibold text-amber-400">{curr} {catCost.toLocaleString()}</td>
                    <td className="p-3.5 font-semibold text-cyan-400">{curr} {catRetail.toLocaleString()}</td>
                    <td className="p-3.5 font-extrabold text-emerald-400 text-right">
                      {curr} {(catRetail - catCost).toLocaleString()}
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
