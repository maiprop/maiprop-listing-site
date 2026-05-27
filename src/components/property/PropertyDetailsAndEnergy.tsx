import { Home, Zap } from "lucide-react";
import { Section, SectionHeader } from "@/components/property/DetailPrimitives";
import { ENERGY_SCALE, ENERGY_COLORS } from "@/types";
import type { EnergyClass } from "@/types";

export interface DetailRowItem {
  label: string;
  value: string | number | null | undefined;
}

export interface DetailGroupItem {
  title: string;
  rows: DetailRowItem[];
}

interface Props {
  detailRows?: DetailRowItem[];
  detailGroups?: DetailGroupItem[];
  energyClass: string | null | undefined;
}

type VisibleDetailRow = {
  label: string;
  value: string | number;
};

type VisibleDetailGroup = {
  title: string;
  rows: VisibleDetailRow[];
};

const hasDisplayValue = (row: DetailRowItem): row is VisibleDetailRow => {
  return row.value !== null && row.value !== undefined;
};

const getDisplayEnergyClass = (energyClass: string | null | undefined): EnergyClass | null => { // skipcq: JS-R1005 - Energy class normalization keeps exempt and unknown values local.
  if (!energyClass || energyClass === "Exempt") return null;
  return energyClass in ENERGY_COLORS ? (energyClass as EnergyClass) : null;
};

const getEnergyDescription = (energyClass: EnergyClass | null) => {
  return ENERGY_SCALE.find((e) => e.cls === energyClass)?.desc;
};

const getVisibleGroups = (
  detailGroups: DetailGroupItem[] | undefined,
  detailRows: DetailRowItem[] | undefined,
): VisibleDetailGroup[] => {
  const sourceGroups = detailGroups?.length
    ? detailGroups
    : [{ title: "Overview", rows: detailRows ?? [] }];

  return sourceGroups
    .map((group) => ({ ...group, rows: group.rows.filter(hasDisplayValue) }))
    .filter((group) => group.rows.length > 0);
};

const DetailTile = ({ row }: { row: VisibleDetailRow }) => (
  <div className="min-w-0 rounded-lg border border-border/60 bg-secondary/35 px-3.5 py-3">
    <dt className="truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      {row.label}
    </dt>
    <dd className="mt-1 break-words text-sm font-semibold text-foreground capitalize">
      {row.value}
    </dd>
  </div>
);

const DetailGroupsGrid = ({ groups }: { groups: VisibleDetailGroup[] }) => (
  <div className="space-y-6">
    {groups.map((group) => (
      <section key={group.title} className="space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {group.title}
          </p>
          <div className="h-px flex-1 bg-border" />
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {group.rows.length}
          </span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {group.rows.map((row) => <DetailTile key={`${group.title}-${row.label}`} row={row} />)}
        </dl>
      </section>
    ))}
  </div>
);

interface EnergyBarProps {
  bar: { cls: string; hex: string };
  index: number;
  active: boolean;
}

const EnergyBar = ({ bar, index, active }: EnergyBarProps) => {
  const barH = 16 + index * 4;
  const dark = ["B", "C", "D"].includes(bar.cls);
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5">
      {active && <div className="text-[8px] font-black text-foreground">▼</div>}
      <div
        style={{ backgroundColor: bar.hex, height: `${barH}px`, opacity: active ? 1 : 0.4 }}
        className={`w-full rounded-sm flex items-end justify-center pb-0.5 transition-all ${active ? "ring-2 ring-white/30 ring-offset-1 ring-offset-card" : ""}`}
      >
        <span
          className="text-[8px] font-black leading-none"
          style={{ color: dark ? "#000" : "#fff" }}
        >
          {bar.cls}
        </span>
      </div>
    </div>
  );
};

interface EnergyCertificateProps {
  energyClass: EnergyClass | null;
  energyDesc: string | undefined;
}

const EnergyCertificate = ({ energyClass, energyDesc }: EnergyCertificateProps) => {
  if (!energyClass) return null;

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Energy Performance Certificate
        </p>
      </div>
      <div className="flex gap-1 items-end mb-2">
        {ENERGY_SCALE.map((e, i) => (
          <EnergyBar key={e.cls} bar={e} index={i} active={e.cls === energyClass} />
        ))}
      </div>
      {energyDesc && (
        <div className="flex items-center gap-2 mt-3">
          <div className={`px-2 py-0.5 rounded text-xs font-black ${ENERGY_COLORS[energyClass]}`}>
            {energyClass}
          </div>
          <span className="text-xs text-muted-foreground">{energyDesc}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Property Details section: a 2-column grid of `DetailRow`s plus the optional
 * Energy Performance Certificate visualisation.
 *
 * Extracted from PropertyDetail.tsx to lower its cyclomatic complexity (the
 * energy certificate had nested conditionals + a loop + an IIFE all inline).
 * See docs/ENTERPRISE_ASSESSMENT_2026-04-27.md (Quadrant I, Top fn-size).
 */
export const PropertyDetailsAndEnergy = ({ detailRows, detailGroups, energyClass }: Props) => {
  const displayEnergyClass = getDisplayEnergyClass(energyClass);
  const visibleGroups = getVisibleGroups(detailGroups, detailRows);

  return (
    <Section>
      <SectionHeader icon={Home} title="Property Details" />
      <div className="p-5 sm:p-6">
        <DetailGroupsGrid groups={visibleGroups} />

        <EnergyCertificate
          energyClass={displayEnergyClass}
          energyDesc={getEnergyDescription(displayEnergyClass)}
        />
      </div>
    </Section>
  );
};
