import { useState } from "react";
import { useApp, getProductStock } from "../context/AppContext";
import { Calculator, Info } from "lucide-react";

// Typed amounts: empty / invalid / negative counts as 0
const amount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const ZakatCalculator = () => {
  // Zakat is for the whole shop, so use every customer and supplier (not the header seller filter)
  const { products, allCustomers, suppliers, shopSettings } = useApp();
  const curr = shopSettings.currencySymbol || "Rs.";
  const money = (n) => `${curr} ${Math.round(amount(n)).toLocaleString()}`;

  // Auto-calculated inventory, receivable and payable values
  const defaultInventoryValue = (products || [])
    .filter((p) => !p.isDeleted)
    .reduce((sum, p) => sum + Number(p.purchasePrice || 0) * getProductStock(p), 0);

  const defaultReceivablesValue = (allCustomers || []).reduce((sum, c) => sum + Math.max(0, Number(c.totalPending || 0)), 0);

  // What the shop still owes its suppliers
  const defaultPayables = (suppliers || []).reduce((sum, s) => sum + Math.max(0, Number(s.balance || 0)), 0);

  // Editable Assets & Liabilities Inputs
  const [cashInHand, setCashInHand] = useState(0);
  const [bankBalance, setBankBalance] = useState(0);
  const [goldSilverValue, setGoldSilverValue] = useState(0);
  // Inventory / receivables follow the loaded data until the user types their own value (null = not edited)
  const [inventoryEdit, setInventoryValue] = useState(null);
  const [receivablesEdit, setReceivables] = useState(null);
  const inventoryValue = inventoryEdit ?? defaultInventoryValue;
  const receivables = receivablesEdit ?? defaultReceivablesValue;
  const [liabilitiesEdit, setLiabilitiesDeductions] = useState(null);
  const liabilitiesDeductions = liabilitiesEdit ?? defaultPayables;

  const totalZakatableAssets =
    amount(cashInHand) + amount(bankBalance) + amount(goldSilverValue) + amount(inventoryValue) + amount(receivables);
  const netZakatableAssets = Math.max(0, totalZakatableAssets - amount(liabilitiesDeductions));
  const estimatedZakat = Math.round(netZakatableAssets * 0.025);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm flex items-center gap-4">
        <div className="p-4 bg-purple-600/10 text-purple-400 rounded-2xl border border-purple-500/20">
          <Calculator size={32} />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Shariah Compliant 2.5% Rate
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-100">Annual Zakat Calculator for Shop Assets</h1>
          <p className="text-xs text-slate-400">
            Calculates 2.5% Zakat on Net Business Assets (Cash + Bank + Inventory Valuation + Udhaar Receivables minus Liabilities)
          </p>
        </div>
      </div>

      {/* Main Calculation Inputs & Results Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Asset Inputs */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
          <h2 className="font-bold text-slate-100 text-base border-b border-slate-800 pb-2">Zakatable Assets ({curr})</h2>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-semibold text-slate-400">Cash in Hand / Till</label>
              <input
                type="number"
                min="0"
                value={cashInHand}
                onChange={(e) => setCashInHand(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-semibold mt-1 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-400">Bank Accounts Balance</label>
              <input
                type="number"
                min="0"
                value={bankBalance}
                onChange={(e) => setBankBalance(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-semibold mt-1 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-400">Shop Inventory Wholesale Value (Auto-Derived)</label>
              <input
                type="number"
                min="0"
                value={inventoryValue}
                onChange={(e) => setInventoryValue(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-indigo-300 font-semibold mt-1 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-400">Udhaar Receivables from Customers (Auto-Derived)</label>
              <input
                type="number"
                min="0"
                value={receivables}
                onChange={(e) => setReceivables(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-rose-300 font-semibold mt-1 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-400">Gold / Silver / Other Investments</label>
              <input
                type="number"
                min="0"
                value={goldSilverValue}
                onChange={(e) => setGoldSilverValue(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-semibold mt-1 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-800">
              <label className="font-semibold text-rose-300">Debts & Liabilities Deductions (Payables / Supplier Bills — Auto-Derived)</label>
              <input
                type="number"
                min="0"
                value={liabilitiesDeductions}
                onChange={(e) => setLiabilitiesDeductions(e.target.value)}
                className="w-full bg-slate-950 border border-rose-900/50 rounded-xl p-2.5 text-rose-300 font-semibold mt-1 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Zakat Breakdown Card */}
        <div className="bg-gradient-to-b from-purple-950/40 to-slate-900 border border-purple-800/40 rounded-3xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h2 className="font-bold text-purple-200 text-lg border-b border-purple-800/40 pb-2">Zakat Summary Breakdown</h2>

            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="flex justify-between">
                <span>Gross Zakatable Assets:</span>
                <span className="font-bold text-slate-100">{money(totalZakatableAssets)}</span>
              </div>
              <div className="flex justify-between text-rose-300">
                <span>Deductible Liabilities:</span>
                <span className="font-bold">- {money(liabilitiesDeductions)}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-purple-800/40">
                <span className="font-bold text-slate-100">Net Zakatable Wealth:</span>
                <span className="font-extrabold text-purple-300">{money(netZakatableAssets)}</span>
              </div>
            </div>

            {/* Estimated Zakat Highlight */}
            <div className="p-6 bg-slate-950 rounded-2xl border border-purple-500/30 text-center space-y-1 shadow-xl">
              <span className="text-xs font-bold uppercase text-purple-400">Total Zakat Due (2.5%)</span>
              <div className="text-3xl font-black text-purple-300">
                {money(estimatedZakat)}
              </div>
              <p className="text-[10px] text-slate-400">Payable annually on net wealth exceeding Nisab</p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start gap-2.5 text-xs text-slate-400">
            <Info size={18} className="text-purple-400 shrink-0 mt-0.5" />
            <p>
              Zakat is calculated at 2.5% of net wealth owned continuously for one full lunar year (Hawl).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZakatCalculator;
