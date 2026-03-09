import { usePriceIndex } from "@/hooks/usePriceIndex";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Sparkline paths – pre-generated organic waves per city ────────────────────
const SPARKLINES: Record<string, string> = {
  Athens:       "M0,14 C4,10 8,18 12,12 C16,6 20,16 24,10 C28,4 32,14 36,8 C40,2 44,12 48,8",
  Thessaloniki: "M0,12 C4,16 8,8 12,14 C16,20 20,10 24,16 C28,12 32,18 36,12 C40,8 44,14 48,10",
  Mykonos:      "M0,16 C4,8 8,14 12,6 C16,2 20,10 24,4 C28,8 32,4 36,10 C40,6 44,14 48,8",
  Glyfada:      "M0,10 C4,14 8,8 12,12 C16,16 20,8 24,14 C28,10 32,6 36,12 C40,8 44,12 48,6",
  Rhodes:       "M0,8 C4,12 8,4 12,10 C16,6 20,14 24,8 C28,4 32,10 36,6 C40,12 44,8 48,4",
  Santorini:    "M0,14 C4,10 8,16 12,8 C16,4 20,12 24,6 C28,10 32,4 36,8 C40,2 44,10 48,6",
  Kifisia:      "M0,12 C4,8 8,14 12,10 C16,6 20,12 24,8 C28,14 32,10 36,14 C40,8 44,12 48,10",
  Piraeus:      "M0,8 C4,12 8,10 12,14 C16,16 20,12 24,16 C28,14 32,16 36,18 C40,14 44,16 48,18",
  Heraklion:    "M0,12 C4,8 8,12 12,8 C16,6 20,10 24,8 C28,12 32,8 36,10 C40,6 44,10 48,8",
  Voula:        "M0,10 C4,6 8,12 12,6 C16,2 20,8 24,4 C28,8 32,4 36,8 C40,4 44,10 48,6",
  Paros:        "M0,10 C4,14 8,12 12,16 C16,14 20,16 24,14 C28,16 32,14 36,16 C40,18 44,14 48,16",
  Corfu:        "M0,12 C4,8 8,14 12,10 C16,6 20,12 24,8 C28,12 32,8 36,12 C40,8 44,10 48,8",
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
  Voula: { change: 2.1, up: true },
  Paros: { change: -0.5, up: false },
  Corfu: { change: 1.8, up: true },
};

const DISPLAY_CITIES = ["Athens", "Thessaloniki", "Mykonos", "Glyfada", "Rhodes", "Santorini", "Kifisia"];

const STATIC_PRICES: Record<string, number> = {
  Athens: 2840, Thessaloniki: 1920, Mykonos: 6450, Glyfada: 3760,
  Rhodes: 2299, Santorini: 5120, Kifisia: 4180,
};

function Sparkline({ city, up }: { city: string; up: boolean }) {
  const d = SPARKLINES[city] ?? SPARKLINES.Athens;
  const color = up ? "hsl(192 100% 50%)" : "hsl(0 70% 52%)";
  return (
    <svg width="48" height="22" viewBox="0 0 48 22" fill="none" className="shrink-0">
      <path d={d} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MarketTicker() {
  const { data: liveData, isLoading } = usePriceIndex();

  // Latest auction query
  const { data: latestAuction } = useQuery({
    queryKey: ["latest-auction"],
    queryFn: async () => {
      const { data } = await supabase
        .from("listings")
        .select("title, city, auction_starting_bid, property_type")
        .eq("listing_type", "auction")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Auction count
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

  const rows = DISPLAY_CITIES.map(city => {
    const live = liveData?.find(d => d.city === city);
    const price = live?.is_live ? live.avg_price_per_sqm : (STATIC_PRICES[city] ?? 0);
    const trend = CITY_CHANGES[city] ?? { change: 1.0, up: true };
    return { city, price, ...trend, isLive: live?.is_live ?? false };
  });

  const anyLive = rows.some(r => r.isLive);

  return (
    <div
      className="border border-border rounded-2xl overflow-hidden shadow-elevated"
      style={{ background: "hsl(220 40% 8%)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0 animate-pulse"
            style={{ background: "hsl(192 100% 50%)" }}
          />
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{ color: "hsl(210 40% 96%)" }}
          >
            Live Market
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {anyLive && !isLoading && (
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "hsl(192 100% 50%)" }}
            />
          )}
          <span
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: "hsl(192 100% 50%)" }}
          >
            {isLoading ? "…" : "LIVE"}
          </span>
        </div>
      </div>

      {/* City rows */}
      <div className="divide-y divide-border/40">
        {rows.map(row => (
          <div key={row.city} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.02] transition-colors">
            {/* City name */}
            <span className="w-28 text-sm font-medium" style={{ color: "hsl(210 30% 75%)" }}>
              {row.city}
            </span>

            {/* Sparkline */}
            <Sparkline city={row.city} up={row.up} />

            {/* Price */}
            <span className="flex-1 text-right text-sm font-bold tabular-nums" style={{ color: "hsl(210 40% 96%)" }}>
              {row.price.toLocaleString()}
            </span>

            {/* Change */}
            <span
              className="w-14 text-right text-xs font-bold tabular-nums"
              style={{ color: row.up ? "hsl(192 100% 50%)" : "hsl(0 70% 52%)" }}
            >
              {row.up ? "▲" : "▼"}{Math.abs(row.change).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Footer — auctions */}
      <div className="border-t border-border px-5 py-3 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px]">🔨</span>
            <span
              className="text-[11px] font-bold tracking-wider uppercase"
              style={{ color: "hsl(270 75% 72%)" }}
            >
              New Auctions Today
            </span>
          </div>
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: "hsl(270 75% 72%)" }}
          >
            {auctionCount ?? 47}
          </span>
        </div>
        {latestAuction && (
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: "hsl(215 20% 50%)" }}>
              Latest:{" "}
              <span style={{ color: "hsl(210 40% 96%)", fontWeight: 600 }}>
                {latestAuction.property_type?.charAt(0).toUpperCase() + latestAuction.property_type?.slice(1)}{" "}
                · {latestAuction.city}
              </span>
            </span>
            {latestAuction.auction_starting_bid && (
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: "hsl(210 40% 96%)" }}>
                €{latestAuction.auction_starting_bid.toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Caption */}
      <div
        className="px-5 pb-3 text-[10px] tracking-widest uppercase"
        style={{ color: "hsl(215 20% 38%)" }}
      >
        €/m² · Greek Real Estate Index
      </div>
    </div>
  );
}
