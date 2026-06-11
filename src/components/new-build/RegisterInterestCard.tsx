import { useState } from "react";
import { MessageSquare, Loader2, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatNewBuildPrice } from "@/lib/newBuildConfig";
import { tFallback, tInterpolate } from "@/lib/i18nFallback";

export function RegisterInterestCard({
  listing,
  user,
  onLogin,
  onContact,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listing: Record<string, any>;
  user: { id: string; email?: string } | null;
  onLogin: () => void;
  onContact: (form: { name: string; phone: string; message: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);
  const trv = (key: string, fallback: string, values: Record<string, string | number>) =>
    tInterpolate(t, key, fallback, values);
  const [form, setForm] = useState({ name: "", phone: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onContact(form);
      setForm({ name: "", phone: "", message: "" });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <div className="text-center py-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <p className="font-display font-bold text-base mb-1">{tr("newBuildDetail.interestCard.submittedTitle", "Interest registered!")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {tr("newBuildDetail.interestCard.submittedBody", "The developer has been notified. Expect a response within 1-2 business days with unit availability and pricing.")}
          </p>
          <div className="mt-4 space-y-2">
            <div className="rounded-lg bg-secondary/60 border border-border px-3 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 shrink-0 text-primary" />
              {tr("newBuildDetail.interestCard.messageCopy", "A copy of your enquiry has been sent to your messages")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-0.5">{tr("newBuildDetail.interestCard.startingFrom", "Starting from")}</p>
          <p className="font-display text-3xl font-bold text-primary">{formatNewBuildPrice(Number(listing.price))}</p>
          {listing.price_per_sqm != null && (
            <p className="text-xs text-muted-foreground mt-1">{trv("newBuildDetail.pricePerSqm", "{{price}} / m²", { price: formatNewBuildPrice(Number(listing.price_per_sqm)) })}</p>
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
        {listing.price_per_sqm != null && (
          <p className="text-xs text-muted-foreground mt-1">{trv("newBuildDetail.pricePerSqm", "{{price}} / m²", { price: formatNewBuildPrice(Number(listing.price_per_sqm)) })}</p>
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
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
          <input
            type="tel"
            placeholder={tr("newBuildDetail.interestCard.phonePlaceholder", "Phone number (optional)")}
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
          <textarea
            placeholder={tr("newBuildDetail.interestCard.messagePlaceholder", "What are you looking for? (optional)")}
            rows={3}
            value={form.message}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none"
          />
          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
            {tr("newBuildDetail.interestCard.submit", "Register Interest")}
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground text-center mt-3 leading-relaxed">
          {tr("newBuildDetail.interestCard.privacyNote", "Your enquiry is sent directly to the developer. No spam, no middlemen.")}
        </p>
      </div>
    </div>
  );
}
