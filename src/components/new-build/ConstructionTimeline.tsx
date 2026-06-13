import { HardHat, CheckCircle2, Circle } from "lucide-react";
import { CONSTRUCTION_PHASES } from "@/lib/newBuildConfig";

type ProjectTimeline = {
  permit_approval_date?: string | null;
  construction_start_date?: string | null;
  structural_completion_date?: string | null;
  delivery_date?: string | null;
};

const formatDate = (date: string | null | undefined) => {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(parsed);
};

const projectDateForPhase = (key: string, project: ProjectTimeline | null | undefined) => {
  if (!project) return null;
  if (key === "planning") return formatDate(project.permit_approval_date);
  if (key === "foundation") return formatDate(project.construction_start_date);
  if (key === "under_construction" || key === "topping_out") return formatDate(project.structural_completion_date);
  if (key === "shell_complete" || key === "new") return formatDate(project.delivery_date);
  return null;
};

export function ConstructionTimeline({
  status,
  project,
}: {
  status: string | null;
  project?: ProjectTimeline | null;
}) {
  if (!status) return null;
  const currentIdx = CONSTRUCTION_PHASES.findIndex(p => p.key === status);
  const activeIdx = currentIdx === -1 ? 0 : currentIdx;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
        <HardHat className="w-4 h-4 text-orange-500" /> Construction Progress
      </h2>
      <div className="relative">
        <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-border" />
        <div
          className="absolute left-4 top-4 w-0.5 bg-orange-500 transition-all"
          style={{ height: `${(activeIdx / (CONSTRUCTION_PHASES.length - 1)) * 100}%` }}
        />
        <div className="space-y-4">
          {CONSTRUCTION_PHASES.map((phase, idx) => {
            const done = idx < activeIdx;
            const active = idx === activeIdx;
            const Icon = phase.icon;
            const dateLabel = projectDateForPhase(phase.key, project);
            return (
              <div key={phase.key} className="flex items-center gap-4 relative">
                <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  done   ? "bg-orange-500 text-white" :
                  active ? "bg-orange-500 text-white ring-4 ring-orange-500/20" :
                           "bg-muted text-muted-foreground"
                }`}>
                  {done ? <CheckCircle2 className="w-4 h-4" /> : active ? <Icon className="w-4 h-4" /> : <Circle className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <p className={`text-sm font-medium ${active ? "text-orange-600" : done ? "text-foreground" : "text-muted-foreground"}`}>
                    {phase.label}
                    {active && <span className="ml-2 text-xs font-bold bg-orange-500/15 text-orange-600 px-2 py-0.5 rounded-full">Current</span>}
                    {done && <span className="ml-2 text-xs text-muted-foreground">Done</span>}
                  </p>
                  {dateLabel && <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
