import { useNavigate } from "react-router-dom";
import { Check, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface QuickSaleSubmittedViewProps {
  /** Reference id surfaced by the insert; first 8 chars are shown to the user. */
  requestId: string | null;
  /** AI-derived offer estimate (€). May be null if estimate failed. */
  aiEstimate: number | null;
  /** Reset handler — drops back to step 1 of the form. */
  onReset: () => void;
}

const REVIEW_TIMELINE_STEPS = [
  { time: "Now", label: "Request received", color: "text-primary", icon: "OK" },
  { time: "~2h", label: "Advisor review", color: "text-primary", icon: "AD" },
  { time: "24h", label: "Offer decision", color: "text-brand-gold", icon: "EUR" },
] as const;

const REVIEW_SUBMITTED_GUARANTEES = [
  "Queued for advisor review before investor publication",
  "Investor distribution starts only after admin approval",
  "Dedicated advisor assigned within 2h",
] as const;

/**
 * Post-submit confirmation view for the firesale Quick Sale™ form.
 * Pure presentation — no fetching, no mutation. Owns no state.
 */
export function QuickSaleSubmittedView({
  requestId,
  aiEstimate,
  onReset,
}: QuickSaleSubmittedViewProps) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const timelineSteps = isGreek
    ? [
        { time: "Τώρα", label: "Το αίτημα ελήφθη", color: "text-primary", icon: "OK" },
        { time: "~2ω", label: "Έλεγχος συμβούλου", color: "text-primary", icon: "AD" },
        { time: "24ω", label: "Απόφαση προσφοράς", color: "text-brand-gold", icon: "EUR" },
      ]
    : REVIEW_TIMELINE_STEPS;
  const guarantees = isGreek
    ? [
        "Σε σειρά ελέγχου πριν τη δημοσίευση σε επενδυτές",
        "Η διανομή σε επενδυτές ξεκινά μόνο μετά από έγκριση",
        "Ανάθεση συμβούλου εντός περίπου 2 ωρών",
      ]
    : REVIEW_SUBMITTED_GUARANTEES;

  return (
    <div className="glass-card rounded-2xl border border-primary/30 p-8 text-center shadow-elevated">
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-accent/80 flex items-center justify-center shadow-lg">
            <Check className="w-7 h-7 text-primary-foreground" strokeWidth={3} />
          </div>
        </div>
      </div>
      <h3 className="font-display font-black text-2xl mb-2">{isGreek ? "Το αίτημα υποβλήθηκε!" : "Request Submitted!"}</h3>
      <p className="text-muted-foreground text-sm mb-2 leading-relaxed">
        {isGreek ? "Το αίτημα Quick Sale™ ελήφθη και θα ελεγχθεί πριν κοινοποιηθεί σε επενδυτές." : "Your Quick Sale™ request was received and will be reviewed before it is released to investors."}
      </p>
      {!isGreek && (
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          It is not visible to investors until the mAI Prop team approves publication.
        </p>
      )}
      {requestId && (
        <p className="text-[11px] text-muted-foreground mb-6 font-mono bg-secondary border border-border rounded-lg px-3 py-1.5 inline-block">
          {isGreek ? "Κωδικός" : "Ref"}: <span className="text-primary font-semibold">{requestId.slice(0, 8).toUpperCase()}</span>
        </p>
      )}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {timelineSteps.map((s) => (
          <div key={s.label} className="rounded-xl bg-secondary border border-border p-3 text-center">
            <div className="text-lg mb-1">{s.icon}</div>
            <p className={`font-display font-black text-sm ${s.color}`}>{s.time}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 p-5 mb-6">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">{isGreek ? "AI εκτίμηση προσφοράς" : "AI Offer Estimate"}</p>
        <p className="font-display font-black text-4xl text-primary mb-1">€{aiEstimate?.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{isGreek ? "Ενδεικτική · Υπόκειται σε τελικό έλεγχο" : "Indicative · Subject to final due diligence"}</p>
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-primary/10">
          {[
            { label: isGreek ? "Εκτ. αγοράς" : "Est. Market", value: `€${Math.round((aiEstimate || 0) / 0.95).toLocaleString()}` },
            { label: isGreek ? "Έκπτωση" : "Discount", value: "~5%" },
            { label: isGreek ? "Ολοκλήρωση" : "Close", value: "48–72h" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-bold text-sm">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2 text-xs text-muted-foreground text-left mb-6">
        {guarantees.map((t) => (
          <div key={t} className="flex items-center gap-2">
            <Check className="w-3 h-3 text-primary shrink-0" /> {t}
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 border-border" onClick={onReset}>{isGreek ? "Νέα υποβολή" : "Submit another"}</Button>
        <Button
          className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-2"
          onClick={() => navigate("/investor-dashboard")}
        >
          <BarChart2 className="w-3.5 h-3.5" /> {isGreek ? "Παρακολούθηση" : "Track Status"}
        </Button>
      </div>
    </div>
  );
}
