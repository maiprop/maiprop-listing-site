import { APP_ORIGIN } from "@/lib/config";

export type OAuthIntent = "login" | "signup";

export interface OAuthCallbackParams {
  intent: OAuthIntent;
  next: string;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

const DEFAULT_NEXT: Record<OAuthIntent, string> = {
  login: "/dashboard",
  signup: "/onboarding",
};

const LOGIN_OAUTH_SIGNUP_ERROR_CODES = new Set(["signup_disabled"]);
const LOGIN_OAUTH_SIGNUP_ERROR_PHRASES = [
  "signups not allowed",
  "signup not allowed",
  "sign ups",
  "user not found",
  "not registered",
  "no account",
];

const isSafeLocalPathCandidate = (value: string | null | undefined): value is string =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.startsWith("/\\");

const trimPrefix = (value: string, prefix: string): string =>
  value.startsWith(prefix) ? value.slice(prefix.length) : value;

const parseLocalRedirectPath = (value: string, fallback: string): string => {
  try {
    const url = new URL(value, APP_ORIGIN);
    return url.origin === APP_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
};

export const safeRedirectPath = (
  value: string | null | undefined,
  fallback = "/dashboard",
): string => {
  if (!isSafeLocalPathCandidate(value)) {
    return fallback;
  }

  return parseLocalRedirectPath(value, fallback);
};

export const buildOAuthCallbackRedirectTo = (
  intent: OAuthIntent,
  next = DEFAULT_NEXT[intent],
): string => {
  const callback = new URL("/auth/callback", APP_ORIGIN);
  callback.searchParams.set("intent", intent);
  callback.searchParams.set("next", safeRedirectPath(next, DEFAULT_NEXT[intent]));
  return callback.toString();
};

export const parseOAuthCallbackParams = (
  search: string,
  hash: string,
): OAuthCallbackParams => {
  const searchParams = new URLSearchParams(trimPrefix(search, "?"));
  const hashParams = new URLSearchParams(trimPrefix(hash, "#"));
  const rawIntent = searchParams.get("intent");
  const intent: OAuthIntent = rawIntent === "signup" ? "signup" : "login";

  return {
    intent,
    next: safeRedirectPath(searchParams.get("next"), DEFAULT_NEXT[intent]),
    error: hashParams.get("error") ?? searchParams.get("error"),
    errorCode: hashParams.get("error_code") ?? searchParams.get("error_code"),
    errorDescription: hashParams.get("error_description") ?? searchParams.get("error_description"),
  };
};

export const shouldRouteLoginOAuthErrorToSignup = (
  params: Pick<OAuthCallbackParams, "error" | "errorCode" | "errorDescription">,
): boolean => {
  const code = params.errorCode?.toLowerCase() ?? "";
  if (LOGIN_OAUTH_SIGNUP_ERROR_CODES.has(code)) {
    return true;
  }

  const text = [params.error, params.errorCode, params.errorDescription]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return LOGIN_OAUTH_SIGNUP_ERROR_PHRASES.some((phrase) => text.includes(phrase));
};
