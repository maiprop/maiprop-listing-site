import { forwardRef } from "react";
import { Check } from "lucide-react";

export const FilterChip = forwardRef<HTMLButtonElement, {
  active: boolean; onClick: () => void; children: React.ReactNode;
}>(function FilterChip({ active, onClick, children }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-all ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/40"
      }`}
    >
      {active && <Check className="w-3 h-3" />}
      {children}
    </button>
  );
});
