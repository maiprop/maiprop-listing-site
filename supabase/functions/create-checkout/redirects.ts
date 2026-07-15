const UNSAFE_REDIRECT_PREFIXES = ["//", "/\\"];

const hasUnsafeRedirectPrefix = (raw: string): boolean => {
  return UNSAFE_REDIRECT_PREFIXES.some((prefix) => raw.startsWith(prefix));
};

const REDIRECT_PATH_VALIDATORS = [
  (raw: string) => raw.length > 0,
  (raw: string) => raw.length <= 512,
  (raw: string) => raw.startsWith("/"),
  (raw: string) => !hasUnsafeRedirectPrefix(raw),
  (raw: string) => !/[\r\n\t]/.test(raw),
];

const isSafeRedirectPath = (raw: unknown): raw is string => { // skipcq: JS-R1005 - Redirect safety stays explicit because each validator covers a separate abuse case.
  return typeof raw !== "string"
    ? false
    : REDIRECT_PATH_VALIDATORS.every((validator) => validator(raw));
};

/** Accepts only same-origin absolute paths starting with "/" (and not "//" or "/\\").
 *  Returns null for anything else so callers fall back to a server-controlled default. */
export const sanitizeRedirectPath = (raw: unknown): string | null => {
  return isSafeRedirectPath(raw) ? raw : null;
};

/**
 * Adds Stripe's server-substituted Checkout Session placeholder to a safe
 * same-origin success path. Existing session parameters are discarded so a
 * caller cannot make post-checkout reconciliation inspect a different session.
 */
export const withCheckoutSessionId = (path: string): string => {
  const fragmentIndex = path.indexOf("#");
  const fragment = fragmentIndex >= 0 ? path.slice(fragmentIndex) : "";
  const pathAndQuery = fragmentIndex >= 0 ? path.slice(0, fragmentIndex) : path;
  const queryIndex = pathAndQuery.indexOf("?");
  const pathname = queryIndex >= 0
    ? pathAndQuery.slice(0, queryIndex)
    : pathAndQuery;
  const query = queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(query);
  params.delete("session_id");
  params.delete("checkout_session_id");
  const existingQuery = params.toString();
  const separator = existingQuery ? `?${existingQuery}&` : "?";

  return `${pathname}${separator}session_id={CHECKOUT_SESSION_ID}${fragment}`;
};
