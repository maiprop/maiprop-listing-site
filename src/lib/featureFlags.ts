/**
 * Minimal feature-flag utility.
 *
 * This is intentionally zero-dependency and non-remote: flags live in
 * environment variables so they're immutable per-build, which is appropriate
 * for gradual rollouts via Cloudflare Pages branch deploys (`main`,
 * preview branches). If/when you need runtime toggles, swap this file for a
 * LaunchDarkly / OpenFeature / Unleash client and keep the same `useFlag`
 * API so callers don't change.
 *
 * Setting flags:
 *   .env                 VITE_FF_NEW_LISTING_CARD=1
 *   Cloudflare Pages     VITE_FF_NEW_LISTING_CARD=1 (Production or Preview env)
 *
 * A flag is ON when the value is one of: 1, true, yes, on (case-insensitive).
 * Anything else — including unset — is OFF.
 *
 * Usage:
 *
 *   import { isEnabled, useFlag } from "@/lib/featureFlags";
 *
 *   // In a component:
 *   const showNewCard = useFlag("NEW_LISTING_CARD");
 *
 *   // In a plain module:
 *   if (isEnabled("AI_AUTOCOMPLETE")) { ... }
 *
 * Naming: UPPER_SNAKE_CASE, without the `VITE_FF_` prefix.
 */

import {
  getRuntimeConfigSnapshot,
  getRuntimeValue,
} from "@/lib/runtimeConfig";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

export function isEnabled(name: string): boolean {
  const key = `VITE_FF_${name.toUpperCase()}`;
  const raw = getRuntimeValue(key);
  if (raw === undefined || raw === null) return false;
  return TRUTHY.has(String(raw).toLowerCase());
}

/**
 * Hook-shaped wrapper. Currently a thin proxy to `isEnabled` because flags are
 * build-time constants, but kept as a hook so remote-flag providers can drop
 * in later without changing call sites.
 */
export function useFlag(name: string): boolean {
  return isEnabled(name);
}

/** List every VITE_FF_* that Vite has inlined. Useful for a `/debug` panel. */
export function listFlags(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const env = {
    ...(import.meta.env as Record<string, string | undefined>),
    ...getRuntimeConfigSnapshot(),
  };
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITE_FF_")) {
      out[key.slice("VITE_FF_".length)] = TRUTHY.has(String(env[key]).toLowerCase());
    }
  }
  return out;
}
