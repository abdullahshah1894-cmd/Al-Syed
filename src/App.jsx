import { useState, useCallback } from "react";
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
  // Phone / tablet: the menu is a drawer
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  return (
    <div className="min-h-screen lg:flex bg-paper text-ink print:block print:bg-white">
      <Sidebar open={menuOpen} onClose={closeMenu} />
      <div className="flex-1 min-w-0 flex flex-col print:block">
        <Header onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 min-w-0 print:block">
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
            <Route element={<ProtectedRoute allowedRoles={["admin"]} layout={MainLayout} />}>
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
