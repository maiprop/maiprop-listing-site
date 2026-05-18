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

export function buildOAuthCallbackRedirectTo(intent: OAuthIntent, next = DEFAULT_NEXT[intent]): string {
  const callback = new URL("/auth/callback", APP_ORIGIN);
  callback.searchParams.set("intent", intent);
  callback.searchParams.set("next", safeRedirectPath(next, DEFAULT_NEXT[intent]));
  return callback.toString();
}

export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  try {
    const url = new URL(value, APP_ORIGIN);
    if (url.origin !== APP_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function parseOAuthCallbackParams(search: string, hash: string): OAuthCallbackParams {
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
}

export function shouldRouteLoginOAuthErrorToSignup(params: Pick<OAuthCallbackParams, "error" | "errorCode" | "errorDescription">): boolean {
  const code = params.errorCode?.toLowerCase() ?? "";
  const text = [params.error, params.errorCode, params.errorDescription]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    code === "signup_disabled" ||
    text.includes("signups not allowed") ||
    text.includes("signup not allowed") ||
    text.includes("sign ups") ||
    text.includes("user not found") ||
    text.includes("not registered") ||
    text.includes("no account")
  );
}

function trimPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
