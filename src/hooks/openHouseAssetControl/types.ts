import type { Database } from "@/integrations/supabase/types";

export type OHRegUpdate = Database["public"]["Tables"]["open_house_registrations"]["Update"];
export type OHOfferUpdate = Database["public"]["Tables"]["open_house_offers"]["Update"];

export type OHTimeslot = { start: string; end: string; max_visitors: number };
export type OHRegistrationStatus = "pending" | "approved" | "rejected" | "attended" | "cancelled";
export type OHIdDocType = "id_card" | "passport";
export type OHOfferStatus = "submitted" | "revealed" | "accepted" | "rejected" | "withdrawn";
export type OHPofVerifiedStatus = "unreviewed" | "verified" | "rejected";
export type OpenHouseTransactionType = "sale" | "rent";

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

export type OpenHouseCapacityRow = Omit<OpenHouseCapacity, "slot_counts"> & {
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

type OHListingSummary = Pick<
  Database["public"]["Tables"]["listings"]["Row"],
  "id" | "title" | "city" | "address" | "cover_image_url" | "open_house_date"
>;

export type MyOpenHouseRegistration = OpenHouseRegistration & { listings: OHListingSummary | null };
export type MyOpenHouseOffer = OpenHouseOffer & { listings: OHListingSummary | null };

export type RegistrationContext = Pick<
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

export type OfferEligibilityContext = {
  open_house_date: string | null;
  offer_deadline: string | null;
};

export type OpenHouseSettingsUpdate = Partial<{
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

export type OpenHouseRegistrationUpdates = Partial<{
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
  mortgage_status: string;
  budget_range: string;
  working_with_agent: string;
  screening_doc_url: string;
}>;

export type OpenHouseRegistrationLookup = {
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
    open_house_transaction_type?: string | null;
    open_house_settings?: OpenHouseSettings[] | OpenHouseSettings | null;
  };
};

export type OpenHouseOfferLookup = {
  bidder_id?: string;
  status?: OHOfferStatus;
  listings?: {
    owner_id?: string;
    open_house_date?: string | null;
    open_house_settings?: Array<{ offer_deadline?: string | null }> | { offer_deadline?: string | null } | null;
  };
};

export type OpenHouseRevealListingLookup = {
  owner_id?: string;
  open_house_date?: string | null;
  open_house_settings?: Array<{ offer_deadline?: string | null }> | { offer_deadline?: string | null } | null;
};

export type FunctionError = { code?: string | null; message?: string | null };

export type OpenHouseRegistrationEnvelope = {
  data: OpenHouseRegistration | null;
  error: FunctionError | null;
};

export type SubmitOpenHouseOfferRpc = (
  fn: "submit_open_house_offer",
  args: {
    p_listing_id: string;
    p_amount: number;
    p_message?: string | null;
    p_currency?: string;
  },
) => Promise<{ data: OpenHouseOffer | null; error: Error | null }>;

export type AcceptOpenHouseOfferRpc = (
  fn: "accept_open_house_offer",
  args: {
    p_offer_id: string;
  },
) => Promise<{ data: OpenHouseOffer | null; error: Error | null }>;

export type ReopenOpenHouseOfferSelectionRpc = (
  fn: "reopen_open_house_offer_selection",
  args: {
    p_listing_id: string;
  },
) => Promise<{ data: null; error: Error | null }>;

export type InvokeOpenHouseCapacity = (
  fn: "open-house-capacity",
  options: { body: { listingId: string } },
) => Promise<{ data: OpenHouseCapacityRow | null; error: Error | null }>;

export type InvokeOpenHouseRegistration = (
  fn: "open-house-registration",
  options: {
    body: {
      listingId: string;
      timeslotIndex: number | null;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
      visitPurpose: string | null;
      note: string | null;
      contactPermission: boolean;
      idVerificationConsent: boolean;
      privacyAcknowledgement: boolean;
    };
  },
) => Promise<{ data: OpenHouseRegistrationEnvelope | null; error: FunctionError | null }>;
