import { Home, Zap } from "lucide-react";
import { Section, SectionHeader, DetailRow } from "@/components/property/DetailPrimitives";
import { ENERGY_SCALE, ENERGY_COLORS } from "@/types";
import type { EnergyClass } from "@/types";

export interface DetailRowItem {
  label: string;
  value: string | number | null | undefined;
}

interface Props {
  detailRows: DetailRowItem[];
  energyClass: string | null | undefined;
}

type VisibleDetailRow = {
  label: string;
  value: string | number;
};

const hasDisplayValue = (row: DetailRowItem): row is VisibleDetailRow => {
  return row.value !== null && row.value !== undefined;
};

const getDisplayEnergyClass = (energyClass: string | null | undefined): EnergyClass | null => {
  if (!energyClass || energyClass === "Exempt") return null;
  return energyClass in ENERGY_COLORS ? (energyClass as EnergyClass) : null;
};

const getEnergyDescription = (energyClass: EnergyClass | null) => {
  return ENERGY_SCALE.find((e) => e.cls === energyClass)?.desc;
};

const DetailRowsGrid = ({ rows }: { rows: VisibleDetailRow[] }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
    {rows.map((row) => (
      <DetailRow key={row.label} label={row.label} value={row.value} />
    ))}
  </div>
);

/**
 * Property Details section: a 2-column grid of `DetailRow`s plus the optional
 * Energy Performance Certificate visualisation.
 *
 * Extracted from PropertyDetail.tsx to lower its cyclomatic complexity (the
 * energy certificate had nested conditionals + a loop + an IIFE all inline).
 * See docs/ENTERPRISE_ASSESSMENT_2026-04-27.md (Quadrant I, Top fn-size).
 */
export const PropertyDetailsAndEnergy = ({ detailRows, energyClass }: Props) => {
  const displayEnergyClass = getDisplayEnergyClass(energyClass);
  const visibleDetailRows = detailRows.filter(hasDisplayValue);

  return (
    <Section>
      <SectionHeader icon={Home} title="Property Details" />
      <div className="p-6">
        <DetailRowsGrid rows={visibleDetailRows} />

        <EnergyCertificate
          energyClass={displayEnergyClass}
          energyDesc={getEnergyDescription(displayEnergyClass)}
        />
      </div>
    </Section>
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
