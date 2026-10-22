import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { Settings as SettingsIcon, Save, Store, ShieldCheck, UserCheck, KeyRound, UserPlus } from "lucide-react";

const MIN_PASSWORD = 6;

const inputCls =
  "w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 mt-1 focus:outline-none focus:border-indigo-500";

// Green / red message line
const Notice = ({ kind, children }) =>
  children ? (
    <div
      className={`p-3 rounded-xl text-xs font-semibold border ${
        kind === "error"
          ? "bg-rose-950/40 border-rose-900/50 text-rose-300"
          : "bg-emerald-950/40 border-emerald-800/50 text-emerald-300"
      }`}
    >
      {children}
    </div>
  ) : null;

// A message that clears itself after a few seconds (timer cleared on unmount)
const useFlash = () => {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(t);
  }, [message]);
  return [message, setMessage];
};

const SectionHeader = ({ icon: Icon, title, subtitle }) => (
  <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
    <div className="p-2 bg-indigo-600/10 text-indigo-400 rounded-xl border border-indigo-500/20">
      <Icon size={18} />
    </div>
    <div>
      <h2 className="font-bold text-slate-100 text-base">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
    </div>
  </div>
);

// ── Change my password ───────────────────────────────────────────────────────
const ChangePasswordCard = () => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useFlash();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError("");
    setSuccess("");
    if (!current) return setError("Enter your current password.");
    if (next.length < MIN_PASSWORD) return setError(`New password must be at least ${MIN_PASSWORD} characters.`);
    if (next !== confirm) return setError("The new password and its confirmation do not match.");
    if (next === current) return setError("The new password is the same as the current one.");

    setSaving(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setSuccess("Password changed. Use the new password next time you log in.");
    } catch (err) {
      setError(err?.message || "Password could not be changed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
      <SectionHeader icon={KeyRound} title="Change My Password" subtitle={`At least ${MIN_PASSWORD} characters`} />
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="font-semibold text-slate-400">Current Password *</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-semibold text-slate-400">New Password *</label>
            <input
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="font-semibold text-slate-400">Confirm New Password *</label>
            <input
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <Notice kind="error">{error}</Notice>
        <Notice kind="success">{success}</Notice>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-60"
          >
            <KeyRound size={16} />
            <span>{saving ? "Changing…" : "Change Password"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

// ── Users ────────────────────────────────────────────────────────────────────
const emptyUser = { name: "", username: "", password: "", role: "cashier" };

const UsersCard = ({ currentUser }) => {
  const [users, setUsers] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState(emptyUser);
  const [error, setError] = useState("");
  const [success, setSuccess] = useFlash();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.getUsers().then((data) => {
      if (!active) return;
      if (Array.isArray(data)) {
        setUsers(data);
        setLoadError("");
      } else {
        setUsers([]);
        setLoadError("Could not load the user list. Check that the backend is running and try again.");
      }
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError("");
    setSuccess("");
    const name = form.name.trim();
    const username = form.username.trim();
    if (!name || !username) return setError("Name and username are required.");
    if (/\s/.test(username)) return setError("The username cannot contain spaces.");
    if (form.password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    if ((users || []).some((u) => (u.username || "").toLowerCase() === username.toLowerCase())) {
      return setError(`The username "${username}" is already taken.`);
    }

    setSaving(true);
    try {
      const saved = await api.createUser({ name, username, password: form.password, role: form.role });
      if (saved && saved.id) setUsers((prev) => [...(prev || []), saved]);
      else setReloadKey((k) => k + 1);
      setForm(emptyUser);
      setSuccess(`User "${username}" added as ${saved?.role || form.role}.`);
    } catch (err) {
      setError(err?.message || "User could not be added.");
    } finally {
      setSaving(false);
    }
  };

  const sortedUsers = [...(users || [])].sort(
    (a, b) => (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1) || (a.username || "").localeCompare(b.username || "")
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
      <SectionHeader icon={UserCheck} title="Users" subtitle="Who can log in to this POS" />

      {users === null ? (
        <p className="text-xs text-slate-500 py-4 text-center">Loading users…</p>
      ) : (
        <>
          <Notice kind="error">{loadError}</Notice>
          {loadError && (
            <button
              type="button"
              onClick={() => {
                setUsers(null);
                setReloadKey((k) => k + 1);
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              Try again
            </button>
          )}
          {!loadError && sortedUsers.length === 0 && (
            <p className="text-xs text-slate-500 py-4 text-center">No users found</p>
          )}
          {sortedUsers.length > 0 && (
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-2xl overflow-hidden">
              {sortedUsers.map((u) => (
                <div key={u.id || u.username} className="px-4 py-3 flex items-center justify-between gap-3 bg-slate-950/40">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-100 truncate">
                      {u.name || u.username}
                      {currentUser && u.id === currentUser.id && (
                        <span className="ml-2 text-[10px] text-indigo-300 font-bold">(you)</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">{u.username}</div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase shrink-0 ${
                      u.role === "admin"
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                    }`}
                  >
                    {u.role || "cashier"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-xs pt-2 border-t border-slate-800">
        <div className="flex items-center gap-2 pt-2 text-slate-300 font-bold text-sm">
          <UserPlus size={16} className="text-indigo-400" /> Add User
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-semibold text-slate-400">Full Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="font-semibold text-slate-400">Username *</label>
            <input
              type="text"
              required
              autoComplete="off"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="font-semibold text-slate-400">Password *</label>
            <input
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="font-semibold text-slate-400">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className={inputCls}
            >
              <option value="cashier">Cashier (staff)</option>
              <option value="admin">Admin (owner)</option>
            </select>
          </div>
        </div>

        <Notice kind="error">{error}</Notice>
        <Notice kind="success">{success}</Notice>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-60"
          >
            <UserPlus size={16} />
            <span>{saving ? "Adding…" : "Add User"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────
const Settings = () => {
  const { shopSettings, saveShopSettings } = useApp();
  const { user } = useAuth();

  const [shopName, setShopName] = useState(shopSettings.shopName ?? "");
  const [address, setAddress] = useState(shopSettings.address ?? "");
  const [phone, setPhone] = useState(shopSettings.phone ?? "");
  const [taxRate, setTaxRate] = useState(shopSettings.taxRate ?? 0);
  const [currencySymbol, setCurrencySymbol] = useState(shopSettings.currencySymbol ?? "Rs.");

  const [savedSuccess, setSavedSuccess] = useFlash();
  const [saving, setSaving] = useState(false);

  // Settings arrive from the database after the page may already be open
  const [loadedSettings, setLoadedSettings] = useState(shopSettings);
  if (loadedSettings !== shopSettings) {
    setLoadedSettings(shopSettings);
    setShopName(shopSettings.shopName ?? "");
    setAddress(shopSettings.address ?? "");
    setPhone(shopSettings.phone ?? "");
    setTaxRate(shopSettings.taxRate ?? 0);
    setCurrencySymbol(shopSettings.currencySymbol ?? "Rs.");
  }

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const ok = await saveShopSettings({
      ...shopSettings,
      shopName: shopName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      taxRate: Math.max(0, Number(taxRate) || 0),
      currencySymbol: currencySymbol.trim() || "Rs.",
    });
    setSaving(false);
    if (!ok) return;
    setSavedSuccess("Settings updated successfully!");
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm flex items-center gap-3">
        <div className="p-3 bg-indigo-600/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
          <SettingsIcon size={28} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-100">Shop Settings & Configurations</h1>
          <p className="text-xs text-slate-400">
            Configure shop title, printed invoice header, tax rates, passwords and staff logins
          </p>
        </div>
        {user && (
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0">
            <ShieldCheck size={14} className="text-emerald-400" />
            Signed in as <span className="font-bold text-slate-200">{user.username}</span>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <SectionHeader icon={Store} title="Shop Details" subtitle="Printed on invoices and receipts" />
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-400">Shop Name / Business Title *</label>
            <input
              type="text"
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className={`${inputCls} font-bold`}
            />
          </div>

          <div>
            <label className="font-semibold text-slate-400">Shop Physical Address *</label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="font-semibold text-slate-400">Shop Contact Phone *</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`${inputCls} font-bold`}
              />
            </div>

            <div>
              <label className="font-semibold text-slate-400">Default POS Tax Rate (%)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className={`${inputCls} font-bold`}
              />
            </div>

            <div>
              <label className="font-semibold text-slate-400">Currency Symbol</label>
              <input
                type="text"
                maxLength={6}
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                className={`${inputCls} font-bold`}
              />
            </div>
          </div>

          <Notice kind="success">{savedSuccess}</Notice>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-60"
            >
              <Save size={16} />
              <span>{saving ? "Saving…" : "Save Configuration"}</span>
            </button>
          </div>
        </form>
      </div>

      <ChangePasswordCard />
      <UsersCard currentUser={user} />
    </div>
  );
};

export default Settings;
