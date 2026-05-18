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

/**
 * Property Details section: a 2-column grid of `DetailRow`s plus the optional
 * Energy Performance Certificate visualisation.
 *
 * Extracted from PropertyDetail.tsx to lower its cyclomatic complexity (the
 * energy certificate had nested conditionals + a loop + an IIFE all inline).
 * See docs/ENTERPRISE_ASSESSMENT_2026-04-27.md (Quadrant I, Top fn-size).
 */
export function PropertyDetailsAndEnergy({ detailRows, energyClass }: Props) {
  const displayEnergyClass =
    energyClass && energyClass !== "Exempt" && (energyClass as EnergyClass) in ENERGY_COLORS
      ? energyClass
      : null;
  const energyData = displayEnergyClass ? ENERGY_SCALE.find((e) => e.cls === displayEnergyClass) : undefined;

  return (
    <Section>
      <SectionHeader icon={Home} title="Property Details" />
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
          {detailRows
            .filter((row): row is { label: string; value: string | number } =>
              row.value !== null && row.value !== undefined,
            )
            .map((row) => (
              <DetailRow key={row.label} label={row.label} value={row.value} />
            ))}
        </div>

        {displayEnergyClass && (
          <EnergyCertificate energyClass={displayEnergyClass} energyDesc={energyData?.desc} />
        )}
      </div>
    </Section>
  );
}

interface EnergyCertificateProps {
  energyClass: string;
  energyDesc: string | undefined;
}

function EnergyCertificate({ energyClass, energyDesc }: EnergyCertificateProps) {
  const cls = energyClass as EnergyClass;
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
          <div className={`px-2 py-0.5 rounded text-xs font-black ${ENERGY_COLORS[cls]}`}>
            {energyClass}
          </div>
          <span className="text-xs text-muted-foreground">{energyDesc}</span>
        </div>
      )}
    </div>
  );
}

interface EnergyBarProps {
  bar: { cls: string; hex: string };
  index: number;
  active: boolean;
}

function EnergyBar({ bar, index, active }: EnergyBarProps) {
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
}
