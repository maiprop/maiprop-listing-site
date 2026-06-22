export type NewBuildCardUnit = {
  availability_status?: string | null;
  internal_sqm?: number | string | null;
};

export type NewBuildCardMedia = {
  url?: string | null;
  media_type?: string | null;
  sort_order?: number | string | null;
};

export type NewBuildCardProject = {
  cover_image_url?: string | null;
  delivery_date?: string | null;
  project_units?: NewBuildCardUnit[] | null;
  project_media?: NewBuildCardMedia[] | null;
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

const cleanUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const mediaOrder = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 99;
};

const isProjectVisualMedia = (media: NewBuildCardMedia): boolean => {
  const url = cleanUrl(media.url);
  if (!url) return false;
  const type = media.media_type?.toLowerCase() ?? "";
  return !type.includes("pdf") && !url.toLowerCase().endsWith(".pdf");
};

const uniqueUrls = (urls: Array<string | null | undefined>): string[] =>
  Array.from(new Set(urls.filter((url): url is string => Boolean(url))));

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

export function getNewBuildCardImages(input: {
  listing_type?: string | null;
  cover_image_url?: string | null;
  listing_images?: Array<{ url?: string | null }> | null;
  project?: NewBuildCardProject | null;
  projects?: NewBuildCardProject | null;
}): string[] {
  const listingCover = cleanUrl(input.cover_image_url);
  const listingImages = (input.listing_images ?? []).map((image) => cleanUrl(image.url));

  if (input.listing_type !== "new_build") {
    return uniqueUrls([listingCover, ...listingImages]);
  }

  const project = input.project ?? input.projects ?? null;
  const projectCover = cleanUrl(project?.cover_image_url);
  const projectImages = [...(project?.project_media ?? [])]
    .filter(isProjectVisualMedia)
    .sort((a, b) => mediaOrder(a.sort_order) - mediaOrder(b.sort_order))
    .map((media) => cleanUrl(media.url));

  return uniqueUrls([projectCover, listingCover, ...listingImages, ...projectImages]);
}
