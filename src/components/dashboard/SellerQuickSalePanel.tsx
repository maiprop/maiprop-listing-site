import { Link } from "react-router-dom";
import { ArrowRight, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SellerQuickSaleRequest = {
  id: string;
  address: string;
  city: string;
  property_type: string | null;
  asking_price: number | null;
  offer_price: number | null;
  status: string;
  seller_response: string | null;
  seller_response_price: number | null;
  seller_responded_at: string | null;
  created_at: string;
};

const QUICK_SALE_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-brand-gold/15 text-brand-gold border-brand-gold/20" },
  reviewed: { label: "Reviewed", className: "bg-primary/15 text-primary border-primary/20" },
  offer_sent: { label: "Offer Sent", className: "bg-accent/15 text-accent border-accent/20" },
  closed: { label: "Closed", className: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20" },
};

function formatQuickSaleMoney(value: number | null | undefined) {
  if (value == null) return null;
  return `\u20ac${Number(value).toLocaleString()}`;
}

export function SellerQuickSalePanel({ requests }: { requests: SellerQuickSaleRequest[] }) {
  return (
    <div className="glass-card rounded-xl border border-destructive/20 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-semibold flex items-center gap-2">
            <Flame className="w-4 h-4 text-destructive" /> Quick Sale Requests
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Track your submitted Quick Sale pipeline status.</p>
        </div>
        <Button size="sm" variant="outline" className="border-destructive/30 text-destructive gap-1.5 shrink-0" asChild>
          <Link to="/firesale">New Request <ArrowRight className="w-3.5 h-3.5" /></Link>
        </Button>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No Quick Sale requests yet.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.slice(0, 4).map((request) => {
            const badge = QUICK_SALE_STATUS_BADGES[request.status] ?? QUICK_SALE_STATUS_BADGES.pending;
            const offer = formatQuickSaleMoney(request.offer_price);
            const response = request.seller_response ? request.seller_response.replace("_", " ") : null;
            return (
              <div key={request.id} className="rounded-lg border border-border bg-background/60 px-3 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${badge.className}`}>
                    {badge.label}
                  </span>
                  {response && (
                    <span className="text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full bg-muted text-muted-foreground border-border">
                      Seller {response}
                    </span>
                  )}
                </div>
                <div className="flex items-start justify-between gap-3 mt-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{request.address}, {request.city}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                      {request.property_type || "property"} - Submitted {new Date(request.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-muted-foreground">{offer ? "Offer" : "Asking"}</p>
                    <p className="text-sm font-bold">{offer ?? formatQuickSaleMoney(request.asking_price) ?? "TBD"}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
