import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEligibleForQuickSale } from "@/hooks/useEligibleForQuickSale";
import { ProtectedRoute } from "./ProtectedRoute";

/** Protects Quick Sale deal flow. Access: admin or eligible buyers (approved via invitation_requests → investor_subscriptions). */
export function InvestorRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <InvestorGate>{children}</InvestorGate>
    </ProtectedRoute>
  );
}

function InvestorGate({ children }: { children: React.ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const { eligible, loading: eligibilityLoading } = useEligibleForQuickSale();

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (eligibilityLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!eligible) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
