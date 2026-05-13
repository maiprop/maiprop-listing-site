import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, profileLoading, needsOnboarding } = useAuth();
  const location = useLocation();

  // Wait for auth AND the initial profile fetch before making routing decisions.
  // Without this, needsOnboarding is briefly false (profile=null) then flips true,
  // causing a mid-page redirect to /onboarding for users who haven't completed it.
  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Redirect to onboarding for new users — but don't loop if already on /onboarding
  const isAccountSettingsRoute = location.pathname === "/dashboard/settings";

  // Keep account settings reachable for account-level actions such as GDPR deletion.
  if (needsOnboarding && location.pathname !== "/onboarding" && !isAccountSettingsRoute) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
