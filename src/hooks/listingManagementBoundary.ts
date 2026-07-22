import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type ListingMutationResult = {
  id: string;
  owner_id?: string | null;
  status?: string | null;
  listing_type?: string | null;
  updated_at?: string | null;
};

const CLIENT_SYSTEM_FIELDS = new Set([
  "id",
  "owner_id",
  "organization_id",
  "created_at",
  "updated_at",
  "views_count",
  "ai_score",
  "is_featured",
  "featured_until",
  "priority_placement",
  "priority_until",
  "walkability_score",
  "safety_score",
  "noise_score",
  "location_search_text",
  "project_id",
]);

function withoutSystemFields(payload: Record<string, unknown>): Json {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) =>
      !CLIENT_SYSTEM_FIELDS.has(key) && value !== undefined
    ),
  ) as Json;
}

export async function createListingForUser(
  payload: TablesInsert<"listings">,
): Promise<ListingMutationResult> {
  const { data, error } = await supabase.rpc("create_listing_for_user", {
    p_payload: withoutSystemFields(payload as Record<string, unknown>),
  });
  if (error) throw error;
  return data as ListingMutationResult;
}

export async function updateListingForUser(
  id: string,
  updates: TablesUpdate<"listings">,
): Promise<ListingMutationResult> {
  const { data, error } = await supabase.rpc("update_listing_for_user", {
    p_id: id,
    p_updates: withoutSystemFields(updates as Record<string, unknown>),
  });
  if (error) throw error;
  return data as ListingMutationResult;
}

export async function deleteListingForUser(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_listing_for_user", { p_id: id });
  if (error) throw error;
}
