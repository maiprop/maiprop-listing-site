import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type OHRegUpdate = Database["public"]["Tables"]["open_house_registrations"]["Update"];
type OHOfferUpdate = Database["public"]["Tables"]["open_house_offers"]["Update"];
type CreateOpenHouseRegistrationRpc = (
  fn: "create_open_house_registration",
  args: {
    p_listing_id: string;
    p_timeslot_index?: number | null;
    p_contact_name?: string | null;
    p_contact_email?: string | null;
    p_contact_phone?: string | null;
    p_visit_purpose?: string | null;
    p_note?: string | null;
    p_contact_permission?: boolean;
    p_id_verification_consent?: boolean;
    p_privacy_acknowledgement?: boolean;
  },
) => Promise<{ data: OpenHouseRegistration | null; error: { code?: string; message?: string } | null }>;
type SubmitOpenHouseOfferRpc = (
  fn: "submit_open_house_offer",
  args: {
    p_listing_id: string;
    p_amount: number;
    p_message?: string | null;
    p_currency?: string;
  },
) => Promise<{ data: OpenHouseOffer | null; error: Error | null }>;
type AcceptOpenHouseOfferRpc = (
  fn: "accept_open_house_offer",
  args: {
    p_offer_id: string;
  },
) => Promise<{ data: OpenHouseOffer | null; error: Error | null }>;
type ReopenOpenHouseOfferSelectionRpc = (
  fn: "reopen_open_house_offer_selection",
  args: {
    p_listing_id: string;
  },
) => Promise<{ data: null; error: Error | null }>;
type GetOpenHouseCapacityRpc = (
  fn: "get_open_house_capacity",
  args: {
    p_listing_id: string;
  },
) => Promise<{ data: OpenHouseCapacityRow[] | null; error: Error | null }>;

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
export type OHPofVerifiedStatus = "unreviewed" | "verified" | "rejected";

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

export interface OpenHouseCapacitySlot {
  slot_index: number;
  active_count: number;
  max_visitors: number | null;
  full: boolean;
}

export interface OpenHouseCapacity {
  listing_id: string;
  active_total: number;
  max_total_visitors: number | null;
  slot_counts: OpenHouseCapacitySlot[];
}

type OpenHouseCapacityRow = Omit<OpenHouseCapacity, "slot_counts"> & {
  slot_counts: OpenHouseCapacitySlot[] | string | null;
};

export interface OpenHouseRegistration {
  id: string;
  listing_id: string;
  requester_id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_permission_at: string | null;
  id_verification_consent_at: string | null;
  privacy_acknowledged_at: string | null;
  visit_purpose: string | null;
  timeslot_index: number | null;
  id_doc_type: OHIdDocType | null;
  id_doc_url: string | null;
  id_verified_at: string | null;
  waiver_signed_at: string | null;
  waiver_url: string | null;
  proof_of_funds_url: string | null;
  pof_verified_status: OHPofVerifiedStatus | null;
  pof_rejection_reason: string | null;
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
  profiles?: { display_name: string; first_name: string; last_name: string; avatar_url: string } | null;
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

type RegistrationContext = Pick<
  OpenHouseRegistration,
  | "timeslot_index"
  | "contact_name"
  | "contact_email"
  | "contact_phone"
  | "contact_permission_at"
  | "id_verification_consent_at"
  | "privacy_acknowledged_at"
  | "id_doc_url"
  | "id_verified_at"
  | "waiver_signed_at"
  | "proof_of_funds_url"
  | "pof_verified_status"
  | "proof_amount"
  | "investor_declaration_signed_at"
  | "mortgage_status"
  | "budget_range"
  | "working_with_agent"
>;

type OfferEligibilityContext = {
  open_house_date: string | null;
  offer_deadline: string | null;
};

const OPEN_HOUSE_SCREENING_PRICE_THRESHOLD = 200_000;

function requiresOpenHouseScreening(listingPrice: number | null | undefined) {
  return Number(listingPrice ?? 0) >= OPEN_HOUSE_SCREENING_PRICE_THRESHOLD;
}

function isDateInPast(value: string | null | undefined) {
  if (!value) return false;
  return new Date(value).getTime() <= Date.now();
}

function getOpenHouseRevealBlocker({ open_house_date, offer_deadline }: OfferEligibilityContext) {
  const revealGate = offer_deadline ?? open_house_date;
  if (!revealGate) return null;
  if (!isDateInPast(revealGate)) {
    return offer_deadline
      ? "Bids can only be revealed after the offer deadline."
      : "Bids can only be revealed after the open house has taken place.";
  }

  return null;
}

export function getOpenHouseApprovalBlockers(
  registration: RegistrationContext,
  settings: OpenHouseSettings | null | undefined,
  listingPrice?: number | null
) {
  const blockers: string[] = [];
  const requiresScreening = requiresOpenHouseScreening(listingPrice);

  if ((settings?.timeslots?.length ?? 0) > 0 && registration.timeslot_index === null) {
    blockers.push("Timeslot not selected");
  }

  if (!registration.contact_name) blockers.push("Contact name missing");
  if (!registration.contact_email) blockers.push("Contact email missing");
  if (!registration.contact_phone) blockers.push("Contact phone missing");
  if (!registration.contact_permission_at) blockers.push("Contact permission missing");
  if (!registration.id_verification_consent_at) blockers.push("ID verification consent missing");
  if (!registration.privacy_acknowledged_at) blockers.push("Privacy acknowledgement missing");

  if (requiresScreening) {
    if (!registration.mortgage_status) blockers.push("Mortgage/funds question missing");
    if (!registration.budget_range) blockers.push("Budget range missing");
    if (!registration.working_with_agent) blockers.push("Agent representation question missing");
  }

  if (!registration.id_doc_url || !registration.id_verified_at) {
    blockers.push("ID verification incomplete");
  }

  if (!registration.waiver_signed_at) {
    blockers.push("Waiver not signed");
  }

  if (settings?.require_proof_of_funds) {
    if (!registration.proof_of_funds_url) {
      blockers.push("Proof of funds missing");
    } else if (registration.pof_verified_status !== "verified") {
      blockers.push("Proof of funds not verified");
    }
    if (settings.min_proof_amount && Number(registration.proof_amount ?? 0) < Number(settings.min_proof_amount)) {
      blockers.push(`Proof of funds is below the minimum ${Number(settings.min_proof_amount).toLocaleString()}`);
    }
  }

  if (settings?.require_investor_declaration && !registration.investor_declaration_signed_at) {
    blockers.push("Investor declaration not signed");
  }

  return blockers;
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

export function useOpenHouseCapacity(listingId: string | undefined) {
  return useQuery({
    queryKey: ["open_house_capacity", listingId],
    queryFn: async () => {
      if (!listingId) return null;
      const rpc = supabase.rpc as unknown as GetOpenHouseCapacityRpc;
      const { data, error } = await rpc("get_open_house_capacity", { p_listing_id: listingId });
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      const parsedSlots =
        typeof row.slot_counts === "string"
          ? (JSON.parse(row.slot_counts) as OpenHouseCapacitySlot[])
          : row.slot_counts ?? [];
      return {
        listing_id: row.listing_id,
        active_total: Number(row.active_total ?? 0),
        max_total_visitors: row.max_total_visitors ?? null,
        slot_counts: parsedSlots.map((slot) => ({
          slot_index: Number(slot.slot_index),
          active_count: Number(slot.active_count ?? 0),
          max_visitors: slot.max_visitors == null ? null : Number(slot.max_visitors),
          full: Boolean(slot.full),
        })),
      } satisfies OpenHouseCapacity;
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
      const rpc = supabase.rpc as unknown as CreateOpenHouseRegistrationRpc;
      const { data, error } = await rpc("create_open_house_registration", {
          p_listing_id: listingId,
          p_timeslot_index: timeslotIndex ?? null,
          p_contact_name: contactName,
          p_contact_email: contactEmail,
          p_contact_phone: contactPhone,
          p_visit_purpose: visitPurpose || null,
          p_note: note || null,
          p_contact_permission: true,
          p_id_verification_consent: true,
          p_privacy_acknowledgement: true,
        });
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
        const capacityMessages: Record<string, string> = {
          open_house_total_capacity_reached: "This open house is fully booked.",
          open_house_timeslot_capacity_reached: "That timeslot is fully booked. Please choose another slot.",
          open_house_timeslot_required: "Please choose a timeslot.",
          open_house_timeslot_invalid: "That timeslot is no longer available. Please choose another slot.",
          open_house_registration_closed: "Registration for this open house is closed.",
          open_house_not_active: "This open house is not accepting registrations.",
          open_house_rsvp_limit_reached: "You've reached your monthly RSVP limit. Upgrade to Pro for unlimited open-house RSVPs.",
        };
        if (error.message && capacityMessages[error.message]) {
          throw new Error(capacityMessages[error.message]);
        }
        throw new Error(error.message || "Registration failed. Please try again.");
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
        timeslot_index: number;
        contact_name: string;
        contact_email: string;
        contact_phone: string;
        contact_permission_at: string;
        id_verification_consent_at: string;
        privacy_acknowledged_at: string;
        visit_purpose: string;
        id_doc_type: OHIdDocType;
        id_doc_url: string;
        id_verified_at: string;
        waiver_signed_at: string;
        waiver_url: string;
        proof_of_funds_url: string;
        pof_verified_status: OHPofVerifiedStatus;
        proof_amount: number;
        investor_declaration_signed_at: string;
        status: OHRegistrationStatus;
        approved_by: string;
        approved_at: string;
        attended_at: string;
        rejection_reason: string;
        pof_rejection_reason: string | null;
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
        .select(`
          requester_id,
          status,
          timeslot_index,
          contact_name,
          contact_email,
          contact_phone,
          contact_permission_at,
          id_verification_consent_at,
          privacy_acknowledged_at,
          id_doc_url,
          id_verified_at,
          waiver_signed_at,
          proof_of_funds_url,
          pof_verified_status,
          pof_rejection_reason,
          proof_amount,
          investor_declaration_signed_at,
          mortgage_status,
          budget_range,
          working_with_agent,
          listings!inner(
            owner_id,
            price,
            open_house_settings (
              id,
              listing_id,
              timeslots,
              max_visitors_per_slot,
              max_total_visitors,
              broker_required,
              require_proof_of_funds,
              min_proof_amount,
              require_investor_declaration,
              offer_deadline,
              allow_sealed_bids,
              created_at,
              updated_at
            )
          )
        `)
        .eq("id", id)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      const lookup = reg as unknown as {
        requester_id?: string;
        status?: OHRegistrationStatus;
        timeslot_index?: number | null;
        contact_name?: string | null;
        contact_email?: string | null;
        contact_phone?: string | null;
        contact_permission_at?: string | null;
        id_verification_consent_at?: string | null;
        privacy_acknowledged_at?: string | null;
        id_doc_url?: string | null;
        id_verified_at?: string | null;
        waiver_signed_at?: string | null;
        proof_of_funds_url?: string | null;
        pof_verified_status?: OHPofVerifiedStatus | null;
        pof_rejection_reason?: string | null;
        proof_amount?: number | null;
        investor_declaration_signed_at?: string | null;
        mortgage_status?: string | null;
        budget_range?: string | null;
        working_with_agent?: string | null;
        listings?: {
          owner_id?: string;
          price?: number | null;
          open_house_settings?: OpenHouseSettings[] | OpenHouseSettings | null;
        };
      } | null;
      const requesterId = lookup?.requester_id;
      const ownerId = lookup?.listings?.owner_id;
      if (uid !== requesterId && uid !== ownerId) {
        throw new Error("Not authorised for this registration");
      }
      const isOwner = uid === ownerId;
      const isRequester = uid === requesterId;
      const requestedStatus = updates.status;

      if (isRequester) {
        const requesterStatusAllowed = requestedStatus === undefined || requestedStatus === "cancelled";
        const ownerOnlyFields = [
          "id_verified_at",
          "approved_by",
          "approved_at",
          "attended_at",
          "rejection_reason",
          "pof_verified_status",
          "pof_rejection_reason",
          "timeslot_index",
        ] as const;
        if (!requesterStatusAllowed || ownerOnlyFields.some((field) => field in updates)) {
          throw new Error("Only the host can approve, reject, or mark attendance.");
        }
      }

      if (isOwner && requestedStatus === "approved") {
        const registrationForApproval: RegistrationContext = {
          timeslot_index: updates.timeslot_index ?? lookup?.timeslot_index ?? null,
          contact_name: updates.contact_name ?? lookup?.contact_name ?? null,
          contact_email: updates.contact_email ?? lookup?.contact_email ?? null,
          contact_phone: updates.contact_phone ?? lookup?.contact_phone ?? null,
          contact_permission_at: updates.contact_permission_at ?? lookup?.contact_permission_at ?? null,
          id_verification_consent_at: updates.id_verification_consent_at ?? lookup?.id_verification_consent_at ?? null,
          privacy_acknowledged_at: updates.privacy_acknowledged_at ?? lookup?.privacy_acknowledged_at ?? null,
          id_doc_url: updates.id_doc_url ?? lookup?.id_doc_url ?? null,
          id_verified_at: updates.id_verified_at ?? lookup?.id_verified_at ?? null,
          waiver_signed_at: updates.waiver_signed_at ?? lookup?.waiver_signed_at ?? null,
          proof_of_funds_url: updates.proof_of_funds_url ?? lookup?.proof_of_funds_url ?? null,
          pof_verified_status: updates.pof_verified_status ?? lookup?.pof_verified_status ?? null,
          proof_amount: updates.proof_amount ?? lookup?.proof_amount ?? null,
          investor_declaration_signed_at: updates.investor_declaration_signed_at ?? lookup?.investor_declaration_signed_at ?? null,
          mortgage_status: updates.mortgage_status ?? lookup?.mortgage_status ?? null,
          budget_range: updates.budget_range ?? lookup?.budget_range ?? null,
          working_with_agent: updates.working_with_agent ?? lookup?.working_with_agent ?? null,
        };
        const rawSettings = lookup?.listings?.open_house_settings;
        const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings;
        const blockers = getOpenHouseApprovalBlockers(
          registrationForApproval,
          settings ?? null,
          lookup?.listings?.price ?? null
        );
        if (blockers.length > 0) {
          throw new Error(`Registration is incomplete: ${blockers.join(", ")}`);
        }
      }

      if (isOwner && requestedStatus === "attended" && lookup?.status !== "approved") {
        throw new Error("Only approved registrations can be marked as attended.");
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
      const rpc = supabase.rpc as unknown as SubmitOpenHouseOfferRpc;
      const { data, error } = await rpc("submit_open_house_offer", {
        p_listing_id: listingId,
        p_amount: amount,
        p_message: message || null,
        p_currency: "EUR",
      });
      if (error) {
        const offerMessages: Record<string, string> = {
          proof_of_funds_must_be_verified: "Proof of funds must be verified before you can submit an offer.",
          only_attendees_can_submit_offers: "Attend the open house before submitting an offer.",
          offers_unlock_after_open_house: "Offers unlock after the open house has taken place.",
          sealed_bid_deadline_passed: "The sealed-bid deadline has passed.",
          sealed_bids_disabled_for_open_house: "Sealed bids are disabled for this open house.",
        };
        throw new Error(offerMessages[error.message] ?? error.message);
      }
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
        .select(`
          bidder_id,
          status,
          listings!inner(
            owner_id,
            open_house_date,
            open_house_settings (offer_deadline)
          )
        `)
        .eq("id", id)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      const lookup = offer as unknown as {
        bidder_id?: string;
        status?: OHOfferStatus;
        listings?: {
          owner_id?: string;
          open_house_date?: string | null;
          open_house_settings?: Array<{ offer_deadline?: string | null }> | { offer_deadline?: string | null } | null;
        };
      } | null;
      const bidderId = lookup?.bidder_id;
      const ownerId = lookup?.listings?.owner_id;
      if (uid !== bidderId && uid !== ownerId) {
        throw new Error("Not authorised for this offer");
      }
      const isOwner = uid === ownerId;
      const isBidder = uid === bidderId;
      const rawSettings = lookup?.listings?.open_house_settings;
      const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings;

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
      const msg = err instanceof Error ? err.message : "Failed to accept offer. Please try again.";
      toast.error(msg);
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
      const msg = err instanceof Error ? err.message : "Failed to reopen winner selection.";
      toast.error(msg);
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
        .select(`
          owner_id,
          open_house_date,
          open_house_settings (offer_deadline)
        `)
        .eq("id", _listingId)
        .maybeSingle();
      if (listingErr) throw listingErr;
      const lookup = listing as unknown as {
        owner_id?: string;
        open_house_date?: string | null;
        open_house_settings?: Array<{ offer_deadline?: string | null }> | { offer_deadline?: string | null } | null;
      } | null;
      if (lookup?.owner_id !== uid) {
        throw new Error("Only the host can reveal sealed bids.");
      }
      const rawSettings = lookup?.open_house_settings;
      const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings;
      const revealBlocker = getOpenHouseRevealBlocker({
        open_house_date: lookup?.open_house_date ?? null,
        offer_deadline: settings?.offer_deadline ?? null,
      });
      if (revealBlocker) throw new Error(revealBlocker);
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
