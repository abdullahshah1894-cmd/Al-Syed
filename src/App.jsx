import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { AppProvider } from "./context/AppContext";

import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Inventory from "./pages/Inventory";
import ImeiChecker from "./pages/ImeiChecker";
import Bills from "./pages/Bills";
import PendingPayments from "./pages/PendingPayments";
import Warranties from "./pages/Warranties";
import SalesReports from "./pages/SalesReports";
import InventoryValuation from "./pages/InventoryValuation";
import ZakatCalculator from "./pages/ZakatCalculator";
import Settings from "./pages/Settings";
import Ledger from "./pages/Ledger";
import MobileIssues from "./pages/MobileIssues";
import Expenses from "./pages/Expenses";
import Sellers from "./pages/Sellers";
import Suppliers from "./pages/Suppliers";

// Main App Layout Wrapper
const MainLayout = ({ children }) => {
  // A crash inside one page shows an error card there; the menu keeps working and moving to another page clears it
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden print:h-auto print:bg-white print:overflow-visible print:block">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto print:overflow-visible print:bg-white print:block">
        <Header />
        <main className="flex-1 overflow-y-auto print:overflow-visible print:bg-white print:block">
          <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <Router>
          <Routes>
            {/* Public Login Route */}
            <Route path="/login" element={<Login />} />

            {/* Protected Routes for Cashier & Admin */}
            <Route element={<ProtectedRoute allowedRoles={["admin", "cashier"]} />}>
              <Route
                path="/dashboard"
                element={
                  <MainLayout>
                    <Dashboard />
                  </MainLayout>
                }
              />
              <Route
                path="/pos"
                element={
                  <MainLayout>
                    <POS />
                  </MainLayout>
                }
              />
              <Route
                path="/inventory"
                element={
                  <MainLayout>
                    <Inventory />
                  </MainLayout>
                }
              />
              <Route
                path="/products"
                element={<Navigate to="/inventory" replace />}
              />
              <Route
                path="/imei-checker"
                element={
                  <MainLayout>
                    <ImeiChecker />
                  </MainLayout>
                }
              />
              {/* Customer accounts live in Pending Payments now */}
              <Route
                path="/customers"
                element={<Navigate to="/pending-payments" replace />}
              />
              <Route
                path="/bills"
                element={
                  <MainLayout>
                    <Bills />
                  </MainLayout>
                }
              />
              <Route
                path="/pending-payments"
                element={
                  <MainLayout>
                    <PendingPayments />
                  </MainLayout>
                }
              />
              <Route
                path="/warranties"
                element={
                  <MainLayout>
                    <Warranties />
                  </MainLayout>
                }
              />
              <Route
                path="/mobile-issues"
                element={
                  <MainLayout>
                    <MobileIssues />
                  </MainLayout>
                }
              />
              <Route
                path="/ledger"
                element={
                  <MainLayout>
                    <Ledger />
                  </MainLayout>
                }
              />
              <Route
                path="/expenses"
                element={
                  <MainLayout>
                    <Expenses />
                  </MainLayout>
                }
              />
              <Route
                path="/sellers"
                element={
                  <MainLayout>
                    <Sellers />
                  </MainLayout>
                }
              />
            </Route>

            {/* Admin-Only Protected Routes */}
            <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
              <Route
                path="/suppliers"
                element={
                  <MainLayout>
                    <Suppliers />
                  </MainLayout>
                }
              />
              <Route
                path="/reports"
                element={
                  <MainLayout>
                    <SalesReports />
                  </MainLayout>
                }
              />
              <Route
                path="/valuation"
                element={
                  <MainLayout>
                    <InventoryValuation />
                  </MainLayout>
                }
              />
              <Route
                path="/zakat"
                element={
                  <MainLayout>
                    <ZakatCalculator />
                  </MainLayout>
                }
              />
              <Route
                path="/settings"
                element={
                  <MainLayout>
                    <Settings />
                  </MainLayout>
                }
              />
            </Route>

            {/* Fallback Redirect */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Router>
      </AppProvider>
    </AuthProvider>
  );
}

export default App;
