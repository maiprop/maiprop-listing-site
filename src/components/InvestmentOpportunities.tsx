import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProperties } from "@/contexts/PropertyContext";
import PropertyCard from "@/components/PropertyCard";
import PropertyModal from "@/components/PropertyModal";
import { Property } from "@/data/properties";
import { ScrollReveal, RevealItem } from "@/components/ScrollReveal";
import { useTranslation } from "@/contexts/TranslationContext";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const InvestmentOpportunities = () => {
  const { properties } = useProperties();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Property | null>(null);
  const { t } = useTranslation();

  // Open property modal from hash link (e.g. #property-uuid)
  useEffect(() => {
    const openFromHash = () => {
      const hash = window.location.hash;
      if (!hash.startsWith("#property-")) return;
      const id = hash.replace("#property-", "");
      const found = properties.find((p) => p.id === id);
      if (found) {
        setSelected(found);
        document.getElementById("opportunities")?.scrollIntoView({ behavior: "smooth" });
      }
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [properties]);

  const current = properties.filter((p) => p.project_type === "new");
  const preview = current.slice(0, 3);

  return (
    <section id="opportunities" className="relative bg-background py-24">
      <div className="pointer-events-none absolute right-0 top-0 h-[500px] w-[500px] rounded-full bg-primary/8 blur-[180px]" />
      <div className="relative container mx-auto px-6">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <span className="mb-2 inline-block text-xs font-semibold uppercase tracking-widest text-primary">{t("Golden Visa Eligible Properties")}</span>
            <h2 className="text-3xl font-bold sm:text-4xl">{t("Visa-Ready Real Estate Portfolio")}</h2>
            <p className="mt-2 text-muted-foreground">{t("Pre-verified Golden Visa properties with full compliance — analyze and compare independently.")}</p>
          </div>
        </ScrollReveal>
        <ScrollReveal variant="stagger">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {preview.map((p) => (
              <RevealItem key={p.id}>
                <PropertyCard property={p} onClick={() => setSelected(p)} />
              </RevealItem>
            ))}
          </div>
        </ScrollReveal>

        {/* View all CTA */}
        {current.length > 3 && (
          <ScrollReveal>
            <div className="mt-10 text-center">
              <p className="mb-4 text-muted-foreground">
                Showing 3 of {current.length} available properties
              </p>
              <Button onClick={() => navigate("/properties")} size="lg" variant="outline" className="gap-2">
                View All Properties
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </ScrollReveal>
        )}
      </div>
      <PropertyModal property={selected} open={!!selected} onClose={() => setSelected(null)} />
    </section>
  );
};

export default InvestmentOpportunities;
