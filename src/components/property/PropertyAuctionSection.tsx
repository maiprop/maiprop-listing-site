import { Building2, Gavel, History } from "lucide-react";
import { Section, SectionHeader } from "@/components/property/DetailPrimitives";
import { PastDealsTable } from "@/components/PastDealsTable";
import { useSubscription } from "@/hooks/useSubscription";

interface OwnershipDisplay {
  label: string;
  cls: string;
}

interface Props {
  listingId: string;
  auctionDate: string | null | undefined;
  auctionStartingBid: number | null | undefined;
  ownershipDisplay: OwnershipDisplay | null;
  ownershipPct: number | null;
  ownershipStatus: string | null;
}

export function PropertyAuctionSection({
  listingId,
  auctionDate,
  auctionStartingBid,
  ownershipDisplay,
  ownershipPct,
  ownershipStatus,
}: Props) {
  const { isPro } = useSubscription();

  return (
    <Section>
      <SectionHeader
        icon={Gavel}
        title="Auction Details"
        badge={
          <span className="text-[10px] bg-brand-gold/20 text-brand-gold px-2 py-0.5 rounded-full font-bold">LIVE</span>
        }
      />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card rounded-xl p-4 border border-border text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Auction Date</p>
            <p className="font-display font-bold text-sm">
              {auctionDate ? new Date(auctionDate).toLocaleDateString("en-GB") : "TBC"}
            </p>
          </div>
          <div className="glass-card rounded-xl p-4 border border-brand-gold/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Starting Bid</p>
            <p className="font-display font-bold text-sm text-brand-gold">
              €{(auctionStartingBid || 0).toLocaleString()}
            </p>
          </div>
        </div>

        {ownershipDisplay && (
          <div className="flex items-center justify-between rounded-xl bg-secondary border border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Ownership Status</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${ownershipDisplay.cls}`}>
                {ownershipDisplay.label}
              </span>
              {ownershipPct != null && ownershipStatus !== "full" && (
                <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-1 rounded-full border border-border">
                  {ownershipPct}%
                </span>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl bg-brand-gold/8 border border-brand-gold/20 p-3 text-xs text-muted-foreground leading-relaxed">
          ⚡ Judicial auction — buyer conducts own due diligence. maiProp provides AI-powered pre-auction analysis.
        </div>

        {isPro && (
          <div className="pt-4 border-t border-border mt-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
              <History className="w-3.5 h-3.5" /> Past Deals (OS)
            </p>
            <PastDealsTable listingId={listingId} />
          </div>
        )}
      </div>
    </Section>
  );
}
