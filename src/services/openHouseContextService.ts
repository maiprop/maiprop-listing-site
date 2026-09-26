import { supabase } from '@/integrations/supabase/client';
import type { OpenHouseSettings } from '@/hooks/openHouseAssetControl/types';

export interface OpenHouseListingContext {
  id: string;
  owner_id: string;
  title: string;
  city: string | null;
  address: string | null;
  cover_image_url: string | null;
  open_house_date: string | null;
  price: number | null;
  open_house_transaction_type: string | null;
  open_house_settings: OpenHouseSettings[];
}

type ContextRpc = (name: 'get_open_house_listing_context', args: { p_listing_ids: string[] }) => Promise<{
  data: OpenHouseListingContext[] | null; error: Error | null;
}>;

export async function getOpenHouseListingContexts(ids: string[]) {
  const unique = [...new Set(ids)];
  const contexts = new Map<string, OpenHouseListingContext>();
  for (let offset = 0; offset < unique.length; offset += 100) {
    const { data, error } = await (supabase.rpc as unknown as ContextRpc)(
      'get_open_house_listing_context', { p_listing_ids: unique.slice(offset, offset + 100) },
    );
    if (error) throw error;
    for (const row of data ?? []) contexts.set(row.id, row);
  }
  return contexts;
}

export async function requireOpenHouseListingContext(listingId: string) {
  const context = (await getOpenHouseListingContexts([listingId])).get(listingId);
  if (!context) throw new Error('Open house listing is unavailable or you are not authorised.');
  return context;
}

export async function hydrateOpenHouseRows<T extends { listing_id: string }>(rows: T[], includeAddress: boolean) {
  const contexts = await getOpenHouseListingContexts(rows.map(row => row.listing_id));
  return rows.map(row => {
    const context = contexts.get(row.listing_id);
    const listings = context ? {
      id: context.id, title: context.title, city: context.city,
      cover_image_url: context.cover_image_url, open_house_date: context.open_house_date,
      ...(includeAddress ? { address: context.address } : {}),
    } : null;
    return { ...row, listings };
  });
}

export interface AdminOpenHousePofRow {
  id: string;
  requester_id: string;
  proof_of_funds_url: string | null;
  proof_amount: number | null;
  pof_verified_status: 'unreviewed' | 'verified' | 'rejected' | null;
  pof_rejection_reason: string | null;
  created_at: string | null;
  listing_id: string;
  rejection_reason: string | null;
  status: string | null;
  /** Exact backend version: never parse/reformat this value. */
  updated_at: string | null;
}

type AdminPofRpc = (name: 'get_admin_open_house_pof_reviews' | 'review_admin_open_house_pof', args: Record<string, string | null>) => Promise<{
  data: AdminOpenHousePofRow[] | null; error: { message: string; code?: string } | null;
}>;

export async function getAdminOpenHousePofReviews(listingId?: string) {
  const { data, error } = await (supabase.rpc as unknown as AdminPofRpc)(
    'get_admin_open_house_pof_reviews', { p_listing_id: listingId ?? null },
  );
  if (error) throw error;
  return data ?? [];
}

export async function reviewAdminOpenHousePof(id: string, decision: 'verified' | 'rejected', reason: string | null, version: string | null) {
  const { data, error } = await (supabase.rpc as unknown as AdminPofRpc)('review_admin_open_house_pof', {
    p_registration_id: id, p_decision: decision, p_reason: reason, p_expected_updated_at: version,
  });
  if (error) throw error;
  if (data?.length !== 1 || data[0].id !== id || data[0].pof_verified_status !== decision
      || !Object.prototype.hasOwnProperty.call(data[0], 'updated_at')) {
    throw new Error('The proof review did not return an updated row. Please reload.');
  }
  return data[0];
}
