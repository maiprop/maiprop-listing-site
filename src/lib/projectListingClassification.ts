import type { TablesUpdate } from "@/integrations/supabase/types";

export type ProjectListingClassificationSource = {
  id: string;
  building_permit_number?: string | null;
  permit_approval_date?: string | null;
  construction_start_date?: string | null;
  structural_completion_date?: string | null;
  delivery_date?: string | null;
};

export type ProjectLinkableListingSource = {
  listing_type?: string | null;
};

export const isProjectLinkableListing = (
  listing: ProjectLinkableListingSource,
): boolean => listing.listing_type === "new_build";

const deliveryYearFromDate = (date: string | null | undefined) => {
  const match = date?.match(/^(\d{4})-/);
  if (!match) return undefined;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : undefined;
};

const phaseFromProject = (project: ProjectListingClassificationSource) => {
  if (project.structural_completion_date) return "shell_complete";
  if (project.construction_start_date) return "under_construction";
  if (project.permit_approval_date || project.building_permit_number?.trim()) return "planning";
  return undefined;
};

export const getProjectLinkedListingUpdates = (
  project: ProjectListingClassificationSource,
): TablesUpdate<"listings"> => {
  const updates: TablesUpdate<"listings"> = {
    project_id: project.id,
    listing_type: "new_build",
    is_pre_sale: false,
  };
  const phase = phaseFromProject(project);
  const deliveryYear = deliveryYearFromDate(project.delivery_date);
  if (phase) updates.construction_status = phase;
  if (deliveryYear !== undefined) updates.year_built = deliveryYear;
  return updates;
};
