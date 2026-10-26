import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { AppProvider } from "./context/AppContext";

import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import DataProblemBanner from "./components/DataProblemBanner";

import Login from "./pages/Login";

// Each page is its own file, so the app opens without loading every screen first.
// Once the app is idle, all pages are fetched in the background so moving between them stays instant.
const pageLoaders = [];
const page = (load) => {
  pageLoaders.push(load);
  return lazy(load);
};
const preloadPages = () => pageLoaders.forEach((load) => load().catch(() => {}));

const Dashboard = page(() => import("./pages/Dashboard"));
const POS = page(() => import("./pages/POS"));
const Inventory = page(() => import("./pages/Inventory"));
const ImeiChecker = page(() => import("./pages/ImeiChecker"));
const Bills = page(() => import("./pages/Bills"));
const PendingPayments = page(() => import("./pages/PendingPayments"));
const Warranties = page(() => import("./pages/Warranties"));
const SalesReports = page(() => import("./pages/SalesReports"));
const InventoryValuation = page(() => import("./pages/InventoryValuation"));
const ZakatCalculator = page(() => import("./pages/ZakatCalculator"));
const Settings = page(() => import("./pages/Settings"));
const Ledger = page(() => import("./pages/Ledger"));
const MobileIssues = page(() => import("./pages/MobileIssues"));
const Expenses = page(() => import("./pages/Expenses"));
const Sellers = page(() => import("./pages/Sellers"));
const Suppliers = page(() => import("./pages/Suppliers"));

const PageLoading = () => <div className="p-8 text-sm text-muted">Loading…</div>;

// Main App Layout Wrapper
const MainLayout = ({ children }) => {
  // A crash inside one page shows an error card there; the menu keeps working and moving to another page clears it
  const { pathname } = useLocation();
  // Phone / tablet: the menu is a drawer
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEffect(() => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    idle(preloadPages);
  }, []);
  return (
    <div className="min-h-screen lg:flex bg-paper text-ink print:block print:bg-white">
      <Sidebar open={menuOpen} onClose={closeMenu} />
      <div className="flex-1 min-w-0 flex flex-col print:block">
        <Header onMenu={() => setMenuOpen(true)} />
        <DataProblemBanner />
        <main className="flex-1 min-w-0 print:block">
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<PageLoading />}>{children}</Suspense>
          </ErrorBoundary>
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
