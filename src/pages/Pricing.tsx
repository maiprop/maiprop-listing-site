import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  Euro,
  Users,
  Briefcase,
  UserCheck,
  FileBarChart2,
  Flame,
  Sparkles,
  ChevronRight,
  Zap,
} from "lucide-react";

type PricingRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  amount: number;
  unit: string;
  currency: string;
  module: string;
  audience: string;
  sort_order: number;
  metadata?: Record<string, unknown>;
};

const AUDIENCE_TABS: { id: string; label: string; icon: typeof Users; audience: string }[] = [
  { id: "user", label: "Consumers", icon: Users, audience: "user" },
  { id: "professional", label: "Professionals", icon: Briefcase, audience: "professional" },
  { id: "agent", label: "Agents", icon: UserCheck, audience: "agent" },
  { id: "investor", label: "Investors", icon: Flame, audience: "investor" },
];

/** Plan modules (subscriptions / main plans) per audience */
const PLAN_MODULES: Record<string, string[]> = {
  user: ["user_subscription"],
  professional: ["professional_subscription"],
  agent: ["agent_subscription"],
  investor: ["firesale_dashboard"],
};

/** Extra consumption / add-on modules per audience */
const CONSUMPTION_MODULES: Record<string, string[]> = {
  user: ["valuation_reports", "adhoc_charges"],
  professional: ["adhoc_charges"],
  agent: [],
  investor: [],
};

function useAllPricing() {
  return useQuery({
    queryKey: ["pricing", "all"],
    queryFn: async (): Promise<PricingRow[]> => {
      const { data, error } = await (supabase as any)
        .from("pricing_configs")
        .select("id, key, label, description, amount, unit, currency, module, audience, sort_order, metadata")
        .eq("is_active", true)
        .order("module", { ascending: true })
        .order("audience", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        key: row.key,
        label: row.label,
        description: row.description ?? null,
        amount: Number(row.amount ?? 0),
        unit: row.unit ?? "monthly",
        currency: row.currency ?? "EUR",
        module: row.module,
        audience: row.audience,
        sort_order: row.sort_order ?? 0,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      }));
    },
    staleTime: 2 * 60 * 1000,
  });
}

function formatPrice(amount: number, unit: string, currency: string): string {
  if (amount === 0 && (unit === "custom" || unit === "Custom")) return "Custom";
  const sym = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency + " ";
  const value = amount === 0 ? "Free" : `${sym}${amount.toFixed(0)}`;
  const unitLabel =
    unit === "monthly"
      ? "/ month"
      : unit === "yearly"
        ? "/ year"
        : unit === "per_report"
          ? "/ report"
          : unit === "per_listing"
            ? "/ listing"
            : unit === "bundle"
              ? " (bundle)"
              : unit === "custom"
                ? ""
                : ` / ${unit}`;
  return value + unitLabel;
}

function formatMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const parts: string[] = [];
  if (metadata.limit != null) parts.push(`Included: ${metadata.limit}`);
  if (metadata.limits != null && typeof metadata.limits === "string") parts.push(metadata.limits);
  if (metadata.overage != null) parts.push(`Overage: ${metadata.overage}`);
  if (metadata.included_listings != null) parts.push(`Listings: ${metadata.included_listings}`);
  return parts.length ? parts.join(" · ") : null;
}

export default function Pricing() {
  const [activeTab, setActiveTab] = useState<string>("user");
  const { data: rows = [], isLoading } = useAllPricing();

  const byAudience = useMemo(() => {
    const acc: Record<string, PricingRow[]> = {};
    for (const row of rows) {
      if (!acc[row.audience]) acc[row.audience] = [];
      acc[row.audience].push(row);
    }
    return acc;
  }, [rows]);

  const currentAudience = activeTab;
  const planModules = PLAN_MODULES[currentAudience] ?? [];
  const consumptionModules = CONSUMPTION_MODULES[currentAudience] ?? [];
  const planRows = (byAudience[currentAudience] ?? []).filter((r) => planModules.includes(r.module));
  const consumptionRows = (byAudience[currentAudience] ?? []).filter((r) =>
    consumptionModules.includes(r.module)
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <div className="border-b border-border bg-card/50 py-10">
          <div className="container max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-4">
              <Euro className="w-3.5 h-3.5" /> Pricing by role
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-black mb-2">
              Plans & pricing
            </h1>
            <p className="text-muted-foreground text-sm max-w-xl">
              Choose your role to see plans and extra consumption. All amounts in EUR.
            </p>

            {/* Tabs per user type */}
            <div className="flex gap-1 overflow-x-auto scrollbar-none mt-6 pb-px">
              {AUDIENCE_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`shrink-0 flex items-center gap-2 px-4 py-3 rounded-t-xl text-sm font-semibold transition-colors border-b-2 ${
                    activeTab === id
                      ? "bg-background border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-background/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="container max-w-4xl py-8">
          {isLoading ? (
            <div className="flex justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading pricing…</span>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Plans for this audience */}
              {planRows.length > 0 && (
                <section className="glass-card rounded-2xl border border-border overflow-hidden">
                  <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <h2 className="font-display font-bold text-base">Plans</h2>
                  </div>
                  <div className="divide-y divide-border">
                    {planRows.map((row) => {
                      const metaStr = formatMetadata(row.metadata);
                      return (
                        <div
                          key={row.id}
                          className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-semibold text-sm">{row.label}</p>
                            {row.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
                            )}
                            {metaStr && (
                              <p className="text-[11px] text-primary/80 mt-1">{metaStr}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-display font-black text-lg text-foreground">
                              {formatPrice(row.amount, row.unit, row.currency)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Extra consumption for this audience */}
              {consumptionRows.length > 0 && (
                <section className="glass-card rounded-2xl border border-border overflow-hidden">
                  <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h2 className="font-display font-bold text-base">Extra consumption</h2>
                  </div>
                  <p className="px-5 py-2 text-xs text-muted-foreground">
                    Add-ons and usage-based charges for this role.
                  </p>
                  <div className="divide-y divide-border">
                    {consumptionRows.map((row) => {
                      const metaStr = formatMetadata(row.metadata);
                      return (
                        <div
                          key={row.id}
                          className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-semibold text-sm">{row.label}</p>
                            {row.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
                            )}
                            {metaStr && (
                              <p className="text-[11px] text-primary/80 mt-1">{metaStr}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-display font-black text-lg text-foreground">
                              {formatPrice(row.amount, row.unit, row.currency)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {planRows.length === 0 && consumptionRows.length === 0 && (
                <div className="glass-card rounded-2xl border border-border p-8 text-center text-muted-foreground text-sm">
                  No pricing configured for this role yet.
                </div>
              )}
            </div>
          )}

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild className="bg-gradient-primary border-0 text-primary-foreground gap-1.5">
              <Link to="/pro">
                Pro plans
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild className="border-border gap-1.5" variant="outline">
              <Link to="/investor-dashboard">
                Investor deal flow
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-border gap-1.5">
              <Link to="/pricing/firesale-investors">Firesale investor plans (detail)</Link>
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8 max-w-xl mx-auto">
            Prices are indicative. Final billing may be configured per agreement. Changes in Admin Pricing are reflected here.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
