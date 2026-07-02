/**
 * AuctionBidHistory
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows comparable sales near an auction listing by calling the
 * os-sales-coordinates Supabase edge function, which proxies the OS API and
 * fails closed when OS is unavailable or not configured over HTTPS.
 *
 * Props: lat, lng, listingId, title
 */

import { useState } from "react";
import { formatDate as fmtDate } from "@/lib/format";
import {
  TrendingUp,
  Clock,
  BarChart3,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RefreshCw,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculatePricePerSqm } from "@/lib/priceCalculations";
import { Badge } from "@/components/ui/badge";
import { useAuctionBidHistory, type SaleRecord } from "@/hooks/useAuctionBidHistory";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const RADIUS_OPTIONS = [0.5, 1, 1.5, 2, 5] as const;
type RadiusKm = (typeof RADIUS_OPTIONS)[number];


// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  lat?: number;
  /** Accepts both `lng` (new) and `lon` (legacy) */
  lng?: number;
  lon?: number;
  listingId?: string;
  title?: string;
  sqm?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}


function ppm(sale: SaleRecord): number {
  return calculatePricePerSqm({ price: sale.sale_price, sqm: sale.sqm }) ?? 0;
}

function medianOf(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function isWithinLastYear(isoDate: string): boolean {
  return new Date(isoDate).getTime() >= Date.now() - 365 * 24 * 3600 * 1000;
}

function propertyTypeLabel(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function sourceLabel(source: string): string {
  return source === "court_auction" ? "Property Auction" : "Private Sale";
}

function typeBadgeVariant(
  type: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (type) {
    case "apartment":
      return "default";
    case "house":
      return "secondary";
    case "commercial":
      return "outline";
    default:
      return "outline";
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function DeltaBadge({
  subjectPpm,
  medianPpm,
}: {
  subjectPpm: number | null;
  medianPpm: number;
}) {
  if (!subjectPpm || medianPpm === 0) return null;
  const pct = ((subjectPpm - medianPpm) / medianPpm) * 100;
  const abs = Math.abs(pct).toFixed(1);

  if (Math.abs(pct) < 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-muted text-muted-foreground border border-border">
        <Minus className="w-3 h-3" /> At market median
      </span>
    );
  }

  if (pct > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
        <ArrowUpRight className="w-3 h-3" /> {abs}% above median
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
      <ArrowDownRight className="w-3 h-3" /> {abs}% below median
    </span>
  );
}

function SkeletonTable() {
  return (
    <div className="divide-y divide-border">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="px-4 py-3 animate-pulse flex gap-4">
          <div className="h-4 w-48 bg-muted rounded" />
          <div className="h-4 w-16 bg-muted rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AuctionBidHistory({ lat, lng, lon, listingId: _listingId, title, sqm }: Props) {
  const resolvedLng = lng ?? lon;
  const [radius, setRadius] = useState<RadiusKm>(1.5);

  const { data: result, isLoading, isError, refetch, isFetching } = useAuctionBidHistory(
    lat,
    resolvedLng,
    radius,
  );

  const isMock = result?.dataSource === "mock";
  const showOsError = isError && !isLoading;
  const showLegacyOsErrorFallback = false;
  const sales = result?.sales ?? [];
  const soldSales = sales.filter((s) => s.status === "sold");

  // Stats
  const ppmValues = soldSales.filter((s) => s.sqm > 0).map(ppm);
  const medianPpm = medianOf(ppmValues);
  const avgDom = soldSales.length > 0
    ? Math.round(soldSales.reduce((s, r) => s + (r.days_on_market ?? 0), 0) / soldSales.length)
    : null;
  const salesLastYear = sales.filter((s) => isWithinLastYear(s.sale_date)).length;
  const subjectPpm = sqm ? medianPpm : null;
  const avgDiscount =
    soldSales.length > 0
      ? Math.round(
          soldSales.reduce((s, r) => s + r.discount_pct, 0) / soldSales.length,
        )
      : 0;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary shrink-0" />
          <h3 className="font-semibold text-foreground">
            {title ?? "Comparable Sales"}
          </h3>
          <Badge variant="outline" className="text-xs gap-1">
            <MapPin className="w-3 h-3" />
            {radius} km radius
          </Badge>
          {isFetching && !isLoading && (
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Radius:</span>
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRadius(r);
                void refetch();
              }}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                radius === r
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {r}km
            </button>
          ))}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Refresh bid history"
            className="h-7 w-7"
            onClick={() => void refetch()}
            disabled={isLoading || isFetching}
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5", (isLoading || isFetching) && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {/* Mock data notice */}
      {isMock && !isLoading && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Sample data — connect to OS for live results.</span>
        </div>
      )}

      {/* Hard error (shouldn't happen — edge fn returns mock on failure) */}
      {showOsError && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          OS comparable sales are unavailable. Refresh after the OS connection is restored.
        </div>
      )}

      {showLegacyOsErrorFallback && showOsError && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          OS API unavailable — showing representative Athens market data.
        </div>
      )}

      {/* Summary cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryCard
            icon={TrendingUp}
            label="Median price / m²"
            value={medianPpm > 0 ? `${fmtEur(medianPpm)}/m²` : "—"}
            sub="Sold comparables"
          />
          {avgDom !== null ? (
            <SummaryCard
              icon={Clock}
              label="Avg days on market"
              value={`${avgDom} days`}
              sub="Sold comparables"
            />
          ) : (
            <SummaryCard
              icon={Clock}
              label="Avg discount"
              value={avgDiscount > 0 ? `${avgDiscount}%` : "—"}
              sub="Sold comparables"
            />
          )}
          <SummaryCard
            icon={BarChart3}
            label="Sales (last 12 mo)"
            value={String(salesLastYear)}
            sub={`Within ${radius} km radius`}
          />
        </div>
      )}

      {/* Subject vs market */}
      {sqm && !isLoading && medianPpm > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">This property:</span>
          <DeltaBadge subjectPpm={subjectPpm} medianPpm={medianPpm} />
        </div>
      )}


      {/* Sales table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 flex items-center gap-2 border-b border-border">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Recent comparable sales
          </span>
        </div>

        {isLoading ? (
          <SkeletonTable />
        ) : sales.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted-foreground text-sm">
            No comparable sales found within {radius} km.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 text-xs text-muted-foreground border-b border-border">
                  <th className="text-left px-4 py-2.5 font-medium">Address</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Type</th>
                  <th className="text-right px-4 py-2.5 font-medium">Sale price</th>
                  <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell">Asking</th>
                  <th className="text-center px-4 py-2.5 font-medium hidden md:table-cell">Disc.</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">Date</th>
                  <th className="text-center px-4 py-2.5 font-medium hidden lg:table-cell">Round</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden xl:table-cell">Source</th>
                  <th className="text-right px-4 py-2.5 font-medium hidden sm:table-cell">vs median</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sales.map((s) => {
                  const ppmVal = ppm(s);
                  const delta =
                    medianPpm > 0
                      ? ((ppmVal - medianPpm) / medianPpm) * 100
                      : 0;

                  return (
                    <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                      {/* Address */}
                      <td
                        className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate"
                        title={s.address}
                      >
                        {s.address}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge
                          variant={typeBadgeVariant(s.property_type)}
                          className="text-xs whitespace-nowrap"
                        >
                          {propertyTypeLabel(s.property_type)}
                        </Badge>
                      </td>

                      {/* Sale Price */}
                      <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400 tabular-nums whitespace-nowrap">
                        {fmtEur(s.sale_price)}
                      </td>

                      {/* Asking Price */}
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs tabular-nums whitespace-nowrap hidden md:table-cell">
                        {fmtEur(s.asking_price)}
                      </td>

                      {/* Discount */}
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        {s.discount_pct > 5 ? (
                          <Badge variant="destructive" className="text-xs tabular-nums">
                            -{s.discount_pct}%
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {s.discount_pct > 0 ? `-${s.discount_pct}%` : "—"}
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell whitespace-nowrap">
                        {fmtDate(s.sale_date)}
                      </td>

                      {/* Round */}
                      <td className="px-4 py-3 text-center hidden lg:table-cell">
                        {s.source === "court_auction" ? (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center rounded-full text-xs font-medium w-6 h-6",
                              s.round === 1
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                : s.round === 2
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
                            )}
                            title={`Round ${s.round}`}
                          >
                            {s.round}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <Badge
                          variant={s.source === "court_auction" ? "secondary" : "outline"}
                          className="text-xs whitespace-nowrap"
                        >
                          {sourceLabel(s.source)}
                        </Badge>
                      </td>

                      {/* vs median */}
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        {medianPpm > 0 && ppmVal > 0 ? (
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              delta > 2
                                ? "text-red-500"
                                : delta < -2
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground",
                            )}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuctionBidHistory;
