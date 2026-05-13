import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/authUtils";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";

type GateMessageProps = {
  tone: "muted" | "orange";
  title: string;
  message: string;
  primary: { to: string; label: string };
  secondary: { to: string; label: string };
};

/** Protects Developer-only project and portfolio modules. */
export const DeveloperRoute = ({ children }: { children: React.ReactNode }) => {
  return (
    <ProtectedRoute>
      <DeveloperGate>{children}</DeveloperGate>
    </ProtectedRoute>
  );
};

const DeveloperGate = ({ children }: { children: React.ReactNode }) => {
  const { profile, loading } = useAuth();
  const { hasDeveloperPro, loading: subLoading } = useSubscription();

  if (loading || subLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <GateMessage
        tone="muted"
        title="Profile Required"
        message="We could not load your account profile. Refresh your session or return to the dashboard before opening developer modules."
        primary={{ to: "/dashboard", label: "Back to Dashboard" }}
        secondary={{ to: "/login", label: "Sign In Again" }}
      />
    );
  }

  if (isPlatformAdmin(profile)) return <>{children}</>;

  if (profile.role !== "developer") {
    return (
      <GateMessage
        tone="orange"
        title="Developer Access Required"
        message="Projects and portfolios are available to Developer accounts. Switch your account type in Settings to use these modules."
        primary={{ to: "/dashboard/settings", label: "Switch Account Type" }}
        secondary={{ to: "/dashboard", label: "Back to Dashboard" }}
      />
    );
  }

  if (!hasDeveloperPro) {
    return (
      <GateMessage
        tone="orange"
        title="Developer Pro Required"
        message="Projects and portfolios require an active Developer Pro subscription."
        primary={{ to: "/pricing?audience=developer", label: "View Developer Plan" }}
        secondary={{ to: "/dashboard", label: "Back to Dashboard" }}
      />
    );
  }

  return <>{children}</>;
};

const GateMessage = ({ tone, title, message, primary, secondary }: GateMessageProps) => {
  const iconClass = tone === "orange" ? "bg-orange-500/10 text-orange-500" : "bg-muted text-muted-foreground";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <section className="max-w-md w-full text-center space-y-5" aria-labelledby="developer-route-title">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${iconClass}`}>
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
};
