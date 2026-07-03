import { supabase } from "@/integrations/supabase/client";
import {
  OPEN_HOUSE_OFFERS_SELECT,
  OPEN_HOUSE_REGISTRATIONS_SELECT,
} from "@/hooks/openHouseAssetControl/constants";
import {
  parseMutationInput,
  rowUpdateMutationSchema,
  scopedRowIdsMutationSchema,
} from "@/lib/mutationSchemas";
import type {
  OHOfferUpdate,
  OHRegUpdate,
  OpenHouseSettingsUpdate,
} from "@/hooks/openHouseAssetControl/types";

export async function upsertOpenHouseSettingsRow(
  listingId: string,
  updates: OpenHouseSettingsUpdate,
) {
  const payload = parseMutationInput(
    rowUpdateMutationSchema,
    { id: listingId, updates },
    "open house settings service update",
  );
  const { data, error } = await supabase
    .from("open_house_settings")
    .upsert(
      { listing_id: payload.id, ...(payload.updates as OpenHouseSettingsUpdate) },
      { onConflict: "listing_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateOpenHouseRegistrationRow(
  id: string,
  updates: OHRegUpdate,
) {
  const payload = parseMutationInput(
    rowUpdateMutationSchema,
    { id, updates },
    "open house registration service update",
  );
  const { data, error } = await supabase
    .from("open_house_registrations")
    .update(payload.updates as OHRegUpdate)
    .eq("id", payload.id)
    .select(OPEN_HOUSE_REGISTRATIONS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateOpenHouseOfferRow(
  id: string,
  updates: OHOfferUpdate,
) {
  const payload = parseMutationInput(
    rowUpdateMutationSchema,
    { id, updates },
    "open house offer service update",
  );
  const { data, error } = await supabase
    .from("open_house_offers")
    .update(payload.updates as OHOfferUpdate)
    .eq("id", payload.id)
    .select(OPEN_HOUSE_OFFERS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function revealSubmittedOpenHouseOffers(
  ids: string[],
  revealedAt = new Date().toISOString(),
) {
  const payload = parseMutationInput(
    scopedRowIdsMutationSchema,
    { scopeId: "open_house_offers", ids },
    "open house offer service reveal",
  );
  const { error } = await supabase
    .from("open_house_offers")
    .update({ status: "revealed", revealed_at: revealedAt })
    .in("id", payload.ids)
    .eq("status", "submitted");
  if (error) throw error;
}
