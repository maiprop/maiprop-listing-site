import { useMemo } from "react";
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
};

/** Section order and labels – must match Admin Pricing sections so updates appear here */
const SECTION_ORDER: { module: string; audience: string; label: string; icon: typeof Users }[] = [
  { module: "user_subscription", audience: "user", label: "Users & consumers", icon: Users },
  { module: "professional_subscription", audience: "professional", label: "Professionals", icon: Briefcase },
  { module: "agent_subscription", audience: "agent", label: "Agents", icon: UserCheck },
  { module: "valuation_reports", audience: "user", label: "Valuation reports", icon: FileBarChart2 },
  { module: "firesale_dashboard", audience: "investor", label: "Firesale / investors", icon: Flame },
  { module: "adhoc_charges", audience: "user", label: "Ad-hoc (listings)", icon: Sparkles },
  { module: "adhoc_charges", audience: "professional", label: "Ad-hoc (professionals)", icon: Sparkles },
];

function useAllPricing() {
  return useQuery({
    queryKey: ["pricing", "all"],
    queryFn: async (): Promise<PricingRow[]> => {
      const { data, error } = await supabase
        .from("pricing_configs")
        .select("id, key, label, description, amount, unit, currency, module, audience, sort_order")
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

export default function Pricing() {
  const { data: rows = [], isLoading } = useAllPricing();

  const grouped = useMemo(() => {
    const acc: Record<string, PricingRow[]> = {};
    for (const row of rows) {
      const key = `${row.module}::${row.audience}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
    }
    return acc;
  }, [rows]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Hero */}
        <div className="border-b border-border bg-card/50 py-12">
          <div className="container max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-4">
              <Euro className="w-3.5 h-3.5" /> All pricing
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-black mb-3">
              Transparent pricing
            </h1>
            <p className="text-muted-foreground text-sm max-w-xl mx-auto">
              Plans and add-ons for users, professionals, agents, valuation reports, and the investor deal flow. All amounts are updated from our admin and shown in EUR unless noted.
            </p>
          </div>
        </div>

        <div className="container max-w-4xl py-10">
          {isLoading ? (
            <div className="flex justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading pricing…</span>
            </div>
          ) : (
            <div className="space-y-10">
              {SECTION_ORDER.map(({ module, audience, label, icon: Icon }) => {
                const key = `${module}::${audience}`;
                const items = grouped[key] ?? [];
                if (items.length === 0) return null;
                return (
                  <section
                    key={key}
                    className="glass-card rounded-2xl border border-border overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
                      <Icon className="w-4 h-4 text-primary" />
                      <h2 className="font-display font-bold text-base capitalize">{label}</h2>
                    </div>
                    <div className="divide-y divide-border">
                      {items.map((row) => (
                        <div
                          key={row.id}
                          className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-semibold text-sm">{row.label}</p>
                            {row.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-display font-black text-lg text-foreground">
                              {formatPrice(row.amount, row.unit, row.currency)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}

              {/* Any other module::audience not in SECTION_ORDER */}
              {Object.entries(grouped).map(([key, items]) => {
                if (SECTION_ORDER.some(s => `${s.module}::${s.audience}` === key)) return null;
                const [module, audience] = key.split("::");
                return (
                  <section
                    key={key}
                    className="glass-card rounded-2xl border border-border overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-border bg-muted/30">
                      <h2 className="font-display font-bold text-sm capitalize">
                        {module} · {audience}
                      </h2>
                    </div>
                    <div className="divide-y divide-border">
                      {items.map((row) => (
                        <div
                          key={row.id}
                          className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-semibold text-sm">{row.label}</p>
                            {row.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
                            )}
                          </div>
                          <span className="font-display font-black text-lg">
                            {formatPrice(row.amount, row.unit, row.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild className="bg-gradient-primary border-0 text-primary-foreground gap-1.5">
              <Link to="/investor-dashboard">
                Investor deal flow
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-border gap-1.5">
              <Link to="/pricing/firesale-investors">
                Firesale investor plans (detail)
              </Link>
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8 max-w-xl mx-auto">
            Prices are indicative. Final billing may be configured per agreement. Changes made in Admin Pricing are reflected here.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
