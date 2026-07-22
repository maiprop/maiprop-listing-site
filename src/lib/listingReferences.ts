import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

const LISTING_REFERENCE_SELECT = "id,owner_id,organization_id,project_id,title,city,address,cover_image_url,listing_type,is_pre_sale,price,sqm,views_count,status";

type ListingReferenceViewRow =
  Database["public"]["Views"]["listing_reference_catalogue"]["Row"];

export type ListingReference = Omit<ListingReferenceViewRow, "id" | "title" | "city"> & {
  id: string;
  title: string;
  city: string;
};

const normalizeReference = (row: ListingReferenceViewRow): ListingReference | null => {
  if (typeof row.id !== "string") return null;
  return {
    ...row,
    id: row.id,
    title: row.title ?? "Property",
    city: row.city ?? "",
  };
};

const uniqueIds = (values: Array<string | null | undefined>) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))];

export async function fetchListingReferenceMap(
  listingIds: Array<string | null | undefined>,
): Promise<Map<string, ListingReference>> {
  const ids = uniqueIds(listingIds);
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("listing_reference_catalogue")
    .select(LISTING_REFERENCE_SELECT)
    .in("id", ids);
  if (error) throw error;

  return new Map(
    (data ?? [])
      .map(normalizeReference)
      .filter((row): row is ListingReference => row !== null)
      .map((row) => [row.id, row]),
  );
}

export async function attachListingReferences<
  T extends { listing_id?: string | null },
>(rows: T[]): Promise<Array<T & { listings: ListingReference | null }>> {
  const references = await fetchListingReferenceMap(
    rows.map((row) => row.listing_id),
  );
  return rows.map((row) => ({
    ...row,
    listings: row.listing_id ? references.get(row.listing_id) ?? null : null,
  }));
}

export async function fetchProjectListingReferences(
  projectIds: Array<string | null | undefined>,
): Promise<Map<string, ListingReference[]>> {
  const ids = uniqueIds(projectIds);
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("listing_reference_catalogue")
    .select(LISTING_REFERENCE_SELECT)
    .in("project_id", ids);
  if (error) throw error;

  const byProject = new Map<string, ListingReference[]>();
  for (const row of data ?? []) {
    const reference = normalizeReference(row);
    if (!reference || typeof reference.project_id !== "string") continue;
    const projectRows = byProject.get(reference.project_id) ?? [];
    projectRows.push(reference);
    byProject.set(reference.project_id, projectRows);
  }
  return byProject;
}
