import { useState, useEffect } from "react";
import {
  Building2, Volume2, Shield, TrendingUp, TrendingDown,
  Minus, Loader2, Zap, MapPin, HardHat, CheckCircle2,
  Clock, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  pricePerSqmTrend: PriceTrend;
  noiseLevel: NoiseLevel;
  safetyScore: SafetyScore;
  developmentProjects: DevProject[];
  demographics: { primaryResidents: string; avgAge: number; tourismImpact: string };
  investmentOutlook: { rating: string; summary: string };
  areaHighlights: string[];
}

export interface NeighbourhoodReportProps {
  city: string;
  address?: string;
  region?: string | null;
  propertyType?: string;
  lat?: number | null;
  lng?: number | null;
}

// ── Micro-components ───────────────────────────────────────────────────────────

function ScoreBar({ score, max = 100, colour }: { score: number; max?: number; colour: string }) {
  return (
    <div className="h-1.5 bg-border rounded-full overflow-hidden mt-1.5">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${(score / max) * 100}%`, background: colour }}
      />
    </div>
  );
}

function MiniChart({ trend }: { trend: PriceTrend }) {
  const points = [
    { year: "5yr", val: trend.fiveYearsAgo },
    { year: "3yr", val: trend.threeYearsAgo },
    { year: "1yr", val: trend.oneYearAgo },
    { year: "Now", val: trend.current },
  ];
  const min = Math.min(...points.map(p => p.val)) * 0.95;
  const max = Math.max(...points.map(p => p.val)) * 1.05;
  const range = max - min || 1;
  const w = 220, h = 56, pad = 6;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2));
  const ys = points.map(p => h - pad - ((p.val - min) / range) * (h - pad * 2));

  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const fill = [...xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`), `L${(w - pad).toFixed(1)},${h}`, `L${pad},${h}`, "Z"].join(" ");

  const rising = trend.current >= trend.oneYearAgo;
  const lineColour = rising ? "#22c55e" : "#ef4444";

  return (
    <div>
      <svg width={w} height={h} className="w-full overflow-visible" viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColour} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColour} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#chartFill)" />
        <path d={path} fill="none" stroke={lineColour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={xs[i]} cy={ys[i]} r="3" fill={lineColour} />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        {points.map(p => <span key={p.year}>{p.year}</span>)}
      </div>
      <div className="flex justify-between text-[10px] font-medium mt-0.5">
        {points.map(p => (
          <span key={p.year} style={{ color: p.year === "Now" ? lineColour : undefined }}>
            €{p.val.toLocaleString()}
          </span>
        ))}
      </div>
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function NeighbourhoodReport({ city, address, region, propertyType, lat, lng }: NeighbourhoodReportProps) {
  const [data, setData] = useState<NeighbourhoodData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnErr } = await supabase.functions.invoke("neighbourhood-report", {
        body: { city, address, region, propertyType, lat, lng },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (result?.error) throw new Error(result.error);
      setData(result as NeighbourhoodData);
    } catch (e: any) {
      setError(e.message || "Failed to load neighbourhood report");
      toast.error("Neighbourhood report failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const noiseColour = (s: number) => s <= 3 ? "#22c55e" : s <= 6 ? "#eab308" : "#ef4444";
  const safeColour  = (s: number) => s >= 75 ? "#22c55e" : s >= 50 ? "#eab308" : "#ef4444";

  return (
    <div className="glass-card rounded-xl overflow-hidden border border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 bg-secondary border-b border-border">
        <Building2 className="w-4 h-4 text-primary" />
        <div className="flex-1">
          <h3 className="font-display font-semibold text-sm">Neighbourhood Report</h3>
          {data && <p className="text-[10px] text-muted-foreground mt-0.5">{data.areaName} · {city}</p>}
        </div>
        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
          <Zap className="w-2.5 h-2.5" /> AI
        </span>
      </div>

      <div className="p-5">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">AI is analysing the neighbourhood…</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
            <button onClick={load} className="text-xs text-destructive hover:underline shrink-0">Retry</button>
          </div>
        )}

        {/* Data */}
        {data && !loading && (
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
            <button onClick={load} className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors w-full justify-center border-t border-border pt-3">
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
