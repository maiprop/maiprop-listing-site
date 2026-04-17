import { Link } from "react-router-dom";
import { Calendar, ExternalLink, Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/useSubscription";

export function BuyerOpenHousesCard({ onOpen }: { onOpen: () => void }) {
  const { isPro } = useSubscription();

  return (
    <div className="glass-card rounded-xl border border-brand-emerald/20 bg-brand-emerald/5 md:col-span-2 overflow-hidden">
      <div className="p-6">
        <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-emerald" /> Open Houses
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Attend curated property open houses. Register and attend in person or virtually.
        </p>

        {/* Pro-gated AI features preview */}
        <div className="relative mb-4">
          <div className={cn("grid grid-cols-2 sm:grid-cols-3 gap-2 transition-all", !isPro && "blur-sm pointer-events-none select-none")}>
            {[
              { label: "AI Price Insight",  value: "Market −8%", color: "text-brand-emerald" },
              { label: "Similar Deals",     value: "4 nearby",   color: "text-primary" },
              { label: "Predicted ROI",     value: "6.2% / yr",  color: "text-brand-gold" },
            ].map(item => (
              <div key={item.label} className="glass-card rounded-lg p-3 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{item.label}</p>
                <p className={cn("font-display text-base font-bold mt-0.5", item.color)}>{item.value}</p>
              </div>
            ))}
          </div>
          {!isPro && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/60 backdrop-blur-[2px]">
              <Lock className="w-5 h-5 text-primary" />
              <p className="text-xs font-semibold text-center px-2">AI insights require Pro</p>
              <Button
                size="sm"
                className="bg-gradient-primary border-0 text-primary-foreground h-7 px-3 text-xs gap-1.5"
                asChild
              >
                <Link to="/pricing"><Zap className="w-3 h-3" /> Upgrade to Pro</Link>
              </Button>
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="border-brand-emerald/40 text-brand-emerald hover:bg-brand-emerald/10 gap-1.5"
          onClick={onOpen}
        >
          <ExternalLink className="w-3.5 h-3.5" /> Browse Open Houses
        </Button>
      </div>
    </div>
  );
}
