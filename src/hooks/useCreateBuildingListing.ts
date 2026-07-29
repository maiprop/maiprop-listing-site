/**
 * Submit orchestrator for the new-building listing wizard.
 *
 * The browser still uploads File objects to storage, but all database writes
 * for the project, unit, listing, media rows, and listing images are handled by
 * the authenticated `create-new-building-listing` Edge Function.
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type ProjectMediaType } from "@/hooks/useProjectMedia";
import { deleteProjectMediaUrls, uploadProjectMedia } from "@/lib/buildingListingUploads";
import {
  listingImageUrlsSchema,
  parseMutationInput,
} from "@/lib/mutationSchemas";
import { geocodeAddressText, hasCompleteCoordinates } from "@/lib/location/geocodeAddress";
import { invalidatePublicCatalogueQueries } from "@/lib/publicCatalogueQueryInvalidation";

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
  /** Stable client-generated id persisted with the draft and reused on retry. */
  projectId: string;
  /** Optional tenant scope. NULL means the developer's personal account. */
  organizationId?: string | null;
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

function toOptionalInteger(value: string | number | undefined) {
  if (typeof value === "string" && !value.trim()) return undefined;
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isInteger(parsed) ? parsed : undefined;
}

function normalizeUnitPayload(unit: CreateBuildingListingUnitInput) {
  return {
    unit_id: unit.unit_id || undefined,
    floor: toOptionalInteger(unit.floor),
    unit_number: unit.unit_number || undefined,
    internal_sqm: Number(unit.internal_sqm),
    balcony_sqm: toOptionalNumber(unit.balcony_sqm),
    storage_sqm: toOptionalNumber(unit.storage_sqm),
    parking_sqm: toOptionalNumber(unit.parking_sqm),
    bedrooms: toOptionalInteger(unit.bedrooms),
    bathrooms: toOptionalInteger(unit.bathrooms),
    kitchen_type: unit.kitchen_type || undefined,
    living_rooms: toOptionalInteger(unit.living_rooms),
    price: Number(unit.price),
    vat_included: unit.vat_included,
    parking_price: toOptionalNumber(unit.parking_price),
    storage_price: toOptionalNumber(unit.storage_price),
    sea_view: unit.sea_view,
    city_view: unit.city_view,
    mountain_view: unit.mountain_view,
    energy_class: unit.energy_class || undefined,
    heating_system: unit.heating_system || undefined,
    cooling_system: unit.cooling_system || undefined,
  };
}

const getFunctionError = (data: CreateNewBuildingListingResponse | null | undefined) => {
  if (!data?.error) return null;
  return typeof data.error === "string" ? data.error : data.error.message || "New building listing failed";
};

export function useCreateBuildingListing() {
  const queryClient = useQueryClient();

  return useCallback(
    async (args: CreateBuildingListingInput): Promise<{ listingId: string }> => {
      const {
        projectId,
        organizationId,
        userId,
        project,
        unit,
        projectMedia,
        listing,
        finalTitle,
        coverImageUrl,
        additionalImageUrls,
      } = args;
      const projectKind = args.projectKind ?? "new_build";
      let projectLatitude: number | undefined;
      let projectLongitude: number | undefined;
      if (hasCompleteCoordinates(project.latitude, project.longitude)) {
        projectLatitude = toOptionalNumber(project.latitude);
        projectLongitude = toOptionalNumber(project.longitude);
      } else {
        const geocoded = await geocodeAddressText({
          address: project.address,
          city: project.city,
          municipality: project.municipality,
        });
        if (geocoded) {
          projectLatitude = toOptionalNumber(geocoded.latitude);
          projectLongitude = toOptionalNumber(geocoded.longitude);
        }
      }

      const projectPayload = {
        id: projectId,
        name: project.name.trim(),
        building_permit_number: project.building_permit_number.trim() || undefined,
        developer_company: project.developer_company.trim() || undefined,
        architect_group: project.architect_group.trim() || undefined,
        construction_company: project.construction_company.trim() || undefined,
        description: project.description.trim() || undefined,
        address: project.address.trim() || undefined,
        city: project.city.trim(),
        municipality: project.municipality.trim() || undefined,
        area_description: project.area_description.trim() || undefined,
        latitude: projectLatitude,
        longitude: projectLongitude,
        permit_approval_date: project.permit_approval_date || undefined,
        construction_start_date: project.construction_start_date || undefined,
        structural_completion_date: project.structural_completion_date || undefined,
        delivery_date: project.delivery_date || undefined,
        construction_year: toOptionalInteger(project.construction_year),
        renovation_year: toOptionalInteger(project.renovation_year),
      };

      const rawUnits = args.units?.length ? args.units : [unit];
      const unitPayloads = rawUnits.map(normalizeUnitPayload);

      const mediaRows = [];
      try {
        for (const [mediaType, file] of Object.entries(projectMedia)) {
          if (!file) continue;
          const url = await uploadProjectMedia(file, userId, projectId, mediaType as ProjectMediaType);
          mediaRows.push({
            url,
            media_type: mediaType as ProjectMediaType,
            sort_order: mediaRows.length,
          });
        }
      } catch (error) {
        try {
          await deleteProjectMediaUrls(mediaRows.map((media) => media.url));
        } catch {
          // Preserve the actionable upload error. Server-side retry cleanup and
          // lifecycle maintenance remain the final orphan-removal boundary.
        }
        throw error;
      }

      const listingPayload = {
        title: finalTitle.trim(),
        description: listing.description.trim() || undefined,
        cover_image_url: coverImageUrl,
      };

      const { data, error } = await supabase.functions.invoke<CreateNewBuildingListingResponse>(
        "create-new-building-listing",
        {
          body: {
            projectKind,
            organizationId: organizationId ?? null,
            project: projectPayload,
            units: unitPayloads,
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
      void invalidatePublicCatalogueQueries(queryClient, listingId);
      return { listingId };
    },
    [queryClient],
  );
}
