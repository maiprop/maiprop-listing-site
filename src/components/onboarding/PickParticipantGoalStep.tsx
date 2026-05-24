import { Check, ChevronRight, Home, Loader2, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { colorMap } from "@/lib/onboardingConfig";

const options = [
  {
    id: "buyer" as const,
    label: "I'm Looking to Buy or Rent",
    desc: "Find your next home in Greece - AI-powered search, verified listings, instant viewings.",
    icon: Home,
    color: "blue",
    features: ["Browse all listings", "Book viewings instantly", "Save searches & price alerts", "AI property insights & mortgage calculator"],
    benefit: "Join buyers finding their perfect Greek property",
  },
  {
    id: "seller" as const,
    label: "I'm Selling or Renting Out My Property",
    desc: "Reach serious buyers directly - list in minutes, manage everything from your dashboard.",
    icon: User,
    color: "violet",
    features: ["Publish your listing in 5 minutes", "AI-written listing description", "Viewing request manager", "Direct messaging with buyers"],
    benefit: "Sellers on mAI prop get more qualified enquiries",
  },
];

interface Props {
  loading: boolean;
  authLoading: boolean;
  onGoal: (goal: "buyer" | "seller") => void;
}

export function PickParticipantGoalStep({ loading, authLoading, onGoal }: Props) {
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const localizedOptions = options.map((option) => {
    if (!isGreek) return option;
    if (option.id === "buyer") {
      return {
        ...option,
        label: "Θέλω να αγοράσω ή να ενοικιάσω",
        desc: "Βρείτε το επόμενο ακίνητό σας στην Ελλάδα με AI αναζήτηση, επαληθευμένες αγγελίες και άμεσες επισκέψεις.",
        features: ["Περιήγηση σε όλες τις αγγελίες", "Κράτηση επισκέψεων", "Αποθηκευμένες αναζητήσεις & ειδοποιήσεις τιμής", "AI αναλύσεις ακινήτου"],
        benefit: "Γίνετε μέλος της κοινότητας αγοραστών και ενοικιαστών του mAI prop",
      };
    }
    return {
      ...option,
      label: "Θέλω να πουλήσω ή να ενοικιάσω το ακίνητό μου",
      desc: "Προσεγγίστε σοβαρούς ενδιαφερόμενους - καταχωρήστε αγγελία σε λίγα λεπτά και διαχειριστείτε τα πάντα από τον πίνακά σας.",
      features: ["Δημοσίευση αγγελίας σε λίγα λεπτά", "AI περιγραφή αγγελίας", "Διαχείριση αιτημάτων επίσκεψης", "Άμεση επικοινωνία"],
      benefit: "Οι πωλητές στο mAI prop λαμβάνουν πιο στοχευμένα αιτήματα",
    };
  });

  return (
    <div>
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-xs font-medium text-primary mb-4">
          <Home className="w-3.5 h-3.5" /> {isGreek ? "Μία ακόμη επιλογή" : "One more thing"}
        </div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground mb-2">{isGreek ? "Τι θέλετε να κάνετε;" : "What do you want to do?"}</h1>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          {isGreek ? "Μπορείτε να κάνετε και τα δύο αργότερα - επιλέξτε αυτό που έχει προτεραιότητα τώρα." : "You can do both later - just pick what matters most right now."}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 mb-4">
        {localizedOptions.map(opt => {
          const c = colorMap[opt.color];
          return (
            <button
              key={opt.id}
              onClick={() => onGoal(opt.id)}
              disabled={loading || authLoading}
              className={cn(
                "group relative text-left rounded-2xl border p-5 transition-all duration-200",
                "hover:scale-[1.01] hover:shadow-lg hover:shadow-black/10",
                "bg-secondary/60 border-border hover:border-primary/40 hover:bg-secondary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              )}
            >
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
                  {"benefit" in opt && opt.benefit && (
                    <div className={cn("mt-2 text-[10px] font-semibold", c.text)}>
                      {opt.benefit}
                    </div>
                  )}
                </div>
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin text-primary mt-1 shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors mt-0.5 shrink-0" />}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {isGreek ? "Μπορείτε πάντα να καταχωρήσετε ακίνητο αργότερα από τον πίνακά σας." : "You can always list a property later from your dashboard."}
      </p>
    </div>
  );
}
