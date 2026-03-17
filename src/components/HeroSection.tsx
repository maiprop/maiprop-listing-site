import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLeadBot } from "@/components/LeadBotProvider";
import { useTranslation } from "@/contexts/TranslationContext";

const stats = [
{ value: "€250K", label: "Minimum Investment" },
{ value: "6-9 Months", label: "To Visa Approval" },
{ value: "27 Countries", label: "Schengen Access" }];


const HeroSection = () => {
  const { openWithLocation } = useLeadBot();
  const { t } = useTranslation();

  return (
    <section className="relative flex min-h-screen flex-col justify-end overflow-hidden">
    {/* Background image */}
    <div className="absolute inset-0">
      <img
          src="https://images.unsplash.com/photo-1555993539-1732b0258235?w=800&q=40&fm=webp"
          srcSet="https://images.unsplash.com/photo-1555993539-1732b0258235?w=480&q=40&fm=webp 480w, https://images.unsplash.com/photo-1555993539-1732b0258235?w=800&q=40&fm=webp 800w, https://images.unsplash.com/photo-1555993539-1732b0258235?w=1440&q=45&fm=webp 1440w"
          sizes="100vw"
          alt="Aerial view of Greek coastline — Golden Visa real estate investment destination"
          className="h-full w-full object-cover"
          fetchPriority="high"
          loading="eager"
          decoding="sync"
          width="1440"
          height="960" />

      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
    </div>

    {/* Content */}
    <div className="relative z-10 container mx-auto px-6 pb-10 pt-32">
      <span className="mb-4 inline-block rounded-full border border-primary/40 bg-primary/10 px-5 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary backdrop-blur-sm">
        {t("Greek Golden Visa Program | EU Residency Through Real Estate")}
      </span>
      <h1 className="max-w-3xl text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-7xl">
        {t("Secure Your European")}{" "}
        <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          {t("Golden Visa in Greece")}
        </span>
      </h1>
      <div className="mt-6 max-w-xl font-sans text-left space-y-3">
        <p className="text-base sm:text-xl text-muted-foreground font-light leading-relaxed">
          {t("EU residency through €250K+ Greek real estate investments.")}
        </p>
        <p className="text-base sm:text-lg text-foreground/70 font-medium italic">
          {t("Live freely, invest wisely, and protect your global future.")}
        </p>
      </div>
      <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <Button size="lg" className="gap-2 rounded-full px-8 w-full sm:w-auto" onClick={() => openWithLocation("")}>
            {t("Start Your Golden Visa")} <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-full border-border/50 bg-background/20 px-8 backdrop-blur-sm w-full sm:w-auto">

          <a href="#opportunities" className="bg-accent">{t("View Properties")}</a>
        </Button>
        <Button
            asChild
            size="lg"
            className="gap-2 rounded-full bg-[hsl(210,80%,60%)] px-8 text-white hover:bg-[hsl(210,80%,70%)] w-full sm:w-auto">

          


        </Button>
      </div>

      {/* Stats bar */}
      <div className="mt-12 grid grid-cols-3 gap-4 border-t border-border/40 pt-8 sm:grid-cols-4">
        {stats.map((s) =>
          <div key={s.label}>
            <p className="text-xl font-bold sm:text-3xl">{s.value}</p>
            <p className="text-xs sm:text-sm text-muted-foreground">{t(s.label)}</p>
          </div>
          )}
      </div>
    </div>
  </section>);

};

export default HeroSection;