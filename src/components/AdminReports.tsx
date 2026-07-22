/**
 * AdminReports — Platform analytics dashboard for admins.
 *
 * Tab 1: Platform Overview — KPI cards, monthly listing chart, CSV export.
 * Tab 2: Content Reports  — listing_reports table with status filter & resolve action.
 */

import { Suspense, useState } from "react";
import {
  Building2, Users, Flame, DoorOpen, Flag, ExternalLink,
  Download, Loader2, CheckCircle, TrendingUp, PauseCircle, Ban,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ChartFallback,
} from "@/components/charts/LazyRecharts";
import { adminContentReportActionSchema, parseMutationInput } from "@/lib/mutationSchemas";

// ── Types ─────────────────────────────────────────────────────────────────────────
type ReportStatus = "pending" | "resolved";

type ReportRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  reporter_id: string | null;
  created_at: string;
  status: ReportStatus;
};

type MonthlyBar = { label: string; count: number };

type PlatformStats = {
  totalListings: number;
  activeListings: number;
  totalUsers: number;
  newUsersMonth: number;
  firesaleRequests: number;
  openHouses: number;
  monthlyListings: MonthlyBar[];
};

type Tab = "overview" | "reports";
type ReportFilter = "all" | "pending" | "resolved";

type ModerationAction = "suspend_listing" | "ban_owner";
type PendingModeration = { action: ModerationAction; report: ReportRow } | null;

type AdminReportActionPayload = {
  action: "resolve" | ModerationAction;
  reportId: string;
  reason?: string;
};

type AdminReportActionResponse = {
  data?: unknown;
  error?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────────
function firstOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function downloadCsv(stats: PlatformStats): void {
  const rows = [
    ["Metric", "Value"],
    ["Total Listings", stats.totalListings],
    ["Active Listings", stats.activeListings],
    ["Total Users", stats.totalUsers],
    ["New Users This Month", stats.newUsersMonth],
    ["Firesale Requests", stats.firesaleRequests],
    ["Open Houses", stats.openHouses],
    ["Export Date", new Date().toLocaleDateString()],
  ];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `platform-stats-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

import { formatDateTime as formatDate } from "@/lib/format";

function getLinkForEntity(entityType: string, entityId: string): string {
  if (entityType === "firesale_request") return `/admin?tab=pipeline`;
  return `/property/${entityId}`;
}

async function invokeAdminReportAction(payload: AdminReportActionPayload): Promise<void> {
  const body = parseMutationInput(adminContentReportActionSchema, payload, "admin report action");
  const { data, error } = await supabase.functions.invoke<AdminReportActionResponse>(
    "admin-content-report-action",
    { body },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

// ── Monthly bar helper ─────────────────────────────────────────────────────────────
function buildMonthlyBars(createdAts: string[]): MonthlyBar[] {
  const byMonth: Record<string, number> = {};
  for (const iso of createdAts) {
    const key = iso.slice(0, 7); // "YYYY-MM"
    byMonth[key] = (byMonth[key] ?? 0) + 1;
  }
  const bars: MonthlyBar[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    bars.push({ label, count: byMonth[key] ?? 0 });
  }
  return bars;
}

// ── Main component ────────────────────────────────────────────────────────────────
export default function AdminReports() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-brand-gold" />
          Platform Analytics
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Platform-wide KPIs, growth metrics, and content moderation reports.
        </p>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border">
        {(
          [
            { id: "overview", label: "Platform Overview" },
            { id: "reports",  label: "Content Reports" },
          ] as { id: Tab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────── */}
      {activeTab === "overview" ? <PlatformOverviewTab /> : <ContentReportsTab />}
    </div>
  );
}

// ── Tab 1: Platform Overview ──────────────────────────────────────────────────────
function PlatformOverviewTab() {
  const { data: stats, isLoading: loading } = useQuery<PlatformStats>({
    queryKey: ["admin-platform-stats"],
    queryFn: async () => {
      const som = firstOfMonth();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);

      const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
        supabase.from("listing_management_catalogue").select("id", { count: "exact", head: true }),
        supabase.from("listing_management_catalogue").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("profiles_public").select("user_id", { count: "exact", head: true }),
        supabase.from("profiles_public").select("user_id", { count: "exact", head: true }).gte("created_at", som),
        supabase.from("firesale_requests").select("id", { count: "exact", head: true }),
        supabase.from("open_house_settings").select("id", { count: "exact", head: true }),
        supabase.from("listing_management_catalogue").select("created_at").gte("created_at", sixMonthsAgo.toISOString()),
      ]);

      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
      if (r3.error) throw r3.error;
      if (r4.error) throw r4.error;
      if (r5.error) throw r5.error;
      if (r6.error) throw r6.error;

      const monthlyListings = buildMonthlyBars(
        (r7.data ?? []).map((row) => (row as { created_at: string }).created_at),
      );

      return {
        totalListings:    Number(r1.count ?? 0),
        activeListings:   Number(r2.count ?? 0),
        totalUsers:       Number(r3.count ?? 0),
        newUsersMonth:    Number(r4.count ?? 0),
        firesaleRequests: Number(r5.count ?? 0),
        openHouses:       Number(r6.count ?? 0),
        monthlyListings,
      };
    },
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="animate-pulse bg-muted rounded-xl h-24" />
          ))}
        </div>
        <div className="animate-pulse bg-muted rounded-xl h-56" />
      </div>
    );
  }

  if (!stats) return <p className="text-sm text-muted-foreground">Failed to load stats.</p>;

  const s = stats;

  return (
    <div className="space-y-6">

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon={<Building2 className="w-4 h-4 text-primary" />}    label="Total Listings"        value={s.totalListings}    />
        <StatCard icon={<Building2 className="w-4 h-4 text-emerald-500" />} label="Active Listings"       value={s.activeListings}   color="emerald" />
        <StatCard icon={<Users className="w-4 h-4 text-blue-500" />}        label="Total Users"           value={s.totalUsers}       color="blue" />
        <StatCard icon={<Users className="w-4 h-4 text-violet-500" />}      label="New Users This Month"  value={s.newUsersMonth}    color="violet" />
        <StatCard icon={<Flame className="w-4 h-4 text-rose-500" />}        label="Firesale Requests"     value={s.firesaleRequests} color="rose" />
        <StatCard icon={<DoorOpen className="w-4 h-4 text-amber-500" />}    label="Open Houses"           value={s.openHouses}       color="amber" />
      </div>

      {/* Monthly listing chart — hidden until real data endpoint is wired */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold">Monthly Listings Created (last 6 months)</h3>
          <Button
            size="sm"
            variant="outline"
            className="border-border gap-1.5"
            onClick={() => {
              downloadCsv(s);
              toast.success("CSV downloaded");
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </div>
        {s.monthlyListings.some((m) => m.count > 0) ? (
          <Suspense fallback={<ChartFallback height={180} />}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={s.monthlyListings} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
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
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </Suspense>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">No listings created in the last 6 months.</p>
        )}
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────────
type StatColor = "default" | "emerald" | "blue" | "violet" | "rose" | "amber";

function StatCard({
  icon,
  label,
  value,
  color = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: StatColor;
}) {
  const ringClass: Record<StatColor, string> = {
    default: "ring-primary/10",
    emerald: "ring-emerald-500/15",
    blue:    "ring-blue-500/15",
    violet:  "ring-violet-500/15",
    rose:    "ring-rose-500/15",
    amber:   "ring-amber-500/15",
  };
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ring-1 ${ringClass[color]}`}>
      <div className="flex items-center gap-2 mb-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="font-display font-bold text-2xl">{value.toLocaleString()}</p>
    </div>
  );
}

// ── Tab 2: Content Reports ────────────────────────────────────────────────────────
function ContentReportsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [pendingModeration, setPendingModeration] = useState<PendingModeration>(null);

  const { data: reports = [], isLoading: loading } = useQuery<ReportRow[]>({
    queryKey: ["admin-content-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_reports")
        .select("id, entity_type, entity_id, reporter_id, created_at, status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as unknown as Partial<ReportRow>[]) || []).map((r) => ({
        id: r.id ?? "",
        entity_type: r.entity_type ?? "",
        entity_id: r.entity_id ?? "",
        reporter_id: r.reporter_id ?? null,
        created_at: r.created_at ?? "",
        status: (r.status as ReportStatus | undefined) ?? "pending",
      }));
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      await invokeAdminReportAction({ action: "resolve", reportId: id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-content-reports"] });
      toast.success("Report marked as resolved");
    },
    onError: () => toast.error("Failed to resolve report"),
  });

  const handleResolve = (id: string) => resolveMutation.mutate(id);

  const moderationMutation = useMutation({
    mutationFn: async ({ action, report }: { action: ModerationAction; report: ReportRow }) => {
      const reason = `Action taken from content report ${report.id}`;
      await invokeAdminReportAction({ action, reportId: report.id, reason });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["admin-content-reports"] });
      toast.success(
        variables.action === "suspend_listing"
          ? "Listing suspended and report resolved"
          : "Owner banned and report resolved",
      );
    },
    onError: () => toast.error("Moderation action failed"),
  });

  const confirmModeration = () => {
    if (!pendingModeration) return;
    moderationMutation.mutate(pendingModeration);
    setPendingModeration(null);
  };

  const filtered = reports.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={!!pendingModeration}
        title={pendingModeration?.action === "ban_owner" ? "Ban reported content owner?" : "Suspend reported listing?"}
        description={
          pendingModeration?.action === "ban_owner"
            ? "This marks the content owner as banned, turns off investor mode, resolves the report, and notifies the user."
            : "This pauses the listing, resolves the report, and notifies the owner."
        }
        confirmLabel={pendingModeration?.action === "ban_owner" ? "Ban owner" : "Suspend listing"}
        destructive
        onConfirm={confirmModeration}
        onCancel={() => setPendingModeration(null)}
      />

      {/* Header & filter */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display font-semibold flex items-center gap-2">
            <Flag className="w-4 h-4 text-brand-gold" /> Content Reports
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            User reports on listings, auctions, open houses and firesale requests.
          </p>
        </div>
        <div className="flex gap-1">
          {(["all", "pending", "resolved"] as ReportFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors border capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            {filter === "all" ? "No reports yet." : `No ${filter} reports.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Property / Entity ID</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Reporter</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium min-w-44" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{r.entity_id}</td>
                    <td className="px-4 py-3 capitalize">{r.entity_type.replace("_", " ")}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {r.reporter_id ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <ReportStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          to={getLinkForEntity(r.entity_type, r.entity_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open
                        </Link>
                        {r.status === "pending" && (
                          <button
                            onClick={() => handleResolve(r.id)}
                            className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Resolve
                          </button>
                        )}
                        {r.status === "pending" && r.entity_type === "listing" && (
                          <button
                            onClick={() => setPendingModeration({ action: "suspend_listing", report: r })}
                            className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline"
                          >
                            <PauseCircle className="w-3 h-3" />
                            Suspend
                          </button>
                        )}
                        {r.status === "pending" && (
                          <button
                            onClick={() => setPendingModeration({ action: "ban_owner", report: r })}
                            className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                          >
                            <Ban className="w-3 h-3" />
                            Ban owner
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Report status badge ───────────────────────────────────────────────────────────
function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return status === "resolved" ? (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
      Resolved
    </span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-600 dark:text-yellow-400">
      Pending
    </span>
  );
}
