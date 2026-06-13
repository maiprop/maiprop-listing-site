import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import { profileRoleSwitchInProgress, useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/authUtils";
import { getExplicitParticipantTypeFromProfile } from "@/lib/participantConfig";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { RoleRoute, type RoleRouteGuardResult } from "@/components/RoleRoute";

function GateMessage({
  title,
  message,
  primary,
  secondary,
}: {
  title: string;
  message: string;
  primary: { to: string; label: string };
  secondary: { to: string; label: string };
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <section className="max-w-md w-full text-center space-y-5" aria-labelledby="new-building-route-title">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-orange-500/10 text-orange-500">
          <Building2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 id="new-building-route-title" className="font-display text-2xl font-bold">
          {title}
        </h1>
        <p className="text-muted-foreground text-sm">{message}</p>
        <div className="flex gap-3 justify-center">
          <Button asChild>
            <Link to={primary.to}>{primary.label}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={secondary.to}>{secondary.label}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function useNewBuildingRouteGuard(): RoleRouteGuardResult {
  const { profile, loading } = useAuth();
  const { hasDeveloperPro, loading: subLoading } = useSubscription();
  const switching = profileRoleSwitchInProgress(profile);
  const participantType = switching ? null : getExplicitParticipantTypeFromProfile(profile);

  if (loading || subLoading) return { loading: true };

  if (!profile) {
    return {
      denied: (
      <GateMessage
        title="Profile Required"
        message="We could not load your account profile. Refresh your session or return to the dashboard before creating a New Building."
        primary={{ to: "/dashboard", label: "Back to Dashboard" }}
        secondary={{ to: "/login", label: "Sign In Again" }}
      />
      ),
    };
  }

  if (isPlatformAdmin(profile)) return { allowed: true };

  if (profile.role !== "developer" || participantType !== "developer") {
    return {
      denied: (
      <GateMessage
        title="Developer Access Required"
        message={switching
          ? "Your account type change is still in progress. Finish onboarding before creating a New Building."
          : "New Buildings use the dedicated developer workflow. Switch your account type to Developer to create them."}
        primary={{ to: "/dashboard/settings", label: "Switch Account Type" }}
        secondary={{ to: "/dashboard", label: "Back to Dashboard" }}
      />
      ),
    };
  }

  if (!hasDeveloperPro) {
    return {
      denied: (
      <GateMessage
        title="Developer Pro Required"
        message="New Buildings require an active Developer Pro subscription."
        primary={{ to: "/pricing?audience=developer", label: "View Developer Plan" }}
        secondary={{ to: "/dashboard", label: "Back to Dashboard" }}
      />
      ),
    };
  }

  return { allowed: true };
}

export const NewBuildingRoute = ({ children }: { children: React.ReactNode }) => (
  <RoleRoute useGuard={useNewBuildingRouteGuard}>{children}</RoleRoute>
);
