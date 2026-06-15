import React, { useState } from "react";
import {
  Building2, Volume2, Shield, TrendingUp, TrendingDown,
  Minus, Loader2, Zap, MapPin, HardHat, CheckCircle2,
  AlertCircle, Clock,
} from "lucide-react";
import { getAiErrorMessage, isAiMonthlyLimitError } from "@/lib/aiErrorUtils";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
import { useAuth } from "@/contexts/AuthContext";
import { SignInForAI } from "@/components/SignInForAI";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AIQuotaStatus } from "@/components/AIQuotaStatus";
import { isAiQuotaReached, useAiQuota } from "@/hooks/useAiQuota";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PriceTrend {
  current: number; oneYearAgo: number; threeYearsAgo: number; fiveYearsAgo: number;
  changeYoY: number; change5Y: number;
}

interface NoiseLevel {
  score: number; label: string; notes: string;
}

interface SafetyScore {
  score: number; label: string; trend: string; notes: string;
}

interface DevProject {
  name: string; type: string; status: string;
  impact: "positive" | "negative" | "neutral";
  estimatedCompletion: string; distanceKm: number;
}

interface NeighbourhoodData {
  areaName: string;
  walkabilityScore?: number;
  pricePerSqmTrend: PriceTrend;
  noiseLevel: NoiseLevel;
  safetyScore: SafetyScore;
  developmentProjects: DevProject[];
  demographics: { primaryResidents: string; avgAge: number; tourismImpact: string };
  investmentOutlook: { rating: string; summary: string };
  areaHighlights: string[];
  generatedBy?: string;
  osMunicipalityStatus?: string;
  osMunicipalityName?: string;
  osPrefectureName?: string;
  osMunicipalityDetail?: string;
}

export interface NeighbourhoodReportProps {
  city: string;
  address?: string;
  region?: string | null;
  municipality?: string | null;
  propertyType?: string;
  lat?: number | null;
  lng?: number | null;
  /** If provided, the AI endpoint may persist listing-level neighbourhood scores. */
  listingId?: string | null;
  /** Deprecated: reports are available to all signed-in users; server quotas handle free vs Pro limits. */
  isPro?: boolean;
}

// ── Micro-components ───────────────────────────────────────────────────────────

const ScoreBar = React.forwardRef<HTMLDivElement, { score: number; max?: number; colour: string }>(
  function ScoreBar({ score, max = 100, colour }, ref) {
    return (
      <div ref={ref} className="h-1.5 bg-border rounded-full overflow-hidden mt-1.5">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${(score / max) * 100}%`, background: colour }}
        />
      </div>
    );
  }
);

function MiniChart({ trend }: { trend: PriceTrend }) {
  const currentYear = new Date().getFullYear();
  const points = [
    { year: String(currentYear - 5), val: trend.fiveYearsAgo },
    { year: String(currentYear - 3), val: trend.threeYearsAgo },
    { year: String(currentYear - 1), val: trend.oneYearAgo },
    { year: String(currentYear),     val: trend.current },
  ];
  const vals = points.map(p => p.val);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = (maxVal - minVal) || 1;

  const w = 800, h = 160, padX = 40, padTop = 44, padBottom = 32;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;

  const xs = points.map((_, i) => padX + (i / (points.length - 1)) * innerW);
  const ys = points.map(p => padTop + innerH - ((p.val - minVal) / range) * innerH);

  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const fill = [
    ...xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`),
    `L${(padX + innerW).toFixed(1)},${(padTop + innerH)}`,
    `L${padX},${(padTop + innerH)}`,
    "Z",
  ].join(" ");

  const rising = trend.current >= trend.oneYearAgo;
  const lineColour = rising ? "#22c55e" : "#ef4444";

  const clampX = (x: number, i: number) => {
    if (i === 0) return Math.max(x, 30);
    if (i === points.length - 1) return Math.min(x, w - 30);
    return x;
  };

  return (
    <div className="w-full overflow-visible">
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible block"
        style={{ minHeight: h }}
      >
        <defs>
          <linearGradient id="chartFillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColour} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColour} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#chartFillGrad)" />
        <path d={path} fill="none" stroke={lineColour} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={xs[i]} cy={ys[i]} r="5" fill={lineColour} />
            {/* Price label above dot */}
            <text
              x={clampX(xs[i], i)}
              y={ys[i] - 12}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill={lineColour}
              opacity={i === points.length - 1 ? 1 : 0.75}
            >
              €{p.val >= 1000 ? `${(p.val / 1000).toFixed(1)}k` : p.val}
            </text>
            {/* Year label bottom */}
            <text
              x={clampX(xs[i], i)}
              y={h - 6}
              textAnchor="middle"
              fontSize="12"
              fontWeight={p.year === String(currentYear) ? "700" : "400"}
              fill={p.year === String(currentYear) ? lineColour : "currentColor"}
              opacity={p.year === String(currentYear) ? 1 : 0.55}
            >
              {p.year}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const PROJECT_STATUS_CONFIG: Record<string, { icon: React.ReactNode; colour: string }> = {
  planned:            { icon: <Clock className="w-3 h-3" />,        colour: "text-blue-400" },
  under_construction: { icon: <HardHat className="w-3 h-3" />,     colour: "text-yellow-400" },
  recently_completed: { icon: <CheckCircle2 className="w-3 h-3" />, colour: "text-emerald-400" },
};

const IMPACT_ICON: Record<string, React.ReactNode> = {
  positive: <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />,
  negative: <TrendingDown className="w-3 h-3 text-red-400 shrink-0" />,
  neutral:  <Minus className="w-3 h-3 text-muted-foreground shrink-0" />,
};

const OUTLOOK_COLOUR: Record<string, string> = {
  Excellent: "text-emerald-400", Good: "text-primary",
  Fair: "text-yellow-400", Poor: "text-red-400",
};

const getBenchmarkSourceDescription = (data: NeighbourhoodData): string => {
  const source = data.generatedBy?.toLowerCase() ?? "";
  const isOsBacked = data.osMunicipalityStatus === "ok" || source.includes("maiprop_os") || source.endsWith("_os");
  if (isOsBacked) {
    const area = data.osMunicipalityName ?? data.osPrefectureName;
    return `Source: mAI Prop OS municipality market report${area ? ` for ${area}` : ""}, interpreted with AI. This is municipality-level residential intelligence, not a new-build or street-level asking-price benchmark. Treat it as directional market context, not a certified valuation.`;
  }

  if (source.includes("fallback")) {
    return "Source: fallback city-level market benchmark plus property and location context. This is directional market intelligence, not a new-build or street-level asking-price benchmark or certified valuation.";
  }

  return "Source: AI-generated neighbourhood estimate from property type, address, coordinates, and available market context. Treat it as directional market intelligence, not a certified valuation.";
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function NeighbourhoodReport({ city, address, region, municipality, propertyType, lat, lng, listingId, isPro: _isPro = false }: NeighbourhoodReportProps) {
  const { user } = useAuth();
  const [data, setData] = useState<NeighbourhoodData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    quota,
    quotaLoading,
    quotaChecked,
    refreshQuota,
  } = useAiQuota("neighbourhood-report", user, { enabled: Boolean(city) });
  const quotaReached = isAiQuotaReached(quota);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const currentQuota = await refreshQuota();
      if (currentQuota && !currentQuota.allowed) return;
      const { data: result, error: fnErr } = await invokeAuthenticatedFunction<NeighbourhoodData & { error?: string }>("neighbourhood-report", {
        body: { city, address, region, municipality, propertyType, lat, lng, listingId },
      });
      if (fnErr) throw fnErr;
      if (result?.error) throw new Error(result.error);
      setData(result as NeighbourhoodData);
      await refreshQuota();
    } catch (e: unknown) {
      if (isAiMonthlyLimitError(e, null)) {
        await refreshQuota();
        setError(null);
        return;
      }
      const msg = getAiErrorMessage(e, null, "Failed to load neighbourhood report");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const noiseColour = (s: number) => s <= 3 ? "#22c55e" : s <= 6 ? "#eab308" : "#ef4444";
  const safeColour  = (s: number) => s >= 75 ? "#22c55e" : s >= 50 ? "#eab308" : "#ef4444";

  return (
    <div className="glass-card rounded-xl overflow-hidden border border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 bg-secondary border-b border-border">
        <Building2 className="w-4 h-4 text-primary" />
        <div className="flex-1">
          <h3 className="font-display font-semibold text-sm">Neighbourhood Report</h3>
          {user && data && (
            <AIQuotaStatus
              featureName="Neighbourhood Report"
              quota={quota}
              quotaLoading={quotaLoading || !quotaChecked}
              variant="compact"
              className="mt-1"
            />
          )}
          {data && <p className="text-[10px] text-muted-foreground mt-0.5">{data.areaName} · {city}</p>}
        </div>
        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
          <Zap className="w-2.5 h-2.5" /> AI
        </span>
      </div>

      <div className="p-5">
        {!user && <SignInForAI feature="Neighbourhood Report" />}

        {user && (!data || quotaReached) && (
          <AIQuotaStatus
            featureName="Neighbourhood Report"
            quota={quota}
            quotaLoading={quotaLoading || !quotaChecked}
            className="mb-3"
          />
        )}

        {user && !data && !loading && !error && !quotaReached && (
          <div className="text-center space-y-3 py-4">
            <Button
              className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
              onClick={load}
              disabled={quotaLoading || !quotaChecked}
            >
              <Building2 className="w-4 h-4" /> Load Neighbourhood Report
            </Button>
          </div>
        )}
        {user && loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">AI is analysing the neighbourhood…</p>
          </div>
        )}

        {user && error && !loading && !quotaReached && (
          <div className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
            <button onClick={load} className="text-xs text-destructive hover:underline shrink-0">Retry</button>
          </div>
        )}

        {user && data && !loading && (
          <div className="space-y-6">

            {/* Highlights */}
            {data.areaHighlights?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.areaHighlights.map((h, i) => (
                  <span key={i} className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium">
                    <MapPin className="w-2.5 h-2.5" /> {h}
                  </span>
                ))}
              </div>
            )}

            {/* Price/m² trend */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Price / m² Trend</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-foreground">€{data.pricePerSqmTrend.current.toLocaleString()}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    data.pricePerSqmTrend.changeYoY >= 0
                      ? "bg-emerald-400/10 text-emerald-400"
                      : "bg-red-400/10 text-red-400"
                  }`}>
                    {data.pricePerSqmTrend.changeYoY >= 0 ? "+" : ""}{data.pricePerSqmTrend.changeYoY.toFixed(1)}% YoY
                  </span>
                </div>
              </div>
              <MiniChart trend={data.pricePerSqmTrend} />
              <p className="text-[10px] text-muted-foreground mt-2">
                5-year change: <span className={`font-semibold ${data.pricePerSqmTrend.change5Y >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {data.pricePerSqmTrend.change5Y >= 0 ? "+" : ""}{data.pricePerSqmTrend.change5Y.toFixed(1)}%
                </span>
              </p>
              <div className="mt-2 rounded-lg bg-secondary/70 border border-border px-3 py-2 text-[10px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">How this is estimated: </span>
                {getBenchmarkSourceDescription(data)}
              </div>
            </div>

            {/* Noise + Safety side by side */}
            <div className="grid grid-cols-2 gap-4">
              {/* Noise */}
              <div className="bg-secondary rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Volume2 className="w-3.5 h-3.5" style={{ color: noiseColour(data.noiseLevel.score) }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Noise</span>
                </div>
                <p className="text-sm font-bold" style={{ color: noiseColour(data.noiseLevel.score) }}>
                  {data.noiseLevel.label}
                </p>
                <ScoreBar score={data.noiseLevel.score} max={10} colour={noiseColour(data.noiseLevel.score)} />
                <p className="text-[10px] text-muted-foreground mt-2 leading-tight">{data.noiseLevel.notes}</p>
              </div>

              {/* Safety */}
              <div className="bg-secondary rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Shield className="w-3.5 h-3.5" style={{ color: safeColour(data.safetyScore.score) }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Safety</span>
                </div>
                <p className="text-sm font-bold" style={{ color: safeColour(data.safetyScore.score) }}>
                  {data.safetyScore.label}
                </p>
                <ScoreBar score={data.safetyScore.score} colour={safeColour(data.safetyScore.score)} />
                <p className="text-[10px] text-muted-foreground mt-2 leading-tight">
                  {data.safetyScore.trend} · {data.safetyScore.notes}
                </p>
              </div>

              {/* Walkability */}
              {data.walkabilityScore != null && (
                <div className="bg-secondary rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">🚶</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Walkability</span>
                  </div>
                  <p className="text-sm font-bold" style={{
                    color: data.walkabilityScore >= 70 ? "#22c55e" : data.walkabilityScore >= 50 ? "#eab308" : "#ef4444"
                  }}>
                    {data.walkabilityScore >= 90 ? "Walker's Paradise" :
                     data.walkabilityScore >= 70 ? "Very Walkable" :
                     data.walkabilityScore >= 50 ? "Somewhat Walkable" : "Car-Dependent"}
                  </p>
                  <ScoreBar score={data.walkabilityScore} colour={
                    data.walkabilityScore >= 70 ? "#22c55e" : data.walkabilityScore >= 50 ? "#eab308" : "#ef4444"
                  } />
                  <p className="text-[10px] text-muted-foreground mt-2">{data.walkabilityScore}/100</p>
                </div>
              )}
            </div>

            {/* Development projects */}
            {data.developmentProjects?.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <HardHat className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Development Projects</span>
                </div>
                <div className="space-y-2">
                  {data.developmentProjects.map((p, i) => {
                    const sc = PROJECT_STATUS_CONFIG[p.status] ?? PROJECT_STATUS_CONFIG.planned;
                    return (
                      <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-secondary border border-border hover:border-primary/20 transition-colors">
                        <div className="flex items-start gap-1.5 flex-1 min-w-0">
                          <span className={`mt-0.5 ${sc.colour}`}>{sc.icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{p.type.replace("_", " ")} · {p.estimatedCompletion} · {p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)}m` : `${p.distanceKm.toFixed(1)}km`}</p>
                          </div>
                        </div>
                        {IMPACT_ICON[p.impact]}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Investment outlook */}
            <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
              <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Investment Outlook</span>
                  <span className={`text-sm font-bold ${OUTLOOK_COLOUR[data.investmentOutlook.rating] || "text-primary"}`}>
                    {data.investmentOutlook.rating}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{data.investmentOutlook.summary}</p>
              </div>
            </div>

            {/* Demographics */}
            <div className="flex items-center justify-between text-xs border-t border-border pt-3">
              <div>
                <span className="text-muted-foreground">Residents: </span>
                <span className="font-medium">{data.demographics.primaryResidents}</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                data.demographics.tourismImpact === "Low"
                  ? "bg-emerald-400/10 border-emerald-400/20 text-emerald-400"
                  : data.demographics.tourismImpact === "High"
                  ? "bg-orange-400/10 border-orange-400/20 text-orange-400"
                  : "bg-yellow-400/10 border-yellow-400/20 text-yellow-400"
              }`}>
                {data.demographics.tourismImpact} tourism
              </span>
            </div>

            {/* Refresh */}
            <button
              onClick={load}
              disabled={loading || quotaLoading || !quotaChecked || quotaReached}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors w-full justify-center border-t border-border pt-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Zap className="w-3 h-3" /> Refresh report
            </button>

            <p className="text-[10px] text-muted-foreground text-center">
              AI-generated market intelligence · Not financial advice
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
