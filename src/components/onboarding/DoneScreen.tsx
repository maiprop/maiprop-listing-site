import { useState, useEffect } from "react";
import { Check, ArrowRight, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ParticipantType } from "@/lib/onboardingConfig";

export function DoneScreen({
  selected,
  selectedColor,
  SelectedIcon,
  isPro,
  proCategory: _proCategory,
  selectedServicesCount,
  actions,
  navigate,
  autoRedirect = true,
  onUpgradeToPro,
  professionalProPrice,
}: {
  selected: ParticipantType | null;
  selectedColor: { bg: string; border: string; text: string; iconBg: string };
  SelectedIcon: React.ElementType;
  isPro: boolean;
  proCategory: string;
  selectedServicesCount: number;
  actions: { primary: { label: string; href: string }; subtitle: string };
  navigate: (href: string) => void;
  autoRedirect?: boolean;
  onUpgradeToPro?: () => Promise<void>;
  professionalProPrice?: string;
}) {
  const proPrice = professionalProPrice ?? "EUR 69/mo";
  const [countdown, setCountdown] = useState(4);
  const [redirectCancelled, setRedirectCancelled] = useState(false);

  useEffect(() => {
    if (!autoRedirect) return;
    if (redirectCancelled) return;
    if (countdown <= 0) { navigate(actions.primary.href); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [autoRedirect, countdown, redirectCancelled, actions.primary.href, navigate]);

  return (
    <div className="text-center py-4">
      <div className="relative w-20 h-20 mx-auto mb-5">
        <div className={cn("w-20 h-20 rounded-full flex items-center justify-center border-2", selectedColor.bg, selectedColor.border)}>
          <SelectedIcon className={cn("w-9 h-9", selectedColor.text)} />
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-background">
          <Check className="w-3.5 h-3.5 text-white" />
        </div>
      </div>

      <h1 className="font-display font-bold text-2xl text-foreground mb-1.5">
        {isPro ? "Profile Created!" : "You're all set!"}
      </h1>
      <p className="text-muted-foreground text-sm mb-1">{actions.subtitle}</p>
      {isPro && (
        <p className="text-xs text-muted-foreground mb-2">
          We'll review your details within 24–48 hours and add your verified badge.
        </p>
      )}

      <div className="bg-secondary/60 border border-border rounded-2xl p-4 text-left mb-5 mt-4 space-y-1.5">
        <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">What's unlocked</p>
        {(selected?.features ?? []).map(f => (
          <div key={f} className="flex items-center gap-2 text-sm text-foreground/80">
            <Check className={cn("w-3.5 h-3.5 shrink-0", selectedColor.text)} /> {f}
          </div>
        ))}
        {isPro && (
          <>
            <div className="flex items-center gap-2 text-sm text-foreground/80">
              <Check className="w-3.5 h-3.5 shrink-0 text-rose-400" />{selectedServicesCount} services configured
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground/80">
              <Check className="w-3.5 h-3.5 shrink-0 text-rose-400" />Availability schedule set
            </div>
          </>
        )}
      </div>

      <Button
        className="w-full bg-gradient-primary border-0 text-primary-foreground mb-2 relative overflow-hidden"
        onClick={() => { setRedirectCancelled(true); navigate(actions.primary.href); }}
      >
        <ArrowRight className="w-4 h-4 mr-2" />
        {actions.primary.label}
        {autoRedirect && !redirectCancelled && countdown > 0 && (
          <span className="ml-auto text-[11px] opacity-70 font-normal tabular-nums">
            {countdown}s
          </span>
        )}
      </Button>

      {autoRedirect && !redirectCancelled && countdown > 0 && (
        <p className="text-[11px] text-muted-foreground mb-3">
          Redirecting in {countdown}s ·{" "}
          <button
            className="underline hover:text-foreground transition-colors"
            onClick={() => setRedirectCancelled(true)}
          >
            Stay here
          </button>
        </p>
      )}

      {onUpgradeToPro && (
        <Button
          className="w-full mb-2 border-2 border-rose-500/40 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
          onClick={() => { setRedirectCancelled(true); onUpgradeToPro(); }}
        >
          <Crown className="w-4 h-4 mr-2" />
          Upgrade to Pro — {proPrice}
        </Button>
      )}
    </div>
  );
}
