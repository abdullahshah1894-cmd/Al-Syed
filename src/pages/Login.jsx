import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AlertCircle, Eye, EyeOff, LogIn } from "lucide-react";
import { Button, Field, Input } from "../components/ui";

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
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Shop */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center font-display font-extrabold text-xl shadow-card">
            AS
          </div>
          <h1 className="mt-4 text-2xl font-bold">Al-Syed Mobiles & Electronics</h1>
          <p className="mt-1 text-sm text-muted">Point of sale, stock and khata</p>
        </div>

        {/* Form */}
        <div className="bg-surface border border-line rounded-2xl shadow-card p-6 sm:p-7">
          <h2 className="font-sans text-lg font-semibold">Log in</h2>
          <p className="mt-0.5 text-sm text-muted">Enter your username and password.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
                className="h-11"
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
                  className="h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-sunken"
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

            <Button type="submit" size="lg" icon={LogIn} loading={submitting} className="w-full">
              {submitting ? "Logging in…" : "Log in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted">Jinnah Plaza, Kohat</p>
      </div>
    </div>
  );
};

export default Login;
