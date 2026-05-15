import { test } from "@playwright/test";

const KNOWN_PRODUCTION_PROJECT_REFS = new Set(["qvvicunqcrwpioqnvzxf"]);

type DestructiveLiveE2EDecision = { ok: boolean; reason: string };
type DestructiveLiveE2EContext = {
  allowlist: string[];
  projectRef: string | null;
};
type DestructiveLiveE2ECheck = (
  context: DestructiveLiveE2EContext,
) => DestructiveLiveE2EDecision | null;

const deny = (reason: string): DestructiveLiveE2EDecision => ({
  ok: false,
  reason,
});

const getAllowedDestructiveProjectRefs = (): string[] =>
  (process.env.E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS ?? "")
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean);

const destructiveLiveE2EChecks: DestructiveLiveE2ECheck[] = [
  () =>
    process.env.E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS === "true"
      ? null
      : deny(
          "Set E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS=true only for an isolated test project.",
        ),
  ({ projectRef }) =>
    projectRef
      ? null
      : deny("VITE_SUPABASE_URL must point at a real Supabase project."),
  ({ projectRef }) =>
    projectRef && KNOWN_PRODUCTION_PROJECT_REFS.has(projectRef)
      ? deny(
          `Refusing destructive E2E against known production Supabase project ${projectRef}.`,
        )
      : null,
  ({ allowlist }) =>
    allowlist.length > 0
      ? null
      : deny(
          "E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS must explicitly name the isolated destructive-test Supabase project.",
        ),
  ({ allowlist, projectRef }) =>
    projectRef && allowlist.includes(projectRef)
      ? null
      : deny(
          `Supabase project ${projectRef ?? "unknown"} is not in E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS.`,
        ),
];

export const getSupabaseProjectRef = (
  url = process.env.VITE_SUPABASE_URL ?? "",
): string | null => {
  const match = url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/i);
  return match?.[1] ?? null;
};

export const canRunDestructiveLiveE2E = (): DestructiveLiveE2EDecision => {
  const context: DestructiveLiveE2EContext = {
    allowlist: getAllowedDestructiveProjectRefs(),
    projectRef: getSupabaseProjectRef(),
  };
  const failedCheck = destructiveLiveE2EChecks
    .map((check) => check(context))
    .find((decision) => decision !== null);

  return (
    failedCheck ?? {
      ok: true,
      reason: "Destructive E2E explicitly enabled for this project.",
    }
  );
};

export const skipUnlessDestructiveLiveE2EAllowed = (): void => {
  const decision = canRunDestructiveLiveE2E();
  test.skip(!decision.ok, decision.reason);
};
