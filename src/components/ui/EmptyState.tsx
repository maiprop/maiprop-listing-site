import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline";
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, subtitle, action, className }: EmptyStateProps) {
  return (
    <div className={`glass-card rounded-xl p-12 text-center ${className ?? ""}`}>
      {Icon && <Icon className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" aria-hidden="true" />}
      <p className="font-semibold text-foreground">{title}</p>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      {action && (
        <Button
          size="sm"
          variant={action.variant ?? "outline"}
          className="mt-4"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
