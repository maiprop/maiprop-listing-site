import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, ArrowUpRight, ArrowDownLeft, CheckCircle2,
  AlertCircle, Clock, Loader2, Activity, Wifi, WifiOff, Send,
  Download, Flame, ListFilter,
} from "lucide-react";
import { toast } from "sonner";

interface SyncLogEntry {
  id: string;
  direction: string;
  entity_type: string;
  entity_id: string;
  status: string;
  error_message: string | null;
  records_affected: number | null;
  payload: any;
  created_at: string;
}

function useSyncLogs() {
  return useQuery<SyncLogEntry[]>({
    queryKey: ["sync_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 20_000,
  });
}

export function OSSyncPanel() {
  const qc = useQueryClient();
  const { data: logs = [], isLoading } = useSyncLogs();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<"all" | "hub_to_os" | "os_to_hub">("all");

  // ── Active listings (for manual push) ──────────────────────────────────────
  const { data: listings } = useQuery({
    queryKey: ["my-listings-for-sync"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("listings")
        .select("id, title, status, city, listing_type")
        .eq("owner_id", user.id)
        .eq("status", "active")
        .limit(20);
      return data ?? [];
    },
  });

  // ── Pending firesale requests ───────────────────────────────────────────────
  const { data: firesales } = useQuery({
    queryKey: ["firesales-for-sync"],
    queryFn: async () => {
      const { data } = await supabase
        .from("firesale_requests")
        .select("id, address, city, status, ai_estimate, offer_price")
        .in("status", ["pending", "reviewed", "offered"])
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // ── Mutation: push listing to OS ────────────────────────────────────────────
  const syncListingMutation = useMutation({
    mutationFn: async (listing_id: string) => {
      const { data, error } = await supabase.functions.invoke("sync-to-os", {
        body: { listing_id, entity_type: "listing" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (result) => {
      setSyncingId(null);
      qc.invalidateQueries({ queryKey: ["sync_log"] });
      if (result?.status === "skipped") {
        toast.info("Sync queued — OS credentials pending.", {
          description: "Configure MAIPROP_OS_URL, MAIPROP_OS_EMAIL & MAIPROP_OS_PASSWORD.",
        });
      } else {
        toast.success("Listing pushed to maiProp OS!");
      }
    },
    onError: (err: any) => { setSyncingId(null); toast.error("Sync failed: " + err.message); },
  });

  // ── Mutation: push firesale to OS ───────────────────────────────────────────
  const syncFiresaleMutation = useMutation({
    mutationFn: async (firesale_id: string) => {
      const { data, error } = await supabase.functions.invoke("sync-firesale-to-os", {
        body: { firesale_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (result) => {
      setSyncingId(null);
      qc.invalidateQueries({ queryKey: ["sync_log"] });
      if (result?.status === "skipped") {
        toast.info("Firesale queued — OS credentials pending.");
      } else {
        toast.success("Firesale opportunity pushed to maiProp OS!");
      }
    },
    onError: (err: any) => { setSyncingId(null); toast.error("Firesale sync failed: " + err.message); },
  });

  // ── Poll config state ────────────────────────────────────────────────────────
  const [pollPage, setPollPage]     = useState(0);
  const [pollPages, setPollPages]   = useState(1); // how many pages to scan
  const [pollResult, setPollResult] = useState<any>(null);

  // ── Mutation: poll OS auctions → Hub ────────────────────────────────────────
  const pollAuctionsMutation = useMutation({
    mutationFn: async () => {
      // Scan multiple pages and aggregate results
      let totalImported = 0, totalUpdated = 0, totalErrors = 0, totalScanned = 0;
      for (let p = pollPage; p < pollPage + pollPages; p++) {
        const { data, error } = await supabase.functions.invoke("poll-os-auctions", {
          body: { page: p, pageSize: 100 },
        });
        if (error) throw error;
        totalImported += data?.imported ?? 0;
        totalUpdated  += data?.updated  ?? 0;
        totalErrors   += data?.errors   ?? 0;
        totalScanned  += data?.total    ?? 0;
      }
      return { imported: totalImported, updated: totalUpdated, errors: totalErrors, scanned: totalScanned };
    },
    onSuccess: (result) => {
      setPollResult(result);
      qc.invalidateQueries({ queryKey: ["sync_log"] });
      if (!result) {
        toast.info("Poll queued — OS credentials pending.");
      } else if (result.imported === 0 && result.updated === 0) {
        toast.info(
          `Scanned ${result.scanned} records — no future auctions on this page range. Try a different page.`,
        );
      } else {
        toast.success(
          `Auctions synced: ${result.imported} new, ${result.updated} updated${result.errors ? `, ${result.errors} errors` : ""}.`,
        );
      }
    },
    onError: (err: any) => toast.error("Auction poll failed: " + err.message),
  });

  // ── Derived stats ────────────────────────────────────────────────────────────
  const totalSuccess = logs.filter(l => l.status === "success").length;
  const totalErrors  = logs.filter(l => l.status === "error").length;
  const totalSkipped = logs.filter(l => l.status === "skipped").length;
  const lastSync     = logs[0]?.created_at;
  const hubToOsCount = logs.filter(l => l.direction === "hub_to_os").length;
  const osToHubCount = logs.filter(l => l.direction === "os_to_hub").length;
  const credentialsConfigured = totalSkipped === 0 && (totalSuccess > 0 || totalErrors > 0);

  const filteredLogs = logFilter === "all" ? logs
    : logs.filter(l => l.direction === logFilter);

  const stats = [
    { label: "Successful", value: totalSuccess, icon: CheckCircle2, color: "text-brand-emerald" },
    { label: "Errors",     value: totalErrors,  icon: AlertCircle,  color: "text-destructive"   },
    { label: "Skipped",    value: totalSkipped, icon: Clock,        color: "text-brand-gold"     },
    { label: "Hub → OS",   value: hubToOsCount, icon: ArrowUpRight, color: "text-primary"        },
    { label: "OS → Hub",   value: osToHubCount, icon: ArrowDownLeft,color: "text-primary"        },
  ];

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            OS Sync Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bidirectional sync: OS Auctions → Hub · Hub Listings → OS · Firesale → OS
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Poll OS Auctions button */}
          <Button
            size="sm"
            className="gap-2 bg-primary/90 hover:bg-primary"
            disabled={pollAuctionsMutation.isPending}
            onClick={() => pollAuctionsMutation.mutate()}
          >
            {pollAuctionsMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Download className="w-4 h-4" />}
            Poll OS Auctions
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-border gap-2"
            onClick={() => qc.invalidateQueries({ queryKey: ["sync_log"] })}
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Credential status banner ─────────────────────────────────────────── */}
      <div className={`glass-card rounded-xl p-4 flex items-center gap-3 border ${
        credentialsConfigured ? "border-brand-emerald/40" : "border-brand-gold/40"
      }`}>
        {credentialsConfigured
          ? <Wifi className="w-5 h-5 text-brand-emerald shrink-0" />
          : <WifiOff className="w-5 h-5 text-brand-gold shrink-0" />
        }
        <div className="flex-1">
          {credentialsConfigured ? (
            <>
              <p className="text-sm font-semibold text-brand-emerald">OS Connection Active</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Token-based auth with <code className="bg-secondary px-1 rounded">POST /auth/login</code>. Syncs are live.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-brand-gold">OS Credentials Pending</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ensure{" "}
                <code className="bg-secondary px-1 rounded">MAIPROP_OS_URL</code>,{" "}
                <code className="bg-secondary px-1 rounded">MAIPROP_OS_EMAIL</code> and{" "}
                <code className="bg-secondary px-1 rounded">MAIPROP_OS_PASSWORD</code>{" "}
                are set. Syncs will run as soon as credentials are valid.
              </p>
            </>
          )}
        </div>
        <span className="text-xs bg-secondary rounded-full px-2 py-1 text-muted-foreground shrink-0">
          Webhook ready
        </span>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map(s => (
          <div key={s.label} className="glass-card rounded-xl p-3 text-center">
            <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
            <div className={`font-display text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {lastSync && (
        <p className="text-xs text-muted-foreground">
          Last sync event:{" "}
          <span className="text-foreground font-medium">{new Date(lastSync).toLocaleString()}</span>
        </p>
      )}

      {/* ── 3-column action panels ───────────────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-4">

        {/* Poll OS Auctions → Hub */}
        <div className="glass-card rounded-xl p-5 space-y-3 border border-border">
          <div className="flex items-center gap-2">
            <ArrowDownLeft className="w-5 h-5 text-primary shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">OS Auctions → Hub</h2>
              <p className="text-xs text-muted-foreground">Pull new & updated auctions from OS into the Hub auction module.</p>
            </div>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3 text-xs space-y-1">
            <p className="font-medium text-foreground">What gets synced:</p>
            <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>Auction date, court, starting bid</li>
              <li>Property category, KAEK, location</li>
              <li>Images, description, sqm</li>
              <li>Deduped via <code className="bg-background px-1 rounded">os_auction:{"{id}"}</code> tag</li>
            </ul>
          </div>
          <Button
            className="w-full gap-2"
            size="sm"
            disabled={pollAuctionsMutation.isPending}
            onClick={() => pollAuctionsMutation.mutate()}
          >
            {pollAuctionsMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />}
            Pull Auctions Now
          </Button>
        </div>

        {/* Hub Listings → OS */}
        <div className="glass-card rounded-xl p-5 space-y-3 border border-border">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-brand-emerald shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">Hub Listings → OS</h2>
              <p className="text-xs text-muted-foreground">Push active Hub listings to maiProp OS backoffice.</p>
            </div>
          </div>
          {listings && listings.length > 0 ? (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {listings.map((l: any) => (
                <div key={l.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{l.title}</p>
                    <p className="text-xs text-muted-foreground">{l.city}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-border gap-1 text-xs shrink-0 h-7 px-2"
                    disabled={syncingId === l.id || syncListingMutation.isPending}
                    onClick={() => { setSyncingId(l.id); syncListingMutation.mutate(l.id); }}
                  >
                    {syncingId === l.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Send className="w-3 h-3" />}
                    Push
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground bg-secondary/40 rounded-lg p-3">
              No active listings. Publish a listing first.
            </p>
          )}
        </div>

        {/* Firesale → OS */}
        <div className="glass-card rounded-xl p-5 space-y-3 border border-border">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">Firesale™ → OS</h2>
              <p className="text-xs text-muted-foreground">Push instant-offer opportunities to OS as leads.</p>
            </div>
          </div>
          {firesales && firesales.length > 0 ? (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {firesales.map((f: any) => (
                <div key={f.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{f.address}, {f.city}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {f.status}{f.ai_estimate ? ` · AI: €${Number(f.ai_estimate).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 gap-1 text-xs shrink-0 h-7 px-2 text-destructive"
                    disabled={syncingId === f.id || syncFiresaleMutation.isPending}
                    onClick={() => { setSyncingId(f.id); syncFiresaleMutation.mutate(f.id); }}
                  >
                    {syncingId === f.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Send className="w-3 h-3" />}
                    Push
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground bg-secondary/40 rounded-lg p-3">
              No pending firesale requests.
            </p>
          )}
        </div>
      </div>

      {/* ── Inbound webhook info ─────────────────────────────────────────────── */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <ArrowDownLeft className="w-4 h-4 text-primary" />
          Inbound Webhook (OS → Hub)
        </h2>
        <p className="text-xs text-muted-foreground">
          Configure maiProp OS to POST events to this endpoint for real-time inbound sync:
        </p>
        <div className="bg-secondary rounded-lg p-3 font-mono text-xs text-foreground break-all select-all">
          {`https://jglqlaynezspefoovqyc.supabase.co/functions/v1/receive-from-os`}
        </div>
        <p className="text-xs text-muted-foreground">
          Payload:{" "}
          <code className="bg-secondary px-1 rounded">{"{ event, entity_type, data }"}</code>.
          Supported types:{" "}
          <code className="bg-secondary px-1 rounded">listing</code>,{" "}
          <code className="bg-secondary px-1 rounded">lead</code>,{" "}
          <code className="bg-secondary px-1 rounded">profile</code>.
          Secure with <code className="bg-secondary px-1 rounded">x-os-signature</code> header.
        </p>
      </div>

      {/* ── Sync log table ───────────────────────────────────────────────────── */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">Sync Log (last 50)</h2>
          <div className="flex items-center gap-1.5">
            <ListFilter className="w-3.5 h-3.5 text-muted-foreground" />
            {(["all", "hub_to_os", "os_to_hub"] as const).map(f => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  logFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f === "hub_to_os" ? "Hub→OS" : "OS→Hub"}
              </button>
            ))}
          </div>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No sync events yet. Push a listing or poll auctions to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  {["Time", "Direction", "Type", "Entity ID", "Status", "Message"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      {log.direction === "hub_to_os" ? (
                        <span className="flex items-center gap-1 text-primary">
                          <ArrowUpRight className="w-3 h-3" /> Hub→OS
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-brand-emerald">
                          <ArrowDownLeft className="w-3 h-3" /> OS→Hub
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 capitalize">{log.entity_type}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground truncate max-w-[120px]">
                      {log.entity_id}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                        log.status === "success"
                          ? "bg-brand-emerald/15 text-brand-emerald"
                          : log.status === "error"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-brand-gold/15 text-brand-gold"
                      }`}>
                        {log.status === "success" ? <CheckCircle2 className="w-3 h-3" /> :
                         log.status === "error"   ? <AlertCircle  className="w-3 h-3" /> :
                                                    <Clock        className="w-3 h-3" />}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">
                      {log.error_message || (log.records_affected ? `${log.records_affected} record(s)` : "—")}
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
