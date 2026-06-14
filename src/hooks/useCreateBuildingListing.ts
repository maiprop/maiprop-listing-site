/**
 * Submit orchestrator for the new-building listing wizard.
 *
 * Accepts the *already-validated* form snapshots and the *already-uploaded*
 * cover/additional image URLs (the wizard's photo step uploads images to
 * `listing-images` as the user adds them, before submit time). This hook is
 * responsible only for the database fan-out:
 *
 *   1. Insert into `projects`         (transaction root)
 *   2. Insert into `project_units`    (FK -> project)
 *   3. For each non-null project-media file, upload to `project-media`
 *      and insert a row in `project_media` via `useAddProjectMedia()`
 *   4. Insert into `listings` as listing_type = new_build (FK -> project)
 *   5. Bulk-insert into `listing_images` for any non-cover photos
 *
 * On *any* failure after step 1, created rows are rolled back via
 * guarded `DELETE`s to avoid leaving partial project ads.
 *
 * Caller surfaces success/failure toasts and navigates after success.
 * Pulling this out of `CreateNewBuildingListing.tsx` brings the page from
 * 699 LOC down to ~480 and lets the orchestration be unit-tested
 * independently of the form UI.
 */

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAddProjectMedia, type ProjectMediaType } from "@/hooks/useProjectMedia";
import { type ProjectUnitInsert } from "@/hooks/useProjectUnits";
import { uploadProjectMedia } from "@/lib/buildingListingUploads";
import type { Database } from "@/integrations/supabase/types";
import {
  listingImageRowsSchema,
  listingWriteSchema,
  newBuildingProjectWriteSchema,
  ownedRowDeleteSchema,
  parseMutationInput,
  projectUnitListingLinkSchema,
  projectUnitWriteSchema,
} from "@/lib/mutationSchemas";

type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
type ListingInsert = Database["public"]["Tables"]["listings"]["Insert"];

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
  /** Auth user id (taken from `useAuth().user!.id` by the caller). */
  userId: string;
  /** Step 1 form snapshot. */
  project: CreateBuildingListingProjectInput;
  /** Step 2 form snapshot. */
  unit: CreateBuildingListingUnitInput;
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

function getProjectPhase(project: CreateBuildingListingProjectInput) {
  if (project.structural_completion_date) return "shell_complete";
  if (project.construction_start_date) return "under_construction";
  if (project.permit_approval_date || project.building_permit_number.trim()) return "planning";
  return undefined;
}

export function useCreateBuildingListing() {
  const addMedia = useAddProjectMedia();

  return useCallback(
    async (args: CreateBuildingListingInput): Promise<{ listingId: string }> => {
      const { userId, project, unit, projectMedia, listing, finalTitle, coverImageUrl, additionalImageUrls } = args;

      let createdProjectId: string | null = null;
      let createdListingId: string | null = null;
      try {
        // 1. Create the project
        const projectPayload = {
          name: project.name.trim(),
          building_permit_number: project.building_permit_number.trim(),
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
        };
        const validatedProjectPayload = parseMutationInput(
          newBuildingProjectWriteSchema,
          { ...projectPayload, owner_id: userId },
          "new building project",
        );
        const { data: createdProject, error: projErr } = await supabase
          .from("projects")
          .insert(validatedProjectPayload as ProjectInsert)
          .select()
          .single();
        if (projErr) throw projErr;
        createdProjectId = createdProject.id;

        // 2. Create the project_unit
        const internalSqm = parseFloat(String(unit.internal_sqm));
        const price = parseFloat(String(unit.price));
        const unitPayload: ProjectUnitInsert = {
          project_id: createdProject.id,
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
          price_per_sqm: internalSqm > 0 ? price / internalSqm : undefined,
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
        const validatedUnitPayload = parseMutationInput(projectUnitWriteSchema, unitPayload, "new building unit");
        const { data: createdUnit, error: unitErr } = await supabase
          .from("project_units")
          .insert(validatedUnitPayload as ProjectUnitInsert)
          .select()
          .single();
        if (unitErr) throw unitErr;

        // 3. Upload + record optional project-level media
        for (const [mediaType, file] of Object.entries(projectMedia)) {
          if (file) {
            const url = await uploadProjectMedia(file, userId, createdProject.id, mediaType as ProjectMediaType);
            await addMedia.mutateAsync({ project_id: createdProject.id, url, media_type: mediaType as ProjectMediaType });
          }
        }

        // 4. Create the user-facing listing
        const listingPayload = {
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
          bedrooms: parseInt(String(unit.bedrooms)),
          bathrooms: parseInt(String(unit.bathrooms)),
          living_rooms: unit.living_rooms ? parseInt(String(unit.living_rooms)) : undefined,
          floor: unit.floor ? parseInt(String(unit.floor)) : undefined,
          energy_class: unit.energy_class || undefined,
          heating_system: unit.heating_system || undefined,
          construction_status: getProjectPhase(project),
          year_built: getDeliveryYear(project.delivery_date),
          cover_image_url: coverImageUrl,
          price_per_sqm: internalSqm > 0 ? Math.round(price / internalSqm) : undefined,
          owner_id: userId,
          status: "active" as const,
          project_id: createdProject.id,
          is_pre_sale: false,
        };
        const validatedListingPayload = parseMutationInput(listingWriteSchema, listingPayload, "new building listing");
        const { data: createdListing, error: listErr } = await supabase
          .from("listings")
          .insert(validatedListingPayload as ListingInsert)
          .select()
          .single();
        if (listErr) throw listErr;
        createdListingId = createdListing.id;

        if (createdUnit?.id) {
          const unitLink = parseMutationInput(
            projectUnitListingLinkSchema,
            { unitId: createdUnit.id, projectId: createdProject.id, listingId: createdListing.id },
            "new building unit link",
          );
          const { error: unitLinkErr } = await supabase
            .from("project_units")
            .update({ listing_id: unitLink.listingId })
            .eq("id", unitLink.unitId)
            .eq("project_id", unitLink.projectId);
          if (unitLinkErr) throw unitLinkErr;
        }

        // 5. Bulk-insert listing_images for non-cover photos
        if (additionalImageUrls.length > 0) {
          const { error: imgErr } = await supabase.from("listing_images").insert(
            parseMutationInput(listingImageRowsSchema, additionalImageUrls.map((url, idx) => ({
              listing_id: createdListing.id,
              url,
              sort_order: idx + 1,
            })), "new building images"),
          );
          if (imgErr) throw imgErr;
        }

        return { listingId: createdListing.id };
      } catch (err: unknown) {
        // Rollback: avoid leaving partial rows when any later write fails.
        // Per CLAUDE.md / CONTRIBUTING.md: every UPDATE/DELETE must filter by
        // both record id AND the current user's ownership column — RLS is
        // a defence in depth, not a substitute for the explicit guard.
        if (createdListingId) {
          const rollbackListing = parseMutationInput(
            ownedRowDeleteSchema,
            { id: createdListingId, ownerId: userId },
            "new building listing rollback",
          );
          await supabase
            .from("listings")
            .delete()
            .eq("id", rollbackListing.id)
            .eq("owner_id", rollbackListing.ownerId);
        }
        if (createdProjectId) {
          const rollbackProject = parseMutationInput(
            ownedRowDeleteSchema,
            { id: createdProjectId, ownerId: userId },
            "new building project rollback",
          );
          await supabase
            .from("projects")
            .delete()
            .eq("id", rollbackProject.id)
            .eq("owner_id", rollbackProject.ownerId);
        }
        throw err;
      }
    },
    [addMedia],
  );
}
