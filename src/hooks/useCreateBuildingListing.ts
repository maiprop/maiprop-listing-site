/**
 * Submit orchestrator for the new-building listing wizard.
 *
 * The browser still uploads File objects to storage, but all database writes
 * for the project, unit, listing, media rows, and listing images are handled by
 * the authenticated `create-new-building-listing` Edge Function.
 */

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type ProjectMediaType } from "@/hooks/useProjectMedia";
import { type ProjectUnitInsert } from "@/hooks/useProjectUnits";
import { uploadProjectMedia } from "@/lib/buildingListingUploads";
import {
  listingImageUrlsSchema,
  listingWriteSchema,
  newBuildingProjectWriteSchema,
  parseMutationInput,
  projectMediaCreateSchema,
  projectUnitWriteSchema,
} from "@/lib/mutationSchemas";
import { calculatePricePerSqm } from "@/lib/priceCalculations";

export interface CreateBuildingListingProjectInput {
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
  construction_year?: string;
  renovation_year?: string;
}

export interface CreateBuildingListingUnitInput {
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
}

export interface CreateBuildingListingInput {
  /** Project ad category. Renovations reuse the project layout but valuation as normal sale stock. */
  projectKind?: "new_build" | "renovation";
  /** Auth user id (taken from `useAuth().user!.id` by the caller). */
  userId: string;
  /** Step 1 form snapshot. */
  project: CreateBuildingListingProjectInput;
  /** Step 2 form snapshot. */
  unit: CreateBuildingListingUnitInput;
  /** Optional multi-unit snapshot. Falls back to `unit` for backwards compatibility. */
  units?: CreateBuildingListingUnitInput[];
  /** Step 3 - optional project-level media files keyed by media type. */
  projectMedia: Record<ProjectMediaType, File | null>;
  /** Step 4 form snapshot. */
  listing: { title: string; description: string };
  /** Final listing title (caller already normalised it). */
  finalTitle: string;
  /** Public URL of the chosen cover photo (already uploaded). */
  coverImageUrl: string;
  /** Public URLs of all other already-uploaded valid photos. */
  additionalImageUrls: string[];
}

type CreateNewBuildingListingResponse = {
  data?: { listingId?: string | null } | null;
  error?: string | { message?: string | null } | null;
};

function toOptionalNumber(value: string | number) {
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getDeliveryYear(deliveryDate: string) {
  const match = deliveryDate.match(/^(\d{4})-/);
  if (!match) return undefined;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : undefined;
}

function getYear(value: string | number | undefined) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed >= 1800 && parsed <= 2200 ? Math.round(parsed) : undefined;
}

function getProjectPhase(project: CreateBuildingListingProjectInput, projectKind: CreateBuildingListingInput["projectKind"]) {
  if (projectKind === "renovation") return "renovated";
  if (project.structural_completion_date) return "shell_complete";
  if (project.construction_start_date) return "under_construction";
  if (project.permit_approval_date || project.building_permit_number.trim()) return "planning";
  return undefined;
}

function normalizeUnitPayload(unit: CreateBuildingListingUnitInput, projectId: string): ProjectUnitInsert {
  const internalSqm = parseFloat(String(unit.internal_sqm));
  const price = parseFloat(String(unit.price));
  const pricePerSqm = calculatePricePerSqm({ price, sqm: internalSqm });
  return {
    project_id: projectId,
    unit_id: unit.unit_id || undefined,
    floor: unit.floor ? parseInt(String(unit.floor)) : undefined,
    unit_number: unit.unit_number || undefined,
    availability_status: "available",
    internal_sqm: internalSqm,
    balcony_sqm: unit.balcony_sqm ? parseFloat(String(unit.balcony_sqm)) : undefined,
    storage_sqm: unit.storage_sqm ? parseFloat(String(unit.storage_sqm)) : undefined,
    parking_sqm: unit.parking_sqm ? parseFloat(String(unit.parking_sqm)) : undefined,
    bedrooms: parseInt(String(unit.bedrooms)),
    bathrooms: parseInt(String(unit.bathrooms)),
    kitchen_type: unit.kitchen_type || undefined,
    living_rooms: unit.living_rooms ? parseInt(String(unit.living_rooms)) : undefined,
    price,
    price_per_sqm: pricePerSqm ?? undefined,
    vat_included: unit.vat_included,
    parking_price: unit.parking_price ? parseFloat(String(unit.parking_price)) : undefined,
    storage_price: unit.storage_price ? parseFloat(String(unit.storage_price)) : undefined,
    sea_view: unit.sea_view,
    city_view: unit.city_view,
    mountain_view: unit.mountain_view,
    energy_class: unit.energy_class || undefined,
    heating_system: unit.heating_system || undefined,
    cooling_system: unit.cooling_system || undefined,
  };
}

function getRepresentativeUnit(units: ProjectUnitInsert[]) {
  return [...units].sort((a, b) => {
    const left = typeof a.price === "number" && Number.isFinite(a.price) ? a.price : Number.MAX_SAFE_INTEGER;
    const right = typeof b.price === "number" && Number.isFinite(b.price) ? b.price : Number.MAX_SAFE_INTEGER;
    return left - right;
  })[0] ?? units[0];
}

const getFunctionError = (data: CreateNewBuildingListingResponse | null | undefined) => {
  if (!data?.error) return null;
  return typeof data.error === "string" ? data.error : data.error.message || "New building listing failed";
};

export function useCreateBuildingListing() {
  return useCallback(
    async (args: CreateBuildingListingInput): Promise<{ listingId: string }> => {
      const { userId, project, unit, projectMedia, listing, finalTitle, coverImageUrl, additionalImageUrls } = args;
      const projectKind = args.projectKind ?? "new_build";
      const projectId = crypto.randomUUID();

      const projectPayload = parseMutationInput(
        newBuildingProjectWriteSchema,
        {
          id: projectId,
          name: project.name.trim(),
          building_permit_number: project.building_permit_number.trim() || undefined,
          developer_company: project.developer_company || undefined,
          architect_group: project.architect_group || undefined,
          construction_company: project.construction_company || undefined,
          description: project.description || undefined,
          address: project.address || undefined,
          city: project.city.trim(),
          municipality: project.municipality || undefined,
          area_description: project.area_description || undefined,
          latitude: toOptionalNumber(project.latitude),
          longitude: toOptionalNumber(project.longitude),
          permit_approval_date: project.permit_approval_date || undefined,
          construction_start_date: project.construction_start_date || undefined,
          structural_completion_date: project.structural_completion_date || undefined,
          delivery_date: project.delivery_date || undefined,
          owner_id: userId,
        },
        "new building project",
      );

      const rawUnits = args.units?.length ? args.units : [unit];
      const validatedUnitPayloads = rawUnits.map((item) =>
        parseMutationInput(projectUnitWriteSchema, normalizeUnitPayload(item, projectId), "new building unit") as ProjectUnitInsert,
      );
      const representativeUnit = getRepresentativeUnit(validatedUnitPayloads);
      const price = typeof representativeUnit.price === "number" ? representativeUnit.price : 0;
      const internalSqm = typeof representativeUnit.internal_sqm === "number" ? representativeUnit.internal_sqm : 0;
      const pricePerSqm = calculatePricePerSqm({
        price,
        sqm: internalSqm,
        storedPricePerSqm: representativeUnit.price_per_sqm,
      });

      const mediaRows = [];
      for (const [mediaType, file] of Object.entries(projectMedia)) {
        if (!file) continue;
        const url = await uploadProjectMedia(file, userId, projectId, mediaType as ProjectMediaType);
        mediaRows.push(parseMutationInput(
          projectMediaCreateSchema,
          { project_id: projectId, url, media_type: mediaType as ProjectMediaType },
          "project media",
        ));
      }

      const listingPayload = parseMutationInput(
        listingWriteSchema,
        {
          title: finalTitle,
          description: listing.description || undefined,
          city: project.city.trim(),
          address: project.address || undefined,
          latitude: toOptionalNumber(project.latitude),
          longitude: toOptionalNumber(project.longitude),
          property_type: "apartment" as const,
          listing_type: "new_build" as const,
          price,
          sqm: internalSqm,
          bedrooms: typeof representativeUnit.bedrooms === "number" ? representativeUnit.bedrooms : undefined,
          bathrooms: typeof representativeUnit.bathrooms === "number" ? representativeUnit.bathrooms : undefined,
          living_rooms: typeof representativeUnit.living_rooms === "number" ? representativeUnit.living_rooms : undefined,
          floor: typeof representativeUnit.floor === "number" ? representativeUnit.floor : undefined,
          energy_class: representativeUnit.energy_class || undefined,
          heating_system: representativeUnit.heating_system || undefined,
          construction_status: getProjectPhase(project, projectKind),
          year_built: projectKind === "renovation"
            ? getYear(project.construction_year)
            : getDeliveryYear(project.delivery_date),
          cover_image_url: coverImageUrl,
          price_per_sqm: pricePerSqm ?? undefined,
          owner_id: userId,
          status: "active" as const,
          project_id: projectId,
          is_pre_sale: false,
          tags: projectKind === "renovation"
            ? [
                "renovation_project",
                project.renovation_year ? `renovation_year:${project.renovation_year}` : null,
              ].filter((tag): tag is string => Boolean(tag))
            : undefined,
        },
        "new building listing",
      );

      const { data, error } = await supabase.functions.invoke<CreateNewBuildingListingResponse>(
        "create-new-building-listing",
        {
          body: {
            projectKind,
            project: projectPayload,
            unit: validatedUnitPayloads[0],
            units: validatedUnitPayloads,
            projectMedia: mediaRows,
            listing: listingPayload,
            additionalImageUrls: parseMutationInput(listingImageUrlsSchema, additionalImageUrls, "new building images"),
          },
        },
      );
      if (error) throw error;

      const envelopeError = getFunctionError(data);
      if (envelopeError) throw new Error(envelopeError);

      const listingId = data?.data?.listingId;
      if (!listingId) throw new Error("New building listing failed");
      return { listingId };
    },
    [],
  );
}
