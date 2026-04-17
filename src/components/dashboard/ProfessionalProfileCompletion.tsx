/* eslint-disable @typescript-eslint/no-explicit-any */
import { CheckCircle2, AlertCircle, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useProfessionalAvailability } from "@/hooks/useProfessionalServices";

export function ProfessionalProfileCompletion({
  myProfessional,
  onGoToProfile,
  onGoToServices,
}: {
  myProfessional?: any;
  onGoToProfile?: () => void;
  onGoToServices?: () => void;
}) {
  const { data: availability = [] } = useProfessionalAvailability(myProfessional?.id ?? "");
  const hasAvailability = availability.length > 0;

  const fields = [
    { key: "photo",        label: "Profile photo",        done: !!myProfessional?.avatar_url,                               hint: "3× more profile views",      action: "profile"  },
    { key: "bio",          label: "Bio / About",           done: !!(myProfessional?.bio && myProfessional.bio.length > 20),  hint: "Builds trust with clients",  action: "profile"  },
    { key: "rate",         label: "Hourly rate",           done: !!myProfessional?.hourly_rate,                              hint: "Clients need pricing info",  action: "profile"  },
    { key: "specialties",  label: "Specialties",           done: (myProfessional?.specialties?.length ?? 0) > 0,             hint: "Appear in filtered searches", action: "profile" },
    { key: "availability", label: "Availability schedule", done: hasAvailability,                                            hint: "Enable direct booking",      action: "services" },
  ];

  const completedCount = fields.filter(f => f.done).length;
  const score = Math.round((completedCount / fields.length) * 100);
  const isComplete = score === 100;

  return (
    <div className={cn(
      "glass-card rounded-xl p-5 border",
      isComplete ? "border-brand-emerald/30 bg-brand-emerald/5" : "border-brand-gold/20 bg-brand-gold/5",
    )}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {isComplete
            ? <><CheckCircle2 className="w-4 h-4 text-brand-emerald" /> Profile Complete!</>
            : <><AlertCircle className="w-4 h-4 text-brand-gold" /> Profile Completion</>
          }
        </h3>
        <span className={cn(
          "font-display text-lg font-bold",
          isComplete ? "text-brand-emerald" : score >= 60 ? "text-brand-gold" : "text-destructive",
        )}>
          {score}%
        </span>
      </div>

      <Progress
        value={score}
        className={cn(
          "h-2 mb-4",
          isComplete ? "[&>div]:bg-brand-emerald" : score >= 60 ? "[&>div]:bg-brand-gold" : "[&>div]:bg-destructive",
        )}
      />

      <ul className="space-y-2">
        {fields.map(f => (
          <li key={f.key} className="flex items-center gap-3 text-sm">
            {f.done
              ? <CheckCircle2 className="w-4 h-4 text-brand-emerald shrink-0" />
              : <AlertCircle className="w-4 h-4 text-brand-gold shrink-0" />
            }
            <span className={cn("flex-1 truncate", f.done ? "text-muted-foreground line-through" : "text-foreground")}>
              {f.label}
            </span>
            {!f.done && (
              <span className="text-[10px] text-muted-foreground hidden sm:inline truncate max-w-[140px]">
                {f.hint}
              </span>
            )}
            {!f.done && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] font-semibold text-primary border border-primary/20 hover:bg-primary/10 shrink-0"
                onClick={f.action === "services" ? onGoToServices : onGoToProfile}
              >
                <Edit2 className="w-3 h-3 mr-1" /> Fix
              </Button>
            )}
          </li>
        ))}
      </ul>

      {isComplete && (
        <p className="text-xs text-brand-emerald mt-3">
          🎉 You're fully optimised — your profile appears prominently in client searches.
        </p>
      )}
    </div>
  );
}
