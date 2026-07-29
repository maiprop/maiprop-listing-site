import type { Database } from "@/integrations/supabase/types";
import { formatNewBuildPrice as formatPrice } from "@/lib/newBuildConfig";
import { calculatePricePerSqm } from "@/lib/priceCalculations";

export type NewBuildProjectUnit = Pick<
  Database["public"]["Tables"]["project_units"]["Row"],
  | "id"
  | "listing_id"
  | "unit_id"
  | "unit_number"
  | "floor"
  | "availability_status"
  | "internal_sqm"
  | "balcony_sqm"
  | "storage_sqm"
  | "parking_sqm"
  | "bedrooms"
  | "bathrooms"
  | "kitchen_type"
  | "living_rooms"
  | "price"
  | "price_per_sqm"
  | "vat_included"
  | "parking_price"
  | "storage_price"
  | "sea_view"
  | "city_view"
  | "mountain_view"
  | "energy_class"
  | "heating_system"
  | "cooling_system"
>;

export type NewBuildProjectMedia = Pick<
  Database["public"]["Tables"]["project_media"]["Row"],
  "id" | "url" | "media_type" | "title" | "sort_order"
>;

export type NewBuildProject = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  | "id"
  | "name"
  | "description"
  | "address"
  | "city"
  | "municipality"
  | "latitude"
  | "longitude"
  | "cover_image_url"
  | "developer_company"
  | "architect_group"
  | "construction_company"
  | "building_permit_number"
  | "area_description"
  | "permit_approval_date"
  | "construction_start_date"
  | "structural_completion_date"
  | "delivery_date"
  | "status"
> & {
  project_units?: NewBuildProjectUnit[] | null;
  project_media?: NewBuildProjectMedia[] | null;
};

export type NewBuildListing = Database["public"]["Tables"]["listings"]["Row"] & {
  publicationId?: number;
  listing_images?: Array<Pick<Database["public"]["Tables"]["listing_images"]["Row"], "url" | "sort_order">> | null;
  project?: NewBuildProject | null;
  projects?: NewBuildProject | null;
  profiles?: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    phone?: string | null;
  } | null;
  walkability_score?: number | null;
  safety_score?: number | null;
  noise_score?: number | null;
};

export type NewBuildValuationListing = Pick<NewBuildListing, "price" | "sqm" | "price_per_sqm">;

export const ACTIVE_UNIT_STATUSES = new Set(["available", "reserved", "under_offer"]);

export const getListingProject = (listing: NewBuildListing | null | undefined): NewBuildProject | null => {
  return listing?.project ?? listing?.projects ?? null;
};

const getUnitSortParts = (unit: NewBuildProjectUnit) => {
  const raw = String(unit.unit_number ?? unit.unit_id ?? "");
  const numeric = raw.match(/\d+/)?.[0];
  return {
    numeric: numeric ? Number.parseInt(numeric, 10) : Number.MAX_SAFE_INTEGER,
    label: raw,
  };
};

export const sortProjectUnits = (units: NewBuildProjectUnit[] | null | undefined): NewBuildProjectUnit[] => {
  return [...(units ?? [])].sort((a, b) => {
    const left = getUnitSortParts(a);
    const right = getUnitSortParts(b);
    if (left.numeric !== right.numeric) return left.numeric - right.numeric;
    return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" });
  });
};

export const sortProjectMedia = (media: NewBuildProjectMedia[] | null | undefined): NewBuildProjectMedia[] => {
  return [...(media ?? [])].sort((a, b) => {
    const typeDelta = (a.media_type ?? "").localeCompare(b.media_type ?? "");
    if (typeDelta !== 0) return typeDelta;
    return (a.sort_order ?? 99) - (b.sort_order ?? 99);
  });
};

export const isProjectImageMedia = (media: NewBuildProjectMedia): boolean => {
  const type = media.media_type?.toLowerCase() ?? "";
  const url = media.url.toLowerCase();
  return !type.includes("pdf") && !url.endsWith(".pdf");
};

export const finiteNumbers = (values: Array<number | null | undefined>) =>
  values.filter((value): value is number => Number.isFinite(value) && Number(value) > 0);

const averageNumber = (values: number[]): number | null => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const roundNumber = (value: number, precision = 0): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const getPositiveNumber = (value: number | null | undefined): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const buildProjectValuationMetrics = (
  units: NewBuildProjectUnit[],
  listing: NewBuildValuationListing | null | undefined,
) => {
  const unitSizes = finiteNumbers(units.map((unit) => unit.internal_sqm));
  const unitPrices = finiteNumbers(units.map((unit) => unit.price));
  const unitsWithPriceAndSize = units.filter((unit) => {
    return getPositiveNumber(unit.price) != null && getPositiveNumber(unit.internal_sqm) != null;
  });

  const totalUnitPrice = unitsWithPriceAndSize.reduce((sum, unit) => sum + Number(unit.price), 0);
  const totalUnitSqm = unitsWithPriceAndSize.reduce((sum, unit) => sum + Number(unit.internal_sqm), 0);
  const weightedUnitPricePerSqm = totalUnitPrice > 0 && totalUnitSqm > 0
    ? Math.round(totalUnitPrice / totalUnitSqm)
    : null;
  const averageUnitPricePerSqm = averageNumber(
    units
      .map((unit) => calculatePricePerSqm({
        price: unit.price,
        sqm: unit.internal_sqm,
        storedPricePerSqm: unit.price_per_sqm,
      }))
      .filter((value): value is number => value != null),
  );

  const averageUnitSize = averageNumber(unitSizes);
  const averageUnitPrice = averageNumber(unitPrices);
  const listingPrice = getPositiveNumber(listing?.price);
  const listingSqm = getPositiveNumber(listing?.sqm);
  const listingPricePerSqm = calculatePricePerSqm({
    price: listing?.price,
    sqm: listing?.sqm,
    storedPricePerSqm: listing?.price_per_sqm,
  });

  return {
    price: averageUnitPrice != null ? Math.round(averageUnitPrice) : listingPrice ?? 0,
    sqm: averageUnitSize != null ? roundNumber(averageUnitSize, 1) : listingSqm ?? 0,
    pricePerSqm: weightedUnitPricePerSqm ?? (averageUnitPricePerSqm != null ? Math.round(averageUnitPricePerSqm) : listingPricePerSqm ?? undefined),
  };
};

export const formatValueRange = (values: number[], unit = ""): string | null => {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const suffix = unit ? ` ${unit}` : "";
  return min === max ? `${min}${suffix}` : `${min}-${max}${suffix}`;
};

export const formatPriceRange = (values: number[]): string | null => {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? formatPrice(min) : `${formatPrice(min)} - ${formatPrice(max)}`;
};

export const formatLayoutRange = (beds: number[], baths: number[]): string | null => {
  const bedRange = formatValueRange(beds);
  const bathRange = formatValueRange(baths);
  if (bedRange && bathRange) return `${bedRange} bed · ${bathRange} bath`;
  if (bedRange) return `${bedRange} bed`;
  if (bathRange) return `${bathRange} bath`;
  return null;
};

export const formatVatSummary = (units: NewBuildProjectUnit[]): string | null => {
  const flags = units
    .map((unit) => unit.vat_included)
    .filter((value): value is boolean => typeof value === "boolean");
  if (!flags.length) return null;
  const hasIncluded = flags.includes(true);
  const hasExcluded = flags.includes(false);
  if (hasIncluded && hasExcluded) return "VAT varies by unit";
  return hasIncluded ? "VAT included" : "VAT not included";
};

export const formatProjectDate = (date: string | null | undefined): string | null => {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(parsed);
};
