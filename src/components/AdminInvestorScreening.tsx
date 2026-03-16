/**
 * Admin Investor Screening — screen deals before publishing to main Investor Dashboard.
 * Admin reviews unpublished deals and publishes approved ones.
 */

import { useState, useEffect } from "react";
import { FolderKanban, Check, X, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: "Pending",     color: "bg-brand-gold/15 text-brand-gold border-brand-gold/20" },
  reviewed:    { label: "Reviewed",    color: "bg-primary/15 text-primary border-primary/20" },
  offer_sent:  { label: "Offer Sent",  color: "bg-accent/15 text-accent border-accent/20" },
  closed:      { label: "Closed",      color: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20" },
};

// "published" = status === "reviewed" or "offer_sent" or "closed" (admin has actioned it)
// "unpublished" = status === "pending"
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
  created_at: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminInvestorScreening() {
  const [deals, setDeals] = useState<ScreeningDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"unpublished" | "published">("unpublished");

  const loadDeals = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("firesale_requests")
        .select("id, address, city, property_type, sqm, bedrooms, ai_estimate, asking_price, status, created_at, published_to_investors")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDeals((data || []) as ScreeningDeal[]);
    } catch {
      toast.error("Could not load deals.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDeals(); }, []);

  const unpublished = deals.filter(d => !d.published_to_investors);
  const published = deals.filter(d => d.published_to_investors);
  const displayList = filter === "unpublished" ? unpublished : published;

  const handlePublish = async (id: string) => {
    const { error } = await supabase
      .from("firesale_requests")
      .update({ published_to_investors: true })
      .eq("id", id);
    if (error) {
      toast.error("Failed to publish");
      return;
    }
    setDeals(prev => prev.map(d => d.id === id ? { ...d, published_to_investors: true } : d));
    toast.success("Published to Investor Dashboard");
  };

  const handleUnpublish = async (id: string) => {
    const { error } = await supabase
      .from("firesale_requests")
      .update({ published_to_investors: false })
      .eq("id", id);
    if (error) {
      toast.error("Failed to unpublish");
      return;
    }
    setDeals(prev => prev.map(d => d.id === id ? { ...d, published_to_investors: false } : d));
    toast.success("Removed from Investor Dashboard");
  };

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
              filter === "unpublished" ? "bg-brand-gold/15 text-brand-gold border-brand-gold/30" : "border-border hover:bg-muted/50"
            }`}
          >
            Pending screening ({unpublished.length})
          </button>
          <button
            onClick={() => setFilter("published")}
            className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
              filter === "published" ? "bg-primary/15 text-primary border-primary/30" : "border-border hover:bg-muted/50"
            }`}
          >
            Published ({published.length})
          </button>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={loadDeals}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
        <Link to="/investor-dashboard">
          <Button size="sm" variant="outline" className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> View main Investor Dashboard
          </Button>
        </Link>
      </div>

      {loading ? (
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
          {displayList.map(deal => {
            const statusCfg = STATUS_CONFIG[deal.status] || STATUS_CONFIG.pending;
            const discount = deal.ai_estimate && deal.asking_price
              ? ((1 - deal.asking_price / deal.ai_estimate) * 100).toFixed(1)
              : null;
            return (
              <div key={deal.id} className="glass-card rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full capitalize">
                      {deal.property_type || "property"}
                    </span>
                  </div>
                  <p className="font-medium truncate">{deal.address}, {deal.city}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {deal.sqm} m²
                    {deal.bedrooms != null && ` · ${deal.bedrooms} bed`}
                    {deal.asking_price != null && ` · €${(deal.asking_price / 1000).toFixed(0)}k`}
                    {discount != null && ` · ${discount}% below estimate`}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(deal.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {filter === "unpublished" ? (
                    <Button size="sm" className="bg-primary text-primary-foreground gap-1" onClick={() => handlePublish(deal.id)}>
                      <Check className="w-3.5 h-3.5" /> Publish
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => handleUnpublish(deal.id)}>
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
