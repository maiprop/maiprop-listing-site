import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type OHRegUpdate = Database["public"]["Tables"]["open_house_registrations"]["Update"];
type OHOfferUpdate = Database["public"]["Tables"]["open_house_offers"]["Update"];
type OHOfferInsert = Database["public"]["Tables"]["open_house_offers"]["Insert"];

/** Listing summary attached to "my" registrations and offers via the listing_id join. */
type OHListingSummary = Pick<
  Database["public"]["Tables"]["listings"]["Row"],
  "id" | "title" | "city" | "address" | "cover_image_url" | "open_house_date"
>;

/** Row shape returned by useMyOpenHouseRegistrations() (registration + listing summary). */
export type MyOpenHouseRegistration = OpenHouseRegistration & { listings: OHListingSummary | null };

/** Row shape returned by useMyOpenHouseOffers() (offer + listing summary). */
export type MyOpenHouseOffer = OpenHouseOffer & { listings: OHListingSummary | null };

export type OHTimeslot = { start: string; end: string; max_visitors: number };
export type OHRegistrationStatus = "pending" | "approved" | "rejected" | "attended" | "cancelled";
export type OHIdDocType = "id_card" | "passport";
export type OHOfferStatus = "submitted" | "revealed" | "accepted" | "rejected" | "withdrawn";

export interface OpenHouseSettings {
  id: string;
  listing_id: string;
  timeslots: OHTimeslot[];
  max_visitors_per_slot: number;
  max_total_visitors: number | null;
  broker_required: boolean;
  require_proof_of_funds: boolean;
  min_proof_amount: number | null;
  require_investor_declaration: boolean;
  offer_deadline: string | null;
  allow_sealed_bids: boolean;
  created_at: string;
  updated_at: string;
}

export interface OpenHouseRegistration {
  id: string;
  listing_id: string;
  requester_id: string;
  timeslot_index: number | null;
  id_doc_type: OHIdDocType | null;
  id_doc_url: string | null;
  id_verified_at: string | null;
  waiver_signed_at: string | null;
  waiver_url: string | null;
  proof_of_funds_url: string | null;
  proof_amount: number | null;
  investor_declaration_signed_at: string | null;
  status: OHRegistrationStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  attended_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  // Pre-qualification / screening fields
  mortgage_status: string | null;
  budget_range: string | null;
  working_with_agent: string | null;
  screening_doc_url: string | null;
  screening_score: number | null;
  profiles?: { display_name: string; first_name: string; last_name: string; avatar_url: string; email?: string } | null;
}

export interface OpenHouseOffer {
  id: string;
  listing_id: string;
  bidder_id: string;
  amount: number;
  currency: string;
  message: string | null;
  status: OHOfferStatus;
  submitted_at: string;
  revealed_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  profiles?: { display_name: string } | null;
}

export function useOpenHouseSettings(listingId: string | undefined) {
  return useQuery({
    queryKey: ["open_house_settings", listingId],
    queryFn: async () => {
      if (!listingId) return null;
      const { data, error } = await supabase
        .from("open_house_settings")
        .select("id, listing_id, timeslots, max_visitors_per_slot, max_total_visitors, require_proof_of_funds, min_proof_amount, require_investor_declaration, allow_sealed_bids, offer_deadline, broker_required, created_at, updated_at")
        .eq("listing_id", listingId)
        .maybeSingle();
      if (error) throw error;
      return data as OpenHouseSettings | null;
    },
    enabled: !!listingId,
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
      settings: Partial<{
        timeslots: OHTimeslot[];
        max_visitors_per_slot: number;
        max_total_visitors: number | null;
        broker_required: boolean;
        require_proof_of_funds: boolean;
        min_proof_amount: number | null;
        require_investor_declaration: boolean;
        offer_deadline: string | null;
        allow_sealed_bids: boolean;
      }>;
    }) => {
      const { data, error } = await supabase
        .from("open_house_settings")
        .upsert(
          { listing_id: listingId, ...settings, updated_at: new Date().toISOString() },
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
      const msg = err instanceof Error ? err.message : "Failed to save settings. Please try again.";
      toast.error(msg);
    },
  });
}

export function useOpenHouseRegistrations(listingId: string | undefined, _asOwner: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["open_house_registrations", listingId, user?.id ?? "anon"],
    queryFn: async () => {
      if (!listingId) return [];
      const { data, error } = await supabase
        .from("open_house_registrations")
        .select(`
          *,
          profiles:requester_id (display_name, first_name, last_name, avatar_url)
        `)
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OpenHouseRegistration[];
    },
    enabled: !!listingId,
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
        .select(`
          *,
          listings:listing_id (id, title, city, address, cover_image_url, open_house_date)
        `)
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
    }: {
      listingId: string;
      timeslotIndex?: number;
      note?: string;
    }) => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("open_house_registrations")
        .insert({
          listing_id: listingId,
          requester_id: authUser.id,
          timeslot_index: timeslotIndex ?? null,
          status: "pending" as OHRegistrationStatus,
          note: note || null,
        })
        .select()
        .single();
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
        throw error;
      }
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["open_house_registrations", v.listingId] });
      qc.invalidateQueries({ queryKey: ["open_house_registrations_mine"] });
      toast.success("Registration submitted. Complete ID verification and waiver to be considered.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Registration failed. Please try again.";
      toast.error(msg);
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
      updates: Partial<{
        id_doc_type: OHIdDocType;
        id_doc_url: string;
        id_verified_at: string;
        waiver_signed_at: string;
        waiver_url: string;
        proof_of_funds_url: string;
        proof_amount: number;
        investor_declaration_signed_at: string;
        status: OHRegistrationStatus;
        approved_by: string;
        approved_at: string;
        attended_at: string;
        rejection_reason: string;
        // Pre-qualification screening fields
        mortgage_status: string;
        budget_range: string;
        working_with_agent: string;
        screening_doc_url: string;
      }>;
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
        .select("requester_id, listings!inner(owner_id)")
        .eq("id", id)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      const lookup = reg as unknown as {
        requester_id?: string;
        listings?: { owner_id?: string };
      } | null;
      const requesterId = lookup?.requester_id;
      const ownerId = lookup?.listings?.owner_id;
      if (uid !== requesterId && uid !== ownerId) {
        throw new Error("Not authorised for this registration");
      }
      const { data, error } = await supabase
        .from("open_house_registrations")
        .update(updates as OHRegUpdate)
        .eq("id", id)
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
      const msg = err instanceof Error ? err.message : "Update failed. Please try again.";
      toast.error(msg);
    },
  });
}

export function useOpenHouseOffers(listingId: string | undefined) {
  return useQuery({
    queryKey: ["open_house_offers", listingId],
    queryFn: async () => {
      if (!listingId) return [];
      const { data, error } = await supabase
        .from("open_house_offers")
        .select(`
          *,
          profiles:bidder_id (display_name)
        `)
        .eq("listing_id", listingId)
        .order("amount", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpenHouseOffer[];
    },
    enabled: !!listingId,
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
        .select(`
          *,
          listings:listing_id (id, title, city, cover_image_url, open_house_date)
        `)
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
      const { data, error } = await supabase
        .from("open_house_offers")
        .upsert(
          {
            listing_id: listingId,
            bidder_id: uid,
            amount,
            message: message || null,
            status: "submitted",
          } as OHOfferInsert,
          { onConflict: "listing_id,bidder_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["open_house_offers", v.listingId] });
      qc.invalidateQueries({ queryKey: ["open_house_offers_mine"] });
      toast.success("Offer submitted");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to submit offer. Please try again.";
      toast.error(msg);
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
        .select("bidder_id, listings!inner(owner_id)")
        .eq("id", id)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      const lookup = offer as unknown as {
        bidder_id?: string;
        listings?: { owner_id?: string };
      } | null;
      const bidderId = lookup?.bidder_id;
      const ownerId = lookup?.listings?.owner_id;
      if (uid !== bidderId && uid !== ownerId) {
        throw new Error("Not authorised for this offer");
      }
      const updates: OHOfferUpdate = { status };
      if (status === "revealed") updates.revealed_at = new Date().toISOString();
      if (status === "accepted" || status === "rejected") {
        updates.decided_by = uid;
        updates.decided_at = new Date().toISOString();
      }
      const { data, error } = await supabase
        .from("open_house_offers")
        .update(updates)
        .eq("id", id)
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
      const msg = err instanceof Error ? err.message : "Failed to update offer. Please try again.";
      toast.error(msg);
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
      const now = new Date().toISOString();
      const { error: e1 } = await supabase
        .from("open_house_offers")
        .update({ status: "accepted", decided_by: uid, decided_at: now, revealed_at: now })
        .eq("id", acceptId);
      if (e1) throw e1;
      const otherIds = allOfferIds.filter((id) => id !== acceptId);
      if (otherIds.length > 0) {
        const { error: e2 } = await supabase
          .from("open_house_offers")
          .update({ status: "rejected", decided_by: uid, decided_at: now })
          .in("id", otherIds)
          .neq("status", "withdrawn");
        if (e2) throw e2;
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["open_house_offers", v.listingId] });
      toast.success("Offer accepted — other bids automatically rejected");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to accept offer. Please try again.";
      toast.error(msg);
    },
  });
}

/** Reveal all submitted (sealed) bids at once. */
export function useRevealAllOffers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId: _listingId, offerIds }: { listingId: string; offerIds: string[] }) => {
      const { error } = await supabase
        .from("open_house_offers")
        .update({ status: "revealed", revealed_at: new Date().toISOString() })
        .in("id", offerIds)
        .eq("status", "submitted");
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["open_house_offers", v.listingId] });
      toast.success("All bids revealed");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to reveal offers. Please try again.";
      toast.error(msg);
    },
  });
}

/** Upload ID doc or waiver to storage. Returns storage path for DB. */
export async function uploadOpenHouseDoc(
  file: File,
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("open-house-docs")
    .upload(path, file, { upsert: true });
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
