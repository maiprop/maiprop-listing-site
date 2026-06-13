import { Ruler, SquareStack, Layers, Home, Trees, Zap, Building2, FileCheck2, Users } from "lucide-react";

type Project = {
  developer_company?: string | null;
  architect_group?: string | null;
  construction_company?: string | null;
  building_permit_number?: string | null;
  municipality?: string | null;
};

type ProjectUnit = {
  id: string;
  availability_status?: string | null;
};

export function ConstructionSpecs({
  listing,
  project,
  units = [],
}: {
  listing: Record<string, unknown>;
  project?: Project | null;
  units?: ProjectUnit[];
}) {
  const availableUnits = units.filter((unit) => (unit.availability_status ?? "available") === "available").length;
  const specs = [
    project?.developer_company && { icon: Building2, label: "Developer", value: project.developer_company },
    project?.architect_group && { icon: Ruler, label: "Architect", value: project.architect_group },
    project?.construction_company && { icon: Home, label: "Builder", value: project.construction_company },
    project?.building_permit_number && { icon: FileCheck2, label: "Building permit", value: project.building_permit_number },
    project?.municipality && { icon: Building2, label: "Municipality", value: project.municipality },
    units.length > 0 && { icon: Users, label: "Project units", value: `${availableUnits}/${units.length} available` },
    listing.total_floors && { icon: SquareStack, label: "Total floors", value: `${listing.total_floors}` },
    listing.sqm && { icon: Ruler, label: "Unit area from", value: `${listing.sqm} m2` },
    listing.has_parking && { icon: Home, label: "Parking", value: "Included" },
    listing.has_elevator && { icon: Layers, label: "Elevator", value: "Yes" },
    listing.has_pool && { icon: Trees, label: "Swimming pool", value: "Common area" },
    listing.has_garden && { icon: Trees, label: "Garden / Grounds", value: "Yes" },
    listing.has_smart_home && { icon: Zap, label: "Smart home system", value: "Standard" },
    listing.energy_class && { icon: Zap, label: "Energy rating", value: `${listing.energy_class}` },
  ].filter(Boolean) as { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[];

  if (!specs.length) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
        <Ruler className="w-4 h-4" /> Building Specifications
      </h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
        {specs.map(spec => (
          <div key={spec.label} className="flex items-start gap-2">
            <spec.icon className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <dt className="text-[10px] text-muted-foreground leading-tight">{spec.label}</dt>
              <dd className="text-xs font-semibold break-words">{spec.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
