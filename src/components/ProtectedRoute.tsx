import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, needsOnboarding, profile, signOut } = useAuth();
  const location = useLocation();

  // Block only while the auth session itself is unresolved. Profile hydration is
  // allowed to complete in the background so a valid sign-in does not leave the
  // user on a full-screen loading shell after redirect.
  if (loading) {
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

  const accountStatus = profile?.account_status;
  if (accountStatus && accountStatus !== "active" && !isAccountSettingsRoute) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center space-y-4">
          <div>
            <h1 className="font-display text-xl font-bold">Account {accountStatus}</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {profile?.account_moderation_reason ||
                "This account is currently restricted by the moderation team."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void signOut(); }}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Keep account settings reachable for account-level actions such as GDPR deletion.
  if (needsOnboarding && location.pathname !== "/onboarding" && !isAccountSettingsRoute) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
