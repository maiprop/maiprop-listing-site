import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, ArrowUpRight, ArrowDownLeft, CheckCircle2,
  AlertCircle, Clock, Loader2, Activity, Wifi, WifiOff, Send
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
    refetchInterval: 30_000,
  });
}

export function OSSyncPanel() {
  const qc = useQueryClient();
  const { data: logs = [], isLoading } = useSyncLogs();
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Get user's active listings to manually trigger sync
  const { data: listings } = useQuery({
    queryKey: ["my-listings-for-sync"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("listings")
        .select("id, title, status, city")
        .eq("owner_id", user.id)
        .eq("status", "active")
        .limit(20);
      return data ?? [];
    },
  });

  const syncListingMutation = useMutation({
    mutationFn: async (listing_id: string) => {
      const { data, error } = await supabase.functions.invoke("sync-to-os", {
        body: { listing_id, entity_type: "listing" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (result, listing_id) => {
      setSyncingId(null);
      qc.invalidateQueries({ queryKey: ["sync_log"] });
      if (result?.status === "skipped") {
        toast.info("Sync queued — OS credentials not yet configured.", {
          description: "Add MAIPROP_OS_URL and MAIPROP_OS_API_KEY to enable live push.",
        });
      } else {
        toast.success("Listing synced to maiProp OS!");
      }
    },
    onError: (err: any) => {
      setSyncingId(null);
      toast.error("Sync failed: " + err.message);
    },
  });

  // Stats derived from logs
  const totalSuccess = logs.filter(l => l.status === "success").length;
  const totalErrors = logs.filter(l => l.status === "error").length;
  const totalSkipped = logs.filter(l => l.status === "skipped").length;
  const lastSync = logs[0]?.created_at;
  const hubToOs = logs.filter(l => l.direction === "hub_to_os").length;
  const osToHub = logs.filter(l => l.direction === "os_to_hub").length;
  const hasCredentials = true; // visual indicator only; actual check happens server-side

  const stats = [
    { label: "Successful", value: totalSuccess, icon: CheckCircle2, color: "text-brand-emerald" },
    { label: "Errors", value: totalErrors, icon: AlertCircle, color: "text-destructive" },
    { label: "Skipped", value: totalSkipped, icon: Clock, color: "text-brand-gold" },
    { label: "Hub → OS", value: hubToOs, icon: ArrowUpRight, color: "text-primary" },
    { label: "OS → Hub", value: osToHub, icon: ArrowDownLeft, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            OS Sync Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor & control bidirectional data sync between maiProp Hub and maiProp OS.
          </p>
        </div>
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

      {/* Status Banner */}
      <div className="glass-card rounded-xl p-4 flex items-center gap-3 border border-border">
        <WifiOff className="w-5 h-5 text-brand-gold shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-brand-gold">OS Credentials Not Configured</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Syncs will be queued as <span className="text-brand-gold font-medium">skipped</span> until you add{" "}
            <code className="text-xs bg-secondary px-1 rounded">MAIPROP_OS_URL</code> and{" "}
            <code className="text-xs bg-secondary px-1 rounded">MAIPROP_OS_API_KEY</code> to your backend secrets.
          </p>
        </div>
        <span className="text-xs bg-secondary rounded-full px-2 py-1 text-muted-foreground shrink-0">Webhook ready</span>
      </div>

      {/* Stats */}
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
          Last sync event: <span className="text-foreground font-medium">{new Date(lastSync).toLocaleString()}</span>
        </p>
      )}

      {/* Manual Trigger */}
      {listings && listings.length > 0 && (
        <div className="glass-card rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-sm">Push Active Listings to OS</h2>
          <p className="text-xs text-muted-foreground">Manually trigger a sync for any active listing.</p>
          <div className="space-y-2">
            {listings.map((l: any) => (
              <div key={l.id} className="flex items-center gap-3 bg-secondary/50 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{l.title}</p>
                  <p className="text-xs text-muted-foreground">{l.city} · {l.status}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border gap-1.5 text-xs shrink-0"
                  disabled={syncingId === l.id || syncListingMutation.isPending}
                  onClick={() => {
                    setSyncingId(l.id);
                    syncListingMutation.mutate(l.id);
                  }}
                >
                  {syncingId === l.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  Sync
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Webhook Info */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <ArrowDownLeft className="w-4 h-4 text-primary" />
          Inbound Webhook (OS → Hub)
        </h2>
        <p className="text-xs text-muted-foreground">
          Configure maiProp OS to POST events to this endpoint:
        </p>
        <div className="bg-secondary rounded-lg p-3 font-mono text-xs text-foreground break-all select-all">
          {`https://jglqlaynezspefoovqyc.supabase.co/functions/v1/receive-from-os`}
        </div>
        <p className="text-xs text-muted-foreground">
          Payload format: <code className="bg-secondary px-1 rounded">{"{ event, entity_type, data }"}</code>.
          Supported <code className="bg-secondary px-1 rounded">entity_type</code>:{" "}
          <code className="bg-secondary px-1 rounded">listing</code>,{" "}
          <code className="bg-secondary px-1 rounded">lead</code>,{" "}
          <code className="bg-secondary px-1 rounded">profile</code>. Add{" "}
          <code className="bg-secondary px-1 rounded">x-os-signature</code> header for security.
        </p>
      </div>

      {/* Sync Log Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm">Sync Log (last 50)</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No sync events yet. Push a listing to get started.
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
                {logs.map(log => (
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
                         log.status === "error" ? <AlertCircle className="w-3 h-3" /> :
                         <Clock className="w-3 h-3" />}
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
