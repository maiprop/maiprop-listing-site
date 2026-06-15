import {
  OPEN_HOUSE_SCREENING_PRICE_THRESHOLD,
} from "./constants";
import type {
  OfferEligibilityContext,
  OHOfferStatus,
  OHOfferUpdate,
  OpenHouseCapacity,
  OpenHouseCapacityRow,
  OpenHouseCapacitySlot,
  OpenHouseRegistrationLookup,
  OpenHouseRegistrationUpdates,
  OpenHouseSettings,
  OpenHouseTransactionType,
  RegistrationContext,
} from "./types";

const REQUESTER_OWNER_ONLY_REGISTRATION_FIELDS = [
  "id_verified_at",
  "approved_by",
  "approved_at",
  "attended_at",
  "rejection_reason",
  "pof_verified_status",
  "pof_rejection_reason",
  "timeslot_index",
] as const;

export function requiresOpenHouseScreening(
  listingPrice: number | null | undefined,
  openHouseTransactionType: OpenHouseTransactionType = "sale",
) {
  return openHouseTransactionType !== "rent" && Number(listingPrice ?? 0) >= OPEN_HOUSE_SCREENING_PRICE_THRESHOLD;
}

export function isDateInPast(value: string | null | undefined) {
  if (!value) return false;
  return new Date(value).getTime() <= Date.now();
}

export function getOpenHouseRevealBlocker({ open_house_date, offer_deadline }: OfferEligibilityContext) {
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
  listingPrice?: number | null,
  openHouseTransactionType: OpenHouseTransactionType = "sale",
) {
  const blockers: string[] = [];
  const isRentalOpenHouse = openHouseTransactionType === "rent";
  const requiresScreening = requiresOpenHouseScreening(listingPrice, openHouseTransactionType);

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

  if (!isRentalOpenHouse && settings?.require_proof_of_funds) {
    if (!registration.proof_of_funds_url) {
      blockers.push("Proof of funds missing");
    } else if (registration.pof_verified_status !== "verified") {
      blockers.push("Proof of funds not verified");
    }
    if (settings.min_proof_amount && Number(registration.proof_amount ?? 0) < Number(settings.min_proof_amount)) {
      blockers.push(`Proof of funds is below the minimum ${Number(settings.min_proof_amount).toLocaleString()}`);
    }
  }

  if (!isRentalOpenHouse && settings?.require_investor_declaration && !registration.investor_declaration_signed_at) {
    blockers.push("Investor declaration not signed");
  }

  return blockers;
}

export function normalizeOpenHouseCapacity(row: OpenHouseCapacityRow): OpenHouseCapacity {
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
  };
}

export function getFirstOpenHouseSetting<T>(rawSettings: T[] | T | null | undefined) {
  return Array.isArray(rawSettings) ? rawSettings[0] : rawSettings;
}

export function getRequesterRegistrationUpdateBlocker(updates: OpenHouseRegistrationUpdates) {
  const requestedStatus = updates.status;
  const requesterStatusAllowed = requestedStatus === undefined || requestedStatus === "cancelled";
  if (!requesterStatusAllowed || REQUESTER_OWNER_ONLY_REGISTRATION_FIELDS.some((field) => field in updates)) {
    return "Only the host can approve, reject, or mark attendance.";
  }

  return null;
}

export function buildRegistrationApprovalContext(
  updates: OpenHouseRegistrationUpdates,
  lookup: OpenHouseRegistrationLookup | null,
): RegistrationContext {
  return {
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
}

export function buildOfferStatusUpdate(status: OHOfferStatus, uid: string): OHOfferUpdate {
  const updates: OHOfferUpdate = { status };
  if (status === "revealed") updates.revealed_at = new Date().toISOString();
  if (status === "accepted" || status === "rejected") {
    updates.decided_by = uid;
    updates.decided_at = new Date().toISOString();
  }
  return updates;
}

const RAW_RUNTIME_ERROR_RE = /cannot read propert(?:y|ies)|undefined is not an object|is not a function/i;

export function getErrorMessage(err: unknown, fallback: string) {
  if (!(err instanceof Error)) return fallback;
  const message = err.message.trim();
  if (!message || err instanceof TypeError || RAW_RUNTIME_ERROR_RE.test(message)) {
    return fallback;
  }
  return message;
}
