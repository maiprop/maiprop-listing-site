import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AddonItem } from "./addons";

export const AddonCard = ({
  item,
  accent,
  loading,
  onPurchase,
}: {
  item: AddonItem;
  accent: string;
  loading: boolean;
  onPurchase: () => void;
}) => {
  const accentClasses = {
    amber: {
      border: "border-amber-500/20",
      bg: "bg-amber-500/10",
      icon: "text-amber-500",
    },
    primary: {
      border: "border-primary/20",
      bg: "bg-primary/10",
      icon: "text-primary",
    },
    rose: {
      border: "border-rose-500/20",
      bg: "bg-rose-500/10",
      icon: "text-rose-400",
    },
  }[accent] ?? {
    border: "border-border",
    bg: "bg-secondary",
    icon: "text-foreground",
  };

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-card p-4 flex flex-col gap-2",
        accentClasses.border,
      )}
    >
      {item.badge && (
        <div className="absolute -top-2.5 right-3">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
            {item.badge}
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            accentClasses.bg,
          )}
        >
          <item.icon className={cn("w-4 h-4", accentClasses.icon)} />
        </div>
        <div className="text-right">
          <p className="font-bold text-lg leading-none">{item.price}</p>
          <p className="text-[10px] text-muted-foreground">{item.unit}</p>
        </div>
      </div>
      <p className="font-semibold text-sm">{item.name}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {item.desc}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-auto gap-1.5"
        onClick={onPurchase}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <CreditCard className="w-3.5 h-3.5" />
        )}
        {item.manual ? "Contact team" : "Buy add-on"}
      </Button>
    </div>
  );
};
