import { useQuery } from "@tanstack/react-query";
import { fetchPublicApi } from "@/lib/publicApi";

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
  unavailable: {
    accent: "hsl(220 12% 58%)",
    soft: "hsl(220 12% 58% / 0.08)",
    chip: "hsl(220 16% 22%)",
  },
};

type MarketRow = {
  city: string;
  price: number | null;
  priceKind: "observed" | "estimate" | "unavailable";
  trendChange: number | null;
  trendUp: boolean | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildMarketRow(data: unknown, city: string): MarketRow {
  const raw = Array.isArray(data)
    ? data.find((candidate) => isRecord(candidate) && candidate.city === city)
    : undefined;
  if (!isRecord(raw)) {
    return { city, price: null, priceKind: "unavailable", trendChange: null, trendUp: null };
  }

  const listingCount = raw.listing_count;
  const isLive = raw.is_live;
  const price = raw.avg_price_per_sqm;
  const validCount = Number.isSafeInteger(listingCount) && Number(listingCount) >= 0;
  const validPrice =
    validCount &&
    typeof isLive === "boolean" &&
    typeof price === "number" &&
    Number.isFinite(price) &&
    price > 0 &&
    (!isLive || Number(listingCount) > 0);
  const trendChange = raw.trend_change_pct;
  const validTrend =
    raw.trend_is_live === true &&
    typeof trendChange === "number" &&
    Number.isFinite(trendChange);

  return {
    city,
    price: validPrice ? price : null,
    priceKind: validPrice ? (isLive ? "observed" : "estimate") : "unavailable",
    trendChange: validTrend ? trendChange : null,
    trendUp: validTrend ? trendChange >= 0 : null,
  };
}

function getTrendColor(trendUp: boolean | null) {
  if (trendUp == null) return MARKET_TREND_COLORS.unavailable;
  return trendUp ? MARKET_TREND_COLORS.rise : MARKET_TREND_COLORS.fall;
}

function formatPrice(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatAuctionCount(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value.toLocaleString()
    : null;
}

export function MarketTicker() {
  const { data: marketData, isLoading: marketIsLoading } = useQuery({
    queryKey: ["price-index"],
    queryFn: ({ signal }) => fetchPublicApi<unknown>("/api/public/homepage?section=price-index", { signal }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: auctionCount, isLoading: auctionCountIsLoading } = useQuery({
    queryKey: ["auction-count-today"],
    queryFn: ({ signal }) => fetchPublicApi<unknown>("/api/public/homepage?section=auction-count", { signal }),
    staleTime: 5 * 60 * 1000,
  });

  const rows = DISPLAY_CITIES.map((city) => buildMarketRow(marketData, city));
  const scrollRows = [...rows, ...rows];
  const formattedAuctionCount = formatAuctionCount(auctionCount);

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
      <div
        className="absolute -inset-px rounded-2xl pointer-events-none"
        style={{ boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.08)" }}
      />

      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{
          borderColor: "hsl(0 0% 100% / 0.10)",
          background: "hsl(220 30% 7% / 0.58)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="relative inline-flex rounded-full w-2 h-2 shrink-0"
            style={{ background: MARKET_TREND_COLORS.rise.accent }}
          />
          <span
            className="text-[10px] font-black tracking-widest uppercase"
            style={{ color: MARKET_TREND_COLORS.rise.accent }}
          >
            Market data
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{ background: MARKET_TREND_COLORS.rise.soft, border: `1px solid ${MARKET_TREND_COLORS.rise.accent}` }}
        >
          <span className="w-1 h-1 rounded-full" style={{ background: MARKET_TREND_COLORS.rise.accent }} />
          <span
            className="text-[8px] font-black tracking-widest uppercase"
            style={{ color: MARKET_TREND_COLORS.rise.accent }}
          >
            {marketIsLoading ? "…" : "Latest available"}
          </span>
        </div>
      </div>

      <div className="overflow-hidden" style={{ height: "calc(7 * 36px)" }}>
        <div className="ticker-scroll-rows" style={{ animationPlayState: "running" }}>
          {scrollRows.map((row, index) => {
            const trend = getTrendColor(row.trendUp);
            return (
              <div
                key={`${row.city}-${index}`}
                data-market-row
                className="flex items-center gap-2.5 px-4 transition-all duration-300"
                style={{
                  height: "36px",
                  background: `linear-gradient(90deg, ${trend.soft}, hsl(220 28% 7% / 0.50) 54%, hsl(220 24% 8% / 0.40))`,
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
                  style={{ color: "hsl(220 20% 88%)" }}
                >
                  {row.city}
                </span>

                <span className="w-10 text-center text-[8px] uppercase tracking-wide" style={{ color: "hsl(220 16% 66%)" }}>
                  {row.priceKind === "observed" ? "Observed" : row.priceKind === "estimate" ? "Estimate" : "—"}
                </span>

                <span
                  className="flex-1 text-right text-[11px] font-bold tabular-nums transition-colors duration-300"
                  style={{ color: "hsl(0 0% 96%)" }}
                >
                  {row.price == null ? "Unavailable" : `€${formatPrice(row.price)}`}
                </span>

                <span
                  className="w-16 text-right text-[10px] font-black tabular-nums px-1 py-0.5 rounded"
                  style={{
                    color: "hsl(0 0% 100%)",
                    background: trend.chip,
                    border: "1px solid hsl(0 0% 100% / 0.12)",
                    opacity: row.trendChange == null ? 0.7 : 1,
                  }}
                  title={row.trendChange == null ? "Trend unavailable" : "Observed trend from recent listings"}
                >
                  {row.trendChange == null
                    ? "Unavailable"
                    : `${row.trendUp ? "▲" : "▼"} ${Math.abs(row.trendChange).toFixed(1)}%`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

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
          {auctionCountIsLoading ? "…" : formattedAuctionCount ?? "Unavailable"}
        </span>
      </div>

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
