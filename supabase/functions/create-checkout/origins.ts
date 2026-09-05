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
  // Match the staging origins accepted by the shared CORS policy, without
  // allowing production Checkout to redirect to staging or arbitrary branches.
  const isStagingOrigin = Deno.env.get("ENVIRONMENT") === "staging" &&
    origin !== null &&
    (origin === "https://maiprop-listing-site-staging.pages.dev" ||
      /^https:\/\/[0-9a-f]{8}\.maiprop-listing-site-staging\.pages\.dev$/.test(origin));
  if (origin && (allowed.has(origin) || CF_PAGES_ORIGIN_RE.test(origin) || isStagingOrigin)) {
    return origin;
  }
  return siteOrigin;
};
