import { usePriceIndex } from "@/hooks/usePriceIndex";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useRef } from "react";

// ── Sparkline paths – pre-generated organic waves per city ────────────────────
const SPARKLINES: Record<string, string> = {
  Athens: "M0,14 C4,10 8,18 12,12 C16,6 20,16 24,10 C28,4 32,14 36,8 C40,2 44,12 48,8",
  Thessaloniki: "M0,12 C4,16 8,8 12,14 C16,20 20,10 24,16 C28,12 32,18 36,12 C40,8 44,14 48,10",
  Mykonos: "M0,16 C4,8 8,14 12,6 C16,2 20,10 24,4 C28,8 32,4 36,10 C40,6 44,14 48,8",
  Glyfada: "M0,10 C4,14 8,8 12,12 C16,16 20,8 24,14 C28,10 32,6 36,12 C40,8 44,12 48,6",
  Rhodes: "M0,8 C4,12 8,4 12,10 C16,6 20,14 24,8 C28,4 32,10 36,6 C40,12 44,8 48,4",
  Santorini: "M0,14 C4,10 8,16 12,8 C16,4 20,12 24,6 C28,10 32,4 36,8 C40,2 44,10 48,6",
  Kifisia: "M0,12 C4,8 8,14 12,10 C16,6 20,12 24,8 C28,14 32,10 36,14 C40,8 44,12 48,10",
  Piraeus: "M0,8 C4,12 8,10 12,14 C16,16 20,12 24,16 C28,14 32,16 36,18 C40,14 44,16 48,18",
  Heraklion: "M0,12 C4,8 8,12 12,8 C16,6 20,10 24,8 C28,12 32,8 36,10 C40,6 44,10 48,8",
};

// ── Static trends per city ────────────────────────────────────────────────────
const CITY_CHANGES: Record<string, { change: number; up: boolean }> = {
  Athens: { change: 1.2, up: true },
  Thessaloniki: { change: 0.8, up: true },
  Mykonos: { change: 2.3, up: true },
  Glyfada: { change: 1.7, up: true },
  Rhodes: { change: 3.2, up: true },
  Santorini: { change: 1.9, up: true },
  Kifisia: { change: 0.6, up: true },
  Piraeus: { change: -0.3, up: false },
  Heraklion: { change: 1.4, up: true },
};

const DISPLAY_CITIES = [
  "Athens",
  "Thessaloniki",
  "Mykonos",
  "Glyfada",
  "Rhodes",
  "Santorini",
  "Kifisia",
  "Piraeus",
  "Heraklion",
];

const STATIC_PRICES: Record<string, number> = {
  Athens: 2840,
  Thessaloniki: 1920,
  Mykonos: 6450,
  Glyfada: 3760,
  Rhodes: 2299,
  Santorini: 5120,
  Kifisia: 4180,
  Piraeus: 1740,
  Heraklion: 1880,
};

const MARKET_TREND_COLORS = {
  rise: {
    accent: "hsl(164 82% 52%)",
    soft: "hsl(164 82% 52% / 0.12)",
    chip: "linear-gradient(135deg, hsl(164 74% 34%), hsl(164 78% 44%))",
  },
  fall: {
    accent: "hsl(356 78% 62%)",
    soft: "hsl(356 78% 62% / 0.12)",
    chip: "linear-gradient(135deg, hsl(356 72% 44%), hsl(346 76% 50%))",
  },
};

function getTrendColor(up: boolean) {
  return up ? MARKET_TREND_COLORS.rise : MARKET_TREND_COLORS.fall;
}

function Sparkline({ city, accent }: { city: string; accent: string }) {
  const d = SPARKLINES[city] ?? SPARKLINES.Athens;
  return (
    <svg width="40" height="20" viewBox="0 0 48 22" fill="none" className="shrink-0">
      <defs>
        <linearGradient id={`spark-${city}-stroke`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
          <stop offset="100%" stopColor={accent} stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d={d} stroke={`url(#spark-${city}-stroke)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Live flicker hook ─────────────────────────────────────────────────────────
function useLiveFlicker(basePrices: Record<string, number>) {
  const [prices, setPrices] = useState<Record<string, number>>(basePrices);
  const [flickeringCity, setFlickeringCity] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cities = Object.keys(basePrices);
    const tick = () => {
      const city = cities[Math.floor(Math.random() * cities.length)];
      const base = basePrices[city];
      const delta = base * (0.0005 + Math.random() * 0.002) * (Math.random() > 0.35 ? 1 : -1);
      setPrices((prev) => ({ ...prev, [city]: Math.round(prev[city] + delta) }));
      setFlickeringCity(city);
      setTimeout(() => setFlickeringCity(null), 700);
      timerRef.current = setTimeout(tick, 2800 + Math.random() * 600);
    };
    timerRef.current = setTimeout(tick, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { prices, flickeringCity };
}

export function MarketTicker() {
  const { data: liveData, isLoading } = usePriceIndex();

  const { data: auctionCount } = useQuery({
    queryKey: ["auction-count-today"],
    queryFn: async () => {
      const { count } = await supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("listing_type", "auction")
        .eq("status", "active");
      return count ?? 47;
    },
    staleTime: 5 * 60 * 1000,
  });

  const baseRows = DISPLAY_CITIES.map((city) => {
    const live = liveData?.find((d) => d.city === city);
    const price = live?.is_live ? live.avg_price_per_sqm : (STATIC_PRICES[city] ?? 0);
    const trend = CITY_CHANGES[city] ?? { change: 1.0, up: true };
    return { city, price, ...trend, isLive: live?.is_live ?? false };
  });

  const basePriceMap = Object.fromEntries(baseRows.map((r) => [r.city, r.price]));
  const { prices: livePrices, flickeringCity } = useLiveFlicker(basePriceMap);
  const rows = baseRows.map((r) => ({ ...r, price: livePrices[r.city] ?? r.price }));

  // Duplicate rows for seamless infinite scroll
  const scrollRows = [...rows, ...rows];

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, hsl(222 30% 7% / 0.80) 0%, hsl(224 28% 6% / 0.76) 52%, hsl(220 24% 8% / 0.72) 100%)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid hsl(0 0% 100% / 0.14)",
        boxShadow:
          "0 0 0 1px hsl(0 0% 100% / 0.04), 0 16px 38px -12px hsl(220 60% 3% / 0.55)",
      }}
    >
      {/* Subtle ambient glow */}
      <div
        className="absolute -inset-px rounded-2xl pointer-events-none"
        style={{ boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.08)" }}
      />

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{
          borderColor: "hsl(0 0% 100% / 0.10)",
          background: "hsl(220 30% 7% / 0.58)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex w-2 h-2 shrink-0">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40"
              style={{ background: MARKET_TREND_COLORS.rise.accent }}
            />
            <span
              className="relative inline-flex rounded-full w-2 h-2"
              style={{ background: MARKET_TREND_COLORS.rise.accent }}
            />
          </span>
          <span
            className="text-[10px] font-black tracking-widest uppercase"
            style={{ color: MARKET_TREND_COLORS.rise.accent }}
          >
            Live Market
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{ background: MARKET_TREND_COLORS.rise.soft, border: `1px solid ${MARKET_TREND_COLORS.rise.accent}` }}
        >
          <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: MARKET_TREND_COLORS.rise.accent }} />
          <span
            className="text-[8px] font-black tracking-widest uppercase"
            style={{ color: MARKET_TREND_COLORS.rise.accent }}
          >
            {isLoading ? "…" : "LIVE"}
          </span>
        </div>
      </div>

      {/* Scrolling city rows — clipped container */}
      <div className="overflow-hidden" style={{ height: "calc(7 * 36px)" }}>
        <div className="ticker-scroll-rows" style={{ animationPlayState: "running" }}>
          {scrollRows.map((row, i) => {
            const isFlickering = flickeringCity === row.city && i < rows.length;
            const trend = getTrendColor(row.up);
            return (
              <div
                key={`${row.city}-${i}`}
                className="flex items-center gap-2.5 px-4 transition-all duration-300"
                style={{
                  height: "36px",
                  background: isFlickering
                    ? trend.soft
                    : `linear-gradient(90deg, ${trend.soft}, hsl(220 28% 7% / 0.50) 54%, hsl(220 24% 8% / 0.40))`,
                  borderBottom: "1px solid hsl(0 0% 100% / 0.07)",
                }}
              >
                <span
                  className="h-4 w-1 rounded-full shrink-0"
                  style={{ background: trend.accent, boxShadow: `0 0 10px ${trend.accent}` }}
                  aria-hidden="true"
                />
                <span
                  className="w-[5.5rem] text-[11px] font-semibold transition-colors duration-300 truncate"
                  style={{ color: isFlickering ? "hsl(0 0% 100%)" : "hsl(220 20% 88%)" }}
                >
                  {row.city}
                </span>

                <Sparkline city={row.city} accent={trend.accent} />

                <span
                  className="flex-1 text-right text-[11px] font-bold tabular-nums transition-colors duration-300"
                  style={{ color: isFlickering ? "hsl(0 0% 100%)" : "hsl(0 0% 96%)" }}
                >
                  €{row.price.toLocaleString()}
                  {!row.isLive && <span className="text-[8px] font-normal ml-0.5 opacity-50">est.</span>}
                </span>

                <span
                  className="w-14 text-right text-[10px] font-black tabular-nums px-1 py-0.5 rounded"
                  style={{
                    color: "hsl(0 0% 100%)",
                    background: trend.chip,
                    border: row.isLive ? "1px solid hsl(0 0% 100% / 0.18)" : "1px solid hsl(0 0% 100% / 0.10)",
                    opacity: row.isLive ? 1 : 0.78,
                  }}
                  title={row.isLive ? "Live market signal" : "Estimated market signal"}
                >
                  {row.up ? "▲" : "▼"} {Math.abs(row.change).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{
          borderTop: "1px solid hsl(0 0% 100% / 0.10)",
          background: "hsl(220 30% 7% / 0.44)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]" aria-hidden="true">•</span>
          <span className="text-[9px] font-black tracking-wider uppercase" style={{ color: "hsl(220 18% 82%)" }}>
            Active Auctions
          </span>
        </div>
        <span
          className="text-[11px] font-black tabular-nums px-1.5 py-0.5 rounded"
          style={{ color: "hsl(0 0% 100%)", background: "hsl(0 0% 100% / 0.10)" }}
        >
          {auctionCount ?? 47}
        </span>
      </div>

      {/* Caption */}
      <div
        className="px-4 pb-2 pt-0.5 text-[8px] tracking-widest uppercase flex items-center gap-1.5"
        style={{ color: "hsl(220 16% 78% / 0.52)" }}
      >
        <span className="w-1 h-1 rounded-full inline-block" style={{ background: "hsl(0 0% 100% / 0.35)" }} />
        €/m² · Greek Real Estate Index
      </div>
    </div>
  );
}
