import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import { profileRoleSwitchInProgress, useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/authUtils";
import { getExplicitParticipantTypeFromProfile } from "@/lib/participantConfig";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";

function LoadingGate() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
    </div>
  );
}

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
      <section className="max-w-md w-full text-center space-y-5" aria-labelledby="developer-route-title">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-orange-500/10 text-orange-500">
          <Building2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 id="developer-route-title" className="font-display text-2xl font-bold">
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

function DeveloperGate({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { hasDeveloperPro, loading: subLoading } = useSubscription();
  const switching = profileRoleSwitchInProgress(profile);
  const participantType = switching ? null : getExplicitParticipantTypeFromProfile(profile);

  if (loading || subLoading) return <LoadingGate />;

  if (!profile) {
    return (
      <GateMessage
        title="Profile Required"
        message="We could not load your account profile. Refresh your session or return to the dashboard before opening developer modules."
        primary={{ to: "/dashboard", label: "Back to Dashboard" }}
        secondary={{ to: "/login", label: "Sign In Again" }}
      />
    );
  }

  if (isPlatformAdmin(profile)) return children as React.ReactElement;

  if (profile.role !== "developer" || participantType !== "developer") {
    return (
      <GateMessage
        title="Developer Access Required"
        message={switching
          ? "Your account type change is still in progress. Finish onboarding before opening developer modules."
          : "Projects and portfolios are available to Developer accounts. Switch your account type in Settings to use these modules."}
        primary={{ to: "/dashboard/settings", label: "Switch Account Type" }}
        secondary={{ to: "/dashboard", label: "Back to Dashboard" }}
      />
    );
  }

  if (!hasDeveloperPro) {
    return (
      <GateMessage
        title="Developer Pro Required"
        message="Projects and portfolios require an active Developer Pro subscription."
        primary={{ to: "/pricing?audience=developer", label: "View Developer Plan" }}
        secondary={{ to: "/dashboard", label: "Back to Dashboard" }}
      />
    );
  }

  return children as React.ReactElement;
}

export const DeveloperRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <DeveloperGate>{children}</DeveloperGate>
  </ProtectedRoute>
);
