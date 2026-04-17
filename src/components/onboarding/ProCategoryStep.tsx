import { Wrench, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRO_CATEGORIES } from "@/lib/onboardingConfig";

interface Props {
  proCategory: string;
  onChange: (cat: string) => void;
  onNext: () => void;
}

export function ProCategoryStep({ proCategory, onChange, onNext }: Props) {
  return (
    <div>
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto mb-4">
          <Wrench className="w-7 h-7 text-rose-400" />
        </div>
        <h1 className="font-display font-bold text-2xl text-foreground mb-1">What's your discipline?</h1>
        <p className="text-muted-foreground text-sm">Select the category that best describes your practice</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
        {PRO_CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => onChange(cat.value)}
            className={cn(
              "p-3 rounded-xl border text-sm font-medium text-left transition-all",
              proCategory === cat.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-secondary/60 text-muted-foreground hover:border-border/80 hover:text-foreground"
            )}
          >
            {proCategory === cat.value && <Check className="w-3.5 h-3.5 text-primary inline mr-1.5" />}
            {cat.label}
          </button>
        ))}
      </div>
      <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" onClick={onNext}>
        Continue <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}
