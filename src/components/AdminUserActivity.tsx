import { useMemo, useState } from "react";
import {
  Activity,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime, formatTimeAgo } from "@/lib/format";
import { isSyntheticAdminActivityIdentity } from "@/lib/isSyntheticAdminActivityIdentity";
import type { Json } from "@/integrations/supabase/types";

type AdminActivitySummary = {
  total_users?: number;
  confirmed_users?: number;
  signups_in_range?: number;
  signups_7d?: number;
  active_users_in_range?: number;
  active_users_7d?: number;
  sessions_in_range?: number;
  sessions_24h?: number;
  searches_in_range?: number;
  searches_7d?: number;
  unique_searchers_in_range?: number;
  auth_audit_events_in_range?: number;
  auth_audit_logs_available?: boolean;
  auth_activity_events_in_range?: number;
  auth_activity_events_24h?: number;
  sign_in_events_in_range?: number;
  sign_out_events_in_range?: number;
  app_auth_events_available?: boolean;
};

type AdminActivityUser = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  created_at: string;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  last_session_at: string | null;
  session_count: number;
  sessions_24h: number;
  auth_event_count: number;
  auth_events_24h: number;
  last_auth_event_at: string | null;
  last_auth_event_type: string | null;
  search_count: number;
  last_search_at: string | null;
  last_search_query: string | null;
  last_activity_at: string | null;
  banned_until: string | null;
};

type AdminSearchEvent = {
  id: string;
  created_at: string;
  surface: string;
  query_text: string;
  normalized_query: string;
  route: string | null;
  result_count: number | null;
  filters: Record<string, Json>;
  metadata: Record<string, Json>;
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
};

type AdminAuthEvent = {
  id: string;
  created_at: string;
  event_type: string;
  route: string | null;
  user_agent: string | null;
  metadata: Record<string, Json>;
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
};

type AuthEventTypeSummary = {
  event_type: string;
  event_count: number;
  user_count: number;
  last_seen_at: string;
};

type TopKeyword = {
  keyword: string;
  search_count: number;
  user_count: number;
  last_seen_at: string;
};

type DailyActivity = {
  date: string;
  signups: number;
  logins: number;
  sessions: number;
  auth_events?: number;
  searches: number;
};

type AuditAction = {
  action: string;
  event_count: number;
  last_seen_at: string;
};

type AdminActivitySnapshot = {
  generated_at: string;
  days: number;
  summary: AdminActivitySummary;
  users: AdminActivityUser[];
  recent_searches: AdminSearchEvent[];
  recent_auth_events: AdminAuthEvent[];
  auth_events_by_type: AuthEventTypeSummary[];
  top_keywords: TopKeyword[];
  daily: DailyActivity[];
  audit_actions: AuditAction[];
};

type AdminActivityRpc = (
  name: "admin_user_activity_snapshot",
  args: { p_days: number; p_limit: number },
) => Promise<{ data: AdminActivitySnapshot | null; error: { message?: string } | null }>;

type AdminActivitySupabaseClient = {
  rpc: AdminActivityRpc;
};

const RANGE_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

function numberLabel(value: number | null | undefined) {
  return (value ?? 0).toLocaleString();
}

function personName(user: Pick<AdminActivityUser, "display_name" | "first_name" | "last_name" | "email" | "user_id">) {
  return user.display_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || user.user_id.slice(0, 8);
}

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-black text-foreground mt-1">{value}</p>
        </div>
        <Icon className="w-4 h-4 text-primary shrink-0" />
      </div>
      <p className="text-xs text-muted-foreground mt-2">{detail}</p>
    </div>
  );
}

function useAdminUserActivity(days: number) {
  return useQuery<AdminActivitySnapshot>({
    queryKey: ["admin-user-activity", days],
    queryFn: async () => {
      const typedSupabase = supabase as unknown as AdminActivitySupabaseClient;
      const { data, error } = await typedSupabase.rpc("admin_user_activity_snapshot", {
        p_days: days,
        p_limit: 100,
      });
      if (error) throw new Error(error.message ?? "Could not load user activity");
      if (!data) throw new Error("User activity snapshot returned no data");
      return data;
    },
  });
}

export default function AdminUserActivity() {
  const [days, setDays] = useState(30);
  const [userSearch, setUserSearch] = useState("");
  const { data, isLoading, isError, error, refetch, isFetching } = useAdminUserActivity(days);

  const summary = data?.summary ?? {};
  const hasAppAuthEvents = Boolean(summary.app_auth_events_available || (data?.recent_auth_events ?? []).length > 0);
  const visibleUsers = useMemo(() => {
    return (data?.users ?? []).filter((user) => !isSyntheticAdminActivityIdentity(user.email, user.display_name));
  }, [data?.users]);
  const visibleAuthEvents = useMemo(() => {
    return (data?.recent_auth_events ?? []).filter((event) => !isSyntheticAdminActivityIdentity(event.email, event.display_name));
  }, [data?.recent_auth_events]);
  const visibleSearches = useMemo(() => {
    return (data?.recent_searches ?? []).filter((event) => !isSyntheticAdminActivityIdentity(event.email, event.display_name));
  }, [data?.recent_searches]);
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const users = visibleUsers;
    if (!q) return users;
    return users.filter((user) => [
      user.email,
      user.display_name,
      user.first_name,
      user.last_name,
      user.role,
      user.last_search_query,
    ].some((value) => value?.toLowerCase().includes(q)));
  }, [userSearch, visibleUsers]);

  const maxDaily = Math.max(1, ...(data?.daily ?? []).map((row) => row.signups + row.logins + row.searches + (row.auth_events ?? 0)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            User Activity
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Users, signups, logins, active sessions, searches, and searched keywords.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setDays(option.value)}
              className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                days === option.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm text-destructive">
          {(error as Error)?.message || "Could not load user activity."}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
            <StatTile
              label="Users"
              value={numberLabel(summary.total_users)}
              detail={`${numberLabel(summary.confirmed_users)} confirmed accounts`}
              icon={Users}
            />
            <StatTile
              label="Signups"
              value={numberLabel(summary.signups_in_range)}
              detail={`${numberLabel(summary.signups_7d)} in the last 7 days`}
              icon={UserCheck}
            />
            <StatTile
              label="Active"
              value={numberLabel(summary.active_users_in_range)}
              detail={`${numberLabel(summary.active_users_7d)} signed in during last 7 days`}
              icon={Activity}
            />
            <StatTile
              label="Sessions"
              value={numberLabel(summary.sessions_in_range)}
              detail={`${numberLabel(summary.sessions_24h)} refreshed in last 24h`}
              icon={Clock}
            />
            <StatTile
              label="Auth Events"
              value={numberLabel(summary.auth_activity_events_in_range)}
              detail={`${numberLabel(summary.auth_activity_events_24h)} in the last 24h`}
              icon={ShieldCheck}
            />
            <StatTile
              label="Searches"
              value={numberLabel(summary.searches_in_range)}
              detail={`${numberLabel(summary.unique_searchers_in_range)} unique searchers`}
              icon={Search}
            />
          </div>

          {!hasAppAuthEvents && !summary.auth_audit_logs_available && (
            <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-brand-gold shrink-0 mt-0.5" />
              <span>
                First-party auth activity tracking is enabled. Recent sign-in, sign-out, and session events will appear after users authenticate through the app.
              </span>
            </div>
          )}

          <div className="grid xl:grid-cols-[1.6fr_1fr] gap-4">
            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-display font-semibold text-sm">Users and Sessions</p>
                  <p className="text-xs text-muted-foreground">Last login, latest session, and search activity per account.</p>
                </div>
                <label className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Search users"
                    className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
                  />
                </label>
              </div>

              <div className="divide-y divide-border">
                {filteredUsers.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-muted-foreground">No users match this filter.</div>
                ) : filteredUsers.map((user) => (
                  <div key={user.user_id} className="px-4 py-3 grid lg:grid-cols-[1fr_auto_auto] gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-foreground truncate">{personName(user)}</p>
                        {user.role && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{user.role}</span>}
                        {user.banned_until && <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-destructive">Banned</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email ?? user.user_id}</p>
                      {user.last_search_query && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          Last search: <span className="text-foreground">{user.last_search_query}</span>
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground lg:text-right">
                      <p>Signup: <span className="text-foreground">{formatDate(user.created_at)}</span></p>
                      <p>Login: <span className="text-foreground">{formatDateTime(user.last_sign_in_at)}</span></p>
                      <p>Session: <span className="text-foreground">{formatDateTime(user.last_session_at)}</span></p>
                      <p>Auth: <span className="text-foreground">{user.last_auth_event_type ? `${user.last_auth_event_type.replace("_", " ")} - ${formatDateTime(user.last_auth_event_at)}` : "-"}</span></p>
                    </div>
                    <div className="flex lg:flex-col gap-2 lg:items-end text-xs">
                      <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{numberLabel(user.session_count)} sessions</span>
                      <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{numberLabel(user.auth_event_count)} auth events</span>
                      <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">{numberLabel(user.search_count)} searches</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-lg border border-border bg-card p-4">
                <p className="font-display font-semibold text-sm">Top Keywords</p>
                <p className="text-xs text-muted-foreground mt-1">Normalized words from listing, auction, and AI search queries.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(data.top_keywords ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No keyword events yet.</p>
                  ) : data.top_keywords.map((keyword) => (
                    <span key={keyword.keyword} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs text-primary">
                      {keyword.keyword} <span className="font-semibold">{keyword.search_count}</span>
                    </span>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card p-4">
                <p className="font-display font-semibold text-sm">Auth Event Types</p>
                <p className="text-xs text-muted-foreground mt-1">First-party app sign-in, sign-out, and session events.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(data.auth_events_by_type ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No auth events yet.</p>
                  ) : data.auth_events_by_type.map((eventType) => (
                    <span key={eventType.event_type} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
                      {eventType.event_type.replace("_", " ")} <span className="font-semibold text-foreground">{eventType.event_count}</span>
                    </span>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card p-4">
                <p className="font-display font-semibold text-sm">Daily Activity</p>
                <div className="mt-4 space-y-2">
                  {data.daily.slice(-14).map((row) => {
                    const total = row.signups + row.logins + row.searches + (row.auth_events ?? 0);
                    return (
                      <div key={row.date} className="grid grid-cols-[72px_1fr_auto] items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{formatDate(row.date).replace(/\s\d{4}$/, "")}</span>
                        <span className="h-2 rounded-full bg-muted overflow-hidden">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (total / maxDaily) * 100)}%` }} />
                        </span>
                        <span className="text-muted-foreground">{total}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </aside>
          </div>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="font-display font-semibold text-sm">Recent Auth Events</p>
              <p className="text-xs text-muted-foreground">Captured from app sign-in, sign-out, restored-session, and refreshed-token events.</p>
            </div>
            <div className="divide-y divide-border">
              {visibleAuthEvents.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">No auth events in this range yet.</div>
              ) : visibleAuthEvents.map((event) => (
                <div key={event.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{event.event_type.replace("_", " ")}</span>
                      <p className="font-semibold text-sm truncate">{event.display_name || event.email || event.user_id.slice(0, 8)}</p>
                      {event.role && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{event.role}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{event.route ?? "no route"}</p>
                  </div>
                  <div className="text-xs text-muted-foreground md:text-right">
                    <p>{formatTimeAgo(event.created_at)}</p>
                    <p>{formatDateTime(event.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="font-display font-semibold text-sm">Recent Searches</p>
              <p className="text-xs text-muted-foreground">New events are captured from the listings, auctions, and AI search surfaces.</p>
            </div>
            <div className="divide-y divide-border">
              {visibleSearches.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">No search events in this range yet.</div>
              ) : visibleSearches.map((event) => (
                <div key={event.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{event.surface.replace("_", " ")}</span>
                      <p className="font-semibold text-sm truncate">{event.query_text}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {(event.display_name || event.email || event.user_id.slice(0, 8))} - {event.route ?? "no route"}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground md:text-right">
                    <p>{formatTimeAgo(event.created_at)}</p>
                    <p>{event.result_count == null ? "Results not recorded" : `${event.result_count.toLocaleString()} results`}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {(data.audit_actions ?? []).length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <p className="font-display font-semibold text-sm">Supabase Auth Audit Actions</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.audit_actions.map((action) => (
                  <span key={action.action} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
                    {action.action}: <span className="font-semibold text-foreground">{action.event_count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
