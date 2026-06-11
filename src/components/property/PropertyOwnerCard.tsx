import { Calendar, CheckCircle, Clock, Eye, Loader2, Lock, MessageSquare, Phone, Star, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface OwnerProfile {
  display_name?: string | null;
  avatar_url?: string | null;
  verified?: boolean;
}

interface PropertyOwnerCardProps {
  ownerProfile: OwnerProfile | null;
  ownerParticipantType: string | null;
  isAuction: boolean;
  ownerIsPro: boolean;
  price: number;
  listingType: string;
  pricePerSqm?: number | null;
  viewsCount: number;
  onContact: () => void;
  isContactPending: boolean;
  onRequestViewing: () => void;
  onRequestVideoViewing: () => void;
  canVideoView: boolean;
}

export default function PropertyOwnerCard({
  ownerProfile, ownerParticipantType, isAuction, ownerIsPro,
  price, listingType, pricePerSqm, viewsCount,
  onContact, isContactPending, onRequestViewing, onRequestVideoViewing, canVideoView,
}: PropertyOwnerCardProps) {
  const { i18n } = useTranslation();
  const isGreek = i18n?.language?.toLowerCase().startsWith("el") ?? false;
  const locale = isGreek ? "el-GR" : undefined;
  const ownerLabel =
    ownerParticipantType === "agent"
      ? (isGreek ? "Αδειοδοτημένος μεσίτης" : "Licensed real estate agent")
      : ownerParticipantType === "seller"
        ? (isGreek ? "Ιδιώτης πωλητής / εκμισθωτής" : "Private seller / landlord")
        : (isGreek ? "Ιδιοκτήτης αγγελίας" : "Listing owner");

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-primary/10 shadow-elevated">
      {!isAuction && (
        <div className="bg-gradient-to-br from-primary/10 to-accent/5 border-b border-border px-5 py-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
                {listingType === "rent" ? (isGreek ? "Μηνιαίο μίσθωμα" : "Monthly Rent") : (isGreek ? "Ζητούμενη τιμή" : "Asking Price")}
              </p>
              <p className="font-display text-2xl font-black text-foreground">
                €{price.toLocaleString(locale)}
                {listingType === "rent" && <span className="text-sm font-normal text-muted-foreground">{isGreek ? "/μήνα" : "/mo"}</span>}
              </p>
              {!!pricePerSqm && (
                <p className="text-xs text-muted-foreground mt-0.5">€{Number(pricePerSqm).toLocaleString(locale)}/m²</p>
              )}
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="w-3 h-3" />{viewsCount}
              </div>
              <p className="text-[10px] text-muted-foreground">{isGreek ? "προβολές" : "views"}</p>
            </div>
          </div>
        </div>
      )}

      {!isAuction && (
        <div className="px-5 py-4 border-b border-border">
          {ownerProfile ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground overflow-hidden shrink-0">
                {ownerProfile.avatar_url ? (
                  <img src={ownerProfile.avatar_url} alt={isGreek ? `Φωτογραφία προφίλ ${ownerProfile.display_name || "ιδιοκτήτη"}` : `${ownerProfile.display_name || "Owner"} profile photo`} className="w-full h-full object-cover" />
                ) : (
                  ownerProfile.display_name?.[0] || "O"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm truncate">{ownerProfile.display_name || (isGreek ? "Ιδιοκτήτης" : "Owner")}</p>
                  {ownerParticipantType === "agent" && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple border border-brand-purple/30">{isGreek ? "Μεσίτης" : "Agent"}</span>
                  )}
                  {ownerParticipantType === "seller" && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-400 border border-violet-500/30">{isGreek ? "Ιδιώτης" : "Private Seller"}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{ownerLabel}</p>
              </div>
              {ownerProfile.verified && (
                <div className="flex items-center gap-1 text-xs text-primary shrink-0">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{isGreek ? "Επαληθευμένο" : "Verified"}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0">A</div>
              <div>
                <p className="font-semibold text-sm">{isGreek ? "Αδειοδοτημένος μεσίτης" : "Licensed Agent"}</p>
                <div className="flex items-center gap-1 text-xs text-brand-gold mt-0.5">
                  <Star className="w-3 h-3 fill-current" /><span>{isGreek ? "Επαληθευμένο" : "Verified"}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!isAuction && (
        <div className="p-5 space-y-2.5">
          {ownerIsPro ? (
            <>
              <Button
                className="h-auto min-h-[44px] w-full whitespace-normal bg-gradient-primary border-0 text-center leading-tight text-primary-foreground gap-2"
                onClick={onContact}
                disabled={isContactPending}>
                {isContactPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                {isGreek ? "Αποστολή μηνύματος" : "Send Message"}
              </Button>
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                <Button variant="outline" className="h-auto min-h-[44px] whitespace-normal border-border px-3 py-2 text-center text-xs leading-tight gap-1.5">
                  <Phone className="w-3.5 h-3.5" />{isGreek ? "Κλήση" : "Call"}
                </Button>
                <Button variant="outline" className="h-auto min-h-[44px] whitespace-normal border-border px-3 py-2 text-center text-xs leading-tight gap-1.5" onClick={onRequestViewing}>
                  <Calendar className="w-3.5 h-3.5" />{isGreek ? "Επίσκεψη" : "Viewing"}
                </Button>
              </div>
              <Button
                variant="outline"
                className="h-auto min-h-[44px] w-full whitespace-normal border-border px-3 py-2 text-center text-xs leading-tight gap-2"
                onClick={onRequestVideoViewing}>
                <Video className="w-3.5 h-3.5" />{isGreek ? "Βιντεοκλήση" : "Video Viewing"}
                {!canVideoView && <Lock className="w-3 h-3 ml-0.5 opacity-60" />}
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{isGreek ? "Τα μηνύματα και ο συγχρονισμός ημερολογίου είναι διαθέσιμα σε ιδιοκτήτες με Pro." : "Messaging and calendar sync available for Pro property owners."}</p>
          )}
        </div>
      )}

      {!isAuction && (
        <div className="px-5 pb-4 text-center">
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" />{isGreek ? "Συνήθως απαντά μέσα σε 2 ώρες" : "Usually responds within 2 hours"}
          </p>
        </div>
      )}
    </div>
  );
}
