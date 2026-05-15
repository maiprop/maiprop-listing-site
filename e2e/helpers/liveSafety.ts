import { test } from "@playwright/test";

const KNOWN_PRODUCTION_PROJECT_REFS = new Set(["qvvicunqcrwpioqnvzxf"]);

type DestructiveLiveE2EDecision = { ok: boolean; reason: string };

const deny = (reason: string): DestructiveLiveE2EDecision => ({
  ok: false,
  reason,
});

const getAllowedDestructiveProjectRefs = (): string[] =>
  (process.env.E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS ?? "")
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean);

export const getSupabaseProjectRef = (
  url = process.env.VITE_SUPABASE_URL ?? "",
): string | null => {
  const match = url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/i);
  return match?.[1] ?? null;
};

export const canRunDestructiveLiveE2E = (): DestructiveLiveE2EDecision => {
  if (process.env.E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS !== "true") {
    return deny(
      "Set E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS=true only for an isolated test project.",
    );
  }

  const projectRef = getSupabaseProjectRef();
  if (!projectRef) {
    return deny("VITE_SUPABASE_URL must point at a real Supabase project.");
  }

  if (KNOWN_PRODUCTION_PROJECT_REFS.has(projectRef)) {
    return deny(
      `Refusing destructive E2E against known production Supabase project ${projectRef}.`,
    );
  }

  const allowlist = getAllowedDestructiveProjectRefs();
  if (allowlist.length === 0) {
    return deny(
      "E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS must explicitly name the isolated destructive-test Supabase project.",
    );
  }

  if (!allowlist.includes(projectRef)) {
    return deny(
      `Supabase project ${projectRef} is not in E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS.`,
    );
  }

  return {
    ok: true,
    reason: "Destructive E2E explicitly enabled for this project.",
  };
};

export const skipUnlessDestructiveLiveE2EAllowed = (): void => {
  const decision = canRunDestructiveLiveE2E();
  test.skip(!decision.ok, decision.reason);
};
