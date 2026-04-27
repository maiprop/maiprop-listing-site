import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEligibleForQuickSale } from "@/hooks/useEligibleForQuickSale";
import { ProtectedRoute } from "./ProtectedRoute";
import { Flame, Lock, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Protects Quick Sale deal flow. Access: admin or approved investors only. */
export function InvestorRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <InvestorGate>{children}</InvestorGate>
    </ProtectedRoute>
  );
}

function InvestorGate({ children }: { children: React.ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const { eligible, loading: eligibilityLoading } = useEligibleForQuickSale();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (authLoading || eligibilityLoading) {
      const timer = setTimeout(() => setTimedOut(true), 4000);
      return () => clearTimeout(timer);
    }
    setTimedOut(false);
  }, [authLoading, eligibilityLoading]);

  if ((authLoading || !profile || eligibilityLoading) && !timedOut) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <span className="sr-only">Checking investor access…</span>
      </div>
    );
  }

  if (!eligible) {
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

  return <>{children}</>;
}
