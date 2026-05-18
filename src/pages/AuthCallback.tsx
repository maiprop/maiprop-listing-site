import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  parseOAuthCallbackParams,
  shouldRouteLoginOAuthErrorToSignup,
} from "@/lib/oauthCallback";

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, profileLoading, needsOnboarding } = useAuth();
  const params = useMemo(
    () => parseOAuthCallbackParams(location.search, location.hash),
    [location.hash, location.search],
  );
  const hasOAuthError = Boolean(params.error || params.errorCode || params.errorDescription);

  useEffect(() => {
    if (!hasOAuthError) return;

    if (params.intent === "login" && shouldRouteLoginOAuthErrorToSignup(params)) {
      navigate("/signup", {
        replace: true,
        state: { oauthRedirectReason: "account_required" },
      });
      return;
    }

    toast.error(params.errorDescription || "Google sign-in failed. Please try again.");
    navigate(params.intent === "signup" ? "/signup" : "/login", { replace: true });
  }, [hasOAuthError, navigate, params]);

  useEffect(() => {
    if (hasOAuthError || loading || profileLoading) return;

    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    if (params.intent === "signup" || needsOnboarding) {
      navigate("/onboarding", { replace: true });
      return;
    }

    navigate(params.next, { replace: true });
  }, [hasOAuthError, loading, navigate, needsOnboarding, params.intent, params.next, profileLoading, user]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm">Finishing sign-in...</span>
      </div>
    </div>
  );
}
