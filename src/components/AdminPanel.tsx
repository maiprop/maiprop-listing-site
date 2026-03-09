import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Shield, Wifi, WifiOff, RefreshCw, Loader2, CheckCircle2, AlertCircle,
  Clock, Activity, Download, Send, ChevronDown, ChevronRight, ArrowDownLeft,
  ArrowUpRight, Zap, Database, Server, Globe, Play, TerminalSquare, Calendar,
  FlaskConical, Bot
} from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SyncLog {
  id: string;
  direction: string;
  entity_type: string;
  status: string;
  error_message: string | null;
  records_affected: number | null;
  payload: any;
  created_at: string;
}

interface ApiCheckResult {
  name: string;
  status: "ok" | "error" | "pending" | "unconfigured";
  latency?: number;
  detail?: string;
}

// ── Helper: status pill ───────────────────────────────────────────────────────
function StatusPill({ status }: { status: ApiCheckResult["status"] }) {
  const map = {
    ok: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30",
    error: "bg-destructive/15 text-destructive border-destructive/30",
    pending: "bg-brand-gold/15 text-brand-gold border-brand-gold/30",
    unconfigured: "bg-muted text-muted-foreground border-border",
  };
  const icon = {
    ok: <CheckCircle2 className="w-3 h-3" />,
    error: <AlertCircle className="w-3 h-3" />,
    pending: <Loader2 className="w-3 h-3 animate-spin" />,
    unconfigured: <Clock className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${map[status]}`}>
      {icon[status]} {status}
    </span>
  );
}

// ── Hook: live sync logs ──────────────────────────────────────────────────────
function useSyncLogs() {
  return useQuery<SyncLog[]>({
    queryKey: ["admin-sync-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });
}

// ── Hook: DB stats ────────────────────────────────────────────────────────────
function useDbStats() {
  return useQuery({
    queryKey: ["admin-db-stats"],
    queryFn: async () => {
      const [listings, auctions, professionals, users] = await Promise.all([
        supabase.from("listings").select("id", { count: "exact", head: true }),
        supabase.from("listings").select("id", { count: "exact", head: true }).eq("listing_type", "auction"),
        supabase.from("professionals").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      return {
        totalListings: listings.count ?? 0,
        auctionListings: auctions.count ?? 0,
        professionals: professionals.count ?? 0,
        users: users.count ?? 0,
      };
    },
    refetchInterval: 30_000,
  });
}

// ── Edge functions list ───────────────────────────────────────────────────────
const EDGE_FUNCTIONS = [
  { name: "poll-os-auctions", label: "Poll OS Auctions", icon: ArrowDownLeft, description: "Imports future auctions from maiProp OS" },
  { name: "sync-to-os", label: "Sync to OS", icon: ArrowUpRight, description: "Pushes Hub listings to OS backoffice" },
  { name: "sync-firesale-to-os", label: "Sync Firesale → OS", icon: Zap, description: "Pushes Quick Sale™ requests to OS" },
  { name: "ai-search", label: "AI Search", icon: Bot, description: "Natural-language listing search" },
  { name: "listing-ai-assist", label: "Listing AI Assist", icon: Bot, description: "AI description & price suggestion" },
  { name: "neighbourhood-report", label: "Neighbourhood Report", icon: Globe, description: "Area analysis & POI report" },
  { name: "property-valuation", label: "Property Valuation", icon: FlaskConical, description: "AI-powered price estimation" },
  { name: "os-diagnose", label: "OS Diagnose", icon: Server, description: "Probes OS API reachability & schemas" },
] as const;

// ── Cron schedule info ────────────────────────────────────────────────────────
const CRON_JOBS = [
  { name: "poll-os-auctions-00", schedule: "0 3 * * *", fn: "poll-os-auctions", body: '{"page":0,"pageSize":100}', description: "Nightly 03:00 UTC – page 0" },
  { name: "poll-os-auctions-15", schedule: "15 3 * * *", fn: "poll-os-auctions", body: '{"page":1,"pageSize":100}', description: "Nightly 03:15 UTC – page 1" },
  { name: "poll-os-auctions-30", schedule: "30 3 * * *", fn: "poll-os-auctions", body: '{"page":2,"pageSize":100}', description: "Nightly 03:30 UTC – page 2" },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const qc = useQueryClient();
  const { data: logs = [], isLoading: logsLoading } = useSyncLogs();
  const { data: dbStats } = useDbStats();

  const [apiChecks, setApiChecks] = useState<ApiCheckResult[]>([
    { name: "maiProp OS API", status: "pending" },
    { name: "Lovable AI Gateway", status: "pending" },
    { name: "Supabase DB", status: "pending" },
  ]);
  const [logFilter, setLogFilter] = useState<"all" | "os_to_hub" | "hub_to_os">("all");
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [fnTestResult, setFnTestResult] = useState<Record<string, { status: "idle" | "running" | "ok" | "error"; detail: string }>>({});
  const [pollPage, setPollPage] = useState(0);
  const [pollPages, setPollPages] = useState(1);

  // ── Run API checks ──────────────────────────────────────────────────────────
  const runApiChecks = async () => {
    setApiChecks([
      { name: "maiProp OS API", status: "pending" },
      { name: "Lovable AI Gateway", status: "pending" },
      { name: "Supabase DB", status: "pending" },
    ]);

    // 1. Supabase DB check (simple query)
    const t0 = Date.now();
    try {
      const { error } = await supabase.from("sync_log").select("id").limit(1);
      const latency = Date.now() - t0;
      setApiChecks(prev => prev.map(c => c.name === "Supabase DB"
        ? { ...c, status: error ? "error" : "ok", latency, detail: error?.message }
        : c));
    } catch (e: any) {
      setApiChecks(prev => prev.map(c => c.name === "Supabase DB" ? { ...c, status: "error", detail: e.message } : c));
    }

    // 2. OS API check via os-diagnose function
    const t1 = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke("os-diagnose", { body: {} });
      const latency = Date.now() - t1;
      if (error) throw new Error(error.message);
      const isOk = data?.osReachable === true || data?.status === "ok";
      setApiChecks(prev => prev.map(c => c.name === "maiProp OS API"
        ? { ...c, status: isOk ? "ok" : data?.osReachable === false ? "error" : "unconfigured", latency, detail: data?.detail ?? JSON.stringify(data).slice(0, 120) }
        : c));
    } catch (e: any) {
      const latency = Date.now() - t1;
      setApiChecks(prev => prev.map(c => c.name === "maiProp OS API"
        ? { ...c, status: "unconfigured", latency, detail: e.message }
        : c));
    }

    // 3. AI Gateway check via a lightweight function
    const t2 = Date.now();
    try {
      const { error } = await supabase.functions.invoke("listing-ai-assist", {
        body: { type: "ping" },
      });
      const latency = Date.now() - t2;
      setApiChecks(prev => prev.map(c => c.name === "Lovable AI Gateway"
        ? { ...c, status: error ? "error" : "ok", latency, detail: error?.message }
        : c));
    } catch (e: any) {
      setApiChecks(prev => prev.map(c => c.name === "Lovable AI Gateway"
        ? { ...c, status: "error", detail: e.message }
        : c));
    }
  };

  useEffect(() => { runApiChecks(); }, []);

  // ── Mutation: test any edge function ───────────────────────────────────────
  const testFunction = async (name: string, body: Record<string, unknown> = {}) => {
    setFnTestResult(prev => ({ ...prev, [name]: { status: "running", detail: "Invoking…" } }));
    const t = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke(name, { body });
      const ms = Date.now() - t;
      if (error) throw new Error(error.message);
      setFnTestResult(prev => ({ ...prev, [name]: { status: "ok", detail: `${ms}ms — ${JSON.stringify(data).slice(0, 200)}` } }));
    } catch (e: any) {
      const ms = Date.now() - t;
      setFnTestResult(prev => ({ ...prev, [name]: { status: "error", detail: `${ms}ms — ${e.message}` } }));
    }
  };

  // ── Mutation: poll auctions ─────────────────────────────────────────────────
  const pollMutation = useMutation({
    mutationFn: async () => {
      let totalImported = 0, totalUpdated = 0, totalErrors = 0, totalScanned = 0, aiGenerated = 0;
      for (let p = pollPage; p < pollPage + pollPages; p++) {
        const { data, error } = await supabase.functions.invoke("poll-os-auctions", { body: { page: p, pageSize: 100 } });
        if (error) throw error;
        totalImported += data?.imported ?? 0;
        totalUpdated  += data?.updated ?? 0;
        totalErrors   += data?.errors ?? 0;
        totalScanned  += data?.total ?? 0;
        aiGenerated   += data?.aiGenerated ?? 0;
      }
      return { imported: totalImported, updated: totalUpdated, errors: totalErrors, scanned: totalScanned, aiGenerated };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin-sync-log"] });
      toast.success(`✅ ${r.imported} new · ${r.updated} updated · 🤖 ${r.aiGenerated} AI · scanned ${r.scanned}`);
    },
    onError: (e: any) => toast.error("Poll failed: " + e.message),
  });

  // ── Derived ─────────────────────────────────────────────────────────────────
  const filteredLogs = logFilter === "all" ? logs : logs.filter(l => l.direction === logFilter);
  const successCount = logs.filter(l => l.status === "success").length;
  const errorCount = logs.filter(l => l.status === "error").length;
  const skippedCount = logs.filter(l => l.status === "skipped").length;
  const lastSync = logs[0]?.created_at;

  return (
    <div className="space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" /> Admin Control Panel
          </h1>
          <p className="text-sm text-muted-foreground mt-1">API health, connections, auction polling, edge function tester</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { runApiChecks(); qc.invalidateQueries({ queryKey: ["admin-sync-log", "admin-db-stats"] }); }}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh All
          </Button>
        </div>
      </div>

      {/* ── Row 1: API Connection Health ─────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Wifi className="w-3.5 h-3.5" /> API Connections
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {apiChecks.map((check) => (
            <div key={check.name} className={`glass-card rounded-xl p-4 border transition-colors ${
              check.status === "ok" ? "border-brand-emerald/30" :
              check.status === "error" ? "border-destructive/30" :
              check.status === "pending" ? "border-brand-gold/30" : "border-border"
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{check.name}</span>
                <StatusPill status={check.status} />
              </div>
              {check.latency !== undefined && (
                <p className="text-[11px] text-muted-foreground">Latency: <span className="font-medium text-foreground">{check.latency}ms</span></p>
              )}
              {check.detail && <p className="text-[10px] text-muted-foreground mt-1 truncate">{check.detail}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* ── Row 2: DB Stats ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Database className="w-3.5 h-3.5" /> Database Snapshot
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Listings", value: dbStats?.totalListings ?? "—", color: "text-primary" },
            { label: "Auction Listings", value: dbStats?.auctionListings ?? "—", color: "text-brand-gold" },
            { label: "Professionals", value: dbStats?.professionals ?? "—", color: "text-brand-emerald" },
            { label: "Users", value: dbStats?.users ?? "—", color: "text-accent" },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl p-4 text-center">
              <div className={`font-display text-2xl font-bold ${s.color}`}>{typeof s.value === "number" ? s.value.toLocaleString() : s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Row 3: Auction Polling ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <ArrowDownLeft className="w-3.5 h-3.5" /> Auction Polling — OS → Hub
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Manual poll */}
          <div className="glass-card rounded-xl p-5 space-y-4">
            <div>
              <p className="font-semibold text-sm mb-1">Manual Trigger</p>
              <p className="text-xs text-muted-foreground">Fetch future auctions (POSTED · READY_TO_CONDUCT · FINALIZED) from maiProp OS and upsert to Hub listings.</p>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] text-muted-foreground block mb-1">Start page</label>
                <input type="number" min={0} value={pollPage} onChange={e => setPollPage(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-secondary border border-border rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-muted-foreground block mb-1">Pages to scan</label>
                <input type="number" min={1} max={10} value={pollPages} onChange={e => setPollPages(Math.max(1, Math.min(10, Number(e.target.value))))}
                  className="w-full bg-secondary border border-border rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Scanning pages {pollPage}–{pollPage + pollPages - 1} · {pollPages * 100} records max</p>
            <Button className="w-full gap-2" size="sm" disabled={pollMutation.isPending} onClick={() => pollMutation.mutate()}>
              {pollMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {pollMutation.isPending ? "Polling…" : "Pull Future Auctions"}
            </Button>
          </div>

          {/* Cron schedule */}
          <div className="glass-card rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <p className="font-semibold text-sm">Scheduled Cron Jobs</p>
            </div>
            <div className="space-y-2">
              {CRON_JOBS.map(job => (
                <div key={job.name} className="flex items-start gap-3 bg-secondary/50 rounded-lg p-3">
                  <div className="w-2 h-2 rounded-full bg-brand-emerald mt-1.5 shrink-0 animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{job.description}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{job.schedule} → {job.fn}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{job.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 text-xs">
              <p className="font-medium text-primary">⏰ Auto-scan active nightly 03:00–03:30 UTC</p>
              <p className="text-muted-foreground mt-0.5">AI generates Greek titles & descriptions for each new auction (Gemini 2.5 Flash).</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Row 4: Edge Function Tester ───────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <TerminalSquare className="w-3.5 h-3.5" /> Edge Function Tester
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {EDGE_FUNCTIONS.map(fn => {
            const result = fnTestResult[fn.name];
            return (
              <div key={fn.name} className={`glass-card rounded-xl p-4 border transition-colors ${
                result?.status === "ok" ? "border-brand-emerald/30" :
                result?.status === "error" ? "border-destructive/30" : "border-border"
              }`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <fn.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{fn.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{fn.name}</p>
                  </div>
                  {result && (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${
                      result.status === "ok" ? "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30" :
                      result.status === "error" ? "bg-destructive/15 text-destructive border-destructive/30" :
                      "bg-brand-gold/15 text-brand-gold border-brand-gold/30"
                    }`}>{result.status}</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mb-3">{fn.description}</p>
                {result?.detail && (
                  <p className="text-[10px] font-mono bg-secondary rounded p-2 mb-2 break-all leading-relaxed max-h-16 overflow-y-auto">{result.detail}</p>
                )}
                <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs h-7"
                  disabled={result?.status === "running"}
                  onClick={() => testFunction(fn.name, fn.name === "poll-os-auctions" ? { page: 0, pageSize: 5 } : {})}>
                  {result?.status === "running" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  {result?.status === "running" ? "Running…" : "Test"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Row 5: Sync Log ───────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Sync Log
            {lastSync && <span className="text-[10px] normal-case font-normal">· last event {new Date(lastSync).toLocaleString()}</span>}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(["all", "os_to_hub", "hub_to_os"] as const).map(f => (
                <button key={f} onClick={() => setLogFilter(f)}
                  className={`text-[10px] px-2 py-1 rounded-full border font-medium transition-colors ${logFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {f === "all" ? "All" : f === "os_to_hub" ? "OS → Hub" : "Hub → OS"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => qc.invalidateQueries({ queryKey: ["admin-sync-log"] })}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: "Success", value: successCount, color: "text-brand-emerald", bg: "bg-brand-emerald/10" },
            { label: "Errors", value: errorCount, color: "text-destructive", bg: "bg-destructive/10" },
            { label: "Skipped", value: skippedCount, color: "text-brand-gold", bg: "bg-brand-gold/10" },
          ].map(s => (
            <div key={s.label} className={`glass-card rounded-xl p-3 text-center ${s.bg}`}>
              <div className={`font-display text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {logsLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filteredLogs.length === 0 ? (
          <div className="glass-card rounded-xl p-10 text-center text-muted-foreground text-sm">No sync events yet.</div>
        ) : (
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            {filteredLogs.map(log => (
              <div key={log.id} className={`glass-card rounded-xl overflow-hidden border transition-colors ${
                log.status === "success" ? "border-brand-emerald/20" :
                log.status === "error" ? "border-destructive/20" : "border-border"
              }`}>
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                  {/* Direction icon */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    log.direction === "os_to_hub" ? "bg-primary/10" : "bg-brand-emerald/10"
                  }`}>
                    {log.direction === "os_to_hub"
                      ? <ArrowDownLeft className="w-3 h-3 text-primary" />
                      : <ArrowUpRight className="w-3 h-3 text-brand-emerald" />}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">{log.entity_type}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                        log.status === "success" ? "bg-brand-emerald/15 text-brand-emerald" :
                        log.status === "error" ? "bg-destructive/15 text-destructive" :
                        "bg-brand-gold/15 text-brand-gold"
                      }`}>{log.status}</span>
                      {log.records_affected != null && log.records_affected > 0 && (
                        <span className="text-[10px] text-muted-foreground">{log.records_affected} records</span>
                      )}
                    </div>
                    {log.error_message && (
                      <p className="text-[10px] text-destructive truncate mt-0.5">{log.error_message}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                  {expandedLog === log.id ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                </button>

                {/* Expanded payload */}
                {expandedLog === log.id && log.payload && (
                  <div className="border-t border-border px-4 py-3 bg-secondary/40">
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Payload</p>
                    <pre className="text-[10px] font-mono text-foreground overflow-x-auto max-h-40 overflow-y-auto leading-relaxed whitespace-pre-wrap break-all">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
