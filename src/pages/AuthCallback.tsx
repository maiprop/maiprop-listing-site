import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  type OAuthCallbackParams,
  parseOAuthCallbackParams,
  shouldRouteLoginOAuthErrorToSignup,
} from "@/lib/oauthCallback";

interface OAuthErrorRedirect {
  path: "/signup" | "/login";
  reason?: "account_required";
  toastMessage?: string;
}

const hasCallbackError = (params: OAuthCallbackParams): boolean =>
  Boolean(params.error || params.errorCode || params.errorDescription);

const getOAuthErrorRedirect = (params: OAuthCallbackParams): OAuthErrorRedirect | null => {
  if (!hasCallbackError(params)) {
    return null;
  }

  if (params.intent === "login" && shouldRouteLoginOAuthErrorToSignup(params)) {
    return { path: "/signup", reason: "account_required" };
  }

  return {
    path: params.intent === "signup" ? "/signup" : "/login",
    toastMessage: params.errorDescription || "Google sign-in failed. Please try again.",
  };
};

const getCompletedOAuthRedirect = (
  params: OAuthCallbackParams,
  userId: string | undefined,
  needsOnboarding: boolean,
): string => {
  if (!userId) {
    return "/login";
  }

  if (params.intent === "signup" || needsOnboarding) {
    return "/onboarding";
  }

  return params.next;
};

const AuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, profileLoading, needsOnboarding } = useAuth();
  const params = useMemo(
    () => parseOAuthCallbackParams(location.search, location.hash),
    [location.hash, location.search],
  );
  const errorRedirect = useMemo(() => getOAuthErrorRedirect(params), [params]);

  useEffect(() => {
    if (!errorRedirect) {
      return;
    }

    if (errorRedirect.toastMessage) {
      toast.error(errorRedirect.toastMessage);
    }

    navigate(errorRedirect.path, {
      replace: true,
      state: errorRedirect.reason ? { oauthRedirectReason: errorRedirect.reason } : undefined,
    });
  }, [errorRedirect, navigate]);

  useEffect(() => {
    if (errorRedirect || loading || profileLoading) {
      return;
    }

    navigate(getCompletedOAuthRedirect(params, user?.id, needsOnboarding), { replace: true });
  }, [errorRedirect, loading, navigate, needsOnboarding, params, profileLoading, user?.id]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm">Finishing sign-in...</span>
      </div>
    </div>
  );
};

export default AuthCallback;
