import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Smartphone, Lock, Mail, ShieldCheck, UserCheck } from "lucide-react";

const Login = () => {
  const [email, setEmail] = useState("admin@shop.com");
  const [password, setPassword] = useState("admin123");
  const [selectedRole, setSelectedRole] = useState("admin");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    login(email, password, selectedRole);
    navigate("/dashboard");
  };

  const handleDemoFill = (role) => {
    setSelectedRole(role);
    if (role === "admin") {
      setEmail("admin@shop.com");
      setPassword("admin123");
    } else {
      setEmail("cashier@shop.com");
      setPassword("cashier123");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl p-8 backdrop-blur z-10">
        {/* App Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-cyan-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-indigo-500/20">
            <Smartphone size={36} className="text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight">
            AL-SYED POS
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Mobile & Electronics Shop Inventory System
          </p>
        </div>

        {/* Role Toggle Selector */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => handleDemoFill("admin")}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              selectedRole === "admin"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck size={16} />
            <span>Admin (Owner)</span>
          </button>

          <button
            type="button"
            onClick={() => handleDemoFill("cashier")}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              selectedRole === "cashier"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <UserCheck size={16} />
            <span>Cashier Staff</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                placeholder="staff@shop.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-98 mt-2"
          >
            Sign In as {selectedRole === "admin" ? "Admin Owner" : "Cashier"}
          </button>
        </form>

        {/* Quick Credentials Info Box */}
        <div className="mt-6 p-3.5 bg-indigo-950/40 border border-indigo-900/50 rounded-xl text-xs text-indigo-300">
          <p className="font-semibold mb-1 text-indigo-200">Demo Login Shortcuts:</p>
          <p className="text-slate-400">Admin: <span className="text-slate-200">admin@shop.com</span> / <span className="text-slate-200">admin123</span></p>
          <p className="text-slate-400">Cashier: <span className="text-slate-200">cashier@shop.com</span> / <span className="text-slate-200">cashier123</span></p>
        </div>
      </div>
    </div>
  );
};

export default Login;
