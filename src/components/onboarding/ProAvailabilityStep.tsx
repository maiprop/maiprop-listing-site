import { Calendar, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DAYS, type DayAvailability } from "@/lib/onboardingConfig";

interface Props {
  availability: DayAvailability[];
  loading: boolean;
  authLoading: boolean;
  onChange: (updater: (prev: DayAvailability[]) => DayAvailability[]) => void;
  onSave: () => void;
  onSkip: () => void;
}

export function ProAvailabilityStep({ availability, loading, authLoading, onChange, onSave, onSkip }: Props) {
  return (
    <div>
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto mb-4">
          <Calendar className="w-7 h-7 text-emerald-400" />
        </div>
        <h1 className="font-display font-bold text-2xl text-foreground mb-1">Your Availability</h1>
        <p className="text-muted-foreground text-sm">Set when you're available for client appointments</p>
      </div>
      <div className="space-y-2 mb-6">
        {DAYS.map((day, i) => {
          const d = availability[i];
          return (
            <div
              key={day}
              className={cn(
                "rounded-xl border p-3 transition-all",
                d.enabled ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/40"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  onClick={() => onChange(prev => prev.map((v, idx) => idx === i ? { ...v, enabled: !v.enabled } : v))}
                  className={cn(
                    "w-9 h-5 rounded-full border relative transition-colors cursor-pointer shrink-0",
                    d.enabled ? "bg-primary border-primary" : "bg-secondary border-border"
                  )}
                >
                  <div className={cn(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-background shadow transition-transform",
                    d.enabled ? "translate-x-4" : "translate-x-0.5"
                  )} />
                </div>
                <span className={cn("text-sm font-semibold w-8 shrink-0", d.enabled ? "text-foreground" : "text-muted-foreground")}>
                  {day}
                </span>
                {d.enabled ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={d.start}
                      onChange={e => onChange(prev => prev.map((v, idx) => idx === i ? { ...v, start: e.target.value } : v))}
                      className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground outline-none focus:border-primary transition-colors"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="time"
                      value={d.end}
                      onChange={e => onChange(prev => prev.map((v, idx) => idx === i ? { ...v, end: e.target.value } : v))}
                      className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground outline-none focus:border-primary transition-colors"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Not available</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Button
        className="w-full bg-gradient-primary border-0 text-primary-foreground"
        disabled={loading || authLoading}
        onClick={onSave}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Save Availability & Continue <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
      <button
        className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={onSkip}
      >
        Skip for now →
      </button>
    </div>
  );
}
