import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { Settings as SettingsIcon, Save, Store, ShieldCheck, UserCheck } from "lucide-react";

const Settings = () => {
  const { shopSettings, saveShopSettings } = useApp();
  const { user } = useAuth();

  const [shopName, setShopName] = useState(shopSettings.shopName);
  const [address, setAddress] = useState(shopSettings.address);
  const [phone, setPhone] = useState(shopSettings.phone);
  const [taxRate, setTaxRate] = useState(shopSettings.taxRate);

  const [savedSuccess, setSavedSuccess] = useState(false);

  // Settings arrive from the database after the page may already be open
  const [loadedSettings, setLoadedSettings] = useState(shopSettings);
  if (loadedSettings !== shopSettings) {
    setLoadedSettings(shopSettings);
    setShopName(shopSettings.shopName);
    setAddress(shopSettings.address);
    setPhone(shopSettings.phone);
    setTaxRate(shopSettings.taxRate);
  }

  const handleSave = async (e) => {
    e.preventDefault();
    const ok = await saveShopSettings({
      ...shopSettings,
      shopName,
      address,
      phone,
      taxRate: Number(taxRate),
    });
    if (!ok) return;
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm flex items-center gap-3">
        <div className="p-3 bg-indigo-600/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
          <SettingsIcon size={28} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Shop Settings & Configurations</h1>
          <p className="text-xs text-slate-400">
            Configure shop title, printed invoice header, tax rates, and staff profiles
          </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-400">Shop Name / Business Title *</label>
            <input
              type="text"
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 font-bold mt-1 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-400">Shop Physical Address *</label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-slate-400">Shop Contact Phone *</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 font-bold mt-1 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-400">Default POS Tax Rate (%)</label>
              <input
                type="number"
                min="0"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 font-bold mt-1 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {savedSuccess && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 rounded-xl text-xs font-semibold">
              Settings updated successfully!
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
            >
              <Save size={16} />
              <span>Save Configuration</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;
