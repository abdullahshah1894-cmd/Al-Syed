import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ShieldAlert } from "lucide-react";

// layout: wraps the "Owner only" message so the menu stays on screen
const ProtectedRoute = ({ allowedRoles, layout: Layout }) => {
  const { user, token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!token || !user) {
    // Remember the page so the login screen can come back to it
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const message = (
      <div className="min-h-[70vh] flex flex-col justify-center items-center p-6 text-center">
        <div className="w-14 h-14 bg-saffron-50 text-saffron-600 rounded-2xl flex items-center justify-center mb-4">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-2xl font-bold mb-2">Owner only</h1>
        <p className="text-sm text-muted max-w-md mb-6">
          You are logged in as a {user.role === "admin" ? "owner" : "cashier"}. Only the owner (admin) can open this page.
        </p>
        <button
          onClick={() => navigate("/dashboard", { replace: true })}
          className="h-10 px-5 bg-brand-600 hover:bg-brand-700 font-semibold rounded-xl text-white text-sm"
        >
          Go to dashboard
        </button>
      </div>
    );
    return Layout ? <Layout>{message}</Layout> : message;
  }

  return <Outlet />;
};

export default ProtectedRoute;
