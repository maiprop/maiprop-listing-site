import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Flame, BarChart2, Shield, CheckCircle2, Loader2, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

type PricingItem = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  amount: number;
  unit: string;
  metadata?: { [k: string]: any };
};

const FALLBACK_PLANS: PricingItem[] = [
  {
    id: "local_basic",
    key: "firesale_investor_basic",
    label: "Investor – Quick Sale Access",
    description: "Access to the Quick Sale™ deal feed with basic filters and email alerts.",
    amount: 0,
    unit: "monthly",
  },
  {
    id: "local_pro",
    key: "firesale_investor_pro",
    label: "Investor – Firesale Pro",
    description: "Full Firesale dashboard, live pipeline, AI scoring and priority allocations.",
    amount: 79,
    unit: "monthly",
  },
];

function useInvestorFiresalePricing() {
  return useQuery({
    queryKey: ["pricing", "firesale_investors"],
    queryFn: async (): Promise<PricingItem[]> => {
      const { data, error } = await supabase
        .from("pricing_configs")
        .select("*")
        .eq("audience", "investor")
        .eq("module", "firesale_dashboard")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) {
        // fall back to local defaults
        return FALLBACK_PLANS;
      }
      if (!data || data.length === 0) return FALLBACK_PLANS;
      return data.map((row: any) => ({
        id: row.id,
        key: row.key,
        label: row.label,
        description: row.description,
        amount: Number(row.amount ?? 0),
        unit: row.unit ?? "monthly",
        metadata: row.metadata ?? undefined,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function FiresalePricing() {
  const { data: plans = FALLBACK_PLANS, isLoading } = useInvestorFiresalePricing();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Hero */}
        <div className="bg-card border-b border-border py-16">
          <div className="container max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold uppercase tracking-widest mb-5">
              <Flame className="w-3.5 h-3.5" /> Quick Sale™ Investor Plans
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-black mb-4 leading-tight">
              Pricing for the Firesale
              <br />
              <span className="gradient-text-primary">Investor Deal Flow Dashboard</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Choose the access level that matches your deployment strategy – from testing a few deals to
              running a dedicated capital deployment pipeline.
            </p>
          </div>
        </div>

        {/* Pricing grid */}
        <div className="container max-w-5xl py-16">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading investor pricing…</span>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6 items-stretch">
              {plans.map((plan, idx) => {
                const isPro = idx === plans.length - 1;
                const amountLabel = plan.amount === 0 ? "Free" : `€${plan.amount.toFixed(0)}`;
                const unitLabel =
                  plan.unit === "monthly"
                    ? "/ month"
                    : plan.unit === "yearly"
                    ? "/ year"
                    : plan.unit === "per_deal"
                    ? "/ deal"
                    : plan.unit === "per_ai_call"
                    ? "/ 1K AI calls"
                    : ` / ${plan.unit}`;
                return (
                  <div
                    key={plan.id}
                    className={`relative glass-card rounded-2xl border overflow-hidden flex flex-col ${
                      isPro ? "border-primary/60 shadow-elevated" : "border-border"
                    }`}
                  >
                    {isPro && (
                      <div className="absolute top-4 right-4">
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary text-primary-foreground uppercase tracking-wider">
                          <Zap className="w-3 h-3" /> Recommended
                        </span>
                      </div>
                    )}
                    <div className={`px-7 py-6 border-b border-border ${isPro ? "bg-primary/5" : "bg-card"}`}>
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        {plan.label}
                      </p>
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-4xl font-black text-foreground">{amountLabel}</span>
                        {plan.amount > 0 && <span className="text-muted-foreground text-sm">{unitLabel}</span>}
                      </div>
                      {plan.description && (
                        <p className="text-xs text-muted-foreground mt-2">{plan.description}</p>
                      )}
                    </div>
                    <div className="p-7 flex-1 space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-primary" />
                        <span>
                          Access to the{" "}
                          <span className="text-foreground font-medium">Quick Sale™ investor dashboard</span>
                          {isPro && " with full pipeline analytics and AI scoring."}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-brand-emerald" />
                        <span>Confidential, NDA-based deal flow – no public listing exposure.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-gold" />
                        <span>
                          Curated off-market opportunities synced directly from{" "}
                          <span className="text-foreground font-medium">mAI Prop OS.</span>
                        </span>
                      </div>
                    </div>
                    <div className="px-7 pb-7">
                      <Button
                        className={`w-full h-11 ${
                          isPro
                            ? "bg-gradient-primary border-0 text-primary-foreground font-semibold"
                            : "border-border"
                        }`}
                        variant={isPro ? "default" : "outline"}
                        onClick={() => navigate("/investor-dashboard")}
                      >
                        {isPro ? "Get Firesale Pro access" : "Start with basic access"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footnotes */}
          <div className="mt-10 text-xs text-muted-foreground max-w-3xl mx-auto space-y-1">
            <p>All prices are indicative; final billing is handled via your investor agreement with mAI Prop.</p>
            <p>Usage-based modules (AI calls, exports) can be configured separately in the Admin Pricing console.</p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

