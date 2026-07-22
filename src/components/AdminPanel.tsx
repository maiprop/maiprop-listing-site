/**
 * Simplified Admin — maiProp OS sync (both directions).
 * One view: status, Pull from OS, Push to OS, sync log. Advanced options collapsed.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Shield,
  Wifi,
  WifiOff,
  RefreshCw,
  Loader2,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Activity,
  Send,
  Download,
  Flame,
  ChevronDown,
  ChevronRight,
  Database,
  Play,
  TerminalSquare,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { emptyFunctionBodySchema, parseMutationInput } from "@/lib/mutationSchemas";

const SYNC_LOG_QUERY_KEY = "admin-sync-log";

interface SyncLogEntry {
  id: string;
  direction: string;
  entity_type: string;
  entity_id: string;
  status: string;
  error_message: string | null;
  records_affected: number | null;
  /** Free-form JSON snapshot of the request/response — varies per direction. */
  payload: unknown;
  created_at: string;
}

/** A row from the admin "my listings" sidebar query. */
type AdminListing = { id: string; title: string | null; city: string | null; status: string };
/** A row from the admin firesale-push sidebar query. */
type AdminFiresale = { id: string; address: string | null; city: string | null; status: string };

function useSyncLogs() {
  return useQuery<SyncLogEntry[]>({
    queryKey: [SYNC_LOG_QUERY_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_log")
        .select("id, direction, entity_type, entity_id, status, error_message, records_affected, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

export default function AdminPanel() {
  const qc = useQueryClient();
  const { data: logs = [], isLoading: logsLoading } = useSyncLogs();
  const [logFilter, setLogFilter] = useState<"all" | "os_to_hub" | "hub_to_os">("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ── Connection status (OS + DB) ─────────────────────────────────────────────
  const [osOk, setOsOk] = useState<boolean | null>(null);
  const [dbOk, setDbOk] = useState<boolean | null>(null);

  const runStatusCheck = async () => {
    setOsOk(null);
    setDbOk(null);
    try {
      const { error } = await supabase.from("sync_log").select("id").limit(1);
      setDbOk(!error);
    } catch (_err: unknown) {
      setDbOk(false);
    }
    try {
      const body = parseMutationInput(emptyFunctionBodySchema, {}, "OS diagnostic");
      const { data, error } = await supabase.functions.invoke("os-diagnose", { body });
      const ok = !error && (data?.osReachable === true || data?.status === "ok");
      setOsOk(ok);
    } catch (_err: unknown) {
      setOsOk(false);
    }
  };

  useEffect(() => {
    runStatusCheck();
  }, []);

  const credentialsHint = osOk === false && (
    <p className="text-xs text-muted-foreground mt-1">
      Set MAIPROP_OS_URL, MAIPROP_OS_EMAIL, MAIPROP_OS_PASSWORD in Supabase secrets.
    </p>
  );

  // ── Pull from OS (one primary action) ───────────────────────────────────────
  const pullMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("full-sync-from-os", {
        body: { pageSize: 100, maxPages: 200 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [SYNC_LOG_QUERY_KEY] });
      const a = data?.sync?.auctions ?? {};
      const imp = a.imported ?? 0;
      const upd = a.updated ?? 0;
      const errs = a.errors ?? 0;
      toast.success(`Pull: ${imp} new · ${upd} updated${errs ? ` · ${errs} errors` : ""}`);
    },
    onError: (e: Error) => toast.error("Pull failed: " + e.message),
  });

  // ── Push: listings ─────────────────────────────────────────────────────────
  const { data: myListings = [] } = useQuery({
    queryKey: ["admin-my-listings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .rpc("get_listing_management_catalogue")
        .select("id, title, city, status")
        .eq("owner_id", user.id)
        .eq("status", "active")
        .limit(20);
      return (data ?? []).filter((listing) => Boolean(listing.id)) as AdminListing[];
    },
  });

  const pushListingMutation = useMutation({
    mutationFn: async (listing_id: string) => {
      const { data, error } = await supabase.functions.invoke("sync-to-os", {
        body: { listing_id, entity_type: "listing" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [SYNC_LOG_QUERY_KEY] });
      if (r?.status === "skipped") {
        toast.info("OS credentials not configured.");
      } else {
        toast.success("Listing pushed to maiProp OS.");
      }
    },
    onError: (e: Error) => toast.error("Push failed: " + e.message),
  });

  // ── Push: firesales ────────────────────────────────────────────────────────
  const { data: firesales = [] } = useQuery({
    queryKey: ["admin-firesales"],
    queryFn: async () => {
      const { data } = await supabase
        .from("firesale_requests")
        .select("id, address, city, status")
        .in("status", ["pending", "reviewed", "offered"])
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const pushFiresaleMutation = useMutation({
    mutationFn: async (firesale_id: string) => {
      const { data, error } = await supabase.functions.invoke("sync-firesale-to-os", {
        body: { firesale_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [SYNC_LOG_QUERY_KEY] });
      if (r?.status === "skipped") {
        toast.info("OS credentials not configured.");
      } else {
        toast.success("Firesale pushed to maiProp OS.");
      }
    },
    onError: (e: Error) => toast.error("Firesale push failed: " + e.message),
  });

  // ── Advanced: full sync, replace all, edge tester ───────────────────────────
  const [pageSize, setPageSize] = useState(100);
  const [maxPages, setMaxPages] = useState(200);
  const [fullSyncProgress, setFullSyncProgress] = useState<string | null>(null);

  const fullSyncMutation = useMutation({
    mutationFn: async () => {
      const batchSize = 10;
      let totalImported = 0, totalUpdated = 0, totalErrors = 0;
      for (let start = 0; start < maxPages; start += batchSize) {
        const end = Math.min(start + batchSize, maxPages);
        setFullSyncProgress(`Pages ${start}–${end - 1}…`);
        const { data, error } = await supabase.functions.invoke("full-sync-from-os", {
          body: { pageSize, startPage: start, maxPages: batchSize },
        });
        if (error) throw new Error(error.message);
        const a = data?.sync?.auctions ?? {};
        totalImported += a.imported ?? 0;
        totalUpdated += a.updated ?? 0;
        totalErrors += a.errors ?? 0;
        if ((a.pages ?? 0) < batchSize) break;
      }
      setFullSyncProgress(null);
      return { totalImported, totalUpdated, totalErrors };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [SYNC_LOG_QUERY_KEY] });
      toast.success(`Full sync: ${r.totalImported} new · ${r.totalUpdated} updated`);
    },
    onError: (e: Error) => {
      setFullSyncProgress(null);
      toast.error("Full sync failed: " + e.message);
    },
  });

  const replaceAllMutation = useMutation({
    mutationFn: async () => {
      setFullSyncProgress("Replace all & sync…");
      const { data, error } = await supabase.functions.invoke("full-sync-from-os", {
        body: { replaceAll: true, pageSize, maxPages },
      });
      setFullSyncProgress(null);
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [SYNC_LOG_QUERY_KEY] });
      const a = data?.sync?.auctions ?? {};
      toast.success(
        a.replaced != null
          ? `Replaced ${a.replaced} · ${a.imported ?? 0} new · ${a.updated ?? 0} updated`
          : "Replace & sync done."
      );
    },
    onError: (e: Error) => {
      setFullSyncProgress(null);
      toast.error("Replace failed: " + e.message);
    },
  });

  const [fnTest, setFnTest] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const testFn = async (name: string) => {
    setFnTest((p) => ({ ...p, [name]: { ok: false, msg: "…" } }));
    try {
      const { data, error } = await supabase.functions.invoke(name, {
        body: name === "poll-os-auctions" ? { page: 0, pageSize: 5 } : {},
      });
      const ok = !error;
      setFnTest((p) => ({
        ...p,
        [name]: { ok, msg: ok ? JSON.stringify(data).slice(0, 80) : (error?.message ?? "error") },
      }));
    } catch (e: unknown) {
      setFnTest((p) => ({ ...p, [name]: { ok: false, msg: (e instanceof Error ? e.message : null) ?? "error" } }));
    }
  };

  const filteredLogs = logFilter === "all" ? logs : logs.filter((l) => l.direction === logFilter);
  const lastSync = logs[0]?.created_at;

  return (
    <div className="space-y-6">
      {/* Header + status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pull auctions, push listings and firesales, view sync log.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { runStatusCheck(); qc.invalidateQueries({ queryKey: [SYNC_LOG_QUERY_KEY] }); }}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status row: OS + DB */}
      <div className="glass-card rounded-xl p-4 flex flex-wrap items-center gap-4 border border-border">
        <div className="flex items-center gap-2">
          {osOk === null ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : osOk ? (
            <Wifi className="w-4 h-4 text-brand-emerald" />
          ) : (
            <WifiOff className="w-4 h-4 text-destructive" />
          )}
          <span className="text-sm font-medium">maiProp OS</span>
          <span className={`text-xs ${osOk === true ? "text-brand-emerald" : osOk === false ? "text-destructive" : "text-muted-foreground"}`}>
            {osOk === null ? "Checking…" : osOk ? "Connected" : "Not connected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {dbOk === null ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : dbOk ? (
            <Database className="w-4 h-4 text-brand-emerald" />
          ) : (
            <AlertCircle className="w-4 h-4 text-destructive" />
          )}
          <span className="text-sm font-medium">Database</span>
          <span className={`text-xs ${dbOk === true ? "text-brand-emerald" : dbOk === false ? "text-destructive" : "text-muted-foreground"}`}>
            {dbOk === null ? "Checking…" : dbOk ? "OK" : "Error"}
          </span>
        </div>
        {lastSync && (
          <span className="text-xs text-muted-foreground">
            Last sync: {new Date(lastSync).toLocaleString()}
          </span>
        )}
        {credentialsHint}
      </div>

      {/* Two directions: Pull | Push */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Pull from OS */}
        <div className="glass-card rounded-xl p-5 border border-border space-y-3">
          <div className="flex items-center gap-2">
            <ArrowDownLeft className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-sm">Pull from maiProp OS</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Import all future auctions from OS into the Hub (paginated, up to 20 000 records).
          </p>
          <Button
            className="w-full gap-2"
            size="sm"
            disabled={pullMutation.isPending}
            onClick={() => pullMutation.mutate()}
          >
            {pullMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {pullMutation.isPending ? "Pulling…" : "Pull auctions"}
          </Button>
        </div>

        {/* Push to OS: listings + firesales in one card */}
        <div className="glass-card rounded-xl p-5 border border-border space-y-4">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-brand-emerald" />
            <h2 className="font-semibold text-sm">Push to maiProp OS</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Push your active listings and pending firesales to the OS backoffice.
          </p>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Listings</p>
            {myListings.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-2">No active listings.</p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {myListings.map((l: AdminListing) => (
                  <div key={l.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2">
                    <span className="flex-1 min-w-0 text-xs truncate">{l.title ?? l.city}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs shrink-0"
                      disabled={pushListingMutation.isPending}
                      onClick={() => pushListingMutation.mutate(l.id)}
                    >
                      {pushListingMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Push
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Flame className="w-3 h-3" /> Firesales
            </p>
            {firesales.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-2">No pending firesales.</p>
            ) : (
              <div className="space-y-1.5 max-h-28 overflow-y-auto">
                {firesales.map((f: AdminFiresale) => (
                  <div key={f.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2">
                    <span className="flex-1 min-w-0 text-xs truncate">{f.address ?? f.city}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs shrink-0 border-destructive/40 text-destructive"
                      disabled={pushFiresaleMutation.isPending}
                      onClick={() => pushFiresaleMutation.mutate(f.id)}
                    >
                      {pushFiresaleMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Push
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sync log */}
      <section>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Sync log
          </h2>
          <div className="flex gap-1">
            {(["all", "os_to_hub", "hub_to_os"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                className={`text-[10px] px-2 py-1 rounded-full border font-medium transition-colors ${
                  logFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f === "os_to_hub" ? "OS → Hub" : "Hub → OS"}
              </button>
            ))}
          </div>
        </div>
        {logsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : filteredLogs.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center text-muted-foreground text-sm">No sync events yet.</div>
        ) : (
          <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`glass-card rounded-lg px-3 py-2 flex items-center gap-3 text-xs border ${
                  log.status === "success" ? "border-brand-emerald/20" : log.status === "error" ? "border-destructive/20" : "border-border"
                }`}
              >
                {log.direction === "os_to_hub" ? <ArrowDownLeft className="w-3 h-3 text-primary shrink-0" /> : <ArrowUpRight className="w-3 h-3 text-brand-emerald shrink-0" />}
                <span className="text-muted-foreground shrink-0">{new Date(log.created_at).toLocaleString()}</span>
                <span className="font-medium capitalize">{log.entity_type}</span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  log.status === "success" ? "bg-brand-emerald/15 text-brand-emerald" : log.status === "error" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
                }`}>
                  {log.status}
                </span>
                {(log.records_affected != null && log.records_affected > 0) && <span className="text-muted-foreground">{log.records_affected} records</span>}
                {log.error_message && <span className="text-destructive truncate flex-1">{log.error_message}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Advanced (collapsible) */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-2">
            {advancedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Advanced: full sync, replace all, page limits, function tester
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="glass-card rounded-xl p-5 border border-border space-y-5 mt-2">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Page size</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={pageSize}
                  onChange={(e) => setPageSize(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  className="w-full bg-secondary border border-border rounded-lg px-2.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Max pages (full sync)</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={maxPages}
                  onChange={(e) => setMaxPages(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  className="w-full bg-secondary border border-border rounded-lg px-2.5 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                disabled={fullSyncMutation.isPending}
                onClick={() => fullSyncMutation.mutate()}
              >
                {fullSyncMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {fullSyncMutation.isPending ? (fullSyncProgress ?? "Full sync…") : "Full sync (OS → Hub)"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-destructive/40 text-destructive"
                disabled={replaceAllMutation.isPending}
                onClick={() => replaceAllMutation.mutate()}
              >
                {replaceAllMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Replace all auctions & sync
              </Button>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <TerminalSquare className="w-3.5 h-3.5" /> Function tester
              </h3>
              <div className="flex flex-wrap gap-2">
                {["poll-os-auctions", "full-sync-from-os", "sync-to-os", "sync-firesale-to-os", "os-diagnose"].map((name) => {
                  const r = fnTest[name];
                  return (
                    <div key={name} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-2 py-1.5">
                      <span className="text-xs font-mono">{name}</span>
                      <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => testFn(name)}>
                        <Play className="w-3 h-3" />
                      </Button>
                      {r && <span className={`text-[10px] ${r.ok ? "text-brand-emerald" : "text-destructive"}`}>{r.ok ? "OK" : r.msg.slice(0, 40)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 text-xs flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary shrink-0" />
              <span className="text-muted-foreground">Nightly cron: 03:00 UTC · full-sync-from-os / poll-os-auctions. AI generates Greek titles for new auctions.</span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
