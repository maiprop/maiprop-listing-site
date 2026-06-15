import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { assertAllowedUpload } from "@/lib/uploadValidation";
import {
  CAPACITY_ERROR_MESSAGES,
  MY_OPEN_HOUSE_OFFERS_SELECT,
  MY_OPEN_HOUSE_REGISTRATIONS_SELECT,
  OFFER_ERROR_MESSAGES,
  OPEN_HOUSE_OFFER_LOOKUP_SELECT,
  OPEN_HOUSE_OFFERS_SELECT,
  OPEN_HOUSE_REGISTRATION_LOOKUP_SELECT,
  OPEN_HOUSE_REGISTRATIONS_SELECT,
  OPEN_HOUSE_REVEAL_LISTING_SELECT,
  OPEN_HOUSE_SETTINGS_SELECT,
} from "./openHouseAssetControl/constants";
import {
  buildOfferStatusUpdate,
  buildRegistrationApprovalContext,
  getErrorMessage,
  getFirstOpenHouseSetting,
  getOpenHouseApprovalBlockers,
  getOpenHouseRevealBlocker,
  getRequesterRegistrationUpdateBlocker,
  normalizeOpenHouseCapacity,
} from "./openHouseAssetControl/helpers";
import type {
  AcceptOpenHouseOfferRpc,
  InvokeOpenHouseCapacity,
  InvokeOpenHouseRegistration,
  MyOpenHouseOffer,
  MyOpenHouseRegistration,
  OHOfferStatus,
  OHRegUpdate,
  OpenHouseOffer,
  OpenHouseOfferLookup,
  OpenHouseRegistration,
  OpenHouseRegistrationLookup,
  OpenHouseRegistrationUpdates,
  OpenHouseRevealListingLookup,
  OpenHouseSettings,
  OpenHouseSettingsUpdate,
  ReopenOpenHouseOfferSelectionRpc,
  SubmitOpenHouseOfferRpc,
} from "./openHouseAssetControl/types";
import {
  parseMutationInput,
  rowIdSchema,
  rowUpdateMutationSchema,
  scopedRowIdsMutationSchema,
} from "@/lib/mutationSchemas";

const OPEN_HOUSE_DOC_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const OPEN_HOUSE_DOC_MAX_BYTES = 10 * 1024 * 1024;

export { getOpenHouseApprovalBlockers } from "./openHouseAssetControl/helpers";
export type {
  MyOpenHouseOffer,
  MyOpenHouseRegistration,
  OHIdDocType,
  OHOfferStatus,
  OHRegistrationStatus,
  OHPofVerifiedStatus,
  OHTimeslot,
  OpenHouseCapacity,
  OpenHouseCapacitySlot,
  OpenHouseOffer,
  OpenHouseRegistration,
  OpenHouseSettings,
} from "./openHouseAssetControl/types";

export function useOpenHouseSettings(listingId: string | undefined) {
  return useQuery({
    queryKey: ["open_house_settings", listingId],
    queryFn: async () => {
      if (!listingId) return null;
      const { data, error } = await supabase
        .from("open_house_settings")
        .select(OPEN_HOUSE_SETTINGS_SELECT)
        .eq("listing_id", listingId)
        .maybeSingle();
      if (error) throw error;
      return data as OpenHouseSettings | null;
    },
    enabled: !!listingId,
  });
}

export function useOpenHouseCapacity(listingId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["open_house_capacity", listingId],
    queryFn: async () => {
      if (!listingId || !user) return null;
      const parsedListingId = parseMutationInput(rowIdSchema("listing id"), listingId, "listing id");
      const invoke = supabase.functions.invoke as unknown as InvokeOpenHouseCapacity;
      const { data, error } = await invoke("open-house-capacity", { body: { listingId: parsedListingId } });
      if (error) throw error;
      const row = data;
      if (!row) return null;
      return normalizeOpenHouseCapacity(row);
    },
    enabled: !!listingId && !!user,
  });
}

export function useUpsertOpenHouseSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      listingId,
      settings,
    }: {
      listingId: string;
      settings: OpenHouseSettingsUpdate;
    }) => {
      const payload = parseMutationInput(
        rowUpdateMutationSchema,
        { id: listingId, updates: { ...settings, updated_at: new Date().toISOString() } },
        "open house settings",
      );
      const { data, error } = await supabase
        .from("open_house_settings")
        .upsert(
          { listing_id: payload.id, ...payload.updates },
          { onConflict: "listing_id" }
      )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["open_house_settings", v.listingId] });
      qc.invalidateQueries({ queryKey: ["open_house_registrations", v.listingId] });
      toast.success("Settings saved");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to save settings. Please try again."));
    },
  });
}

export function useOpenHouseRegistrations(listingId: string | undefined, _asOwner: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["open_house_registrations", listingId, user?.id ?? "anon"],
    queryFn: async () => {
      if (!listingId || !user?.id) return [];
      const { data, error } = await supabase
        .from("open_house_registrations")
        .select(OPEN_HOUSE_REGISTRATIONS_SELECT)
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OpenHouseRegistration[];
    },
    enabled: !!listingId && !!user?.id,
  });
}

export function useMyOpenHouseRegistrations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["open_house_registrations_mine", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("open_house_registrations")
        .select(MY_OPEN_HOUSE_REGISTRATIONS_SELECT)
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MyOpenHouseRegistration[];
    },
    enabled: !!user?.id,
  });
}

export function useCreateOpenHouseRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      listingId,
      timeslotIndex,
      note,
      contactName,
      contactEmail,
      contactPhone,
      visitPurpose,
    }: {
      listingId: string;
      timeslotIndex?: number;
      note?: string;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
      visitPurpose?: string;
    }) => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not authenticated");
      const invoke = supabase.functions.invoke as unknown as InvokeOpenHouseRegistration;
      const { data: result, error: invokeError } = await invoke("open-house-registration", {
        body: {
          listingId,
          timeslotIndex: timeslotIndex ?? null,
          contactName,
          contactEmail,
          contactPhone,
          visitPurpose: visitPurpose || null,
          note: note || null,
          contactPermission: true,
          idVerificationConsent: true,
          privacyAcknowledgement: true,
        },
      });
      const error = invokeError ?? result?.error ?? null;
      if (error) {
        // Handle duplicate registration gracefully — fetch existing and return it
        if (error.code === "23505") {
          const { data: existing, error: fetchErr } = await supabase
            .from("open_house_registrations")
            .select("*")
            .eq("listing_id", listingId)
            .eq("requester_id", authUser.id)
            .single();
          if (fetchErr || !existing) throw new Error("You already have a registration for this open house.");
          return existing;
        }
        // FK violation (23503): requester_id not found in auth.users — stale session
        if (error.code === "23503") {
          throw new Error("Your account could not be verified. Please sign out and sign back in, then try again.");
        }
        // PostgrestError has a `.message` but does not extend Error — wrap it so
        // the onError handler always receives a true Error instance.
        if (error.message && CAPACITY_ERROR_MESSAGES[error.message]) {
          throw new Error(CAPACITY_ERROR_MESSAGES[error.message]);
        }
        throw new Error(error.message || "Registration failed. Please try again.");
      }
      if (!result?.data) throw new Error("Registration failed. Please try again.");
      return result.data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["open_house_registrations", v.listingId] });
      qc.invalidateQueries({ queryKey: ["open_house_registrations_mine"] });
      toast.success("Registration submitted. Complete ID verification and waiver to be considered.");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Registration failed. Please try again."));
    },
  });
}

export function useUpdateOpenHouseRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: OpenHouseRegistrationUpdates;
    }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("Not authenticated");
      // Mirror the RLS check: this hook is shared between two actors:
      //   1. the listing owner (approves / rejects / marks attended)
      //   2. the requester (uploads ID doc, signs waiver, submits screening)
      // RLS enforces both server-side via separate policies; we mirror the
      // OR here so the hook surfaces a clear "not authorised" error before
      // a server round-trip rather than getting an opaque RLS rejection.
      const { data: reg, error: lookupErr } = await supabase
        .from("open_house_registrations")
        .select(OPEN_HOUSE_REGISTRATION_LOOKUP_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      const lookup = reg as unknown as OpenHouseRegistrationLookup | null;
      const requesterId = lookup?.requester_id;
      const ownerId = lookup?.listings?.owner_id;
      if (uid !== requesterId && uid !== ownerId) {
        throw new Error("Not authorised for this registration");
      }
      const isOwner = uid === ownerId;
      const isRequester = uid === requesterId;
      const requestedStatus = updates.status;

      if (isRequester) {
        const requesterBlocker = getRequesterRegistrationUpdateBlocker(updates);
        if (requesterBlocker) throw new Error(requesterBlocker);
      }

      if (isOwner && requestedStatus === "approved") {
        const registrationForApproval = buildRegistrationApprovalContext(updates, lookup);
        const settings = getFirstOpenHouseSetting(lookup?.listings?.open_house_settings);
        const openHouseTransactionType = lookup?.listings?.open_house_transaction_type === "rent" ? "rent" : "sale";
        const blockers = getOpenHouseApprovalBlockers(
          registrationForApproval,
          settings ?? null,
          lookup?.listings?.price ?? null,
          openHouseTransactionType
        );
        if (blockers.length > 0) {
          throw new Error(`Registration is incomplete: ${blockers.join(", ")}`);
        }
      }

      if (isOwner && requestedStatus === "attended" && lookup?.status !== "approved") {
        throw new Error("Only approved registrations can be marked as attended.");
      }
      const payload = parseMutationInput(
        rowUpdateMutationSchema,
        { id, updates },
        "open house registration update",
      );
      const { data, error } = await supabase
        .from("open_house_registrations")
        .update(payload.updates as OHRegUpdate)
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["open_house_registrations"] });
      qc.invalidateQueries({ queryKey: ["open_house_registrations_mine"] });
      toast.success("Updated");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Update failed. Please try again."));
    },
  });
}

export function useOpenHouseOffers(listingId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["open_house_offers", listingId, user?.id ?? "anon"],
    queryFn: async () => {
      if (!listingId || !user?.id) return [];
      const { data, error } = await supabase
        .from("open_house_offers")
        .select(OPEN_HOUSE_OFFERS_SELECT)
        .eq("listing_id", listingId)
        .order("amount", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpenHouseOffer[];
    },
    enabled: !!listingId && !!user?.id,
  });
}

export function useMyOpenHouseOffers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["open_house_offers_mine", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("open_house_offers")
        .select(MY_OPEN_HOUSE_OFFERS_SELECT)
        .eq("bidder_id", user.id)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MyOpenHouseOffer[];
    },
    enabled: !!user?.id,
  });
}

export function useSubmitOpenHouseOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      listingId,
      amount,
      message,
    }: {
      listingId: string;
      amount: number;
      message?: string;
    }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("Not authenticated");
      const rpc = supabase.rpc as unknown as SubmitOpenHouseOfferRpc;
      const { data, error } = await rpc("submit_open_house_offer", {
        p_listing_id: listingId,
        p_amount: amount,
        p_message: message || null,
        p_currency: "EUR",
      });
      if (error) {
        throw new Error(OFFER_ERROR_MESSAGES[error.message] ?? error.message);
      }
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["open_house_offers", v.listingId] });
      qc.invalidateQueries({ queryKey: ["open_house_offers_mine"] });
      toast.success("Offer submitted");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to submit offer. Please try again."));
    },
  });
}

export function useUpdateOpenHouseOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: OHOfferStatus;
    }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("Not authenticated");
      // Mirror the RLS check: shared between two actors:
      //   1. the listing owner (reveal / accept / reject)
      //   2. the bidder (withdraw their own offer)
      // RLS enforces both via separate policies; we mirror the OR here so
      // the hook surfaces a clear "not authorised" before the server call.
      const { data: offer, error: lookupErr } = await supabase
        .from("open_house_offers")
        .select(OPEN_HOUSE_OFFER_LOOKUP_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      const lookup = offer as unknown as OpenHouseOfferLookup | null;
      const bidderId = lookup?.bidder_id;
      const ownerId = lookup?.listings?.owner_id;
      if (uid !== bidderId && uid !== ownerId) {
        throw new Error("Not authorised for this offer");
      }
      const isOwner = uid === ownerId;
      const isBidder = uid === bidderId;
      const settings = getFirstOpenHouseSetting(lookup?.listings?.open_house_settings);

      if (isOwner && status === "revealed") {
        const revealBlocker = getOpenHouseRevealBlocker({
          open_house_date: lookup?.listings?.open_house_date ?? null,
          offer_deadline: settings?.offer_deadline ?? null,
        });
        if (revealBlocker) throw new Error(revealBlocker);
      }

      if (isOwner && status === "accepted" && lookup?.status !== "revealed") {
        throw new Error("Only revealed bids can be accepted.");
      }

      if (isBidder && status !== "withdrawn") {
        throw new Error("Bidders can only withdraw their own bids.");
      }

      if (isOwner && status === "withdrawn") {
        throw new Error("Only the bidder can withdraw a bid.");
      }
      const updates = buildOfferStatusUpdate(status, uid);
      const payload = parseMutationInput(
        rowUpdateMutationSchema,
        { id, updates },
        "open house offer update",
      );
      const { data, error } = await supabase
        .from("open_house_offers")
        .update(payload.updates as ReturnType<typeof buildOfferStatusUpdate>)
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["open_house_offers"] });
      toast.success("Offer updated");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to update offer. Please try again."));
    },
  });
}

/** Accept one offer and automatically reject all other active offers for the same listing. */
export function useAcceptOpenHouseOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      acceptId,
      listingId: _listingId,
      allOfferIds,
    }: {
      acceptId: string;
      listingId: string;
      allOfferIds: string[];
    }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("Not authenticated");
      void uid;
      void _listingId;
      void allOfferIds;
      const rpc = supabase.rpc as unknown as AcceptOpenHouseOfferRpc;
      const { error } = await rpc("accept_open_house_offer", { p_offer_id: acceptId });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["open_house_offers", v.listingId] });
      qc.invalidateQueries({ queryKey: ["listing", v.listingId] });
      qc.invalidateQueries({ queryKey: ["listings"] });
      qc.invalidateQueries({ queryKey: ["listings-paginated"] });
      toast.success("Offer accepted — other bids automatically rejected");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to accept offer. Please try again."));
    },
  });
}

/** Reopen a winner selection so the host can choose a runner-up if a deal falls through. */
export function useReopenOpenHouseOfferSelection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId }: { listingId: string }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("Not authenticated");
      void uid;
      const rpc = supabase.rpc as unknown as ReopenOpenHouseOfferSelectionRpc;
      const { error } = await rpc("reopen_open_house_offer_selection", { p_listing_id: listingId });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["open_house_offers", v.listingId] });
      qc.invalidateQueries({ queryKey: ["listing", v.listingId] });
      qc.invalidateQueries({ queryKey: ["listings"] });
      qc.invalidateQueries({ queryKey: ["listings-paginated"] });
      toast.success("Winner selection reopened");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to reopen winner selection."));
    },
  });
}

/** Reveal all submitted (sealed) bids at once. */
export function useRevealAllOffers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId: _listingId, offerIds }: { listingId: string; offerIds: string[] }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("Not authenticated");
      const { data: listing, error: listingErr } = await supabase
        .from("listings")
        .select(OPEN_HOUSE_REVEAL_LISTING_SELECT)
        .eq("id", _listingId)
        .maybeSingle();
      if (listingErr) throw listingErr;
      const lookup = listing as unknown as OpenHouseRevealListingLookup | null;
      if (lookup?.owner_id !== uid) {
        throw new Error("Only the host can reveal sealed bids.");
      }
      const settings = getFirstOpenHouseSetting(lookup?.open_house_settings);
      const revealBlocker = getOpenHouseRevealBlocker({
        open_house_date: lookup?.open_house_date ?? null,
        offer_deadline: settings?.offer_deadline ?? null,
      });
      if (revealBlocker) throw new Error(revealBlocker);
      const payload = parseMutationInput(
        scopedRowIdsMutationSchema,
        { scopeId: _listingId, ids: offerIds },
        "open house offer reveal",
      );
      const { error } = await supabase
        .from("open_house_offers")
        .update({ status: "revealed", revealed_at: new Date().toISOString() })
        .in("id", payload.ids)
        .eq("status", "submitted");
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["open_house_offers", v.listingId] });
      toast.success("All bids revealed");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to reveal offers. Please try again."));
    },
  });
}

/** Upload ID doc or waiver to storage. Returns storage path for DB. */
export async function uploadOpenHouseDoc(
  file: File,
  path: string
): Promise<string> {
  assertAllowedUpload(file, OPEN_HOUSE_DOC_MIME_TYPES, {
    label: "open house document",
    maxBytes: OPEN_HOUSE_DOC_MAX_BYTES,
  });
  const { data, error } = await supabase.storage
    .from("open-house-docs")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return data.path;
}

/** Get signed URL for private doc (expires in seconds) */
export async function getOpenHouseDocSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from("open-house-docs")
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
