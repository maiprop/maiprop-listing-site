import type { NewBuildListing, NewBuildProject } from "@/lib/newBuildProjectDetail";

export type NewBuildValuationContext = {
  description: string;
  tags: string[];
};

export function buildNewBuildValuationContext({
  listing,
  project,
  unitSizeLabel,
  floorRangeLabel,
  layoutLabel,
  vatSummary,
}: {
  listing: NewBuildListing | null | undefined;
  project: NewBuildProject | null | undefined;
  unitSizeLabel: string | null;
  floorRangeLabel: string | null;
  layoutLabel: string | null;
  vatSummary: string | null;
}): NewBuildValuationContext {
  const listingTags = Array.isArray(listing?.tags)
    ? listing.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];

  const tags = Array.from(new Set([
    ...listingTags,
    listing?.has_parking ? "parking" : null,
    listing?.has_pool ? "pool" : null,
    listing?.has_elevator ? "elevator" : null,
    listing?.has_storage ? "storage" : null,
    listing?.has_garden ? "garden" : null,
    listing?.has_view ? "view" : null,
    listing?.has_balcony ? "balcony" : null,
    listing?.has_ac ? "air_conditioning" : null,
    listing?.has_solar_water ? "solar_water" : null,
    listing?.has_security ? "security" : null,
    listing?.has_underfloor_heating ? "underfloor_heating" : null,
    listing?.has_smart_home ? "smart_home" : null,
    listing?.has_video_tour ? "video_tour" : null,
    listing?.has_virtual_tour ? "virtual_tour" : null,
    listing?.floor != null && listing?.total_floors != null && Number(listing.floor) >= Number(listing.total_floors)
      ? "penthouse"
      : null,
    project?.building_permit_number ? "building_permit_known" : null,
  ].filter((tag): tag is string => typeof tag === "string" && tag.length > 0)));

  const description = [
    listing?.description,
    project?.description,
    project?.area_description,
    unitSizeLabel ? `Project unit size range: ${unitSizeLabel}` : null,
    floorRangeLabel ? `Project floor range: ${floorRangeLabel}` : null,
    layoutLabel ? `Project layout range: ${layoutLabel}` : null,
    vatSummary ? `VAT status: ${vatSummary}` : null,
    project?.developer_company ? `Developer: ${project.developer_company}` : null,
    project?.architect_group ? `Architect: ${project.architect_group}` : null,
    project?.construction_company ? `Construction company: ${project.construction_company}` : null,
    project?.building_permit_number ? `Building permit: ${project.building_permit_number}` : null,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0).join("\n");

  return { description, tags };
}
