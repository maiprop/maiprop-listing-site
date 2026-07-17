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

const LIMIT_ERROR_MESSAGES: Record<string, string> = {
  saved_search_limit_reached: "You've reached your saved search limit. Upgrade to Pro for more saved searches.",
  search_alert_limit_reached: "You've reached your search alert limit. Upgrade to Pro for more alerts.",
  auction_alert_limit_reached: "You've reached your auction alert limit. Upgrade to Pro for more alerts.",
  viewing_limit_reached: "You've reached your monthly viewing limit. Upgrade or wait for the next monthly reset.",
  listing_limit_reached: "You've reached your active listing limit. Upgrade to Pro for more listings.",
  listing_not_allowed: "Your current plan does not include this listing type. Upgrade to Pro to continue.",
  contact_limit_reached: "You've reached your monthly contact limit. Upgrade to Pro for more property contacts.",
  open_house_rsvp_limit_reached: "You've reached your monthly open-house RSVP limit. Upgrade to Pro for unlimited RSVPs.",
};

function collectErrorText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return [
      value.message,
      "cause" in value ? collectErrorText(value.cause) : "",
    ].filter(Boolean).join(" ");
  }
  if (typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  return ["message", "details", "hint", "code", "error", "description"]
    .map((key) => collectErrorText(record[key]))
    .filter(Boolean)
    .join(" ");
}

export function getPlanLimitErrorMessage(err: unknown): string | null {
  const msg = collectErrorText(err);
  const lower = msg.toLowerCase();
  const matchedPattern = LIMIT_ERROR_PATTERNS.find(p => lower.includes(p));
  if (!matchedPattern) {
    return null;
  }
  if (matchedPattern === "viewing_limit_reached" && lower.includes("listing owner")) {
    return "The listing owner has reached their monthly viewing limit. Please contact the owner or try another listing.";
  }
  return LIMIT_ERROR_MESSAGES[matchedPattern] ?? "You've reached your plan limit. Upgrade to Pro for more.";
}

export function isPlanLimitError(err: unknown): boolean {
  return getPlanLimitErrorMessage(err) !== null;
}
