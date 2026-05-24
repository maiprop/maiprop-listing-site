import { Link } from "react-router-dom";
import { Flame, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInView } from "@/hooks/useInView";
import { useTranslation } from "react-i18next";

export function QuickSaleCTASection() {
  const { ref, inView } = useInView();
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const metrics = isGreek
    ? [
        { value: "96h", label: "Στόχος ελέγχου" },
        { value: "100%", label: "Προσφορές μετρητοίς" },
        { value: "Ενεργοί", label: "Επενδυτές" },
        { value: "AI", label: "Εκτίμηση αξίας" },
      ]
    : [
        { value: "96h", label: "Target Review" },
        { value: "100%", label: "Cash Offers" },
        { value: "Active", label: "Buyers" },
        { value: "AI", label: "Valuation Engine" },
      ];

  return (
    <section className="py-10 sm:py-16 bg-background">
      <div ref={ref} className="container">
        <div className={`relative rounded-3xl overflow-hidden bg-card border border-border reveal ${inView ? "in-view" : ""}`}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 80% 50%, hsl(0 72% 55% / 0.12) 0%, transparent 60%)" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 20% 50%, hsl(var(--brand-purple) / 0.06) 0%, transparent 50%)" }} />

          <div className="relative p-6 sm:p-10 md:p-16 grid md:grid-cols-2 gap-6 sm:gap-8 items-center">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Flame className="w-5 h-5 text-destructive flame-flicker" />
                <span className="text-xs font-bold text-destructive uppercase tracking-widest">
                  {isGreek ? "Quick Sale™ προκαταρκτική προσφορά" : "Quick Sale™ Preliminary Offer"}
                </span>
              </div>
              <h2 className="font-display text-2xl sm:text-4xl font-bold mb-4">
                {isGreek ? "Ξεκινήστε γρήγορη πώληση ακινήτου" : "Start a Fast Property Sale"} <br />
                <span className="gradient-text-primary">{isGreek ? "με στόχο ελέγχου 96 ωρών" : "with 96h target review"}</span>
              </h2>
              <p className="text-muted-foreground mb-6 text-sm sm:text-base">
                {isGreek ? "Λάβετε AI υποστηριζόμενη προκαταρκτική προσφορά μετρητοίς για το ακίνητό σας. Ιδιωτικός έλεγχος και λιγότερες καθυστερήσεις δημόσιας αγοράς." : "Get an AI-assisted preliminary cash offer for your property. Private review, fewer open-market delays."}
              </p>
              <Button size="lg" className="w-full sm:w-auto bg-gradient-primary border-0 text-primary-foreground" asChild>
                <Link to="/firesale">
                  {isGreek ? "Έναρξη Quick Sale" : "Start Quick Sale"} <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {metrics.map((item) => (
                <div key={item.label} className="glass-card rounded-xl p-3 sm:p-4 text-center">
                  <div className="font-display text-xl sm:text-2xl font-bold gradient-text-cyan">{item.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
