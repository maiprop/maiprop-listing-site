import { Link } from "react-router-dom";
import { profileRoleSwitchInProgress, useAuth } from "@/contexts/AuthContext";
import { isSellSideRole, isPlatformAdmin } from "@/lib/authUtils";
import { getExplicitParticipantTypeFromProfile } from "@/lib/participantConfig";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { RoleRoute, type RoleRouteGuardResult } from "./RoleRoute";

/** Protects listing-creation routes. Sell-side roles (agent, seller, developer, institutional) or platform admin can access. */
export function SellerRoute({ children }: { children: React.ReactNode }) {
  return <RoleRoute useGuard={useSellerRouteGuard}>{children}</RoleRoute>;
}

function useSellerRouteGuard(): RoleRouteGuardResult {
  const { profile, loading } = useAuth();
  const { isPro, loading: subLoading } = useSubscription();
  const switching = profileRoleSwitchInProgress(profile);
  const participantType = switching
    ? null
    : getExplicitParticipantTypeFromProfile(profile);

  if (loading || subLoading || !profile) {
    return { loading: true };
  }

  if (switching || (!isSellSideRole(profile) && !isPlatformAdmin(profile))) {
    return { denied: <ListingAccessRequired /> };
  }

  const isAdmin = isPlatformAdmin(profile);
  const hasDeveloperIdentity =
    profile.role === "developer" || participantType === "developer";
  const hasAlignedDeveloperIdentity =
    profile.role === "developer" && participantType === "developer";

  // Developer listing access must be both identity-aligned and paid. This
  // fails closed while a stale role or participant_type is being repaired.
  if (hasDeveloperIdentity && (!hasAlignedDeveloperIdentity || !isPro) && !isAdmin) {
    return { denied: <DeveloperProRequired /> };
  }

  return { allowed: true };
}

function ListingAccessRequired() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <span className="text-2xl">🏠</span>
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold mb-2">
            Listing Access Required
          </h1>
          <p className="text-muted-foreground text-sm">
            Creating listings requires an Agent, Seller, Developer, or
            Institutional account. To list a property, switch your account
            type in Settings or start a new onboarding.
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

function DeveloperProRequired() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto">
          <span className="text-2xl">🏗️</span>
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold mb-2">
            Developer Pro Required
          </h1>
          <p className="text-muted-foreground text-sm">
            Creating listings as a Developer requires an active Developer Pro
            subscription. Upgrade to unlock unlimited project listings and
            New Building showcase pages.
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
