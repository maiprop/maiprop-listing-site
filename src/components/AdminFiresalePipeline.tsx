/**
 * Firesale pipeline — manage firesale requests. Admin-only.
 * Extracted from InvestorDashboard for dedicated Admin Dashboard.
 */

import { useState } from "react";
import { RefreshCw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { STATUS_CONFIG, type AdminDeal, AdminDealRow } from "@/components/admin/FiresaleComponents";

function useAdminDeals() {
  return useQuery<AdminDeal[]>({
    queryKey: ["admin-firesale-deals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firesale_requests")
        .select("id, address, city, property_type, sqm, bedrooms, condition, ai_estimate, asking_price, offer_price, status, contact_email, contact_phone, notes, admin_notes, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AdminDeal[];
    },
  });
}

function useUpdateAdminDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      admin_notes,
      offerPrice,
    }: {
      id: string;
      status: string;
      admin_notes: string;
      offerPrice?: number;
    }) => {
      const { data, error } = await supabase.rpc("admin_update_firesale_pipeline_deal" as never, {
        p_deal_id: id,
        p_status: status,
        p_admin_notes: admin_notes,
        p_offer_price: offerPrice ?? null,
      } as never);
      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      return { notified: Number((result as { notified?: number } | null)?.notified ?? 0) };
    },
    onSuccess: (result, { status }) => {
      qc.invalidateQueries({ queryKey: ["admin-firesale-deals"] });
      if (status === "offer_sent") {
        toast.success(`Offer sent — ${result.notified} investor${result.notified !== 1 ? "s" : ""} notified`);
      } else {
        toast.success(status === "closed" ? "Deal closed!" : "Deal updated");
      }
    },
    onError: () => toast.error("Failed to update firesale deal. Please try again."),
  });
}

export default function AdminFiresalePipeline() {
  const [adminFilter, setAdminFilter] = useState("all");
  const { data: adminDeals = [], isLoading, refetch } = useAdminDeals();
  const updateDeal = useUpdateAdminDeal();

  const handleAdminUpdate = async (id: string, status: string, admin_notes: string, offerPrice?: number) => {
    updateDeal.mutate({ id, status, admin_notes, offerPrice });
  };

  const adminStats = {
    total: adminDeals.length,
    pending: adminDeals.filter((d) => d.status === "pending").length,
    reviewed: adminDeals.filter((d) => d.status === "reviewed").length,
    offer_sent: adminDeals.filter((d) => d.status === "offer_sent").length,
    closed: adminDeals.filter((d) => d.status === "closed").length,
    totalValue: adminDeals.reduce((s, d) => s + Number(d.asking_price || 0), 0),
  };

  const filteredAdmin = adminDeals.filter((d) => adminFilter === "all" || d.status === adminFilter);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: adminStats.total, color: "text-foreground" },
          { label: "Pending", value: adminStats.pending, color: "text-brand-gold" },
          { label: "Reviewed", value: adminStats.reviewed, color: "text-primary" },
          { label: "Offer Sent", value: adminStats.offer_sent, color: "text-accent" },
          { label: "Closed", value: adminStats.closed, color: "text-brand-emerald" },
        ].map((s) => (
          <div key={s.label} className="glass-card rounded-xl border border-border p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`font-display font-black text-2xl ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>
      <div className="glass-card rounded-xl border border-border p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Total Pipeline Value (Asking)</p>
          <p className="font-display font-black text-2xl text-primary">
            €{(adminStats.totalValue / 1_000_000).toFixed(2)}M
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-border text-xs h-8 gap-1.5"
          onClick={() => refetch()}
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {["all", "pending", "reviewed", "offer_sent", "closed"].map((s) => (
          <button
            key={s}
            onClick={() => setAdminFilter(s)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all capitalize ${
              adminFilter === s
                ? s === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : STATUS_CONFIG[s]?.color + " ring-1 ring-offset-1 ring-offset-background"
                : "text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            {s === "all"
              ? `All (${adminStats.total})`
              : `${STATUS_CONFIG[s]?.label} (${adminDeals.filter((d) => d.status === s).length})`}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : filteredAdmin.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No requests found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAdmin.map((deal) => (
            <AdminDealRow key={deal.id} deal={deal} onUpdate={handleAdminUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
