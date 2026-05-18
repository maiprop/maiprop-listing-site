import { Suspense, useState } from "react";
import {
  BarChart2, Building2, Eye, TrendingUp, Star,
  MessageSquare, Calendar, Percent, Clock,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ChartFallback,
} from "@/components/charts/LazyRecharts";
import { Button } from "@/components/ui/button";
import { ProGate } from "@/components/gates/ProGate";
import { useAuth } from "@/contexts/AuthContext";
import { useMyListings } from "@/hooks/useListings";
import { useListingViewTrends, useLeadFunnel } from "@/hooks/useAnalytics";
import { useMyProfessional } from "@/hooks/useProfessionalServices";
import { useConversations } from "@/hooks/useMessages";
import { useViewings } from "@/hooks/useViewings";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";

// ── Date range options ────────────────────────────────────────────────────────────
const DATE_RANGES: { label: string; days: number }[] = [
  { label: "7d",  days: 7  },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

// ── Skeleton helpers ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return <div className="animate-pulse bg-muted rounded-lg h-24" />;
}

function SkeletonRow() {
  return <div className="animate-pulse bg-muted rounded-lg h-12" />;
}

// ── Funnel bar colours ────────────────────────────────────────────────────────────
const FUNNEL_COLORS: Record<string, string> = {
  pending:   "hsl(var(--warning, 45 96% 53%))",
  reviewed:  "hsl(var(--primary))",
  confirmed: "hsl(var(--success, 142 71% 45%))",
  cancelled: "hsl(var(--muted-foreground))",
};


// ── Main component ────────────────────────────────────────────────────────────────
export default function AnalyticsTab() {
  const { profile } = useAuth();
  const participantType = getParticipantTypeFromProfile(profile);
  const isBuyer = participantType === "buyer";

  return (
    <ProGate>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" />
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isBuyer
              ? "Track your activity on the platform."
              : participantType === "professional"
              ? "Visibility, lead funnel & conversion KPIs."
              : "Listing performance & view trends."}
          </p>
        </div>

        {isBuyer ? (
          <BuyerPlaceholder />
        ) : (
          <SellerAgentAnalytics participantType={participantType} />
        )}
      </div>
    </ProGate>
  );
}

// ── Buyer placeholder ─────────────────────────────────────────────────────────────
function BuyerPlaceholder() {
  return (
    <div className="bg-card border border-border rounded-xl p-10 text-center">
      <BarChart2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="font-semibold">Analytics are available for sellers and agents</p>
      <p className="text-sm text-muted-foreground mt-1">
        Create a listing or upgrade your account type to unlock analytics.
      </p>
    </div>
  );
}

// ── Seller / Agent / Developer / Professional analytics ───────────────────────────
function SellerAgentAnalytics({ participantType }: { participantType: string }) {
  const [selectedDays, setSelectedDays] = useState(14);

  const { data: myListings = [], isLoading: listingsLoading } = useMyListings();
  const { data: myProfessional, isLoading: profLoading } = useMyProfessional();
  const { data: conversations = [] } = useConversations();
  const { data: viewings = [] } = useViewings("owner");

  const listingIds: string[] = myListings
    .map((l: { id?: string }) => l.id)
    .filter((id): id is string => typeof id === "string");

  const { data: viewTrends = [], isLoading: trendsLoading } = useListingViewTrends(listingIds, selectedDays);
  const { data: leadFunnel, isLoading: funnelLoading } = useLeadFunnel(myProfessional?.id);

  const isProfessional = participantType === "professional";
  const isLoading = listingsLoading || trendsLoading || (isProfessional && (profLoading || funnelLoading));

  // ── Derived metrics ────────────────────────────────────────────────────────────
  const totalViews = myListings.reduce((s: number, l: { views_count?: number }) => s + (l.views_count || 0), 0);
  const totalListings = myListings.length;
  const avgViews = totalListings > 0 ? Math.round(totalViews / totalListings) : 0;
  const bestListing = [...myListings]
    .sort((a: { views_count?: number }, b: { views_count?: number }) => (b.views_count || 0) - (a.views_count || 0))[0];

  const messagesReceived = conversations.length;
  const viewingRequests = viewings.length;
  const enquiryRate = totalViews > 0 ? ((viewingRequests / totalViews) * 100).toFixed(1) : "0.0";

  // Avg days listed — approximate from created_at if available
  const avgDaysListed = (() => {
    const now = Date.now();
    const listings = myListings as Array<{ created_at?: string; status?: string }>;
    const active = listings.filter(
      (l): l is { created_at: string; status?: string } => l.status === "active" && Boolean(l.created_at),
    );
    if (active.length === 0) return 0;
    const totalMs = active.reduce((s, l) => s + (now - new Date(l.created_at).getTime()), 0);
    return Math.round(totalMs / active.length / 86_400_000);
  })();

  // Chart data — fill gaps so every day in the window appears
  const chartData = buildChartData(viewTrends as { date: string; count: number }[], selectedDays);
  const hasViewData = chartData.some((d) => d.count > 0);

  // Enquiries chart — built from real viewings data only
  const hasEnquiryData = viewingRequests > 0;

  // Listings sorted by views desc for the performance table
  const sortedListings = [...myListings].sort(
    (a: { views_count?: number }, b: { views_count?: number }) => (b.views_count || 0) - (a.views_count || 0)
  );

  // Funnel bar data for recharts BarChart
  const funnelBars = leadFunnel
    ? [
        { label: "Pending",   value: leadFunnel.pending,   key: "pending" },
        { label: "Reviewed",  value: leadFunnel.reviewed,  key: "reviewed" },
        { label: "Confirmed", value: leadFunnel.confirmed, key: "confirmed" },
        { label: "Cancelled", value: leadFunnel.cancelled, key: "cancelled" },
      ]
    : [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
        <div className="animate-pulse bg-muted rounded-xl h-48" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Date range selector ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide mr-1">Period:</span>
        {DATE_RANGES.map((range) => (
          <button
            key={range.days}
            onClick={() => setSelectedDays(range.days)}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors border ${
              selectedDays === range.days
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* ── Summary cards — row 1: existing ────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Eye className="w-4 h-4 text-primary" />}
          label={`Total views (${selectedDays}d)`}
          value={viewTrends.reduce((s, t) => s + t.count, 0).toString()}
        />
        <SummaryCard
          icon={<Building2 className="w-4 h-4 text-primary" />}
          label="Total listings"
          value={totalListings.toString()}
        />
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4 text-primary" />}
          label="Avg views / listing"
          value={avgViews.toString()}
        />
        <SummaryCard
          icon={<Star className="w-4 h-4 text-primary" />}
          label="Best performing"
          value={bestListing?.title ?? "—"}
          small
        />
      </div>

      {/* ── Summary cards — row 2: new metrics ─────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<MessageSquare className="w-4 h-4 text-blue-500" />}
          label="Messages received"
          value={messagesReceived.toString()}
        />
        <SummaryCard
          icon={<Calendar className="w-4 h-4 text-violet-500" />}
          label="Viewing requests"
          value={viewingRequests.toString()}
        />
        <SummaryCard
          icon={<Percent className="w-4 h-4 text-emerald-500" />}
          label="Enquiry rate"
          value={`${enquiryRate}%`}
        />
        <SummaryCard
          icon={<Clock className="w-4 h-4 text-amber-500" />}
          label="Avg days listed"
          value={avgDaysListed > 0 ? `${avgDaysListed}d` : "—"}
        />
      </div>

      {/* ── Area chart: property views ──────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-display font-semibold mb-4">
          Property views – last {selectedDays} days
        </h2>
        {hasViewData ? (
          <Suspense fallback={<ChartFallback height={180} />}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="viewGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval={selectedDays > 14 ? Math.floor(selectedDays / 7) : 0}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#viewGradient)"
                dot={false}
              />
              </AreaChart>
            </ResponsiveContainer>
          </Suspense>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Eye className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-muted-foreground">
              No view data yet — views will appear once your listings receive traffic.
            </p>
          </div>
        )}
      </div>

      {/* ── Bar chart: enquiries over time ──────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-display font-semibold mb-4">
          Viewing requests over time
        </h2>
        {hasEnquiryData ? (
          (() => {
            const enquiriesData = buildEnquiriesData(
              viewings as Array<{ created_at?: string }>,
              Math.min(selectedDays, 30),
            );
            return (
              <Suspense fallback={<ChartFallback height={160} />}>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={enquiriesData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.floor(enquiriesData.length / 6)}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="enquiries" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </Suspense>
            );
          })()
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Calendar className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-muted-foreground">
              No viewing requests yet — requests will appear here once buyers enquire.
            </p>
          </div>
        )}
      </div>

      {/* ── Listings performance table ──────────────────────────────────── */}
      {sortedListings.length > 0 ? (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-display font-semibold mb-4">Listings performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-4 font-medium">Title</th>
                  <th className="pb-2 pr-4 font-medium">City</th>
                  <th className="pb-2 pr-4 font-medium text-right">Views</th>
                  <th className="pb-2 pr-4 font-medium text-right">Enquiries</th>
                  <th className="pb-2 pr-4 font-medium text-right">CTR</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedListings.map((l: {
                  id?: string;
                  title?: string;
                  city?: string;
                  views_count?: number;
                  status?: string;
                }, _idx: number) => {
                  const views = l.views_count ?? 0;
                  const listingEnquiries =
                    viewingRequests > 0 && totalViews > 0
                      ? Math.round((views / totalViews) * viewingRequests)
                      : null;
                  const ctr =
                    views > 0 && listingEnquiries !== null
                      ? ((listingEnquiries / views) * 100).toFixed(1)
                      : "—";
                  return (
                    <tr key={l.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4 font-medium truncate max-w-[180px]">{l.title ?? "—"}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{l.city ?? "—"}</td>
                      <td className="py-3 pr-4 text-right font-display font-bold text-primary">{views}</td>
                      <td className="py-3 pr-4 text-right">{listingEnquiries ?? "—"}</td>
                      <td className="py-3 pr-4 text-right text-muted-foreground">
                        {ctr === "—" ? "—" : `${ctr}%`}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={l.status ?? "unknown"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <BarChart2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No listing data yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create listings to see performance analytics here.
          </p>
          <Button variant="outline" className="border-border mt-4" asChild>
            <Link to="/listings/new">Create Listing</Link>
          </Button>
        </div>
      )}

      {/* ── Inquiry funnel (professionals) ─────────────────────────────── */}
      {isProfessional && leadFunnel && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold">Inquiry funnel</h2>
            <span className="text-sm text-muted-foreground">
              Conversion rate:{" "}
              <span className="font-bold text-primary">{leadFunnel.conversionRate ?? 0}%</span>
            </span>
          </div>
          {leadFunnel.total === 0 ? (
            <p className="text-sm text-muted-foreground">No consultation requests yet.</p>
          ) : (
            <Suspense fallback={<ChartFallback height={140} />}>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                data={funnelBars}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={72}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "hsl(var(--muted))" }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {funnelBars.map((entry) => (
                    <Cell key={entry.key} fill={FUNNEL_COLORS[entry.key] ?? "hsl(var(--primary))"} />
                  ))}
                </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Suspense>
          )}
        </div>
      )}

    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────────
function SummaryCard({
  icon,
  label,
  value,
  small = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p
        className={`font-display font-bold truncate ${
          small ? "text-base leading-tight" : "text-2xl"
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:  "bg-green-500/15 text-green-600 dark:text-green-400",
    pending: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    sold:    "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    rented:  "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    expired: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
        map[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

// ── Chart data helpers ────────────────────────────────────────────────────────────
function buildChartData(
  trends: { date: string; count: number }[],
  days: number,
): { date: string; label: string; count: number }[] {
  const byDate = Object.fromEntries(trends.map((t) => [t.date, t.count]));
  const result: { date: string; label: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    result.push({ date: iso, label, count: byDate[iso] ?? 0 });
  }
  return result;
}

/** Builds a per-day enquiries histogram from real viewings data */
function buildEnquiriesData(
  viewings: Array<{ created_at?: string }>,
  days: number,
): { label: string; enquiries: number }[] {
  const byDate: Record<string, number> = {};
  for (const v of viewings) {
    if (!v.created_at) continue;
    const iso = v.created_at.slice(0, 10);
    byDate[iso] = (byDate[iso] ?? 0) + 1;
  }
  const result: { label: string; enquiries: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    result.push({ label, enquiries: byDate[iso] ?? 0 });
  }
  return result;
}
