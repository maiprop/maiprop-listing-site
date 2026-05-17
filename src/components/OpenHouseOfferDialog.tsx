/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import { Euro, Loader2, Clock, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  useOpenHouseSettings,
  useOpenHouseOffers,
  useSubmitOpenHouseOffer,
} from "@/hooks/useOpenHouseAssetControl";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  listingPrice: number;
  /** If false, user cannot submit (not attended / OH date not passed) */
  canSubmit?: boolean;
  /** Shown when canSubmit is false */
  offerBlockedReason?: string;
}

export default function OpenHouseOfferDialog({
  open,
  onClose,
  listingId,
  listingTitle,
  listingPrice,
  canSubmit = true,
  offerBlockedReason,
}: Props) {
  const { user } = useAuth();
  const { data: settings } = useOpenHouseSettings(listingId);
  const { data: offers = [] } = useOpenHouseOffers(listingId);
  const submitOffer = useSubmitOpenHouseOffer();

  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  const myOffer = offers.find((o: any) => o.bidder_id === user?.id);
  const offerDeadline = useMemo(
    () => settings?.offer_deadline ? new Date(settings.offer_deadline) : null,
    [settings?.offer_deadline]
  );
  const isExpired = offerDeadline ? offerDeadline < new Date() : false;
  const isBlocked = !canSubmit;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open || !offerDeadline || isExpired) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [open, offerDeadline, isExpired]);

  const countdown = useMemo(() => {
    if (!offerDeadline || isExpired) return null;
    const now = new Date();
    const diff = offerDeadline.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} day${days > 1 ? "s" : ""} left`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} left`;
    const mins = Math.floor(diff / (1000 * 60));
    return mins > 0 ? `${mins} min left` : "Closing soon";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerDeadline, isExpired, tick]);

  useEffect(() => {
    if (open && !amount && listingPrice) setAmount(String(listingPrice));
  }, [open, listingPrice, amount]);

  const handleSubmit = async () => {
    if (!user) {
      toast.error("Sign in to submit an offer");
      return;
    }
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      await submitOffer.mutateAsync({ listingId, amount: num, message: message || undefined });
      toast.success("Offer submitted successfully");
      onClose();
    } catch (_err: unknown) {
      // handled by mutation onError
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Submit Offer</DialogTitle>
          <DialogDescription className="sr-only">
            Review offer eligibility and submit a sealed offer for this open-house listing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{listingTitle}</p>

          {isBlocked && offerBlockedReason && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/25">
              <Lock className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">{offerBlockedReason}</span>
            </div>
          )}

          {offerDeadline && (
            <div className={`flex items-center justify-between gap-2 p-3 rounded-xl ${isExpired ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              <span className="flex items-center gap-2 text-sm font-medium">
                <Clock className="w-4 h-4" />
                {isExpired ? "Deadline passed" : `Deadline: ${offerDeadline.toLocaleString("en-GB")}`}
              </span>
              {countdown && !isExpired && <span className="text-xs font-bold tabular-nums">{countdown}</span>}
            </div>
          )}

          {myOffer ? (
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm font-medium">Your offer: €{Number(myOffer.amount).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Status: {myOffer.status}</p>
              {myOffer.status === "submitted" && <p className="text-xs mt-1">Sealed until reveal</p>}
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-2">Amount (€)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={String(listingPrice)}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-lg font-semibold"
                  disabled={isExpired || isBlocked}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-2">Message (optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Add any conditions or notes..."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none h-20"
                  disabled={isExpired || isBlocked}
                />
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleSubmit}
                disabled={submitOffer.isPending || isExpired || isBlocked}
              >
                {submitOffer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Euro className="w-4 h-4" />}
                Submit Sealed Offer
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
