/* eslint-disable @typescript-eslint/no-explicit-any */
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function ProfileCompletionCard({
  bioType,
  profile,
  proServices,
  pro,
}: {
  bioType: string;
  profile: any;
  proServices?: any[];
  pro?: any;
}) {
  const navigate = useNavigate();

  const steps =
    bioType === "agent"
      ? [
          { label: "Add profile photo",      done: !!profile?.avatar_url },
          { label: "Add license number",     done: !!profile?.license_number },
          { label: "Set your working areas", done: !!profile?.city },
          { label: "Complete bio",           done: (profile?.bio?.length ?? 0) > 50 },
        ]
      : [
          { label: "Add profile photo",          done: !!profile?.avatar_url },
          { label: "Add service catalog",        done: (proServices?.length ?? 0) > 0 },
          { label: "Set availability hours",     done: !!pro?.availability && Object.keys(pro?.availability ?? {}).length > 0 },
          { label: "Upload license/certificate", done: pro?.verified === true },
          { label: "Review video settings",     done: true },
        ];

  const completed = steps.filter(s => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);
  if (pct === 100) return null;

  return (
    <div className="glass-card rounded-xl border border-primary/20 p-4 bg-primary/5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm">Complete your profile</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Get more leads by completing your profile</p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-primary">{pct}%</span>
          <p className="text-[10px] text-muted-foreground">complete</p>
        </div>
      </div>
      <div className="w-full h-1.5 bg-secondary rounded-full mb-3">
        <div className="h-1.5 bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-1.5">
        {steps
          .filter(s => !s.done)
          .slice(0, 3)
          .map(s => (
            <div key={s.label} className="flex items-center text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                {s.label}
              </div>
            </div>
          ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full mt-3 border-primary/30 text-primary text-xs h-8"
        onClick={() => navigate("/dashboard/profile")}
      >
        Complete profile →
      </Button>
    </div>
  );
}
