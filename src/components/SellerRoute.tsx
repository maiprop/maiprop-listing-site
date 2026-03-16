import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isSellSideRole, isPlatformAdmin } from "@/lib/authUtils";
import { ProtectedRoute } from "./ProtectedRoute";

/** Protects listing-creation routes. Sell-side roles (agent, seller_landlord, developer, institutional) or platform admin can access. */
export function SellerRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <SellerGate>{children}</SellerGate>
    </ProtectedRoute>
  );
}

function SellerGate({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!isSellSideRole(profile) && !isPlatformAdmin(profile)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
