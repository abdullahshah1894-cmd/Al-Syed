import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button, Field, Input } from "../components/ui";

// Ruled khata page: faint blue lines with the red margin rule of a ledger book
const ledgerPaper = {
  backgroundImage:
    "linear-gradient(to right, transparent 3.25rem, var(--color-khata-300) 3.25rem, var(--color-khata-300) calc(3.25rem + 1.5px), transparent calc(3.25rem + 1.5px))," +
    "repeating-linear-gradient(to bottom, transparent 0, transparent 2.25rem, var(--color-brand-100) 2.25rem, var(--color-brand-100) calc(2.25rem + 1px))",
};

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Back to the page that sent us here (ProtectedRoute remembers it), else the dashboard
  const fromPath = location.state?.from?.pathname;
  const target = fromPath && fromPath !== "/login" ? `${fromPath}${location.state.from.search || ""}` : "/dashboard";

  if (token) return <Navigate to={target} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err?.message || "Login failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper grid lg:grid-cols-[1.1fr_1fr]">
      {/* Shop side (desktop) */}
      <section className="hidden lg:flex flex-col justify-between bg-brand-50 p-12 relative overflow-hidden" style={ledgerPaper}>
        <div className="pl-16">
          <div className="text-sm font-semibold text-brand-700">Kohat, Jinnah Plaza</div>
        </div>
        <div className="pl-16 max-w-xl">
          <h1 className="font-display font-extrabold text-ink leading-[0.95] text-[clamp(3.5rem,6vw,5.5rem)] tracking-tight">
            Al-Syed
          </h1>
          <p className="mt-2 font-display text-2xl font-semibold text-ink-soft">Mobiles & Electronics</p>
          <p className="mt-8 text-base text-ink-soft leading-relaxed max-w-md">
            Ring up sales, scan IMEIs, keep every customer&apos;s khata straight and know exactly what is in stock.
          </p>
        </div>
        <div className="pl-16 text-xs text-muted">Every sale and payment is saved to the shop&apos;s database the moment you press save.</div>
      </section>

      {/* Login form */}
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10">
            <h1 className="font-display font-extrabold text-5xl text-ink leading-none">Al-Syed</h1>
            <p className="mt-1 font-display text-lg font-semibold text-ink-soft">Mobiles & Electronics</p>
          </div>

          <h2 className="text-2xl font-bold">Log in</h2>
          <p className="mt-1 text-sm text-muted">Use the username and password the owner gave you.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <Field label="Username" htmlFor="login-username">
              <Input
                id="login-username"
                type="text"
                required
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12"
              />
            </Field>

            <Field label="Password" htmlFor="login-password">
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-sunken"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>

            {error && (
              <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-khata-50 border border-khata-200 text-sm text-khata-700">
                <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              {submitting ? "Logging in…" : "Log in"}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
};

export default Login;
