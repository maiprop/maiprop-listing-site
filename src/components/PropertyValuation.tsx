import { useState } from "react";
import {
  Zap, TrendingUp, TrendingDown, Minus, Loader2,
  ChevronDown, ChevronUp, Info, AlertTriangle, Lightbulb,
  BarChart3, Droplets, Scale, MapPin, Receipt, FileCheck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getAiErrorMessage } from "@/lib/aiErrorUtils";
import { getPrimaryValuationEstimate, getRemoteValuationEstimate } from "@/lib/valuationResult";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
import { useAuth } from "@/contexts/AuthContext";
import { SignInForAI } from "@/components/SignInForAI";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { parseMutationInput, propertyValuationBodySchema } from "@/lib/mutationSchemas";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ValuationResult {
  estimatedValue: number;
  rangeLow: number;
  rangeHigh: number;
  executionValue: number;
  pricePerSqmEstimate: number;
  confidence: number;
  confidenceLabel: "High" | "Medium" | "Low";
  liquidityScore: number;
  marketComparison: "below_market" | "at_market" | "above_market";
  marketComparisonPct: number;
  pricingPosition: "underpriced" | "fair" | "overpriced";
  methodUsed: string;
  valuationMode: "MODE_1_LISTING_ONLY" | "MODE_2_PUBLIC_ENRICHED";
  summary: string;
  keyFactors: { factor: string; impact: "positive" | "negative" | "neutral"; note: string }[];
  legalCleanliness: number;
  planningCertainty: number;
  taxFriction: number;
  transferReadiness: number;
  legalSummary: string;
  taxSummary: string;
  objectiveValueProxy: number | null;
  renovationPotential: string | null;
  rentalYieldEstimate: number;
  highestBestUseHint: string | null;
  redFlags: string[];
  auctionAdjustedValue: number | null;
  listingQualityScore: number;
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
  totalFloors?: number | null;
  yearBuilt?: number | null;
  heatingSystem?: string | null;
  energyClass?: string | null;
  pricePerSqm?: number | null;
  hasParking?: boolean | null;
  hasPool?: boolean | null;
  hasElevator?: boolean | null;
  hasGarden?: boolean | null;
  hasStorage?: boolean | null;
  hasBalcony?: boolean | null;
  hasView?: boolean | null;
  hasFurnished?: boolean | null;
  region?: string | null;
  description?: string | null;
  tags?: string[] | null;
  ownershipStatus?: string;
  ownershipPercentage?: number;
  auctionCourt?: string | null;
  plotSurface?: number | null;
  condition?: string | null;
  isNeoclassical?: boolean | null;
  isPreserved?: boolean | null;
  distanceFromSea?: number | null;
  withinCityPlan?: boolean | null;
  withinSettlement?: boolean | null;
  buildingAllowance?: number | null;
  coverageRatio?: number | null;
  isBuildable?: boolean | null;
  cadastreNumber?: string | null;
  hasLandConcession?: boolean | null;
  landUse?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Listing identifier for callers that need to associate this analysis with a listing. */
  listingId?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ScoreRing({
  score, label, colour, size = 56,
}: {
  score: number; label: string; colour: string; size?: number;
}) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={colour} strokeWidth="4"
          strokeDasharray={`${c * (score / 100)} ${c * (1 - score / 100)}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
        />
        <text x={cx} y={cx + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={colour}>{score}</text>
      </svg>
      <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: colour }}>{label}</span>
    </div>
  );
}

function scoreColour(score: number) {
  if (score >= 70) return "#22c55e";
  if (score >= 45) return "#eab308";
  return "#ef4444";
}
function frictionColour(score: number) {
  // for taxFriction: lower = better (green), higher = worse (red)
  if (score <= 25) return "#22c55e";
  if (score <= 50) return "#eab308";
  return "#ef4444";
}
function liquidityColour(score: number) {
  if (score >= 65) return "#22c55e";
  if (score >= 35) return "#f97316";
  return "#ef4444";
}

const IMPACT_ICON: Record<string, React.ReactNode> = {
  positive: <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />,
  negative: <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />,
  neutral:  <Minus className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />,
};

const PRICING_CONFIG = {
  underpriced: { label: "Underpriced",  colour: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/25" },
  fair:        { label: "Fair Value",   colour: "text-yellow-400",  bg: "bg-yellow-400/10 border-yellow-400/25" },
  overpriced:  { label: "Overpriced",   colour: "text-red-400",     bg: "bg-red-400/10 border-red-400/25" },
};

const MODE_LABEL: Record<string, string> = {
  MODE_1_LISTING_ONLY: "Listing-only",
  MODE_2_PUBLIC_ENRICHED: "Public-enriched",
};

const PRICING_LABEL_EL: Record<string, string> = {
  underpriced: "Κάτω από την αγορά",
  fair: "Εύλογη αξία",
  overpriced: "Πάνω από την αγορά",
};

const MODE_LABEL_EL: Record<string, string> = {
  MODE_1_LISTING_ONLY: "Μόνο στοιχεία αγγελίας",
  MODE_2_PUBLIC_ENRICHED: "Εμπλουτισμένο με δημόσια δεδομένα",
};

const ui = (isGreek: boolean, en: string, el: string) => (isGreek ? el : en);

function fmt(n: number) { return n.toLocaleString("el-GR"); }

function toFiniteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

type RawValuationResult = Partial<ValuationResult> & {
  estimated_value?: unknown;
  auction_adjusted_value?: unknown;
};

function normalizeValuationResult(data: RawValuationResult, fallbackPrice: number): ValuationResult {
  const primaryEstimate = getPrimaryValuationEstimate(data, fallbackPrice);
  const estimatedValue = toFiniteNumber(data.estimatedValue ?? data.estimated_value, primaryEstimate);
  const auctionAdjustedValue = toFiniteNumber(data.auctionAdjustedValue ?? data.auction_adjusted_value, 0);
  return {
    estimatedValue,
    rangeLow: toFiniteNumber(data.rangeLow, Math.round(estimatedValue * 0.9)),
    rangeHigh: toFiniteNumber(data.rangeHigh, Math.round(estimatedValue * 1.1)),
    executionValue: toFiniteNumber(data.executionValue, Math.round(estimatedValue * 0.88)),
    pricePerSqmEstimate: toFiniteNumber(data.pricePerSqmEstimate, 0),
    confidence: toFiniteNumber(data.confidence, 50),
    confidenceLabel: data.confidenceLabel ?? "Medium",
    liquidityScore: toFiniteNumber(data.liquidityScore, 50),
    marketComparison: data.marketComparison ?? "at_market",
    marketComparisonPct: toFiniteNumber(data.marketComparisonPct, 0),
    pricingPosition: data.pricingPosition ?? "fair",
    methodUsed: data.methodUsed ?? "OpenAI valuation",
    valuationMode: data.valuationMode ?? "MODE_1_LISTING_ONLY",
    summary: data.summary ?? "",
    keyFactors: Array.isArray(data.keyFactors) ? data.keyFactors : [],
    legalCleanliness: toFiniteNumber(data.legalCleanliness, 50),
    planningCertainty: toFiniteNumber(data.planningCertainty, 60),
    taxFriction: toFiniteNumber(data.taxFriction, 30),
    transferReadiness: toFiniteNumber(data.transferReadiness, 55),
    legalSummary: data.legalSummary ?? "",
    taxSummary: data.taxSummary ?? "",
    objectiveValueProxy: data.objectiveValueProxy ?? null,
    renovationPotential: data.renovationPotential ?? null,
    rentalYieldEstimate: toFiniteNumber(data.rentalYieldEstimate, 0),
    highestBestUseHint: data.highestBestUseHint ?? null,
    redFlags: Array.isArray(data.redFlags) ? data.redFlags : [],
    auctionAdjustedValue: auctionAdjustedValue > 0 ? auctionAdjustedValue : null,
    listingQualityScore: toFiniteNumber(data.listingQualityScore, 50),
  };
}

// ── Mini score bar ─────────────────────────────────────────────────────────────
function ScoreBar({ label, score, invert = false, icon }: { label: string; score: number; invert?: boolean; icon: React.ReactNode }) {
  const colour = invert ? frictionColour(score) : scoreColour(score);
  const pct = invert ? Math.max(0, 100 - score) : score; // bar fill opposite for friction
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
          {icon}{label}
        </span>
        <span className="text-[10px] font-bold" style={{ color: colour }}>{score}/100</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: colour }}
        />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PropertyValuation(props: PropertyValuationProps) {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runValuation = async () => {
    if (!user) return;

    setLoading(true);
    setErrorMessage(null);
    try {
      const body = parseMutationInput(propertyValuationBodySchema, props, "property valuation");
      const { data, error } = await invokeAuthenticatedFunction<RawValuationResult & { error?: string }>("property-valuation", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!getRemoteValuationEstimate(data)) throw new Error(ui(isGreek, "Valuation returned no result", "Η εκτίμηση δεν επέστρεψε αποτέλεσμα"));
      setResult(normalizeValuationResult(data as RawValuationResult, props.price));
      setExpanded(true);
      void queryClient.invalidateQueries({ queryKey: ["usage_ai_calls"] });
    } catch (e: unknown) {
      const message = getAiErrorMessage(e, null, ui(isGreek, "Valuation failed", "Η εκτίμηση απέτυχε"));
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const primaryMarketValue = result ? getPrimaryValuationEstimate(result, props.price) : 0;
  const hasAuctionAdjustment = Boolean(result?.auctionAdjustedValue && result.auctionAdjustedValue > 0);
  const hasDistinctAuctionBidValue = Boolean(hasAuctionAdjustment && result && result.auctionAdjustedValue !== result.estimatedValue);
  const isAuctionValuation = props.listingType === "auction" || Boolean(props.auctionCourt);
  const diff = result ? primaryMarketValue - props.price : 0;
  const diffPct = result ? Math.round((diff / props.price) * 100) : 0;
  const pricing = result ? PRICING_CONFIG[result.pricingPosition as keyof typeof PRICING_CONFIG] : null;

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-primary/20">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 bg-primary/5 border-b border-primary/20">
        <Zap className="w-4 h-4 text-primary" />
        <h4 className="font-display font-semibold text-sm flex-1">{ui(isGreek, "Property Valuation", "Εκτίμηση αξίας ακινήτου")}</h4>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
          mAI Prop · 2026 Model
        </span>
      </div>

      <div className="p-5">
        {!user && <SignInForAI feature={ui(isGreek, "Property Valuation", "Η εκτίμηση αξίας ακινήτου")} />}
        {user && !result && (
          <div className="text-center space-y-3">

            <p className="text-xs text-muted-foreground leading-relaxed">
              {ui(
                isGreek,
                isAuctionValuation
                  ? "Auction-specific AI valuation - price range, confidence, liquidity, and Greek legal/tax overlay (legal cleanliness, planning certainty, transfer readiness)."
                  : "Type-specific AI valuation - price range, confidence, liquidity, and market evidence.",
                isAuctionValuation
                  ? "Εκτίμηση πλειστηριασμού με AI: εύρος τιμής, εμπιστοσύνη, ρευστότητα και ελληνική νομική/φορολογική επισκόπηση."
                  : "Εκτίμηση αξίας με AI ανά τύπο ακινήτου: εύρος τιμής, εμπιστοσύνη, ρευστότητα και δεδομένα αγοράς."
              )}
            </p>
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
            <Button
              className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
              onClick={runValuation}
              disabled={loading}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {ui(isGreek, "Analysing...", "Ανάλυση...")}</>
                : <><Zap className="w-4 h-4" /> {ui(isGreek, "Run AI Valuation", "Εκτέλεση εκτίμησης AI")}</>}
            </Button>
            <p className="text-[10px] text-muted-foreground">{ui(isGreek, "Free - Instant - Not a formal appraisal", "Δωρεάν - Άμεση - Δεν αποτελεί επίσημη εκτίμηση")}</p>
          </div>
        )}

        {user && result && (
          <div className="space-y-4">

            {/* Estimated value + score rings */}
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  {hasAuctionAdjustment
                    ? ui(isGreek, "Hybrid clean-market value", "Υβριδική καθαρή εμπορική αξία")
                    : ui(isGreek, "AI Estimated Value", "Εκτιμώμενη αξία AI")}
                </p>
                <p className="font-display font-black text-2xl text-foreground leading-none">
                  €{fmt(primaryMarketValue)}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5 font-mono">
                  €{fmt(result.rangeLow)} — €{fmt(result.rangeHigh)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  ≈ €{fmt(result.pricePerSqmEstimate)}/{ui(isGreek, "sqm", "τ.μ.")} ({ui(isGreek, "market", "αγορά")})
                </p>
              </div>
              <div className="flex gap-3 shrink-0">
                <ScoreRing score={result.confidence} label={ui(isGreek, "Confidence", "Εμπιστοσύνη")} colour={scoreColour(result.confidence)} />
                <ScoreRing score={result.liquidityScore} label={ui(isGreek, "Liquidity", "Ρευστότητα")} colour={liquidityColour(result.liquidityScore)} />
              </div>
            </div>

            {/* Execution value */}
            {result.executionValue && result.executionValue !== result.estimatedValue && (
              <div className="bg-secondary/60 border border-border rounded-xl px-3 py-2 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">{ui(isGreek, "Execution value (after costs & legal)", "Αξία εκτέλεσης μετά από έξοδα και νομικούς παράγοντες")}</span>
                <span className="font-bold text-foreground">€{fmt(result.executionValue)}</span>
              </div>
            )}

            {/* Auction clean market value */}
            {hasDistinctAuctionBidValue && (
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">{ui(isGreek, "Auction-adjusted bid value", "Αξία προσαρμοσμένη για πλειστηριασμό")}</span>
                <span className="font-bold text-amber-400">€{fmt(result.estimatedValue)}</span>
              </div>
            )}

            {/* Pricing position */}
            {pricing && (
              <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${pricing.bg}`}>
                <span className={`text-xs font-semibold ${pricing.colour}`}>
                  {isGreek ? (PRICING_LABEL_EL[result.pricingPosition] ?? pricing.label) : pricing.label}
                </span>
                <span className={`text-xs font-bold font-mono ${pricing.colour}`}>
                  {result.marketComparisonPct > 0 ? "+" : ""}{result.marketComparisonPct}% {ui(isGreek, "vs. market", "έναντι αγοράς")}
                </span>
              </div>
            )}

            {/* vs listed price */}
            <div className="flex items-center justify-between text-xs border-t border-border pt-3">
              <span className="text-muted-foreground">{ui(isGreek, "vs. Listed Price", "έναντι ζητούμενης τιμής")}</span>
              <span className={`font-bold font-mono ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {diff >= 0 ? "+" : ""}€{fmt(Math.abs(diff))} ({diffPct > 0 ? "+" : ""}{diffPct}%)
              </span>
            </div>

            {/* ── LEGAL/TAX OVERLAY ── */}
            {isAuctionValuation && (
            <div className="bg-secondary/40 border border-border rounded-xl p-3.5 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Scale className="w-3 h-3" /> {ui(isGreek, "Legal & Tax Overlay", "Νομική & φορολογική επισκόπηση")}
                {result.valuationMode && (
                  <span className="ml-auto font-normal text-muted-foreground/60 normal-case tracking-normal">
                    {isGreek ? (MODE_LABEL_EL[result.valuationMode] || result.valuationMode) : (MODE_LABEL[result.valuationMode] || result.valuationMode)}
                  </span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <ScoreBar
                  label={ui(isGreek, "Legal Cleanliness", "Νομική καθαρότητα")}
                  score={result.legalCleanliness}
                  icon={<Scale className="w-3 h-3" />}
                />
                <ScoreBar
                  label={ui(isGreek, "Planning Certainty", "Πολεοδομική βεβαιότητα")}
                  score={result.planningCertainty}
                  icon={<MapPin className="w-3 h-3" />}
                />
                <ScoreBar
                  label={ui(isGreek, "Tax Friction", "Φορολογική τριβή")}
                  score={result.taxFriction}
                  invert
                  icon={<Receipt className="w-3 h-3" />}
                />
                <ScoreBar
                  label={ui(isGreek, "Transfer Readiness", "Ετοιμότητα μεταβίβασης")}
                  score={result.transferReadiness}
                  icon={<FileCheck className="w-3 h-3" />}
                />
              </div>
              {result.legalSummary && (
                <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border pt-2.5">
                  {result.legalSummary}
                </p>
              )}
              {result.taxSummary && (
                <p className="text-[10px] text-muted-foreground leading-relaxed">{result.taxSummary}</p>
              )}
              {result.objectiveValueProxy && (
                <div className="flex items-center justify-between text-[10px] border-t border-border pt-2.5">
                  <span className="text-muted-foreground">{ui(isGreek, "Objective value proxy (ENFIA/tax ref)", "Ένδειξη αντικειμενικής αξίας (ΕΝΦΙΑ/φορολογική βάση)")}</span>
                  <span className="font-semibold text-muted-foreground">≈ €{fmt(result.objectiveValueProxy)}</span>
                </div>
              )}
            </div>
            )}

            {/* Rental yield + listing quality */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between text-xs bg-secondary/50 rounded-lg px-2.5 py-2">
                <span className="text-muted-foreground">{ui(isGreek, "Rental Yield", "Απόδοση μίσθωσης")}</span>
                <span className="font-semibold text-primary">{result.rentalYieldEstimate}% {ui(isGreek, "p.a.", "ετησίως")}</span>
              </div>
              <div className="flex items-center justify-between text-xs bg-secondary/50 rounded-lg px-2.5 py-2">
                <span className="text-muted-foreground">{ui(isGreek, "Data Quality", "Ποιότητα δεδομένων")}</span>
                <span className="font-semibold" style={{ color: scoreColour(result.listingQualityScore) }}>
                  {result.listingQualityScore}/100
                </span>
              </div>
            </div>

            {/* Red flags */}
            {result.redFlags.length > 0 && (
              <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-3 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> {ui(isGreek, "Red Flags", "Σημεία προσοχής")}
                </p>
                {result.redFlags.map((flag, i) => (
                  <p key={i} className="text-xs text-red-300/90 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">•</span>{flag}
                  </p>
                ))}
              </div>
            )}

            {/* Expand toggle */}
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline w-full justify-center"
            >
              {expanded
                ? <><ChevronUp className="w-3 h-3" />{ui(isGreek, "Hide analysis", "Απόκρυψη ανάλυσης")}</>
                : <><ChevronDown className="w-3 h-3" />{ui(isGreek, "Full analysis", "Πλήρης ανάλυση")}</>}
            </button>

            {/* Expanded section */}
            {expanded && (
              <div className="space-y-4 border-t border-border pt-4">

                {result.methodUsed && (
                  <div className="flex items-center gap-1.5">
                    <BarChart3 className="w-3 h-3 text-muted-foreground shrink-0" />
                    <p className="text-[10px] text-muted-foreground italic">{result.methodUsed}</p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground leading-relaxed">{result.summary}</p>

                {result.keyFactors.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{ui(isGreek, "Key Value Drivers", "Κύριοι παράγοντες αξίας")}</p>
                    <div className="space-y-2">
                      {result.keyFactors.map((f, i) => (
                        <div key={i} className="flex items-start gap-2">
                          {IMPACT_ICON[f.impact]}
                          <div>
                            <span className="text-xs font-medium">{f.factor}</span>
                            {f.note && (
                              <span className="text-[10px] text-muted-foreground ml-1.5 block leading-snug">{f.note}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.renovationPotential && (
                  <div className="flex items-start gap-2 bg-secondary rounded-xl p-3">
                    <Droplets className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{ui(isGreek, "Renovation Potential", "Δυνατότητα ανακαίνισης")}</p>
                      <p className="text-xs text-foreground leading-relaxed">{result.renovationPotential}</p>
                    </div>
                  </div>
                )}

                {result.highestBestUseHint && (
                  <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl p-3">
                    <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-primary/70 uppercase tracking-wider mb-0.5">{ui(isGreek, "Highest & Best Use", "Βέλτιστη χρήση")}</p>
                      <p className="text-xs text-foreground leading-relaxed">{result.highestBestUseHint}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 bg-secondary/60 rounded-xl p-3">
                  <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {result.confidence >= 75
                      ? ui(isGreek, "Strong estimate - good listing data and comparable market depth.", "Ισχυρή εκτίμηση: καλά στοιχεία αγγελίας και επαρκές βάθος συγκρίσιμων δεδομένων.")
                      : result.confidence >= 50
                      ? ui(isGreek, "Usable estimate - some missing fields reduce precision. Range reflects uncertainty.", "Χρήσιμη εκτίμηση: ορισμένα ελλιπή στοιχεία μειώνουν την ακρίβεια. Το εύρος αποτυπώνει την αβεβαιότητα.")
                      : ui(isGreek, "Low-confidence estimate - limited data. Treat range as indicative only.", "Εκτίμηση χαμηλής εμπιστοσύνης: περιορισμένα δεδομένα. Αντιμετωπίστε το εύρος ως ενδεικτικό.")}
                    {" "}{ui(isGreek, "Liquidity:", "Ρευστότητα:")} {result.liquidityScore >= 65 ? ui(isGreek, "high", "υψηλή") : result.liquidityScore >= 35 ? ui(isGreek, "moderate", "μέτρια") : ui(isGreek, "low", "χαμηλή")} {ui(isGreek, "for this asset type.", "για αυτόν τον τύπο ακινήτου.")}
                    {" "}{ui(isGreek, "Legal data:", "Νομικά δεδομένα:")} {result.legalCleanliness >= 70 ? ui(isGreek, "appears clean", "φαίνονται καθαρά") : result.legalCleanliness >= 45 ? ui(isGreek, "some unknowns", "υπάρχουν ορισμένες αβεβαιότητες") : ui(isGreek, "significant unknowns - verify before proceeding", "σημαντικές αβεβαιότητες - απαιτείται έλεγχος πριν προχωρήσετε")}.
                  </p>
                </div>

                <button
                  onClick={runValuation}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors w-full justify-center"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  {ui(isGreek, "Refresh valuation", "Ανανέωση εκτίμησης")}
                </button>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              {ui(
                isGreek,
                isAuctionValuation
                  ? "AI estimate only - Not a formal appraisal - 2026 Greek market + legal overlay model"
                  : "AI estimate only - Not a formal appraisal - 2026 Greek market model",
                isAuctionValuation
                  ? "Μόνο εκτίμηση AI - Δεν αποτελεί επίσημη εκτίμηση - Μοντέλο ελληνικής αγοράς και νομικής επισκόπησης 2026"
                  : "Μόνο εκτίμηση AI - Δεν αποτελεί επίσημη εκτίμηση - Μοντέλο ελληνικής αγοράς 2026"
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
