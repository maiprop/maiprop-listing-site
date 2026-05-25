/**
 * Parse plan limit errors from Supabase/Postgres and return user-friendly messages.
 */

const LIMIT_ERROR_PATTERNS = [
  "saved_search_limit_reached",
  "search_alert_limit_reached",
  "auction_alert_limit_reached",
  "viewing_limit_reached",
  "listing_limit_reached",
  "listing_not_allowed",
  "contact_limit_reached",
  "open_house_rsvp_limit_reached",
];

export function getPlanLimitErrorMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const lower = msg.toLowerCase();
  if (lower.includes("contact_limit_reached")) {
    return "You've reached your monthly contact limit. Upgrade to Pro for more property contacts.";
  }
  if (lower.includes("open_house_rsvp_limit_reached")) {
    return "You've reached your monthly open-house RSVP limit. Upgrade to Pro for unlimited RSVPs.";
  }
  if (LIMIT_ERROR_PATTERNS.some(p => lower.includes(p))) {
    return "You've reached your plan limit. Upgrade to Pro for more.";
  }
  return null;
}

export function isPlanLimitError(err: unknown): boolean {
  return getPlanLimitErrorMessage(err) !== null;
}
