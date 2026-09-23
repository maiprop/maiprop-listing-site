import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, TrendingUp, TrendingDown, Minus, ShieldCheck, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAiErrorMessage } from "@/lib/aiErrorUtils";
import { useAuth } from "@/contexts/AuthContext";
import { SignInForAI } from "@/components/SignInForAI";
import { walkScoreLabel, walkScoreColour } from "@/lib/walkScore";
import { parseValuationResponseV2, selectPrimaryValuation, type PrimaryValuation, type ValuationResponseV2 } from "@/lib/valuationResult";
import {
  neighbourhoodReportBodySchema,
  parseMutationInput,
  propertyValuationBodySchema,
} from "@/lib/mutationSchemas";
import { calculatePricePerSqm } from "@/lib/priceCalculations";
import { useTranslation } from "react-i18next";

// Compare drawer is fed both the formatted card view and the raw listing row
// from useListings. Both shapes have ~80 columns between them and a tighter
// type would force a sweeping refactor of the join projection. Per-line
// suppression here keeps the suppression visible at the type definition
// without re-enabling `any` everywhere else in the file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listing = Record<string, any>;

const AI_REPORT_TIMEOUT_MS = 45_000;

interface AIReport {
  response: ValuationResponseV2;
  primary: PrimaryValuation | null;
}

interface NeighbourhoodData {
  safetyScore: number | null; // 0-100, unverified AI estimate
  noiseLevel: "low" | "moderate" | "high" | null;
}

interface PropertyAIData {
  valuation: AIReport | null;
  walkScore: number | null;
  neighbourhood: NeighbourhoodData | null;
  loading: boolean;
  error: string | null;
}

const normaliseStoredWalkScore = (value: unknown): number | null => {
  const score = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
};

const normalizeValuationReport = (data: unknown): AIReport | null => {
  const response = parseValuationResponseV2(data);
  return response ? { response, primary: selectPrimaryValuation(response) } : null;
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
function ValuationCell({ data }: { data: AIReport }) {
  const { response, primary } = data;
  const pct = response.marketComparisonPct;
  const cmpCfg = {
    below_market: { label: "Below Mkt", colour: "text-emerald-400" },
    at_market: { label: "At Market", colour: "text-yellow-400" },
    above_market: { label: "Above Mkt", colour: "text-red-400" },
  }[response.marketComparison ?? "at_market"];
  const Icon = pct == null || pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const iconColour = pct == null || pct === 0 ? "text-muted-foreground" : pct < 0 ? "text-emerald-400" : "text-red-400";
  const money = (value: number, unit: "EUR" | "EUR/month" | null = "EUR") => `€${value.toLocaleString()}${unit === "EUR/month" ? "/mo" : ""}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColour}`} />
        <span className="font-display font-bold text-sm">{primary ? money(primary.value, primary.unit) : "Unavailable"}</span>
      </div>
      {primary?.rangeLow != null && primary.rangeHigh != null && <div className="text-[10px] text-muted-foreground">{money(primary.rangeLow, primary.unit)} – {money(primary.rangeHigh, primary.unit)}</div>}
      {pct != null && response.marketComparison && <div className={`text-[10px] font-semibold ${cmpCfg.colour}`}>Asking versus estimate: {pct > 0 ? "+" : ""}{pct}% · {cmpCfg.label}</div>}
      <div className="text-[10px] text-muted-foreground">{primary ? `${primary.source === "os_prediction" ? "OS model prediction" : "Unverified AI estimate"} · ${primary.basis.replace(/_/g, " ")}${response.transaction === "auction" && primary.basis === "market_value" ? " · clear-title assumption; documents not verified" : ""}` : response.summary ?? "Partial analysis only"}</div>
      {response.providerPrediction?.unit === null && <div className="text-[10px] text-muted-foreground">Rental model observation: {money(response.providerPrediction.value)} · period unavailable</div>}
      {response.transaction === "auction" && response.providerPrediction?.model === "auction" && primary?.basis === "market_value" && <div className="text-[10px] text-muted-foreground">Separate OS auction-model estimate: {money(response.providerPrediction.value)} · not clean-market, bid, or execution value</div>}
      {response.summary && primary && <div className="text-[10px] text-muted-foreground">{response.summary}</div>}
      {response.keyFactors.map((factor) => <div key={`${factor.factor}-${factor.note}`} className="text-[10px] text-muted-foreground"><strong>{factor.factor}:</strong> {factor.note} ({factor.impact})</div>)}
      {response.redFlags.length > 0 && <div className="text-[10px] text-red-400"><strong>Reported concerns:</strong> {response.redFlags.join(" · ")}</div>}
      {response.renovationPotential && <div className="text-[10px] text-muted-foreground"><strong>Renovation potential:</strong> {response.renovationPotential}</div>}
      {response.highestBestUseHint && <div className="text-[10px] text-muted-foreground"><strong>Potential use:</strong> {response.highestBestUseHint}</div>}
      {response.legalSummary && <div className="text-[10px] text-muted-foreground"><strong>Legal context:</strong> {response.legalSummary}</div>}
      {response.taxSummary && <div className="text-[10px] text-muted-foreground"><strong>Tax context:</strong> {response.taxSummary}</div>}
      <div className="text-[10px] text-muted-foreground">Yield: <span className="text-primary font-semibold">{response.rentalYieldEstimate == null ? "Unavailable" : `${response.rentalYieldEstimate}%`}</span></div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function CompareAIReports({ listings }: { listings: Listing[] }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [reports, setReports] = useState<Record<string, PropertyAIData>>({});
  const [triggered, setTriggered] = useState(false);
  const requestGeneration = useRef(0);
  const subjectsKey = listings.map((listing) => listing.id).join("|");

  useEffect(() => {
    requestGeneration.current += 1;
    setReports({}); setTriggered(false);
  }, [subjectsKey, user?.id]);

  const fetchReports = async () => {
    if (!user) return;
    const generation = ++requestGeneration.current;
    setTriggered(true);
    const init: Record<string, PropertyAIData> = {};
    listings.forEach(l => {
      init[l.id] = {
        valuation: null,
        walkScore: null,
        neighbourhood: null,
        loading: true,
        error: null,
      };
    });
    setReports(init);

    await Promise.all(listings.map(async (listing) => {
      const raw = listing._raw ?? listing;
      const storedWalkScore = normaliseStoredWalkScore(raw.walkability_score);
      try {
        // Valuation
        const pricePerSqm = calculatePricePerSqm({
          price: raw.price,
          sqm: raw.sqm,
          storedPricePerSqm: raw.price_per_sqm,
        });
        const valBody = {
          responseVersion: 2,
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
          openHouseTransactionType: raw.open_house_transaction_type,
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
          responseVersion: 2,
          city: raw.city,
          address: raw.address,
          lat: raw.latitude != null ? Number(raw.latitude) : undefined,
          lng: raw.longitude != null ? Number(raw.longitude) : undefined,
          propertyType: raw.property_type,
          listingId: raw.id,
        }, "neighbourhood report");

        // Neighbourhood data (reuse neighbourhood-report edge fn, extract scores)
        const [valRes, nbRes] = await Promise.allSettled([
          supabase.functions.invoke("property-valuation", {
            body: valuationBody,
            timeout: AI_REPORT_TIMEOUT_MS,
          }),
          supabase.functions.invoke("neighbourhood-report", {
            body: neighbourhoodBody,
            timeout: AI_REPORT_TIMEOUT_MS,
          }),
        ]);

        const valuation = valRes.status === "fulfilled" && !valRes.value.error && valRes.value.data
          ? normalizeValuationReport(valRes.value.data)
          : null;

        let reportError: string | null = null;
        const valFail = valRes.status === "fulfilled" ? valRes.value.error?.message ?? valRes.value.data?.error : null;
        const nbFail = nbRes.status === "fulfilled" ? nbRes.value.error?.message ?? nbRes.value.data?.error : null;
        if (valFail ?? nbFail) reportError = getAiErrorMessage(null, { error: valFail ?? nbFail }, "AI analysis failed");

        let neighbourhood: NeighbourhoodData | null = null;
        if (nbRes.status === "fulfilled" && !nbRes.value.error && !nbRes.value.data?.error) {
          const nb = nbRes.value.data;
          const rawSafety = nb?.safetyScore ?? nb?.safety_score;
          const score = rawSafety && typeof rawSafety === "object" ? rawSafety.score : rawSafety;
          const safetyScore = typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
          const rawNoise = nb?.noiseLevel ?? nb?.noise_level;
          const label = rawNoise && typeof rawNoise === "object" ? rawNoise.label : rawNoise;
          const noiseLabels = new Map<string, NeighbourhoodData["noiseLevel"]>([
            ["very quiet", "low"], ["quiet", "low"], ["low", "low"], ["moderate", "moderate"],
            ["busy", "high"], ["very busy", "high"], ["high", "high"], ["noisy", "high"],
          ]);
          const noiseLevel = typeof label === "string" ? noiseLabels.get(label.toLowerCase().trim()) ?? null : null;
          neighbourhood = { safetyScore, noiseLevel };
        }

        if (generation !== requestGeneration.current) return;
        setReports(prev => ({
          ...prev,
          [listing.id]: {
            valuation,
            walkScore: storedWalkScore,
            neighbourhood,
            loading: false,
            error: reportError,
          },
        }));
      } catch (e: unknown) {
        if (generation !== requestGeneration.current) return;
        setReports(prev => ({
          ...prev,
          [listing.id]: {
            valuation: null,
            walkScore: storedWalkScore,
            neighbourhood: null,
            loading: false,
            error: getAiErrorMessage(e, null, "AI analysis failed"),
          },
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
              <p className="text-[10px] text-muted-foreground mt-1.5">Valuation · Stored Walk Score · Safety · Noise</p>
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
                : <ValuationCell data={r.valuation} />
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
                ? <div className="flex flex-col items-center gap-1"><WalkBadge score={r.walkScore} /><p className="text-[9px] text-muted-foreground">{t("poiProvenance.storedScoreSource", { defaultValue: "Stored listing data · not independently verified" })}</p></div>
                : <span className="text-[10px] text-muted-foreground">{t("poiProvenance.unavailable", { defaultValue: "Unavailable" })}</span>
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
                : r.neighbourhood?.safetyScore != null
                ? <><SafetyBar score={r.neighbourhood.safetyScore} /><p className="text-[9px] text-muted-foreground mt-1">AI estimate · not independently verified</p></>
                : <span className="text-[10px] text-muted-foreground">Unavailable</span>
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
                : r.neighbourhood?.noiseLevel != null
                ? <><NoiseBadge level={r.neighbourhood.noiseLevel} /><p className="text-[9px] text-muted-foreground mt-1">AI estimate · not independently verified</p></>
                : <span className="text-[10px] text-muted-foreground">Unavailable</span>
              }
            </td>
          );
        })}
      </tr>
    </>
  );
}
