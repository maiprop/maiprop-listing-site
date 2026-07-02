import { useState, useEffect as _useEffect } from "react";
import { Sparkles, Loader2, TrendingUp, TrendingDown, Minus, ShieldCheck, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAiErrorMessage } from "@/lib/aiErrorUtils";
import { useAuth } from "@/contexts/AuthContext";
import { SignInForAI } from "@/components/SignInForAI";
import { computeWalkScore, walkScoreLabel, walkScoreColour } from "@/lib/walkScore";
import { getPrimaryValuationEstimate } from "@/lib/valuationResult";
import {
  neighbourhoodReportBodySchema,
  parseMutationInput,
  propertyValuationBodySchema,
} from "@/lib/mutationSchemas";
import { calculatePercentDelta, calculatePricePerSqm } from "@/lib/priceCalculations";

// Compare drawer is fed both the formatted card view and the raw listing row
// from useListings. Both shapes have ~80 columns between them and a tighter
// type would force a sweeping refactor of the join projection. Per-line
// suppression here keeps the suppression visible at the type definition
// without re-enabling `any` everywhere else in the file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listing = Record<string, any>;

interface AIReport {
  estimatedValue: number;
  rangeLow: number;
  rangeHigh: number;
  confidence: number;
  marketComparison: "below_market" | "at_market" | "above_market";
  marketComparisonPct: number;
  rentalYieldEstimate: number;
}

interface NeighbourhoodData {
  safetyScore: number; // 0-100
  noiseLevel: "low" | "moderate" | "high";
}

interface PropertyAIData {
  valuation: AIReport | null;
  walkScore: number | null;
  neighbourhood: NeighbourhoodData | null;
  loading: boolean;
  error: string | null;
}

const normalizeValuationReport = (data: unknown, fallbackPrice: number): AIReport => {
  const source = data && typeof data === "object" ? data as Partial<AIReport> : {};
  const estimatedValue = getPrimaryValuationEstimate(source, fallbackPrice);
  const diffPct = fallbackPrice > 0 ? Math.round(((estimatedValue - fallbackPrice) / fallbackPrice) * 100) : 0;
  return {
    estimatedValue,
    rangeLow: Number.isFinite(Number(source.rangeLow)) ? Number(source.rangeLow) : Math.round(estimatedValue * 0.9),
    rangeHigh: Number.isFinite(Number(source.rangeHigh)) ? Number(source.rangeHigh) : Math.round(estimatedValue * 1.1),
    confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : 0,
    marketComparison: source.marketComparison ?? (diffPct > 5 ? "above_market" : diffPct < -5 ? "below_market" : "at_market"),
    marketComparisonPct: Number.isFinite(Number(source.marketComparisonPct)) ? Number(source.marketComparisonPct) : diffPct,
    rentalYieldEstimate: Number.isFinite(Number(source.rentalYieldEstimate)) ? Number(source.rentalYieldEstimate) : 0,
  };
};

// ── Mini walk score badge ─────────────────────────────────────────────────────
function WalkBadge({ score }: { score: number }) {
  const colour = walkScoreColour(score);
  const label = walkScoreLabel(score);
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = score / 100;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={colour} strokeWidth="4"
          strokeDasharray={`${c * pct} ${c * (1 - pct)}`}
          strokeLinecap="round" transform="rotate(-90 24 24)"
        />
        <text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="700" fill={colour}>{score}</text>
      </svg>
      <span className="text-[9px] font-semibold text-center leading-tight" style={{ color: colour }}>{label}</span>
    </div>
  );
}

// ── Safety score bar ──────────────────────────────────────────────────────────
function SafetyBar({ score }: { score: number }) {
  const colour = score >= 75 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  const label = score >= 75 ? "Safe" : score >= 50 ? "Moderate" : "Caution";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> Safety
        </span>
        <span className="font-semibold" style={{ color: colour }}>{score}/100 · {label}</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: colour }} />
      </div>
    </div>
  );
}

// ── Noise level indicator ─────────────────────────────────────────────────────
function NoiseBadge({ level }: { level: "low" | "moderate" | "high" }) {
  const cfg = {
    low: { label: "Quiet", colour: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
    moderate: { label: "Moderate", colour: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/20" },
    high: { label: "Noisy", colour: "text-red-400", bg: "bg-red-400/10 border-red-400/20" },
  }[level];
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cfg.bg} ${cfg.colour}`}>
      <Volume2 className="w-2.5 h-2.5" /> {cfg.label}
    </div>
  );
}

// ── Valuation mini card ───────────────────────────────────────────────────────
function ValuationCell({ data, price }: { data: AIReport; price: number }) {
  const diff = data.estimatedValue - price;
  const pct = calculatePercentDelta({ value: data.estimatedValue, baseline: price }) ?? 0;
  const cmpCfg = {
    below_market: { label: "Below Mkt", colour: "text-emerald-400" },
    at_market: { label: "At Market", colour: "text-yellow-400" },
    above_market: { label: "Above Mkt", colour: "text-red-400" },
  }[data.marketComparison];
  const Icon = diff >= 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const iconColour = diff >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColour}`} />
        <span className="font-display font-bold text-sm">€{data.estimatedValue.toLocaleString()}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">
        €{data.rangeLow.toLocaleString()} – €{data.rangeHigh.toLocaleString()}
      </div>
      <div className={`text-[10px] font-semibold ${cmpCfg.colour}`}>
        {cmpCfg.label} · {pct > 0 ? "+" : ""}{pct}%
      </div>
      <div className="text-[10px] text-muted-foreground">
        Yield: <span className="text-primary font-semibold">{data.rentalYieldEstimate}%</span>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function CompareAIReports({ listings }: { listings: Listing[] }) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Record<string, PropertyAIData>>({});
  const [triggered, setTriggered] = useState(false);

  const fetchReports = async () => {
    if (!user) return;
    setTriggered(true);
    const init: Record<string, PropertyAIData> = {};
    listings.forEach(l => { init[l.id] = { valuation: null, walkScore: null, neighbourhood: null, loading: true, error: null }; });
    setReports(init);

    await Promise.all(listings.map(async (listing) => {
      const raw = listing._raw ?? listing;
      try {
        // Valuation
        const pricePerSqm = calculatePricePerSqm({
          price: raw.price,
          sqm: raw.sqm,
          storedPricePerSqm: raw.price_per_sqm,
        });
        const valBody = {
          listingId: raw.id,
          title: listing.title,
          city: raw.city,
          address: raw.address,
          price: Number(raw.price),
          sqm: Number(raw.sqm),
          latitude: raw.latitude != null ? Number(raw.latitude) : undefined,
          longitude: raw.longitude != null ? Number(raw.longitude) : undefined,
          bedrooms: raw.bedrooms,
          bathrooms: raw.bathrooms,
          propertyType: raw.property_type,
          listingType: raw.listing_type,
          floor: raw.floor,
          yearBuilt: raw.year_built,
          energyClass: raw.energy_class,
          pricePerSqm: pricePerSqm ?? undefined,
          hasParking: raw.has_parking,
          hasPool: raw.has_pool,
          hasElevator: raw.has_elevator,
          region: raw.region,
        };
        const valuationBody = parseMutationInput(propertyValuationBodySchema, valBody, "property valuation");
        const neighbourhoodBody = parseMutationInput(neighbourhoodReportBodySchema, {
          city: raw.city,
          address: raw.address,
          lat: raw.latitude != null ? Number(raw.latitude) : undefined,
          lng: raw.longitude != null ? Number(raw.longitude) : undefined,
          propertyType: raw.property_type,
          listingId: raw.id,
        }, "neighbourhood report");

        // Neighbourhood data (reuse neighbourhood-report edge fn, extract scores)
        const [valRes, nbRes] = await Promise.allSettled([
          supabase.functions.invoke("property-valuation", { body: valuationBody }),
          supabase.functions.invoke("neighbourhood-report", {
            body: neighbourhoodBody,
          }),
        ]);

        const valuation = valRes.status === "fulfilled" && !valRes.value.error && valRes.value.data
          ? normalizeValuationReport(valRes.value.data, Number(raw.price))
          : null;

        let reportError: string | null = null;
        const valFail = valRes.status === "fulfilled" ? valRes.value.error?.message ?? valRes.value.data?.error : null;
        const nbFail = nbRes.status === "fulfilled" ? nbRes.value.error?.message ?? nbRes.value.data?.error : null;
        if (valFail ?? nbFail) reportError = getAiErrorMessage(null, { error: valFail ?? nbFail }, "AI analysis failed");

        let neighbourhood: NeighbourhoodData | null = null;
        if (nbRes.status === "fulfilled" && !nbRes.value.error) {
          const nb = nbRes.value.data;
          // safetyScore is returned as an object {score, label, trend, notes}
          const rawSafety = nb?.safetyScore ?? nb?.safety_score;
          const safetyScore: number =
            typeof rawSafety === "object" && rawSafety !== null
              ? (rawSafety.score ?? 70)
              : (rawSafety ?? 70);
          // noiseLevel is returned as an object {score, label, notes}
          const rawNoise = nb?.noiseLevel ?? nb?.noise_level;
          const noiseLabelRaw: string =
            typeof rawNoise === "object" && rawNoise !== null
              ? (rawNoise.label ?? "Moderate")
              : (rawNoise ?? "Moderate");
          const noiseLevelNorm = noiseLabelRaw.toLowerCase();
          const noiseLevel: "low" | "moderate" | "high" =
            noiseLevelNorm.includes("quiet") || noiseLevelNorm === "low" || noiseLevelNorm === "very quiet"
              ? "low"
              : noiseLevelNorm.includes("busy") || noiseLevelNorm === "high" || noiseLevelNorm.includes("noisy")
              ? "high"
              : "moderate";
          neighbourhood = { safetyScore, noiseLevel };
        }

        // Walk score — use POI endpoint if coords available, else estimate
        let walkScore: number | null = null;
        if (raw.latitude && raw.longitude) {
          const poisRes = await supabase.functions.invoke("property-pois", {
            body: { latitude: raw.latitude, longitude: raw.longitude, city: raw.city },
          });
          const poisFail = poisRes.error?.message ?? poisRes.data?.error;
          if (poisFail && !reportError) reportError = getAiErrorMessage(null, { error: poisFail }, "AI analysis failed");
          if (!poisRes.error && poisRes.data?.pois) {
            const pois = poisRes.data.pois as Array<{
              distanceKm?: number;
              distance_km?: number;
              category?: string;
            }>;
            walkScore = computeWalkScore(
              pois.map((p) => ({
                distanceKm: p.distanceKm ?? p.distance_km ?? 0.5,
                category: (p.category ?? "").toLowerCase(),
              })),
            );
          }
        }

        setReports(prev => ({
          ...prev,
          [listing.id]: { valuation, walkScore, neighbourhood, loading: false, error: reportError ?? null },
        }));
      } catch (e: unknown) {
        setReports(prev => ({
          ...prev,
          [listing.id]: { valuation: null, walkScore: null, neighbourhood: null, loading: false, error: getAiErrorMessage(e, null, "AI analysis failed") },
        }));
      }
    }));
  };


  if (!triggered) {
    return (
      <tr className="bg-primary/5 border-b border-border">
        <td className="px-6 py-4 text-xs text-muted-foreground font-medium whitespace-nowrap" colSpan={1}>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            AI Insights
          </div>
        </td>
        <td colSpan={listings.length} className="px-4 py-4 text-center">
          {!user ? (
            <SignInForAI feature="AI Compare" className="!py-4" />
          ) : (
            <>
              <button
                onClick={fetchReports}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-primary text-primary-foreground text-xs font-semibold transition-opacity hover:opacity-90"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Run AI Analysis for All Properties
              </button>
              <p className="text-[10px] text-muted-foreground mt-1.5">Valuation · Walk Score · Safety · Noise</p>
            </>
          )}
        </td>
      </tr>
    );
  }

  return (
    <>
      {/* AI Valuation row */}
      <tr className="border-b border-border/50 bg-secondary/20">
        <td className="px-6 py-3 text-xs text-muted-foreground font-medium whitespace-nowrap">
          <div className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-primary" /> AI Value
          </div>
        </td>
        {listings.map(l => {
          const r = reports[l.id];
          return (
            <td key={l.id} className="px-4 py-3 text-center align-top">
              {!r || r.loading
                ? <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto" />
                : r.error || !r.valuation
                ? <span className="text-[10px] text-muted-foreground">—</span>
                : <ValuationCell data={r.valuation} price={Number((l._raw ?? l).price)} />
              }
            </td>
          );
        })}
      </tr>

      {/* Walk Score row */}
      <tr className="border-b border-border/50">
        <td className="px-6 py-3 text-xs text-muted-foreground font-medium whitespace-nowrap">Walk Score</td>
        {listings.map(l => {
          const r = reports[l.id];
          return (
            <td key={l.id} className="px-4 py-3 text-center">
              {!r || r.loading
                ? <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto" />
                : r.walkScore != null
                ? <div className="flex justify-center"><WalkBadge score={r.walkScore} /></div>
                : <span className="text-[10px] text-muted-foreground">—</span>
              }
            </td>
          );
        })}
      </tr>

      {/* Safety row */}
      <tr className="border-b border-border/50 bg-secondary/20">
        <td className="px-6 py-3 text-xs text-muted-foreground font-medium whitespace-nowrap">Safety Score</td>
        {listings.map(l => {
          const r = reports[l.id];
          return (
            <td key={l.id} className="px-4 py-3">
              {!r || r.loading
                ? <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto" />
                : r.neighbourhood
                ? <SafetyBar score={r.neighbourhood.safetyScore} />
                : <span className="text-[10px] text-muted-foreground">—</span>
              }
            </td>
          );
        })}
      </tr>

      {/* Noise row */}
      <tr className="border-b border-border/50">
        <td className="px-6 py-3 text-xs text-muted-foreground font-medium whitespace-nowrap">Noise Level</td>
        {listings.map(l => {
          const r = reports[l.id];
          return (
            <td key={l.id} className="px-4 py-3 text-center">
              {!r || r.loading
                ? <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto" />
                : r.neighbourhood
                ? <NoiseBadge level={r.neighbourhood.noiseLevel} />
                : <span className="text-[10px] text-muted-foreground">—</span>
              }
            </td>
          );
        })}
      </tr>
    </>
  );
}
