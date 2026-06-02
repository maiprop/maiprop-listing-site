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
