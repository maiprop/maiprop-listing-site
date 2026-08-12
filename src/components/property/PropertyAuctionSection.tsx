import { Building2, ExternalLink, Gavel, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "@/components/property/DetailPrimitives";
import { PastDealsTable } from "@/components/PastDealsTable";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessPastDeals } from "@/lib/pastDealsAccess";

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
  websiteUrl?: string | null;
}

export function PropertyAuctionSection({
  listingId,
  auctionDate,
  auctionStartingBid,
  ownershipDisplay,
  ownershipPct,
  ownershipStatus,
  websiteUrl,
}: Props) {
  const { isPro } = useSubscription();
  const { profile } = useAuth();
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const dateLocale = isGreek ? "el-GR" : "en-GB";
  const safeWebsiteUrl = websiteUrl && /^https?:\/\//i.test(websiteUrl) ? websiteUrl : null;

  return (
    <Section>
      <SectionHeader
        icon={Gavel}
        title={isGreek ? "Στοιχεία πλειστηριασμού" : "Auction Details"}
        badge={
          <span className="text-[10px] bg-brand-gold/20 text-brand-gold px-2 py-0.5 rounded-full font-bold">LIVE</span>
        }
      />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card rounded-xl p-4 border border-border text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{isGreek ? "Ημερομηνία πλειστηριασμού" : "Auction Date"}</p>
            <p className="font-display font-bold text-sm">
              {auctionDate ? new Date(auctionDate).toLocaleDateString(dateLocale) : (isGreek ? "Θα ανακοινωθεί" : "TBC")}
            </p>
          </div>
          <div className="glass-card rounded-xl p-4 border border-brand-gold/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{isGreek ? "Τιμή πρώτης προσφοράς" : "First Offer Price"}</p>
            <p className="font-display font-bold text-sm text-brand-gold">
              €{(auctionStartingBid || 0).toLocaleString()}
            </p>
          </div>
        </div>

        {ownershipDisplay && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary border border-border px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">{isGreek ? "Καθεστώς κυριότητας" : "Ownership Status"}</span>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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
          {isGreek
            ? "⚡ Ηλεκτρονικός πλειστηριασμός — ο ενδιαφερόμενος αγοραστής διενεργεί τον δικό του νομικό και τεχνικό έλεγχο. Το mAI prop παρέχει AI υποστηριζόμενη προ-πλειστηριαστική ανάλυση."
            : "⚡ Electronic auction — buyer conducts own due diligence. mAI prop provides AI-powered pre-auction analysis."}
        </div>

        {safeWebsiteUrl && (
          <Button asChild className="w-full gap-2">
            <a href={safeWebsiteUrl} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="w-4 h-4" />
              {isGreek ? "Άνοιγμα eAuction" : "Open eAuction"}
            </a>
          </Button>
        )}

        {canAccessPastDeals(profile, isPro) && (
          <div className="pt-4 border-t border-border mt-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
              <History className="w-3.5 h-3.5" /> {isGreek ? "Ιστορικές συναλλαγές (OS)" : "Past Deals (OS)"}
            </p>
            <PastDealsTable listingId={listingId} />
          </div>
        )}
      </div>
    </Section>
  );
}
