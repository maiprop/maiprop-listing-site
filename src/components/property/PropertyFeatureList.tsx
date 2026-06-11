import { Check } from "lucide-react";
import { FeatureSection, Section, SectionHeader } from "@/components/property/DetailPrimitives";

export interface PropertyFeature {
  icon?: React.ElementType;
  label: string;
}

interface PropertyFeatureListProps {
  internalFeatures: PropertyFeature[];
  externalFeatures: PropertyFeature[];
  constructionFeatures: PropertyFeature[];
  suitabilityFeatures: PropertyFeature[];
}

export default function PropertyFeatureList({
  internalFeatures, externalFeatures, constructionFeatures, suitabilityFeatures,
}: PropertyFeatureListProps) {
  const total =
    internalFeatures.length +
    externalFeatures.length +
    constructionFeatures.length +
    suitabilityFeatures.length;

  if (total === 0) return null;

  return (
    <Section>
      <SectionHeader
        icon={Check}
        title="Features & Amenities"
        badge={
          <span className="inline-flex max-w-full items-center justify-center text-center text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border">
            {total} features
          </span>
        }
      />
      <div className="p-6 space-y-6">
        <FeatureSection title="Internal" features={internalFeatures} accent="bg-primary" />
        <FeatureSection title="External" features={externalFeatures} accent="bg-brand-emerald" />
        <FeatureSection title="Construction" features={constructionFeatures} accent="bg-accent" />
        <FeatureSection title="Suitable For" features={suitabilityFeatures} accent="bg-brand-gold" />
      </div>
    </Section>
  );
}
