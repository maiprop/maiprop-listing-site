export type UploadedImage = {
  id: string;
  url: string;
  file?: File;
  uploading?: boolean;
  error?: string;
};

export const WIZARD_STEPS = ["building", "unit", "media", "listing", "photos"] as const;
export type WizardStep = typeof WIZARD_STEPS[number];
export type ProjectKind = "new_build" | "renovation";

export type ProjectDraft = {
  name: string;
  building_permit_number: string;
  developer_company: string;
  architect_group: string;
  construction_company: string;
  description: string;
  address: string;
  city: string;
  municipality: string;
  area_description: string;
  permit_approval_date: string;
  construction_start_date: string;
  structural_completion_date: string;
  delivery_date: string;
  latitude: string | number;
  longitude: string | number;
  construction_year: string;
  renovation_year: string;
};

export type UnitDraft = {
  unit_id: string;
  floor: string;
  unit_number: string;
  internal_sqm: string;
  balcony_sqm: string;
  storage_sqm: string;
  parking_sqm: string;
  bedrooms: string;
  bathrooms: string;
  kitchen_type: string;
  living_rooms: string;
  price: string;
  vat_included: boolean;
  parking_price: string;
  storage_price: string;
  sea_view: boolean;
  city_view: boolean;
  mountain_view: boolean;
  energy_class: string;
  heating_system: string;
  cooling_system: string;
};

export type ListingDraft = {
  title: string;
  description: string;
};

export type NewBuildingDraft = {
  version: 1;
  projectId: string;
  organizationId: string | null;
  step: WizardStep;
  projectKind: ProjectKind;
  project: ProjectDraft;
  units: UnitDraft[];
  listing: ListingDraft;
  images: Array<Pick<UploadedImage, "id" | "url">>;
  coverImageId: string | null;
};

export const EMPTY_PROJECT: ProjectDraft = {
  name: "",
  building_permit_number: "",
  developer_company: "",
  architect_group: "",
  construction_company: "",
  description: "",
  address: "",
  city: "",
  municipality: "",
  area_description: "",
  permit_approval_date: "",
  construction_start_date: "",
  structural_completion_date: "",
  delivery_date: "",
  latitude: "",
  longitude: "",
  construction_year: "",
  renovation_year: "",
};

export const EMPTY_UNIT: UnitDraft = {
  unit_id: "",
  floor: "",
  unit_number: "",
  internal_sqm: "",
  balcony_sqm: "",
  storage_sqm: "",
  parking_sqm: "",
  bedrooms: "",
  bathrooms: "",
  kitchen_type: "",
  living_rooms: "",
  price: "",
  vat_included: true,
  parking_price: "",
  storage_price: "",
  sea_view: false,
  city_view: false,
  mountain_view: false,
  energy_class: "",
  heating_system: "",
  cooling_system: "",
};

export const EMPTY_LISTING: ListingDraft = {
  title: "",
  description: "",
};

const NEW_BUILDING_DRAFT_KEY_PREFIX = "maiprop:new-building-listing-draft:v1";

export function getNewBuildingDraftKey(userId: string) {
  return `${NEW_BUILDING_DRAFT_KEY_PREFIX}:${userId}`;
}

export function readNewBuildingDraft(
  userId: string,
  fallbackProjectId: string,
): NewBuildingDraft | null {
  try {
    const raw = localStorage.getItem(getNewBuildingDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NewBuildingDraft>;
    if (parsed.version !== 1) return null;
    if (!parsed.step || !WIZARD_STEPS.includes(parsed.step)) return null;
    const legacyUnit = (
      parsed as Partial<NewBuildingDraft> & { unit?: Partial<UnitDraft> }
    ).unit;
    const rawUnits = Array.isArray(parsed.units)
      ? parsed.units
      : legacyUnit
        ? [legacyUnit]
        : [];

    return {
      version: 1,
      projectId:
        typeof parsed.projectId === "string" && parsed.projectId
          ? parsed.projectId
          : fallbackProjectId,
      organizationId:
        typeof parsed.organizationId === "string" ? parsed.organizationId : null,
      step: parsed.step,
      projectKind: parsed.projectKind === "renovation" ? "renovation" : "new_build",
      project: { ...EMPTY_PROJECT, ...(parsed.project ?? {}) },
      units:
        rawUnits.length > 0
          ? rawUnits.map((unit) => ({ ...EMPTY_UNIT, ...unit }))
          : [{ ...EMPTY_UNIT }],
      listing: { ...EMPTY_LISTING, ...(parsed.listing ?? {}) },
      images: Array.isArray(parsed.images)
        ? parsed.images.filter(
            (image): image is Pick<UploadedImage, "id" | "url"> =>
              typeof image?.id === "string" &&
              typeof image?.url === "string" &&
              !image.url.startsWith("blob:"),
          )
        : [],
      coverImageId:
        typeof parsed.coverImageId === "string" ? parsed.coverImageId : null,
    };
  } catch (_err: unknown) {
    return null;
  }
}

export function clearNewBuildingDraft(userId: string) {
  try {
    localStorage.removeItem(getNewBuildingDraftKey(userId));
  } catch (_err: unknown) {
    // localStorage can be disabled.
  }
}

export function hasDraftContent(
  project: ProjectDraft,
  units: UnitDraft[],
  listing: ListingDraft,
  images: UploadedImage[],
) {
  return (
    Object.values(project).some((value) => String(value).trim() !== "") ||
    units.some((unit) =>
      Object.entries(unit).some(
        ([key, value]) =>
          key !== "vat_included" && String(value).trim() !== "",
      ),
    ) ||
    Object.values(listing).some((value) => value.trim() !== "") ||
    images.some(
      (image) =>
        !image.uploading &&
        !image.error &&
        !image.file &&
        !image.url.startsWith("blob:"),
    )
  );
}

export function persistableImages(
  images: UploadedImage[],
): Array<Pick<UploadedImage, "id" | "url">> {
  return images
    .filter(
      (image) =>
        !image.uploading &&
        !image.error &&
        !image.file &&
        !image.url.startsWith("blob:"),
    )
    .map(({ id, url }) => ({ id, url }));
}
