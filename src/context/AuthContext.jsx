import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Pre-seed with default admin user for instant demo
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("pos_user");
    if (savedUser) {
      try { return JSON.parse(savedUser); } catch (e) {}
    }
    return {
      id: "u1",
      name: "Syed Admin (Owner)",
      email: "admin@shop.com",
      role: "admin", // 'admin' or 'cashier'
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin",
    };
  });

  const [token, setToken] = useState(() => localStorage.getItem("pos_token") || "mock-jwt-token-xyz");

  const login = (email, password, role = "admin") => {
    const userData = {
      id: role === "admin" ? "u1" : "u2",
      name: role === "admin" ? "Syed Owner (Admin)" : "Ali Cashier",
      email: email,
      role: role,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${role}`,
    };
    const fakeToken = `jwt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    setUser(userData);
    setToken(fakeToken);
    localStorage.setItem("pos_user", JSON.stringify(userData));
    localStorage.setItem("pos_token", fakeToken);
    return userData;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("pos_user");
    localStorage.removeItem("pos_token");
  };

  const switchRole = (newRole) => {
    if (!user) return;
    const updated = { ...user, role: newRole, name: newRole === 'admin' ? 'Syed Owner (Admin)' : 'Ali Cashier' };
    setUser(updated);
    localStorage.setItem("pos_user", JSON.stringify(updated));
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, switchRole, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
