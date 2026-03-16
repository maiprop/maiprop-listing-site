import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isBuySideRole, isPlatformAdmin } from "@/lib/authUtils";
import { ProtectedRoute } from "./ProtectedRoute";

/** Protects investor dashboard. Buy-side roles (investor, institutional) or platform admin can access. */
export function InvestorRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <InvestorGate>{children}</InvestorGate>
    </ProtectedRoute>
  );
}

function InvestorGate({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!isBuySideRole(profile) && !isPlatformAdmin(profile)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
