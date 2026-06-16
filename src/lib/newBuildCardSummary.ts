export type NewBuildCardUnit = {
  availability_status?: string | null;
  internal_sqm?: number | string | null;
};

export type NewBuildCardProject = {
  delivery_date?: string | null;
  project_units?: NewBuildCardUnit[] | null;
};

export type NewBuildCardSummary = {
  newBuildUnitSizeMin?: number;
  newBuildUnitSizeMax?: number;
  newBuildUnitCount?: number;
  newBuildAvailableUnitCount?: number;
  newBuildDeliveryYear?: number;
};

const ACTIVE_UNIT_STATUSES = new Set(["available", "reserved", "under_offer"]);

const positiveNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const yearFromDate = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCFullYear();
};

export function getNewBuildCardSummary(input: {
  listing_type?: string | null;
  project?: NewBuildCardProject | null;
  projects?: NewBuildCardProject | null;
  sqm?: number | string | null;
  year_built?: number | string | null;
}): NewBuildCardSummary {
  if (input.listing_type !== "new_build") return {};

  const project = input.project ?? input.projects ?? null;
  const units = Array.isArray(project?.project_units) ? project.project_units : [];
  const unitSizes = units
    .map((unit) => positiveNumber(unit.internal_sqm))
    .filter((value): value is number => value != null);
  const fallbackSqm = positiveNumber(input.sqm);
  const sizes = unitSizes.length ? unitSizes : fallbackSqm != null ? [fallbackSqm] : [];
  const unitCount = units.length || undefined;
  const availableCount = units.filter((unit) => ACTIVE_UNIT_STATUSES.has(unit.availability_status ?? "available")).length || undefined;
  const deliveryYear = yearFromDate(project?.delivery_date) ?? positiveNumber(input.year_built) ?? undefined;

  return {
    newBuildUnitSizeMin: sizes.length ? Math.min(...sizes) : undefined,
    newBuildUnitSizeMax: sizes.length ? Math.max(...sizes) : undefined,
    newBuildUnitCount: unitCount,
    newBuildAvailableUnitCount: availableCount,
    newBuildDeliveryYear: deliveryYear ? Math.trunc(deliveryYear) : undefined,
  };
}
