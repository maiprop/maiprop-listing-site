/**
 * Admin Investor Screening — screen deals before publishing to main Investor Dashboard.
 * Admin reviews unpublished deals and publishes approved ones.
 */

import { useState } from "react";
import { FolderKanban, Check, X, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { formatPrice, formatTimeAgo } from "@/lib/format";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: "Pending",     color: "bg-brand-gold/15 text-brand-gold border-brand-gold/20" },
  reviewed:    { label: "Reviewed",    color: "bg-primary/15 text-primary border-primary/20" },
  offer_sent:  { label: "Offer Sent",  color: "bg-accent/15 text-accent border-accent/20" },
  closed:      { label: "Closed",      color: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20" },
};

type ScreeningDeal = {
  id: string;
  address: string;
  city: string;
  property_type: string | null;
  sqm: number;
  bedrooms: number | null;
  ai_estimate: number | null;
  asking_price: number | null;
  status: string;
  published_to_investors: boolean;
  created_at: string;
};

type AdminFiresaleActionResponse = {
  data?: unknown;
  error?: string | null;
};

function useScreeningDeals() {
  return useQuery<ScreeningDeal[]>({
    queryKey: ["admin-screening-deals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firesale_requests")
        .select("id, address, city, property_type, sqm, bedrooms, ai_estimate, asking_price, status, published_to_investors, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ScreeningDeal[];
    },
  });
}

function useSetDealStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { data, error } = await supabase.functions.invoke<AdminFiresaleActionResponse>("admin-firesale-action", {
        body: {
          action: "set_investor_publication",
          dealId: id,
          published,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: (_, { published }) => {
      qc.invalidateQueries({ queryKey: ["admin-screening-deals"] });
      toast.success(
        published
          ? "Marked as reviewed — visible to investors"
          : "Returned to pending screening"
      );
    },
    onError: (_, { published }) => toast.error(published ? "Failed to publish" : "Failed to unpublish"),
  });
}

export default function AdminInvestorScreening() {
  const [filter, setFilter] = useState<"unpublished" | "published">("unpublished");
  const { data: deals = [], isLoading, refetch } = useScreeningDeals();
  const setStatus = useSetDealStatus();

  const unpublished = deals.filter((d) => !d.published_to_investors);
  const published = deals.filter((d) => d.published_to_investors);
  const displayList = filter === "unpublished" ? unpublished : published;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-brand-gold" /> Investor Deal Screening
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Screen deals before they appear in the main Investor Dashboard. Only published deals are visible to investors.
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("unpublished")}
            className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
              filter === "unpublished"
                ? "bg-brand-gold/15 text-brand-gold border-brand-gold/30"
                : "border-border hover:bg-muted/50"
            }`}
          >
            Pending screening ({unpublished.length})
          </button>
          <button
            onClick={() => setFilter("published")}
            className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
              filter === "published"
                ? "bg-primary/15 text-primary border-primary/30"
                : "border-border hover:bg-muted/50"
            }`}
          >
            Published ({published.length})
          </button>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}>
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
        <Link to="/investor-dashboard">
          <Button size="sm" variant="outline" className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> View main Investor Dashboard
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : displayList.length === 0 ? (
        <div className="glass-card rounded-xl border border-border p-12 text-center">
          <FolderKanban className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-foreground">
            {filter === "unpublished" ? "No deals awaiting screening" : "No published deals yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {filter === "unpublished"
              ? "Deals from the Quick Sale Pipeline will appear here. Use the Pipeline tab to review and progress deals first."
              : "Publish deals from the Pending screening tab to make them visible to investors."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayList.map((deal) => {
            const statusCfg = STATUS_CONFIG[deal.status] || STATUS_CONFIG.pending;
            const discount =
              deal.ai_estimate && deal.asking_price
                ? ((1 - deal.asking_price / deal.ai_estimate) * 100).toFixed(1)
                : null;
            return (
              <div
                key={deal.id}
                className="glass-card rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${statusCfg.color}`}
                    >
                      {statusCfg.label}
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full capitalize">
                      {deal.property_type || "property"}
                    </span>
                  </div>
                  <p className="font-medium truncate">
                    {deal.address}, {deal.city}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {deal.sqm} m²
                    {deal.bedrooms != null && ` · ${deal.bedrooms} bed`}
                    {deal.asking_price != null && ` · ${formatPrice(deal.asking_price)}`}
                    {discount != null && ` · ${discount}% below estimate`}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">{formatTimeAgo(deal.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {filter === "unpublished" ? (
                    <Button
                      size="sm"
                      className="bg-primary text-primary-foreground gap-1"
                      onClick={() => setStatus.mutate({ id: deal.id, published: true })}
                    >
                      <Check className="w-3.5 h-3.5" /> Publish
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => setStatus.mutate({ id: deal.id, published: false })}
                    >
                      <X className="w-3.5 h-3.5" /> Unpublish
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
