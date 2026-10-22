import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ShieldAlert } from "lucide-react";

const ProtectedRoute = ({ allowedRoles }) => {
  const { user, token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!token || !user) {
    // Remember the page so the login screen can come back to it
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
          <ShieldAlert size={36} />
        </div>
        <h1 className="text-2xl font-bold text-slate-100 mb-2">Access Restricted</h1>
        <p className="text-slate-400 max-w-md mb-6">
          Your assigned role (<span className="capitalize font-semibold text-amber-400">{user.role}</span>) does not have
          permission to view this section. Only the owner (admin) can open it.
        </p>
        <button
          onClick={() => navigate("/dashboard", { replace: true })}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 font-medium rounded-lg text-white transition-all shadow-lg shadow-indigo-600/30"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return <Outlet />;
};

export default ProtectedRoute;
