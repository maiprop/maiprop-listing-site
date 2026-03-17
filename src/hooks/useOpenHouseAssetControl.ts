import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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

export function useOpenHouseSettings(listingId: string | undefined) {
  return useQuery({
    queryKey: ["open_house_settings", listingId],
    queryFn: async () => {
      if (!listingId) return null;
      const { data, error } = await supabase
        .from("open_house_settings")
        .select("*")
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
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useOpenHouseRegistrations(listingId: string | undefined, asOwner: boolean) {
  return useQuery({
    queryKey: ["open_house_registrations", listingId],
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
      return (data ?? []) as OpenHouseRegistration[];
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
      return data ?? [];
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
      const { data, error } = await supabase
        .from("open_house_registrations")
        .insert({
          listing_id: listingId,
          requester_id: (await supabase.auth.getUser()).data.user?.id,
          timeslot_index: timeslotIndex ?? null,
          status: "pending",
          note: note || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["open_house_registrations", v.listingId] });
      qc.invalidateQueries({ queryKey: ["open_house_registrations_mine"] });
      toast.success("Registration submitted. Complete ID verification and waiver to be considered.");
    },
    onError: (e: Error) => toast.error(e.message),
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
      }>;
    }) => {
      const { data, error } = await supabase
        .from("open_house_registrations")
        .update(updates as any)
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
    onError: (e: Error) => toast.error(e.message),
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
      return data ?? [];
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
          } as any,
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
    onError: (e: Error) => toast.error(e.message),
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
      const updates: any = { status };
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
    onError: (e: Error) => toast.error(e.message),
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
