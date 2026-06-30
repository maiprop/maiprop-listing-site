/**
 * Investor subscribers management. Admin-only.
 */

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Users, UserCheck, Clock, Ban, RefreshCw, Save, ArrowUpCircle, ArrowLeftRight, Loader2, ShieldCheck } from "lucide-react";
import { usePricingConfigs, formatPrice, INVESTOR_TIER_TO_KEY } from "@/hooks/usePricingConfigs";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SUBSCRIPTION_STATUS_COLORS } from "@/lib/statusColors";
import { logger } from "@/lib/logger";
import type { Database } from "@/integrations/supabase/types";
import { parseMutationInput, rowUpdateMutationSchema } from "@/lib/mutationSchemas";

function TransferAdminForm({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const doTransfer = async (trimmed: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("transfer-platform-admin", {
        body: { targetEmail: trimmed },
      });
      if (error) throw error;
      toast.success("Admin rights transferred. You will be redirected.");
      Promise.resolve(onSuccess()).catch((err: unknown) => {
        logger.warn("[AdminSubscribers] post-transfer refresh failed:", err instanceof Error ? err.message : err);
      });
      window.location.href = "/dashboard";
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Transfer failed");
    } finally {
      setLoading(false);
    }
  };
  const trimmed = email.trim().toLowerCase();
  return (
    <div className="flex gap-2 flex-wrap">
      <input
        type="email"
        placeholder="new-admin@example.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="flex-1 min-w-[200px] h-9 px-3 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
      />
      <Button size="sm" className="h-9 gap-1.5"
        onClick={() => { if (trimmed) setConfirmOpen(true); else toast.error("Enter the new admin's email"); }}
        disabled={loading}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
        Transfer admin
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title="Transfer admin rights?"
        description={`You will permanently lose admin access and transfer it to ${trimmed}. This cannot be undone.`}
        confirmLabel="Yes, transfer"
        onConfirm={() => { setConfirmOpen(false); doTransfer(trimmed); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

type Subscription = {
  id: string;
  user_id: string;
  tier: "private" | "institutional" | "developer";
  status: "active" | "cancelled" | "expired" | "trial";
  started_at: string;
  expires_at: string | null;
};

type AdminSubscription = Subscription & { display_name?: string | null; email?: string | null };
type SubscriptionUpdate = Pick<Database["public"]["Tables"]["investor_subscriptions"]["Update"], "tier" | "status" | "expires_at">;

function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function useAdminSubscriptions() {
  return useQuery<AdminSubscription[]>({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      type SubRow = {
        id: string;
        user_id: string;
        tier: string;
        status: string;
        started_at: string | null;
        expires_at: string | null;
        created_at: string | null;
      };
      type ProfileRow = { user_id: string; display_name: string | null };

      const { data: subs, error } = await supabase
        .from("investor_subscriptions")
        .select("id, user_id, tier, status, started_at, expires_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const subRows = (subs ?? []) as SubRow[];
      const userIds = subRows.map((s) => s.user_id);
      const profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles_public")
          .select("user_id, display_name")
          .in("user_id", userIds);
        for (const p of ((profiles ?? []) as ProfileRow[])) {
          profileMap[p.user_id] = p.display_name || p.user_id.slice(0, 8);
        }
      }
      return subRows.map((s) => ({
        ...s,
        display_name: profileMap[s.user_id] || s.user_id.slice(0, 8),
      })) as AdminSubscription[];
    },
  });
}

function useUpdateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ subId, updates }: { subId: string; updates: SubscriptionUpdate }) => {
      const payload = parseMutationInput(
        rowUpdateMutationSchema,
        { id: subId, updates },
        "subscription update",
      );
      const { error } = await supabase
        .from("investor_subscriptions")
        .update(payload.updates as SubscriptionUpdate)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      toast.success("Subscription updated");
    },
    onError: () => toast.error("Update failed"),
  });
}

export default function AdminSubscribers() {
  const { refreshProfile } = useAuth();
  const { data: pricingConfigs = {} } = usePricingConfigs();
  const { data: allSubs = [], isLoading: subsLoading, refetch } = useAdminSubscriptions();
  const updateSub = useUpdateSubscription();
  const [subsFilter, setSubsFilter] = useState<"all" | "active" | "trial" | "cancelled" | "expired">("all");
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState<string>("");
  const [editExpiry, setEditExpiry] = useState<string>("");

  const handleSubUpdate = (subId: string, updates: SubscriptionUpdate) => {
    updateSub.mutate({ subId, updates }, { onSuccess: () => setEditingSubId(null) });
  };

  const filtered = allSubs.filter(s => subsFilter === "all" || s.status === subsFilter);
  const investorPriceLabel = (tier: "private" | "institutional") => {
    const config = pricingConfigs[INVESTOR_TIER_TO_KEY[tier]];
    return config && Number(config.amount) > 0
      ? formatPrice(config, { showUnit: true, fallback: "Custom annual link" })
      : "Custom annual link";
  };
  const estimatedMrr = allSubs
    .filter(s => s.status === "active")
    .reduce((total, sub) => {
      if (sub.tier !== "private" && sub.tier !== "institutional") return total;
      return total + Number(pricingConfigs[INVESTOR_TIER_TO_KEY[sub.tier]]?.amount ?? 0);
    }, 0);
  const tierConfig: Record<string, { color: string; price: string }> = {
    private: {
      color: "text-primary border-primary/20 bg-primary/10",
      price: investorPriceLabel("private"),
    },
    institutional: {
      color: "text-accent border-accent/20 bg-accent/10",
      price: investorPriceLabel("institutional"),
    },
    developer: { color: "text-brand-gold border-brand-gold/20 bg-brand-gold/10", price: "Custom" },
  };
  const statusColor = SUBSCRIPTION_STATUS_COLORS;

  return (
    <div className="space-y-6">
      {/* Transfer platform admin â€” only current admin can grant */}
      <div className="glass-card rounded-xl border border-primary/30 p-4 space-y-3">
        <p className="font-display font-semibold text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" /> Transfer platform admin
        </p>
        <p className="text-xs text-muted-foreground">
          Only one platform admin exists. Transferring will revoke your admin rights and grant them to the user with the given email.
        </p>
        <TransferAdminForm onSuccess={refreshProfile} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: allSubs.length, color: "text-foreground", icon: Users },
          { label: "Active", value: allSubs.filter(s => s.status === "active").length, color: "text-brand-emerald", icon: UserCheck },
          { label: "Trial", value: allSubs.filter(s => s.status === "trial").length, color: "text-brand-gold", icon: Clock },
          { label: "Cancelled/Expired", value: allSubs.filter(s => s.status === "cancelled" || s.status === "expired").length, color: "text-destructive", icon: Ban },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2"><p className="text-[10px] text-muted-foreground uppercase tracking-widest">{s.label}</p><s.icon className={`w-3.5 h-3.5 ${s.color}`} /></div>
            <p className={`font-display font-black text-2xl ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>
      <div className="glass-card rounded-xl border border-primary/20 p-4 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Configured MRR</p>
          <p className="font-display font-black text-2xl text-primary">
            €{estimatedMrr.toLocaleString()}
          </p>
          {estimatedMrr === 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Investor payments use custom annual Checkout links and are reconciled from Stripe payments.
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" className="border-border text-xs h-8 gap-1.5" onClick={() => refetch()}><RefreshCw className={`w-3 h-3 ${subsLoading ? "animate-spin" : ""}`} /> Refresh</Button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "active", "trial", "cancelled", "expired"] as const).map(s => (
          <button key={s} onClick={() => setSubsFilter(s)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all capitalize ${subsFilter === s ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:border-primary/40"}`}>
            {s === "all" ? `All (${allSubs.length})` : `${s} (${allSubs.filter(x => x.status === s).length})`}
          </button>
        ))}
      </div>
      {subsLoading ? (
        <div className="flex justify-center py-20"><RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20"><Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No subscribers yet.</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(sub => {
            const isEditing = editingSubId === sub.id;
            const subDaysLeft = daysUntilExpiry(sub.expires_at);
            return (
              <div key={sub.id} className="glass-card rounded-xl border border-border overflow-hidden">
                <div className="p-4 flex items-center gap-4 flex-wrap">
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-sm text-primary shrink-0 uppercase">{(sub.display_name || "?")[0]}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{sub.display_name || "Unknown"}</p>
                    <p className="text-[10px] text-muted-foreground">Since {new Date(sub.started_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{sub.expires_at && <> Â· Expires {new Date(sub.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full capitalize ${tierConfig[sub.tier]?.color}`}>{sub.tier} Â· {tierConfig[sub.tier]?.price}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full capitalize ${statusColor[sub.status]}`}>{sub.status}</span>
                    {subDaysLeft !== null && subDaysLeft <= 7 && subDaysLeft >= 0 && <span className="text-[10px] font-bold text-destructive border border-destructive/20 bg-destructive/10 px-2 py-0.5 rounded-full">Expires in {subDaysLeft}d</span>}
                  </div>
                  <Button size="sm" variant="outline" className="border-border text-xs h-8 gap-1" onClick={() => { if (isEditing) setEditingSubId(null); else { setEditingSubId(sub.id); setEditTier(sub.tier); setEditExpiry(sub.expires_at ? sub.expires_at.slice(0, 10) : ""); } }}>{isEditing ? "Cancel" : "Edit"}</Button>
                </div>
                {isEditing && (
                  <div className="border-t border-border p-4 bg-muted/20 space-y-4">
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Tier</label>
                        <select value={editTier} onChange={e => setEditTier(e.target.value)} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary">
                          <option value="private">Private - {investorPriceLabel("private")}</option>
                          <option value="institutional">Institutional - {investorPriceLabel("institutional")}</option>
                          <option value="developer">Developer - Custom</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Status</label>
                        <select value={sub.status} onChange={e => handleSubUpdate(sub.id, { status: e.target.value as Subscription["status"] })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary">
                          <option value="active">Active</option>
                          <option value="trial">Trial</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="expired">Expired</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Expiry</label>
                        <input type="date" value={editExpiry} onChange={e => setEditExpiry(e.target.value)} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground text-xs h-8 gap-1.5" onClick={() => handleSubUpdate(sub.id, { tier: editTier as Subscription["tier"], expires_at: editExpiry ? new Date(editExpiry).toISOString() : null })}><Save className="w-3 h-3" /> Save</Button>
                      <Button size="sm" variant="outline" className="border-destructive/40 text-destructive text-xs h-8 gap-1.5" onClick={() => handleSubUpdate(sub.id, { status: "cancelled" })}><Ban className="w-3 h-3" /> Cancel Sub</Button>
                      <Button size="sm" variant="outline" className="border-brand-emerald/40 text-brand-emerald text-xs h-8 gap-1.5" onClick={() => handleSubUpdate(sub.id, { status: "active", tier: editTier as Subscription["tier"] })}><ArrowUpCircle className="w-3 h-3" /> Activate</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
