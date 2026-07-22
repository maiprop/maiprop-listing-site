export const OPEN_HOUSE_SCREENING_PRICE_THRESHOLD = 200_000;

export const CAPACITY_ERROR_MESSAGES: Record<string, string> = {
  open_house_total_capacity_reached: "This open house is fully booked.",
  open_house_timeslot_capacity_reached: "That timeslot is fully booked. Please choose another slot.",
  open_house_timeslot_required: "Please choose a timeslot.",
  open_house_timeslot_invalid: "That timeslot is no longer available. Please choose another slot.",
  open_house_registration_closed: "Registration for this open house is closed.",
  open_house_not_active: "This open house is not accepting registrations.",
  open_house_rsvp_limit_reached: "You've reached your monthly RSVP limit. Upgrade to Pro for unlimited open-house RSVPs.",
};

export const OFFER_ERROR_MESSAGES: Record<string, string> = {
  proof_of_funds_must_be_verified: "Proof of funds must be verified before you can submit an offer.",
  only_attendees_can_submit_offers: "Attend the open house before submitting an offer.",
  offers_unlock_after_open_house: "Offers unlock after the open house has taken place.",
  sealed_bid_deadline_passed: "The sealed-bid deadline has passed.",
  sealed_bids_disabled_for_open_house: "Sealed bids are disabled for this open house.",
};

export const OPEN_HOUSE_SETTINGS_SELECT =
  "id, listing_id, timeslots, max_visitors_per_slot, max_total_visitors, require_proof_of_funds, min_proof_amount, require_investor_declaration, allow_sealed_bids, offer_deadline, broker_required, created_at, updated_at";

export const OPEN_HOUSE_REGISTRATIONS_SELECT = `
  *,
  profiles:requester_id (display_name, first_name, last_name, avatar_url)
`;

export const MY_OPEN_HOUSE_REGISTRATIONS_SELECT = `
  *,
  listings:listing_id (id, title, city, address, cover_image_url, open_house_date)
`;

export const OPEN_HOUSE_REGISTRATION_LOOKUP_SELECT = `
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
    open_house_transaction_type,
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
`;

export const OPEN_HOUSE_OFFERS_SELECT = `
  *,
  profiles:bidder_id (display_name)
`;

export const MY_OPEN_HOUSE_OFFERS_SELECT = `
  *,
  listings:listing_id (id, title, city, cover_image_url, open_house_date)
`;

export const OPEN_HOUSE_OFFER_LOOKUP_SELECT = `
  bidder_id,
  status,
  listings!inner(
    owner_id,
    open_house_date,
    open_house_settings (offer_deadline)
  )
`;

export const OPEN_HOUSE_REVEAL_LISTING_SELECT = `
  owner_id,
  open_house_date,
  open_house_settings
`;
