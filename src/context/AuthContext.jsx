import React, { createContext, useContext, useState } from "react";
import { api, TOKEN_KEY, USER_KEY, setSessionToken } from "../services/api";

const AuthContext = createContext();

const readStored = () => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const user = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    return token && user ? { token, user } : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
};

export const AuthProvider = ({ children }) => {
  // Nobody is logged in until the backend accepts a username and password
  const [session, setSession] = useState(() => {
    const stored = readStored();
    setSessionToken(stored.token);
    return stored;
  });

  // Checks the username / password against the users table; throws with the server's message on failure
  const login = async (username, password) => {
    const { user, token } = await api.login({ username, password });
    const userData = {
      ...user,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.username)}`,
    };
    setSessionToken(token);
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
    } catch {
      // storage blocked: the session lasts until the tab is closed
    }
    setSession({ token, user: userData });
    return userData;
  };

  const logout = () => {
    setSessionToken(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // nothing stored
    }
    setSession({ token: null, user: null });
  };

  return (
    <AuthContext.Provider
      value={{ user: session.user, token: session.token, login, logout, isAdmin: session.user?.role === "admin" }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
