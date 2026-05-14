import { test } from "@playwright/test";

const KNOWN_PRODUCTION_PROJECT_REFS = new Set([
  "qvvicunqcrwpioqnvzxf",
]);

export function getSupabaseProjectRef(url = process.env.VITE_SUPABASE_URL ?? ""): string | null {
  const match = url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/i);
  return match?.[1] ?? null;
}

export function canRunDestructiveLiveE2E(): { ok: boolean; reason: string } {
  if (process.env.E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS !== "true") {
    return {
      ok: false,
      reason: "Set E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS=true only for an isolated test project.",
    };
  }

  const projectRef = getSupabaseProjectRef();
  if (!projectRef) {
    return {
      ok: false,
      reason: "VITE_SUPABASE_URL must point at a real Supabase project.",
    };
  }

  if (KNOWN_PRODUCTION_PROJECT_REFS.has(projectRef)) {
    return {
      ok: false,
      reason: `Refusing destructive E2E against known production Supabase project ${projectRef}.`,
    };
  }

  const allowlist = (process.env.E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS ?? "")
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean);

  if (allowlist.length === 0) {
    return {
      ok: false,
      reason: "E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS must explicitly name the isolated destructive-test Supabase project.",
    };
  }

  if (!allowlist.includes(projectRef)) {
    return {
      ok: false,
      reason: `Supabase project ${projectRef} is not in E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS.`,
    };
  }

  return { ok: true, reason: "Destructive E2E explicitly enabled for this project." };
}

export function skipUnlessDestructiveLiveE2EAllowed() {
  const decision = canRunDestructiveLiveE2E();
  test.skip(!decision.ok, decision.reason);
}
