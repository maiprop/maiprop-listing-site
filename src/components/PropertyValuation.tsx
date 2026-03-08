import { useState } from "react";
import {
  Zap, TrendingUp, TrendingDown, Minus, Loader2,
  ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ValuationResult {
  estimatedValue: number;
  rangeLow: number;
  rangeHigh: number;
  confidence: number;
  confidenceLabel: "High" | "Medium" | "Low";
  pricePerSqmEstimate: number;
  marketComparison: "below_market" | "at_market" | "above_market";
  marketComparisonPct: number;
  summary: string;
  keyFactors: { factor: string; impact: "positive" | "negative" | "neutral"; note: string }[];
  renovationPotential: string;
  rentalYieldEstimate: number;
}

export interface PropertyValuationProps {
  title: string;
  city: string;
  address?: string;
  price: number;
  sqm: number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  propertyType?: string;
  listingType?: string;
  floor?: number | null;
  yearBuilt?: number | null;
  energyClass?: string | null;
  pricePerSqm?: number | null;
  hasParking?: boolean | null;
  hasPool?: boolean | null;
  hasElevator?: boolean | null;
  region?: string | null;
}

// ── Helper bits ────────────────────────────────────────────────────────────────

function ConfidenceRing({ score, label }: { score: number; label: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = score / 100;
  const colour = score >= 75 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
        <circle
          cx="30" cy="30" r={r} fill="none"
          stroke={colour} strokeWidth="4"
          strokeDasharray={`${c * pct} ${c * (1 - pct)}`}
          strokeLinecap="round"
          transform="rotate(-90 30 30)"
        />
        <text x="30" y="34" textAnchor="middle" fontSize="13" fontWeight="700" fill={colour}>{score}</text>
      </svg>
      <span className="text-[10px] font-semibold" style={{ color: colour }}>{label}</span>
    </div>
  );
}

const IMPACT_ICON: Record<string, React.ReactNode> = {
  positive: <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />,
  negative: <TrendingDown className="w-3 h-3 text-red-400 shrink-0" />,
  neutral:  <Minus className="w-3 h-3 text-muted-foreground shrink-0" />,
};

const CMP_CONFIG = {
  below_market: { label: "Below Market", colour: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
  at_market:    { label: "At Market",    colour: "text-yellow-400",  bg: "bg-yellow-400/10 border-yellow-400/20" },
  above_market: { label: "Above Market", colour: "text-red-400",     bg: "bg-red-400/10 border-red-400/20" },
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function PropertyValuation(props: PropertyValuationProps) {
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const runValuation = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("property-valuation", {
        body: props,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setResult(data as ValuationResult);
      setExpanded(true);
    } catch (e: any) {
      toast.error(e.message || "Valuation failed");
    } finally {
      setLoading(false);
    }
  };

  const diff = result ? result.estimatedValue - props.price : 0;
  const diffPct = result ? Math.round((diff / props.price) * 100) : 0;
  const cmp = result ? CMP_CONFIG[result.marketComparison] : null;

  return (
    <div className="glass-card rounded-xl overflow-hidden border border-primary/20">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 bg-primary/5 border-b border-primary/20">
        <Zap className="w-4 h-4 text-primary" />
        <h4 className="font-display font-semibold text-sm flex-1">AI Property Valuation</h4>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
          mAI Prop OS
        </span>
      </div>

      <div className="p-5">
        {/* CTA state */}
        {!result && (
          <div className="text-center space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Get an instant AI-powered market valuation based on comparable sales, location data, and current trends.
            </p>
            <Button
              className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
              onClick={runValuation}
              disabled={loading}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
                : <><Zap className="w-4 h-4" /> Get AI Valuation</>
              }
            </Button>
            <p className="text-[10px] text-muted-foreground">Free · Instant · AI-powered estimate</p>
          </div>
        )}

        {/* Result state */}
        {result && (
          <div className="space-y-4">
            {/* Top row: estimated value + confidence */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">AI Estimated Value</p>
                <p className="font-display font-black text-2xl text-foreground">
                  €{result.estimatedValue.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  €{result.rangeLow.toLocaleString()} – €{result.rangeHigh.toLocaleString()}
                </p>
              </div>
              <ConfidenceRing score={result.confidence} label={result.confidenceLabel} />
            </div>

            {/* Market comparison badge */}
            {cmp && (
              <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${cmp.bg}`}>
                <span className={`text-xs font-semibold ${cmp.colour}`}>{cmp.label}</span>
                <span className={`text-xs font-bold ${cmp.colour}`}>
                  {result.marketComparisonPct > 0 ? "+" : ""}{result.marketComparisonPct}%
                </span>
              </div>
            )}

            {/* vs listed price */}
            <div className="flex items-center justify-between text-xs border-t border-border pt-3">
              <span className="text-muted-foreground">vs. Listed Price</span>
              <span className={`font-bold ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {diff >= 0 ? "+" : ""}€{Math.abs(diff).toLocaleString()} ({diffPct > 0 ? "+" : ""}{diffPct}%)
              </span>
            </div>

            {/* Rental yield */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Est. Rental Yield</span>
              <span className="font-semibold text-primary">{result.rentalYieldEstimate}% p.a.</span>
            </div>

            {/* Expand/collapse toggle */}
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline w-full justify-center"
            >
              {expanded ? <><ChevronUp className="w-3 h-3" />Hide details</> : <><ChevronDown className="w-3 h-3" />Full analysis</>}
            </button>

            {expanded && (
              <div className="space-y-4 border-t border-border pt-4">
                {/* Summary */}
                <p className="text-xs text-muted-foreground leading-relaxed">{result.summary}</p>

                {/* Key factors */}
                {result.keyFactors.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Key Factors</p>
                    <div className="space-y-2">
                      {result.keyFactors.map((f, i) => (
                        <div key={i} className="flex items-start gap-2">
                          {IMPACT_ICON[f.impact]}
                          <div>
                            <span className="text-xs font-medium">{f.factor}</span>
                            {f.note && <span className="text-[10px] text-muted-foreground ml-1.5">{f.note}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Renovation potential */}
                {result.renovationPotential && (
                  <div className="flex items-start gap-2 bg-secondary rounded-xl p-3">
                    <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Renovation Potential</p>
                      <p className="text-xs text-foreground">{result.renovationPotential}</p>
                    </div>
                  </div>
                )}

                {/* Rerun */}
                <button
                  onClick={runValuation}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors w-full justify-center"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Refresh valuation
                </button>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground text-center">
              AI estimate only · Not a formal appraisal · Updated {new Date().toLocaleDateString("en-GB")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
