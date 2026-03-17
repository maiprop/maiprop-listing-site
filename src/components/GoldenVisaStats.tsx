import { Globe, Users, Zap, Home, TrendingUp, Sun } from "lucide-react";
import { ScrollReveal, RevealItem } from "@/components/ScrollReveal";
import { useTranslation } from "@/contexts/TranslationContext";

const benefits = [
{ icon: Globe, title: "EU Residency", desc: "Live, work, and travel freely across 27 Schengen countries" },
{ icon: Users, title: "Family Inclusion", desc: "Spouse, children under 21, and parents included in one single application" },
{ icon: Zap, title: "Fast Processing", desc: "Permanent residency in 6-9 months with a streamlined application" },
{ icon: Home, title: "No Stay Required", desc: "Maintain residency without minimum stay obligations" },
{ icon: TrendingUp, title: "Asset Diversification", desc: "8%+ annual appreciation with strong rental income potential" },
{ icon: Sun, title: "Mediterranean Lifestyle", desc: "300+ days of sunshine, world-class cuisine, and rich culture" }];

const GoldenVisaStats = () => {
  const { t } = useTranslation();
  return (
  <section id="overview" className="relative bg-background py-24">
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
    <div className="relative container mx-auto px-6">
      <ScrollReveal>
        <div className="mb-14 text-center">
          <span className="mb-2 inline-block text-xs font-semibold uppercase tracking-widest text-primary">
            {t("Greek Golden Visa Program")}
          </span>
          <h2 className="text-3xl font-bold sm:text-4xl">{t("Why Greek Golden Visa?")}</h2>
          <p className="mt-2 text-muted-foreground">{t("European residency with investment returns and lifestyle benefits.")}</p>
        </div>
      </ScrollReveal>
      <ScrollReveal variant="stagger">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) =>
        <RevealItem key={b.title}>
          <div className="h-full rounded-xl border border-border bg-background/40 p-6 backdrop-blur transition-all hover:border-primary/30 hover:shadow-[0_0_30px_hsl(179_90%_63%/0.06)]">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <b.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-1 font-semibold">{t(b.title)}</h3>
              <p className="text-sm text-muted-foreground">{t(b.desc)}</p>
            </div>
        </RevealItem>
        )}
        </div>
      </ScrollReveal>
    </div>
  </section>
  );
};

export default GoldenVisaStats;