import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { InvitationRequestModal } from "@/components/InvitationRequestModal";
import { FiresaleInvestorPanel } from "@/components/firesale/FiresaleInvestorPanel";
import { FiresaleQuickSaleForm } from "@/components/firesale/FiresaleQuickSaleForm";
import { Flame, Check, ChevronRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useEligibleForQuickSale } from "@/hooks/useEligibleForQuickSale";
import { useInvitationRequestStatus } from "@/hooks/useInvitationRequests";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const getSteps = (isGreek: boolean) => [
  {
    step: "01",
    title: isGreek ? "Στοιχεία ακινήτου" : "Property Details",
    desc: isGreek ? "Διεύθυνση, ΚΑΕΚ, τύπος, εμβαδόν — περίπου 2 λεπτά." : "Address, KAEK, type, size — takes 2 minutes.",
  },
  {
    step: "02",
    title: isGreek ? "AI εκτίμηση αξίας" : "AI Valuation Engine",
    desc: isGreek ? "Ανάλυση 100+ σημείων δεδομένων από το mAI Prop OS." : "100+ data points analyzed from mAI Prop OS.",
  },
  {
    step: "03",
    title: isGreek ? "Εμπιστευτική προσφορά" : "Confidential Offer",
    desc: isGreek ? "Προκαταρκτική προσφορά μετρητοίς εντός στόχου 96 ωρών, μετά από έλεγχο." : "Preliminary cash offer within 96 hours, subject to review.",
  },
  {
    step: "04",
    title: isGreek ? "Στόχος ολοκλήρωσης 96 ωρών" : "Target 96h Completion",
    desc: isGreek ? "Αν αποδεχθείτε, συντονίζουμε τον νομικό, συμβολαιογραφικό και εκτελεστικό έλεγχο." : "Accept and move to closing. We coordinate title, notary, and execution steps.",
  },
];

export default function Firesale() {
  const { user } = useAuth();
  const { eligible } = useEligibleForQuickSale();
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const steps = getSteps(isGreek);

  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const { data: rawInvitationStatus = "none" } = useInvitationRequestStatus({ enabled: !!user && !eligible });
  // The Firesale UI only renders three of the four states; "approved" users have already
  // been routed to /investor-dashboard via the InvestorPanel branch above.
  const invitationStatus: "none" | "pending" | "rejected" =
    rawInvitationStatus === "pending" || rawInvitationStatus === "rejected" ? rawInvitationStatus : "none";

  return (
      <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Helmet>
        <title>{isGreek ? "Γρήγορη Πώληση Quick Sale™ - mAI prop" : "Quick Sale™ - mAI prop"}</title>
        <meta property="og:title" content={isGreek ? "Γρήγορη Πώληση Quick Sale™ - mAI prop" : "Quick Sale™ - mAI prop"} />
      </Helmet>
      <Navbar />
      <div className="pt-16">
        {/* Hero */}
        <div className="relative py-16 sm:py-28 overflow-hidden border-b border-border">
          <div
            className="firesale-orb-1 absolute -left-24 top-1/4 w-[520px] h-[520px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, hsl(0 72% 55% / 0.13) 0%, transparent 70%)" }}
          />
          <div
            className="firesale-orb-2 absolute right-0 bottom-0 w-[400px] h-[400px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, hsl(183 100% 42% / 0.08) 0%, transparent 70%)" }}
          />
          <div
            className="firesale-orb-3 absolute left-1/2 top-0 w-[300px] h-[300px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, hsl(0 80% 55% / 0.06) 0%, transparent 70%)" }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 60%, hsl(var(--background) / 0.4) 100%)",
            }}
          />

          <div className="container relative">
            <div className="max-w-3xl">
              <div className="reveal in-view inline-flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6">
                <Flame className="w-3.5 h-3.5 flame-flicker" /> {isGreek ? "Γρήγορη πώληση Quick Sale™ — προκαταρκτική προσφορά μετρητοίς" : "Quick Sale™ — Preliminary Cash Offer"}
              </div>
              <h1 className="reveal in-view reveal-delay-1 font-display text-3xl sm:text-5xl md:text-6xl font-black mb-4 sm:mb-5 leading-tight">
                {isGreek ? "Ξεκινήστε γρήγορη πώληση ακινήτου" : "Start a Fast Property Sale"}
                <br />
                <span className="gradient-text-primary">{isGreek ? "με στόχο ελέγχου 96 ωρών." : "with 96h target review."}</span>
              </h1>
              <p className="reveal in-view reveal-delay-2 text-muted-foreground text-base sm:text-xl mb-6 sm:mb-8 leading-relaxed max-w-2xl">
                {isGreek ? (
                  <>AI υποστηριζόμενη προκαταρκτική προσφορά μετρητοίς. Ιδιωτικός έλεγχος χωρίς δημόσια έκθεση στην αγορά και αντιστοίχιση με δίκτυο <strong className="text-foreground">ιδιωτών επενδυτών</strong>.</>
                ) : (
                  <>AI-assisted preliminary cash offer. Fast private review, fewer open-market delays. Your property is matched to our network of <strong className="text-foreground">private investors</strong>.</>
                )}
              </p>
              <div className="reveal in-view reveal-delay-3 flex flex-wrap gap-3 mb-10">
                {(isGreek ? ["Προκαταρκτική προσφορά", "Στόχος 96 ωρών", "Νομικός συντονισμός", "AI εκτίμηση αξίας"] : ["Preliminary cash offer", "96h target", "Legal coordination", "AI valuation"]).map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-1.5 text-sm bg-muted border border-border rounded-full px-3 py-1.5 hover-scale"
                  >
                    <Check className="w-3.5 h-3.5 text-primary" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="container py-10 sm:py-16 border-b border-border">
          <p className="reveal in-view text-[11px] font-bold uppercase tracking-widest text-muted-foreground text-center mb-6 sm:mb-8">
            {isGreek ? "Πώς λειτουργεί" : "How It Works"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {steps.map((s, i) => (
              <div
                key={s.step}
                className={`reveal in-view reveal-delay-${i + 1} relative flex gap-4 md:flex-col md:gap-0 glass-card rounded-xl p-4 sm:p-5 border border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated hover:border-primary/30`}
              >
                <div className="font-display text-4xl sm:text-5xl font-black gradient-text-cyan opacity-20 leading-none md:mb-3 shrink-0 w-12 md:w-auto">
                  {s.step}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-bold text-sm mb-1">{s.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-card/50 px-5 py-3.5 text-xs text-muted-foreground">
            <Flame className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>
              {isGreek ? (
                <>Η υποβολή είναι πάντα <strong className="text-foreground">δωρεάν</strong>. Η αμοιβή μας είναι <strong className="text-foreground">0,5% στην ολοκλήρωση</strong> (ελάχιστο €500) και πληρώνεται από τον πωλητή μόνο όταν ολοκληρωθεί η συναλλαγή. Οι προσφορές και τα χρονοδιαγράμματα εξαρτώνται από επενδυτικό έλεγχο, τίτλους και συμβολαιογραφική διαδικασία.</>
              ) : (
                <>Submitting is always <strong className="text-foreground">free</strong>. Our fee is <strong className="text-foreground">0.5% at completion</strong> (min €500), paid by the seller only when the deal closes — never upfront. Offers and timelines remain subject to investor review, title checks, and notarial process.</>
              )}
            </span>
          </div>
        </div>

        {/* Main section: Form + Investor pitch */}
        <div className="container py-8 sm:py-16 pb-12">
          <div className="grid lg:grid-cols-[1fr_420px] gap-6 sm:gap-10 items-start">
            <div className="reveal in-view">
              <FiresaleQuickSaleForm />
            </div>
            <FiresaleInvestorPanel
              invitationStatus={invitationStatus}
              onRequestInvitation={() => setShowInvitationModal(true)}
            />
          </div>
        </div>
      </div>
      <Footer />

      {showInvitationModal && (
        <InvitationRequestModal
          user={user}
          onClose={() => setShowInvitationModal(false)}
          onSuccess={() => {
            setShowInvitationModal(false);
            // Optimistic update — write "pending" into the cache immediately so the
            // FiresaleInvestorPanel re-renders the "request received" banner without
            // waiting for the background refetch. The invalidate that follows still
            // confirms the server state in case the row landed differently (e.g.
            // straight to "approved" via an admin auto-approve).
            queryClient.setQueryData(["invitation-request-status", user?.id], "pending");
            void queryClient.invalidateQueries({ queryKey: ["invitation-request-status", user?.id] });
            toast.success(isGreek ? "Το αίτημα πρόσβασης υποβλήθηκε — θα επικοινωνήσουμε μαζί σας εντός 48 ωρών." : "Invitation request submitted — we'll be in touch within 48 hours.");
          }}
        />
      )}
    </div>
  );
}
