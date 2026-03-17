import { ScrollReveal, RevealItem } from "@/components/ScrollReveal";
import { useTranslation } from "@/contexts/TranslationContext";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
{ num: "01", title: "Consultation & Eligibility", desc: "Confirm eligibility and discuss investment goals" },
{ num: "02", title: "Property Selection", desc: "Browse and assess visa-eligible properties on our platform" },
{ num: "03", title: "Legal & Purchase Support", desc: "Full legal documentation and transaction coordination" },
{ num: "04", title: "Visa Application & Approval", desc: "Complete support through Golden Visa application" }];

const JourneySection = () => {
  const { t } = useTranslation();
  return (
  <section id="journey" className="relative bg-background py-24">
    <div className="pointer-events-none absolute left-0 top-1/2 h-[350px] w-[350px] -translate-y-1/2 rounded-full bg-secondary/8 blur-[120px]" />
    <div className="relative container mx-auto px-6">
      <ScrollReveal>
        <div className="mb-14 text-center">
          <span className="mb-2 inline-block text-xs font-semibold uppercase tracking-widest text-secondary">
            {t("Your Golden Visa Journey")}
          </span>
          <h2 className="text-3xl font-bold sm:text-4xl">{t("Simple Path to EU Residency")}</h2>
          <p className="mt-2 text-muted-foreground">{t("From consultation to visa approval with full support.")}</p>
        </div>
      </ScrollReveal>

      <ScrollReveal variant="stagger">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) =>
        <RevealItem key={s.num}>
          <div className="relative rounded-xl border border-border bg-background/40 p-6 backdrop-blur transition-all hover:border-primary/30">
              <span className="mb-3 inline-block text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">{s.num}</span>
              <h3 className="mb-2 font-semibold">{t(s.title)}</h3>
              <p className="text-sm text-muted-foreground">{t(s.desc)}</p>
              {i < steps.length - 1 &&
          <div className="pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 text-2xl text-muted-foreground/30 lg:block">→</div>
          }
            </div>
        </RevealItem>
        )}
        </div>
      </ScrollReveal>

      <ScrollReveal>
        <div className="mt-12 text-center">
          <Button asChild size="lg" variant="outline" className="rounded-full px-8 gap-2">
            <Link to="/process">
              {t("Learn More About Our Golden Visa Process")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </ScrollReveal>
    </div>
  </section>
  );
};

export default JourneySection;
