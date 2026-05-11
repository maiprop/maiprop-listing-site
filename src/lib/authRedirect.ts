import { APP_ORIGIN } from "@/lib/config";

function normaliseOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function sanitizeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value === "string") {
    if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
      return value;
    }
    return fallback;
  }

  if (value && typeof value === "object" && "pathname" in value) {
    const candidate = value as { pathname?: unknown; search?: unknown; hash?: unknown };
    const pathname = typeof candidate.pathname === "string" ? candidate.pathname : fallback;
    const search = typeof candidate.search === "string" ? candidate.search : "";
    const hash = typeof candidate.hash === "string" ? candidate.hash : "";
    return sanitizeRedirectPath(`${pathname}${search}${hash}`, fallback);
  }

  return fallback;
}

export function appRedirectUrl(path: string): string {
  const safePath = sanitizeRedirectPath(path, "/dashboard");
  return `${normaliseOrigin(APP_ORIGIN)}${safePath}`;
}
