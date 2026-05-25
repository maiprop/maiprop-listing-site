/**
 * OpenHouseAnalytics — per-listing open house performance dashboard.
 * Shows KPIs, conversion funnel, timeslot utilization, and mortgage status breakdown.
 */

import { Suspense, useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ChartFallback,
} from "@/components/charts/LazyRecharts";
import { Users, CheckCircle, TrendingUp, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────────
type Registration = {
  id: string;
  listing_id: string;
  timeslot_index: number | null;
  status: string | null;           // pending | approved | attended | cancelled
  mortgage_status: string | null;  // yes | no | exploring
  created_at: string;
};

type Offer = {
  id: string;
  listing_id: string;
  created_at: string;
};

type OHTimeslot = {
  start: string;
  end: string;
  max_visitors: number;
};

type KpiData = {
  registered: number;
  approved: number;
  attended: number;
  offers: number;
  conversion: number;
};

type TimeslotUtil = {
  index: number;
  label: string;
  registered: number;
  max_visitors: number;
};

type MortgageDist = { name: string; value: number; color: string };


const MORTGAGE_COLORS: Record<string, string> = {
  yes:       "#22c55e",
  no:        "#ef4444",
  exploring: "#f59e0b",
  unknown:   "#94a3b8",
};

// ── Component ─────────────────────────────────────────────────────────────────────
export default function OpenHouseAnalytics({ listingId }: { listingId: string }) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [timeslots, setTimeslots] = useState<OHTimeslot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!listingId) return;
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const [regRes, offerRes, settingsRes] = await Promise.all([
          supabase
            .from("open_house_registrations")
            .select("id, listing_id, timeslot_index, status, mortgage_status, created_at")
            .eq("listing_id", listingId),
          supabase
            .from("open_house_offers")
            .select("id, listing_id, created_at")
            .eq("listing_id", listingId),
          supabase
            .from("open_house_settings")
            .select("timeslots")
            .eq("listing_id", listingId)
            .maybeSingle(),
        ]);

        if (!mounted) return;

        const regs = (regRes.data as Registration[] | null) ?? [];
        const offs = (offerRes.data as Offer[] | null) ?? [];
        const rawSlots = ((settingsRes.data as { timeslots?: OHTimeslot[] } | null)?.timeslots ?? []) as OHTimeslot[];

        setRegistrations(regs);
        setOffers(offs);
        setTimeslots(rawSlots);
      } catch (_err: unknown) {
        // leave state empty — UI shows empty state below
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [listingId]);

  // ── Derived KPIs ───────────────────────────────────────────────────────────────
  const attended = registrations.filter((r) => r.status === "attended").length;
  const approved = registrations.filter((r) => r.status === "approved" || r.status === "attended").length;
  const kpi: KpiData = {
    registered: registrations.length,
    approved,
    attended,
    offers: offers.length,
    conversion: attended > 0 ? Math.round((offers.length / attended) * 1000) / 10 : 0,
  };

  // ── Funnel data ────────────────────────────────────────────────────────────────
  const funnelData = [
    { stage: "Registered", value: kpi.registered },
    { stage: "Approved",   value: kpi.approved },
    { stage: "Attended",   value: kpi.attended },
    { stage: "Offer",      value: kpi.offers },
  ];

  // ── Timeslot utilization ───────────────────────────────────────────────────────
  const timeslotUtil: TimeslotUtil[] = timeslots.map((slot, index) => ({
    index,
    label: `${slot.start} – ${slot.end}`,
    max_visitors: slot.max_visitors,
    registered: registrations.filter((r) => r.timeslot_index === index).length,
  }));

  // ── Mortgage distribution ──────────────────────────────────────────────────────
  const mortgageDist: MortgageDist[] = (() => {
    const counts: Record<string, number> = {};
    registrations.forEach((r) => {
      const key = r.mortgage_status ?? "unknown";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name === "yes" ? "Pre-approved / Funds" : name === "no" ? "Not yet" : name === "exploring" ? "Exploring" : name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: MORTGAGE_COLORS[name] ?? "#94a3b8",
    }));
  })();

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-muted rounded-xl h-24" />
        ))}
      </div>
    );
  }

  if (!loading && registrations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="font-semibold text-sm">No registrations yet</p>
        <p className="text-xs text-muted-foreground mt-1">Analytics will appear once visitors register for this open house.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── KPI cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<Users className="w-4 h-4 text-blue-500" />}
          label="Total Registered"
          value={kpi.registered.toString()}
          color="blue"
        />
        <KpiCard
          icon={<CheckCircle className="w-4 h-4 text-emerald-500" />}
          label="Attended"
          value={kpi.attended.toString()}
          color="emerald"
        />
        <KpiCard
          icon={<FileText className="w-4 h-4 text-violet-500" />}
          label="Offers Submitted"
          value={kpi.offers.toString()}
          color="violet"
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
          label="Conversion Rate"
          value={`${kpi.conversion}%`}
          sub="attended → offer"
          color="amber"
        />
      </div>

      {/* ── Conversion funnel ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-display">Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<ChartFallback height={160} />}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
              data={funnelData}
              layout="vertical"
              margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="stage"
                width={80}
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
                {funnelData.map((_entry, i) => {
                  const colors = [
                    "hsl(var(--primary))",
                    "#22c55e",
                    "#f59e0b",
                    "#8b5cf6",
                  ];
                  return <Cell key={i} fill={colors[i] ?? "hsl(var(--primary))"} />;
                })}
              </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Suspense>
        </CardContent>
      </Card>

      {/* ── Timeslot utilization ───────────────────────────────────────── */}
      {timeslotUtil.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display">Timeslot Utilization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {timeslotUtil.map((slot) => {
              const pct = slot.max_visitors > 0
                ? Math.min(100, Math.round((slot.registered / slot.max_visitors) * 100))
                : 0;
              const barColor =
                pct >= 90 ? "bg-emerald-500" :
                pct >= 60 ? "bg-amber-500" :
                "bg-primary";
              return (
                <div key={slot.index} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{slot.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {slot.registered} / {slot.max_visitors} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", barColor)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Mortgage status breakdown ──────────────────────────────────── */}
      {mortgageDist.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display">Attendee Pre-qualification</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ChartFallback height={200} />}>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                <Pie
                  data={mortgageDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {mortgageDist.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                      {value}
                    </span>
                  )}
                />
                </PieChart>
              </ResponsiveContainer>
            </Suspense>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── KPI card sub-component ────────────────────────────────────────────────────────
function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: "blue" | "emerald" | "violet" | "amber";
}) {
  const ringClass: Record<typeof color, string> = {
    blue:    "ring-blue-500/20",
    emerald: "ring-emerald-500/20",
    violet:  "ring-violet-500/20",
    amber:   "ring-amber-500/20",
  };
  return (
    <div className={cn(
      "bg-card border border-border rounded-xl p-5 ring-1",
      ringClass[color],
    )}>
      <div className="flex items-center gap-2 mb-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="font-display font-bold text-2xl">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
