import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/authUtils";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "./ProtectedRoute";

/** Protects Developer-only project and portfolio modules. */
export function DeveloperRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <DeveloperGate>{children}</DeveloperGate>
    </ProtectedRoute>
  );
}

function DeveloperGate({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { isPro, loading: subLoading } = useSubscription();

  if (loading || subLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (isPlatformAdmin(profile)) return <>{children}</>;

  if (profile.role !== "developer") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto">
            <Building2 className="h-7 w-7 text-orange-500" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold mb-2">Developer Access Required</h1>
            <p className="text-muted-foreground text-sm">
              Projects and portfolios are available to Developer accounts. Switch your account type in Settings to use these modules.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button asChild>
              <Link to="/dashboard/settings">Switch Account Type</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto">
            <Building2 className="h-7 w-7 text-orange-500" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold mb-2">Developer Pro Required</h1>
            <p className="text-muted-foreground text-sm">
              Projects and portfolios require an active Developer Pro subscription.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button asChild>
              <Link to="/pricing?audience=developer">View Developer Plan</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
