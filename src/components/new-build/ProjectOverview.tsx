import { Building2 } from "lucide-react";
import {
  formatProjectDate,
  type NewBuildProject,
} from "@/lib/newBuildProjectDetail";

type ProjectOverviewProps = {
  project: NewBuildProject | null;
  unitCount: number;
  mediaCount: number;
};

export function ProjectOverview({ project, unitCount, mediaCount }: ProjectOverviewProps) {
  if (!project) return null;

  const facts = [
    { label: "Developer", value: project.developer_company },
    { label: "Architect", value: project.architect_group },
    { label: "Builder", value: project.construction_company },
    { label: "Permit", value: project.building_permit_number },
    { label: "Municipality", value: project.municipality ?? project.city },
    { label: "Delivery", value: formatProjectDate(project.delivery_date) },
    { label: "Available units", value: unitCount > 0 ? `${unitCount} unit${unitCount === 1 ? "" : "s"}` : null },
    { label: "Project media", value: mediaCount > 0 ? `${mediaCount} file${mediaCount === 1 ? "" : "s"}` : null },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  if (!project.name && !project.area_description && !project.description && facts.length === 0) return null;

  return (
    <section className="glass-card rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Building2 className="w-3.5 h-3.5 text-primary" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Project</p>
          <h2 className="font-display font-semibold text-sm">{project.name}</h2>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {(project.area_description || project.description) && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {project.area_description ?? project.description}
          </p>
        )}
        {facts.length > 0 && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
                <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{fact.label}</dt>
                <dd className="mt-1 text-sm font-semibold text-foreground break-words">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
