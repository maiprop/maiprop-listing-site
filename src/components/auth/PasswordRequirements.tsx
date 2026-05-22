import { CheckCircle2, Circle } from "lucide-react";
import { getPasswordRequirements } from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

interface PasswordRequirementsProps {
  password: string;
  forceShow?: boolean;
}

export function PasswordRequirements({ password, forceShow = false }: PasswordRequirementsProps) {
  if (!password && !forceShow) return null;

  const requirements = getPasswordRequirements(password);
  const unmet = requirements.filter(requirement => !requirement.met).length;
  const complete = unmet === 0;

  return (
    <div
      className={cn(
        "mt-3 rounded-xl border px-3 py-3 text-xs transition-colors",
        complete
          ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
          : "border-primary/15 bg-primary/5 text-muted-foreground",
      )}
      aria-live="polite"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className={cn("font-semibold", complete ? "text-emerald-800" : "text-foreground")}>
          {complete ? "Password looks strong" : "Password requirements"}
        </p>
        {!complete && (
          <span className="shrink-0 rounded-full bg-background/80 px-2 py-0.5 font-medium text-primary">
            {requirements.length - unmet}/{requirements.length}
          </span>
        )}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {requirements.map(requirement => (
          <div
            key={requirement.id}
            className={cn(
              "flex items-center gap-1.5",
              requirement.met ? "text-emerald-700" : "text-muted-foreground",
            )}
          >
            {requirement.met ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{requirement.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
