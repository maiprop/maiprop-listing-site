import {
  CF_PAGES_ORIGIN_RE,
  CHECKOUT_ALLOWED_ORIGINS,
  DEFAULT_CHECKOUT_ORIGIN,
} from "./constants.ts";

const getConfiguredAllowedOrigins = (): string[] => {
  const configured = Deno.env.get("CHECKOUT_ALLOWED_ORIGINS") ??
    Deno.env.get("ALLOWED_CHECKOUT_ORIGINS") ??
    "";
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const normalizeOrigin = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
};

const getSiteOrigin = (): string => {
  return normalizeOrigin(Deno.env.get("SITE_URL")) ?? DEFAULT_CHECKOUT_ORIGIN;
};

export const resolveCheckoutOrigin = (rawOrigin: string | null): string => {
  const siteOrigin = getSiteOrigin();
  const allowed = new Set([
    ...CHECKOUT_ALLOWED_ORIGINS,
    ...getConfiguredAllowedOrigins(),
    siteOrigin,
  ]);
  const origin = normalizeOrigin(rawOrigin);
  if (origin && (allowed.has(origin) || CF_PAGES_ORIGIN_RE.test(origin))) {
    return origin;
  }
  return siteOrigin;
};
