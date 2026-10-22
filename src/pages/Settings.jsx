import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { Save, Store, ShieldCheck, UserCheck, KeyRound, UserPlus } from "lucide-react";
import { Page, PageHeader, Card, CardHeader, Badge, Button, Field, Input, Select } from "../components/ui";

const MIN_PASSWORD = 6;

// Green / red message line
const Notice = ({ kind, children }) =>
  children ? (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`p-3 rounded-xl text-sm border ${
        kind === "error" ? "bg-khata-50 border-khata-200 text-khata-700" : "bg-paid-50 border-paid-200 text-paid-700"
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
  <CardHeader
    className="pb-4 border-b border-line"
    title={
      <span className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
          <Icon size={16} aria-hidden="true" />
        </span>
        {title}
      </span>
    }
    description={subtitle && <span className="block pl-[2.625rem]">{subtitle}</span>}
  />
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
    <Card>
      <SectionHeader icon={KeyRound} title="Change my password" subtitle={`At least ${MIN_PASSWORD} characters`} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Current password *" htmlFor="pw-current">
          <Input
            id="pw-current"
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="New password *" htmlFor="pw-new">
            <Input
              id="pw-new"
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Type the new password again *" htmlFor="pw-confirm">
            <Input
              id="pw-confirm"
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>

        <Notice kind="error">{error}</Notice>
        <Notice kind="success">{success}</Notice>

        <div className="flex justify-end">
          <Button type="submit" icon={KeyRound} loading={saving} className="w-full sm:w-auto">
            {saving ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </Card>
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
    <Card>
      <SectionHeader icon={UserCheck} title="Users" subtitle="Who can log in to this POS" />

      <div className="space-y-3">
        {users === null ? (
          <p className="text-sm text-muted py-4 text-center">Loading users…</p>
        ) : (
          <>
            <Notice kind="error">{loadError}</Notice>
            {loadError && (
              <Button
                variant="secondary"
                onClick={() => {
                  setUsers(null);
                  setReloadKey((k) => k + 1);
                }}
              >
                Try again
              </Button>
            )}
            {!loadError && sortedUsers.length === 0 && (
              <p className="text-sm text-muted py-4 text-center">No users yet. Add the first one below.</p>
            )}
            {sortedUsers.length > 0 && (
              <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden">
                {sortedUsers.map((u) => (
                  <li key={u.id || u.username} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink truncate">
                        {u.name || u.username}
                        {currentUser && u.id === currentUser.id && (
                          <span className="ml-2 text-xs text-brand-700 font-semibold">(you)</span>
                        )}
                      </div>
                      <div className="text-xs text-muted font-mono truncate">{u.username}</div>
                    </div>
                    <Badge tone={u.role === "admin" ? "brand" : "neutral"} className="shrink-0 capitalize">
                      {u.role === "admin" ? "Admin (owner)" : u.role === "cashier" || !u.role ? "Cashier" : u.role}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 pt-5 border-t border-line space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink font-sans">
          <UserPlus size={16} className="text-muted" aria-hidden="true" /> Add user
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name *" htmlFor="user-name">
            <Input
              id="user-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Username *" hint="No spaces" htmlFor="user-username">
            <Input
              id="user-username"
              type="text"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </Field>
          <Field label="Password *" hint={`At least ${MIN_PASSWORD} characters`} htmlFor="user-password">
            <Input
              id="user-password"
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Field label="Role" htmlFor="user-role">
            <Select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="cashier">Cashier (staff)</option>
              <option value="admin">Admin (owner)</option>
            </Select>
          </Field>
        </div>

        <Notice kind="error">{error}</Notice>
        <Notice kind="success">{success}</Notice>

        <div className="flex justify-end">
          <Button type="submit" icon={UserPlus} loading={saving} className="w-full sm:w-auto">
            {saving ? "Adding…" : "Add user"}
          </Button>
        </div>
      </form>
    </Card>
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
    setSavedSuccess("Shop details saved.");
  };

  return (
    <Page className="max-w-3xl">
      <PageHeader
        title="Settings"
        description="Shop name and details printed on bills, your password and staff logins."
        actions={
          user && (
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
              <ShieldCheck size={16} className="text-paid-600" aria-hidden="true" />
              Logged in as <span className="font-semibold text-ink">{user.username}</span>
            </span>
          )
        }
      />

      <Card>
        <SectionHeader icon={Store} title="Shop details" subtitle="Printed on bills and receipts" />
        <form onSubmit={handleSave} className="space-y-4">
          <Field label="Shop name *" htmlFor="shop-name">
            <Input id="shop-name" type="text" required value={shopName} onChange={(e) => setShopName(e.target.value)} className="font-semibold" />
          </Field>

          <Field label="Address *" htmlFor="shop-address">
            <Input id="shop-address" type="text" required value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Phone *" htmlFor="shop-phone">
              <Input id="shop-phone" type="text" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>

            <Field label="Default tax rate (%)" htmlFor="shop-tax">
              <Input id="shop-tax" type="number" inputMode="decimal" min="0" step="any" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </Field>

            <Field label="Currency symbol" htmlFor="shop-currency">
              <Input id="shop-currency" type="text" maxLength={6} value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} />
            </Field>
          </div>

          <Notice kind="success">{savedSuccess}</Notice>

          <div className="flex justify-end">
            <Button type="submit" icon={Save} loading={saving} className="w-full sm:w-auto">
              {saving ? "Saving…" : "Save shop details"}
            </Button>
          </div>
        </form>
      </Card>

      <ChangePasswordCard />
      <UsersCard currentUser={user} />
    </Page>
  );
};

export default Settings;
