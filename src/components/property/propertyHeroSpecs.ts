import type { ElementType, ReactNode } from "react";
import {
  Bath,
  BedDouble,
  Building2,
  Calendar,
  Layers,
  Square,
  Thermometer,
  Zap,
} from "lucide-react";
import { CONDITION_OPTIONS, HEATING_TYPES } from "@/lib/filterConfig";
import type { ListingWithJoins } from "@/hooks/useListings";

export interface HeroSpecItem {
  key: string;
  label: string;
  value: ReactNode;
  icon: ElementType;
  emphasis?: boolean;
}

type HeroSpecTranslator = (
  key: string,
  options?: { defaultValue?: string },
) => string;

interface HeroSpecOptions {
  locale?: string;
  t?: HeroSpecTranslator;
}

export const hasVisibleHeroSpecValue = (value: ReactNode) =>
  value !== null && value !== undefined && value !== "";

const formatNumber = (value: number, locale = "en-GB") =>
  Number.isInteger(value)
    ? value.toLocaleString(locale)
    : value.toLocaleString(locale, { maximumFractionDigits: 2 });

export const formatAreaSpec = (value: number | null | undefined, locale = "en-GB") => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return `${formatNumber(Number(value), locale)} m²`;
};

export const formatFloorSpec = (
  floor: number | null | undefined,
  totalFloors?: number | null,
  locale = "en",
) => {
  if (floor === null || floor === undefined) return null;
  const isGreek = locale.toLowerCase().startsWith("el");
  const base = floor === -1
    ? (isGreek ? "Υπόγειο" : "Basement")
    : floor === 0
      ? (isGreek ? "Ισόγειο" : "Ground")
      : String(floor);
  return totalFloors ? `${base} / ${totalFloors}` : base;
};

const getHeatingLabel = (value: string | null | undefined) => {
  if (!value) return null;
  return HEATING_TYPES.find((h) => h.value === value)?.label ?? value.replace(/_/g, " ");
};

const getConditionLabel = (value: string | null | undefined) => {
  if (!value) return null;
  return CONDITION_OPTIONS.find((c) => c.value === value)?.label ?? value.replace(/_/g, " ");
};

export const buildListingHeroSpecs = (
  db: Partial<ListingWithJoins>,
  options: HeroSpecOptions = {},
): HeroSpecItem[] => {
  const locale = options.locale ?? "en";
  const numberLocale = locale.toLowerCase().startsWith("el") ? "el-GR" : "en-GB";
  const translate = (key: string, fallback: string) =>
    options.t?.(key, { defaultValue: fallback }) ?? fallback;
  const floorValue = formatFloorSpec(db.floor, db.total_floors, locale);
  const auctionFloorValue = db.listing_type === "auction"
    ? floorValue ?? translate("property.notProvided", "Not provided")
    : floorValue;
  const specs: HeroSpecItem[] = [
    { key: "surface", label: translate("property.area", "Surface"), value: formatAreaSpec(db.sqm, numberLocale), icon: Square, emphasis: true },
    { key: "bedrooms", label: translate("property.bedrooms", "Bedrooms"), value: db.bedrooms, icon: BedDouble },
    { key: "bathrooms", label: translate("property.bathrooms", "Bathrooms"), value: db.bathrooms, icon: Bath },
    { key: "floor", label: translate("property.floor", "Floor"), value: auctionFloorValue, icon: Layers },
    { key: "built", label: translate("property.yearBuilt", "Built"), value: db.year_built, icon: Calendar },
  ].filter((item) => hasVisibleHeroSpecValue(item.value));

  if (db.energy_class && db.energy_class !== "Exempt") {
    specs.push({ key: "energy", label: translate("property.energyClass", "Energy"), value: db.energy_class, icon: Zap, emphasis: true });
  }

  if (specs.length < 6) {
    const heating = getHeatingLabel(db.heating_system);
    if (heating) specs.push({ key: "heating", label: translate("property.heating", "Heating"), value: heating, icon: Thermometer });
  }

  if (specs.length < 6) {
    const condition = getConditionLabel(db.construction_status);
    if (condition) specs.push({ key: "condition", label: translate("property.condition", "Condition"), value: condition, icon: Building2 });
  }

  return specs;
};
