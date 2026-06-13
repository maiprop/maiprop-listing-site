/**
 * First step of onboarding: pick your role (buyer / seller / agent / developer / professional).
 * Immediate-action cards (developer, professional) bypass the pending/confirm flow.
 */

import { Sparkles, Check, ChevronRight, Loader2, ArrowRight, Home, User, Building2, Briefcase, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { colorMap } from "@/lib/onboardingConfig";
import { useTranslation } from "react-i18next";

interface Props {
  pendingCardId: string | null;
  onPendingChange: (id: string | null) => void;
  loading: boolean;
  authLoading: boolean;
  /** Called when developer card is clicked — parent handles billing gate + navigation */
  onDeveloperImmediate: () => void;
  /** Called when professional card is clicked — parent handles billing gate + navigation */
  onProfessionalImmediate: () => void;
  /** Called when the confirm button is pressed; id is the pendingCardId */
  onConfirm: (id: string) => void;
}

type FlatCard = {
  id: string;
  icon: React.ElementType;
  color: string;
  label: string;
  tagline: string;
  desc: string;
  features: string[];
  immediate?: () => void;
};

export function PickTypeStep({
  pendingCardId,
  onPendingChange,
  loading,
  authLoading,
  onDeveloperImmediate,
  onProfessionalImmediate,
  onConfirm,
}: Props) {
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const flatCards: FlatCard[] = [
    {
      id: "buyer",
      icon: Home,
      color: "blue",
      label: isGreek ? "Αγοραστής / Ενοικιαστής" : "Home Buyer / Renter",
      tagline: isGreek ? "Βρείτε το κατάλληλο ακίνητο" : "Find your perfect property",
      desc: isGreek ? "Αναζητήστε αγγελίες, συγκρίνετε ακίνητα, κλείστε επισκέψεις και χρησιμοποιήστε AI αναλύσεις για καλύτερη απόφαση." : "Search listings, compare properties, book viewings, and get AI-powered insights to help you make the right move.",
      features: isGreek ? ["Περιήγηση σε αγγελίες", "Κράτηση επισκέψεων", "Αποθηκευμένες αναζητήσεις & ειδοποιήσεις", "Αναφορές περιοχής"] : ["Browse listings", "Book viewings", "Saved searches & alerts", "Neighbourhood reports"],
    },
    {
      id: "seller",
      icon: User,
      color: "violet",
      label: isGreek ? "Πωλητής / Εκμισθωτής" : "Private Seller / Landlord",
      tagline: isGreek ? "Καταχωρήστε και διαχειριστείτε το ακίνητό σας" : "List & manage your property",
      desc: isGreek ? "Δημοσιεύστε το ακίνητό σας, διαχειριστείτε αιτήματα επίσκεψης και επικοινωνήστε απευθείας με σοβαρούς ενδιαφερόμενους." : "List your property, manage viewing requests, and connect directly with serious buyers or tenants.",
      features: isGreek ? ["Καταχώρηση ακινήτου", "Διαχείριση επισκέψεων", "AI περιγραφή αγγελίας", "Άμεση επικοινωνία"] : ["List your property", "Manage viewing requests", "AI listing description", "Message buyers directly"],
    },
    {
      id: "agent",
      icon: Building2,
      color: "cyan",
      label: isGreek ? "Μεσίτης ακινήτων / Γραφείο" : "Real Estate Agent / Agency",
      tagline: isGreek ? "Διαχειριστείτε πελάτες, αγγελίες & έργα" : "Manage clients, ads & projects",
      desc: isGreek ? "Καταχωρήστε ακίνητα πελατών, διαχειριστείτε επαφές και υποψήφιους πελάτες και παρακολουθήστε την απόδοση του χαρτοφυλακίου σας." : "List properties for clients, manage your leads and contacts, and track your portfolio performance.",
      features: isGreek ? ["Αγγελίες ακινήτων", "Διαχείριση πελατολογίου & επαφών", "Διαχείριση υποψήφιων πελατών", "Αναλυτικά απόδοσης"] : ["Property listings", "CRM & contacts", "Lead management", "Performance analytics"],
    },
    {
      id: "developer",
      icon: Briefcase,
      color: "orange",
      label: isGreek ? "Κατασκευαστής / εταιρεία ανάπτυξης ακινήτων" : "Developer / Builder",
      tagline: isGreek ? "Προβάλετε νέα έργα" : "Showcase new projects",
      desc: isGreek ? "Δημιουργήστε σελίδες έργων για νέες κατασκευές, διαχειριστείτε αγγελίες έργων και αιτήματα αγοραστών." : "Create project pages for New Buildings, manage project ads, and handle buyer inquiries in one place.",
      features: isGreek ? ["Σελίδες έργων", "Αγγελίες έργων", "Διαχείριση αιτημάτων", "Αναλυτικά έργου"] : ["Project showcase pages", "Project ads", "Buyer inquiry management", "Project analytics"],
      immediate: onDeveloperImmediate,
    },
    {
      id: "professional",
      icon: Wrench,
      color: "rose",
      label: isGreek ? "Επαγγελματίας υπηρεσιών ακινήτων" : "Service Professional",
      tagline: isGreek ? "Βρείτε πελάτες. Αναλάβετε έργα." : "Get found. Get hired.",
      desc: isGreek ? "Αρχιτέκτονας, δικηγόρος, συμβολαιογράφος, εργολάβος και άλλοι επαγγελματίες μπορούν να δημοσιεύσουν υπηρεσίες και να λαμβάνουν αιτήματα πελατών." : "Architect, lawyer, notary, contractor and more — publish your services and receive client leads directly.",
      features: isGreek ? ["Καταχώρηση στον κατάλογο", "Κατάλογος υπηρεσιών & τιμές", "Αιτήματα πελατών", "Επαληθευμένο προφίλ"] : ["Directory listing", "Service catalog & pricing", "Client leads", "Verified badge"],
      immediate: onProfessionalImmediate,
    },
  ];

  return (
    <div className={cn(pendingCardId && "pb-24 md:pb-0")}>
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-xs font-medium text-primary mb-4">
          <Sparkles className="w-3.5 h-3.5" /> {isGreek ? "Προσαρμόστε την εμπειρία σας" : "Personalise your experience"}
        </div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground mb-2">
          {isGreek ? "Πώς χρησιμοποιείτε το mAI prop;" : "How are you using mAI prop?"}
        </h1>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          {isGreek ? "Επιλέξτε προφίλ. Μπορείτε να το αλλάξετε αργότερα από τις ρυθμίσεις." : "Choose your profile. You can update it in settings later."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {flatCards.map((card) => {
          const c = colorMap[card.color] ?? colorMap.blue;
          const isSelected = pendingCardId === card.id;
          return (
            <button
              key={card.id}
              onClick={() => {
                if (card.immediate) { card.immediate(); return; }
                onPendingChange(isSelected ? null : card.id);
              }}
              disabled={loading || authLoading}
              className={cn(
                "group relative text-left rounded-2xl border p-5 transition-all duration-200",
                "hover:scale-[1.01] hover:shadow-lg hover:shadow-black/10",
                isSelected
                  ? `${c.bg} ${c.border} border-2`
                  : "bg-secondary/60 border-border hover:border-primary/40 hover:bg-secondary border",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
            >
              <div className="flex items-start gap-4">
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", c.iconBg)}>
                  <card.icon className={cn("w-5 h-5", c.text)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-foreground leading-tight truncate">{card.label}</div>
                  <div className={cn("text-[11px] font-semibold mt-0.5 mb-1 truncate", c.text)}>{card.tagline}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed mb-2">{card.desc}</div>
                  <div className="flex flex-col gap-1">
                    {card.features.map((f) => (
                      <div key={f} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Check className={cn("w-3 h-3 shrink-0", c.text)} /> {f}
                      </div>
                    ))}
                  </div>
                </div>
                {isSelected ? (
                  <div className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5", c.bg)}>
                    <Check className={cn("w-3 h-3", c.text)} />
                  </div>
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors mt-0.5 shrink-0" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {pendingCardId && !flatCards.find((c) => c.id === pendingCardId)?.immediate && (
        <div className="fixed inset-x-4 bottom-4 z-40 md:static md:inset-auto md:z-auto md:mt-5">
          <Button
            className="w-full bg-gradient-primary border-0 text-primary-foreground"
            disabled={loading || authLoading}
            onClick={() => onConfirm(pendingCardId)}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ArrowRight className="w-4 h-4 mr-2" />
            )}
            {isGreek ? "Συνέχεια ως" : "Continue as"} {flatCards.find((c) => c.id === pendingCardId)?.label}
          </Button>
        </div>
      )}
    </div>
  );
}
