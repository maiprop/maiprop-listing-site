/**
 * Small presentational primitives used across property detail pages.
 * Extracted from PropertyDetail.tsx / NewBuildDetail.tsx.
 */
import { Check } from "lucide-react";

export function FeatureChip({ icon: Icon, label }: { icon?: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground hover:border-primary/30 hover:bg-secondary transition-all duration-200">
      <Check className="w-3 h-3 text-primary shrink-0" />
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      <span className="font-medium">{label}</span>
    </div>
  );
}

export function FeatureSection({
  title,
  features,
  accent,
}: {
  title: string;
  features: { icon?: React.ElementType; label: string }[];
  accent: string;
}) {
  if (features.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-1 h-3.5 rounded-full ${accent}`} />
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full border border-border">
          {features.length}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {features.map((f) => <FeatureChip key={f.label} icon={f.icon} label={f.label} />)}
      </div>
    </div>
  );
}

export function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass-card rounded-2xl border border-border overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  badge,
}: {
  icon?: React.ElementType;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
      {Icon && (
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <h4 className="font-display font-semibold text-sm">{title}</h4>
      {badge && <span className="ml-auto">{badge}</span>}
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0 gap-4">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-semibold text-right capitalize">{value}</span>
    </div>
  );
}
