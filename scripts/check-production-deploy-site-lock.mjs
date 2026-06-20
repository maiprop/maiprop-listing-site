import { createHash } from "node:crypto";

export const SITE_LOCK_COOKIE_NAME = "maiprop_unlock";

const normalizeSecret = (value) => {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
};

export const getSiteLockPassword = (env = process.env) => {
  return (
    normalizeSecret(env.PRODUCTION_DEPLOY_SITE_LOCK_PASSWORD) ||
    normalizeSecret(env.SITE_LOCK_PASSWORD)
  );
};

export const sha256Hex = (input) => {
  return createHash("sha256").update(input).digest("hex");
};

export const getSiteLockCookieValue = async (password) => {
  return sha256Hex(password);
};

export const getSiteLockCookieHeader = async (password) => {
  return `${SITE_LOCK_COOKIE_NAME}=${await getSiteLockCookieValue(password)}`;
};

export const getSiteLockPlaywrightCookie = async (url, password) => {
  const parsed = new URL(url);
  return {
    name: SITE_LOCK_COOKIE_NAME,
    value: await getSiteLockCookieValue(password),
    domain: parsed.hostname,
    path: "/",
    httpOnly: true,
    secure: parsed.protocol === "https:",
    sameSite: "Lax",
  };
};

export const isSiteLockHtml = (text) => {
  return (
    /<title>\s*Maiprop\s+.\s+Private preview\s*<\/title>/i.test(text) ||
    (/Private preview/i.test(text) && /action=["']\/__unlock["']/i.test(text))
  );
};

export const isSiteLockPlainText = (text) => {
  return text.trim() === "Locked";
};

export const getSiteLockErrorMessage = (url) => {
  return [
    `${url} is behind the Cloudflare site-lock gate.`,
    "Set PRODUCTION_DEPLOY_SITE_LOCK_PASSWORD for the deploy smoke check,",
    "or clear SITE_LOCK_PASSWORD before running production health checks.",
  ].join(" ");
};

const entriesFromHeaders = (headers) => {
  if (!headers) return [];
  if (headers instanceof Headers) return Array.from(headers.entries());
  if (Array.isArray(headers)) return headers;
  return Object.entries(headers);
};

export const mergeHeaders = (...headerSets) => {
  const out = {};
  for (const headers of headerSets) {
    for (const [key, value] of entriesFromHeaders(headers)) {
      if (value == null) continue;
      out[key] = value;
    }
  }
  return out;
};
