import { Building2, Briefcase, Wrench, Shield, Check, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { colorMap } from "@/lib/onboardingConfig";
import { useTranslation } from "react-i18next";

const PRO_OPTIONS_EN = [
  {
    id: "agent" as const,
    label: "Real Estate Agent / Agency",
    desc: "Licensed to list and sell properties on behalf of clients.",
    icon: Building2,
    color: "cyan",
    features: ["Property listings", "CRM & contacts", "Auction alerts", "Branded video room"],
  },
  {
    id: "developer" as const,
    label: "Developer / Builder",
    desc: "Launching residential or commercial development projects.",
    icon: Briefcase,
    color: "orange",
    features: ["Project showcases", "Project ad management", "Portfolio pages", "Bulk inquiries"],
  },
  {
    id: "service_pro" as const,
    label: "Service Professional",
    desc: "Architect, lawyer, notary, engineer, contractor, financial advisor & more. Get listed in the professional directory and receive client leads.",
    icon: Wrench,
    color: "rose",
    features: ["Professional directory", "Service catalog", "Client leads", "Verified badge"],
    isPro: true,
  },
];

interface Props {
  loading: boolean;
  authLoading: boolean;
  onSubType: (type: "agent" | "developer" | "service_pro") => void;
}

export function PickProTypeStep({ loading, authLoading, onSubType }: Props) {
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const proOptions = isGreek
    ? [
        {
          id: "agent" as const,
          label: "Μεσίτης ακινήτων / Μεσιτικό γραφείο",
          desc: "Αδειοδοτημένος επαγγελματίας για προώθηση και πώληση ακινήτων πελατών.",
          icon: Building2,
          color: "cyan",
          features: ["Αγγελίες ακινήτων", "CRM & επαφές", "Ειδοποιήσεις πλειστηριασμών", "Επώνυμη αίθουσα βιντεοκλήσης"],
        },
        {
          id: "developer" as const,
          label: "Κατασκευαστής / ανάπτυξη ακινήτων",
          desc: "Προβολή νέων οικιστικών ή επαγγελματικών έργων.",
          icon: Briefcase,
          color: "orange",
          features: ["Σελίδες έργων", "Διαχείριση προπωλήσεων", "Σελίδες χαρτοφυλακίου", "Μαζικά αιτήματα"],
        },
        {
          id: "service_pro" as const,
          label: "Επαγγελματίας υπηρεσιών ακινήτων",
          desc: "Αρχιτέκτονας, δικηγόρος, συμβολαιογράφος, μηχανικός, εργολάβος, χρηματοοικονομικός σύμβουλος και άλλες ειδικότητες.",
          icon: Wrench,
          color: "rose",
          features: ["Κατάλογος επαγγελματιών", "Κατάλογος υπηρεσιών", "Αιτήματα πελατών", "Επαληθευμένο σήμα"],
          isPro: true,
        },
      ]
    : PRO_OPTIONS_EN;
  return (
    <div>
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-xs font-medium text-primary mb-4">
          <Briefcase className="w-3.5 h-3.5" /> {isGreek ? "Ρύθμιση επαγγελματικού προφίλ" : "Professional setup"}
        </div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground mb-2">{isGreek ? "Ποια επιλογή σας περιγράφει καλύτερα;" : "Which best describes you?"}</h1>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          {isGreek ? "Κάθε προφίλ ξεκλειδώνει διαφορετικά εργαλεία και δυνατότητες." : "Each profile unlocks different tools and capabilities."}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {proOptions.map(opt => {
          const c = colorMap[opt.color];
          return (
            <button
              key={opt.id}
              onClick={() => onSubType(opt.id)}
              disabled={loading || authLoading}
              className={cn(
                "group relative text-left rounded-2xl border p-5 transition-all duration-200",
                "hover:scale-[1.01] hover:shadow-lg hover:shadow-black/10",
                "bg-secondary/60 border-border hover:border-primary/40 hover:bg-secondary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              )}
            >
              {opt.isPro && (
                <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5">
                  <Shield className="w-3 h-3 text-amber-400" />
                  <span className="text-[10px] text-amber-400 font-medium">{isGreek ? "Απαιτείται έλεγχος" : "Verify required"}</span>
                </div>
              )}
              <div className="flex items-start gap-4">
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", c.iconBg)}>
                  <opt.icon className={cn("w-5 h-5", c.text)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-foreground leading-tight truncate">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-1 mb-2 leading-relaxed">{opt.desc}</div>
                  <div className="flex flex-col gap-1">
                    {opt.features.map(f => (
                      <div key={f} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Check className={cn("w-3 h-3 shrink-0", c.text)} /> {f}
                      </div>
                    ))}
                  </div>
                </div>
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin text-primary mt-1 shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors mt-0.5 shrink-0" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
