import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEligibleForQuickSale } from "@/hooks/useEligibleForQuickSale";
import { Flame, Lock, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleRoute, type RoleRouteGuardResult } from "./RoleRoute";

/** Protects Quick Sale deal flow. Access: admin or approved investors only. */
export function InvestorRoute({ children }: { children: React.ReactNode }) {
  return <RoleRoute useGuard={useInvestorRouteGuard}>{children}</RoleRoute>;
}

function useInvestorRouteGuard(): RoleRouteGuardResult {
  const { profile, loading: authLoading } = useAuth();
  const { eligible, loading: eligibilityLoading } = useEligibleForQuickSale();
  const [timedOut, setTimedOut] = useState(false);

  const stillLoading = authLoading || !profile || eligibilityLoading;

  useEffect(() => {
    if (stillLoading) {
      const timer = setTimeout(() => setTimedOut(true), 6000);
      return () => clearTimeout(timer);
    }
    setTimedOut(false);
  }, [stillLoading]);

  if (stillLoading && !timedOut) {
    return { loading: true, loadingLabel: "Checking investor access…" };
  }

  // If data is still loading after timeout, show retry UI instead of access-denied.
  if (stillLoading && timedOut) {
    return { denied: <InvestorAccessRetry /> };
  }

  if (!eligible) {
    return { denied: <InvestorAccessRequired /> };
  }

  return { allowed: true };
}

function InvestorAccessRetry() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <p className="text-muted-foreground text-sm">
          Taking longer than expected to verify access.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard">
              Go to Dashboard <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function InvestorAccessRequired() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8 text-orange-400" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold mb-2">Investor Access Required</h1>
          <p className="text-muted-foreground text-sm">
            Quick Sale deal flow is exclusive to approved maiProp investors. Your account needs to be verified and subscribed to an Investor plan before you can access pre-market deals.
          </p>
        </div>
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-left space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-3">How to get access</p>
          {[
            "Subscribe to a Private or Institutional Investor plan",
            "Complete identity verification (KYC)",
            "Upload proof of funds",
            "Await admin approval (typically 24–48h)",
          ].map((step) => (
            <div key={step} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
              <span className="text-muted-foreground">{step}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3 justify-center">
          <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
            <Link to="/pricing?audience=investor">
              <Flame className="w-4 h-4" /> View Investor Plans
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard">
              Go to Dashboard <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
