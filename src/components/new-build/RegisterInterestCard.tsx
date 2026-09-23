import { useRef, useState } from "react";
import { MessageSquare, Loader2, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatNewBuildPrice } from "@/lib/newBuildConfig";
import { tFallback, tInterpolate } from "@/lib/i18nFallback";
import { calculatePricePerSqm } from "@/lib/priceCalculations";

export function RegisterInterestCard({
  listing,
  user,
  onLogin,
  onContact,
  submissionStatus = "editing",
  submissionError,
  onRetry,
  onStartNew,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listing: Record<string, any>;
  user: { id: string; email?: string } | null;
  onLogin: () => void;
  onContact: (form: { name: string; phone: string; message: string }) => Promise<"confirmed" | "uncertain" | "rejected" | void>;
  submissionStatus?: "editing" | "sending" | "uncertain" | "confirmed";
  submissionError?: string | null;
  onRetry?: () => Promise<void> | void;
  onStartNew?: () => void;
}) {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);
  const trv = (key: string, fallback: string, values: Record<string, string | number>) =>
    tInterpolate(t, key, fallback, values);
  const [form, setForm] = useState({ name: "", phone: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [localSubmissionError, setLocalSubmissionError] = useState<string | null>(null);
  const [confirmingNewEnquiry, setConfirmingNewEnquiry] = useState(false);
  const submittingRef = useRef(false);
  const pricePerSqm = calculatePricePerSqm({
    price: listing.price,
    sqm: listing.sqm,
    storedPricePerSqm: listing.price_per_sqm,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || submissionStatus !== "editing") return;
    submittingRef.current = true;
    setLocalSubmissionError(null);
    setLoading(true);
    try {
      const outcome = await onContact(form);
      if (outcome === undefined || outcome === "confirmed") {
        setForm({ name: "", phone: "", message: "" });
        setSubmitted(true);
      }
    } catch {
      setLocalSubmissionError(tr(
        "newBuildDetail.interestCard.submissionError",
        "We couldn't register your interest. Please try again.",
      ));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleStartNew = () => {
    setConfirmingNewEnquiry(false);
    setSubmitted(false);
    setLocalSubmissionError(null);
    onStartNew?.();
  };

  if (submitted || submissionStatus === "confirmed") {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <div className="text-center py-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <p className="font-display font-bold text-base mb-1">{tr("newBuildDetail.interestCard.submittedTitle", "Interest registered!")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {tr("newBuildDetail.interestCard.submittedBody", "Your enquiry was saved successfully.")}
          </p>
          <div className="mt-4 space-y-2">
            <div className="rounded-lg bg-secondary/60 border border-border px-3 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 shrink-0 text-primary" />
              {tr("newBuildDetail.interestCard.messageCopy", "A conversation with the developer is available in Messages")}
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={handleStartNew}>
              {tr("newBuildDetail.interestCard.makeAnother", "Make another enquiry")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const frozen = submissionStatus === "uncertain" || submissionStatus === "sending";
  const busy = loading || submissionStatus === "sending";
  const visibleError = submissionError ?? localSubmissionError;

  if (!user) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-0.5">{tr("newBuildDetail.interestCard.startingFrom", "Starting from")}</p>
          <p className="font-display text-3xl font-bold text-primary">{formatNewBuildPrice(Number(listing.price))}</p>
          {pricePerSqm != null && (
            <p className="text-xs text-muted-foreground mt-1">{trv("newBuildDetail.pricePerSqm", "{{price}} / m²", { price: formatNewBuildPrice(pricePerSqm) })}</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-secondary/40 p-4 mb-3">
          <p className="text-sm font-medium mb-1">{tr("newBuildDetail.interestCard.title", "Register your interest")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {tr("newBuildDetail.interestCard.signInBody", "Sign in to register interest and receive full unit availability, floor plans and pricing from the developer.")}
          </p>
        </div>
        <Button className="w-full gap-2" onClick={onLogin}>
          <MessageSquare className="w-4 h-4" /> {tr("newBuildDetail.interestCard.signInCta", "Sign in to Register Interest")}
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-b border-border px-5 py-4">
        <p className="text-xs text-muted-foreground mb-0.5">{tr("newBuildDetail.interestCard.startingFrom", "Starting from")}</p>
        <p className="font-display text-3xl font-bold text-primary">{formatNewBuildPrice(Number(listing.price))}</p>
        {pricePerSqm != null && (
          <p className="text-xs text-muted-foreground mt-1">{trv("newBuildDetail.pricePerSqm", "{{price}} / m²", { price: formatNewBuildPrice(pricePerSqm) })}</p>
        )}
        {listing.listing_type === "new_build" && (
          <div className="mt-3 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs text-primary font-medium">
            {tr("newBuildDetail.interestCard.preSaleNote", "Project pricing - early buyers may access preferential rates")}
          </div>
        )}
      </div>
      <div className="p-5">
        <p className="text-sm font-semibold mb-0.5">{tr("newBuildDetail.interestCard.title", "Register your interest")}</p>
        <p className="text-xs text-muted-foreground mb-4">
          {tr("newBuildDetail.interestCard.body", "Receive unit availability, floor plans and pricing directly from the developer.")}
        </p>
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <input
            type="text"
            placeholder={tr("newBuildDetail.interestCard.namePlaceholder", "Your name")}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            readOnly={frozen}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
          <input
            type="tel"
            placeholder={tr("newBuildDetail.interestCard.phonePlaceholder", "Phone number (optional)")}
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            readOnly={frozen}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
          <textarea
            placeholder={tr("newBuildDetail.interestCard.messagePlaceholder", "What are you looking for? (optional)")}
            rows={3}
            value={form.message}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            readOnly={frozen}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none"
          />
          {submissionStatus === "uncertain" && (
            <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed">
              <p>{tr(
                "newBuildDetail.interestCard.uncertain",
                "We couldn't confirm whether your enquiry was saved. Retry these details to check without creating another enquiry. Keep this page open until it is confirmed.",
              )}</p>
              {visibleError && <p className="mt-1 text-muted-foreground">{visibleError}</p>}
            </div>
          )}
          {submissionStatus !== "uncertain" && visibleError && (
            <p role="alert" className="text-xs text-destructive leading-relaxed">
              {visibleError}
            </p>
          )}
          {submissionStatus === "uncertain" ? (
            <div className="space-y-2">
              <Button type="button" className="w-full" disabled={busy} onClick={() => void onRetry?.()}>
                {tr("newBuildDetail.interestCard.retry", "Retry these details")}
              </Button>
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => setConfirmingNewEnquiry(true)}>
                {tr("newBuildDetail.interestCard.startNew", "Start a new enquiry")}
              </Button>
              {confirmingNewEnquiry && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed">
                  <p>{tr(
                    "newBuildDetail.interestCard.startNewWarning",
                    "The previous enquiry may already be saved. Starting a new enquiry can create another enquiry and owner notification.",
                  )}</p>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingNewEnquiry(false)}>
                      {tr("common.cancel", "Cancel")}
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={handleStartNew}>
                      {tr("newBuildDetail.interestCard.confirmNew", "Confirm new enquiry")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Button type="submit" className="w-full gap-2" disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              {tr("newBuildDetail.interestCard.submit", "Register Interest")}
            </Button>
          )}
        </form>
        <p className="text-[10px] text-muted-foreground text-center mt-3 leading-relaxed">
          {tr("newBuildDetail.interestCard.privacyNote", "Your enquiry is sent directly to the developer. No spam, no middlemen.")}
        </p>
      </div>
    </div>
  );
}
