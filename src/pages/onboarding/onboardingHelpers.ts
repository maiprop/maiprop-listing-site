import type { Database } from "@/integrations/supabase/types";
import type { ParticipantId } from "@/lib/participantConfig";
import { PRO_CATEGORIES, type OnboardingStep } from "@/lib/onboardingConfig";

/**
 * Extracts a non-empty stripe_error string from log-role-switch's response body.
 * Returns null when the body is shaped unexpectedly or has no error.
 *
 * Defined as a `const` arrow function so DeepSource's `no-implicit-globals`
 * rule (which mis-fires on top-level `function` declarations in ES modules)
 * does not flag it as a global scope declaration.
 */
export const extractStripeError = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const value = (data as { stripe_error?: unknown }).stripe_error;
  return typeof value === "string" && value.length > 0 ? value : null;
};

export type ProfessionalCategory = Database["public"]["Enums"]["professional_category"];
export type ProfessionalInsert = Database["public"]["Tables"]["professionals"]["Insert"];
export type ProfessionalUpdate = Database["public"]["Tables"]["professionals"]["Update"];

export const isProfessionalCategory = (category: string): category is ProfessionalCategory =>
  PRO_CATEGORIES.some((item) => item.value === category);

export const parseServiceRate = (rate: string): number | null => {
  if (rate.trim() === "") return null;
  const parsed = Number(rate);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Reads the role-switch billing context written by Dashboard SettingsSection
 * before navigation. Returns null if the key is missing, malformed, or the
 * environment lacks sessionStorage. Never throws.
 *
 * Called twice synchronously during render — once for `switchCtx`, once for
 * `displaySwitchCtx` — so the role-switch context is available before any
 * effect fires (in particular, before the `onboarding_started` analytics
 * effect, which would otherwise always emit `source: "signup"`). The
 * subsequent mount cleanup effect deletes the sessionStorage key.
 *
 * Defined as a `const` arrow function so DeepSource's `no-implicit-globals`
 * rule does not flag it as a global scope declaration.
 */
export const readRoleSwitchCtx = (): { fromType: ParticipantId; hadActiveSub: boolean } | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem("role_switch_ctx");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fromType?: unknown; hadActiveSub?: unknown };
    if (typeof parsed.fromType !== "string") return null;
    return {
      fromType: parsed.fromType as ParticipantId,
      hadActiveSub: parsed.hadActiveSub === true,
    };
  } catch {
    return null;
  }
};

/**
 * Returns the participant_type when role and participant_type already agree
 * (i.e. the user has finished onboarding once and we should auto-skip the
 * pick-type step). Defined as a pure module-level helper so the inline
 * branching does not contribute to the Onboarding component's cyclomatic
 * complexity.
 */
export const resolvePresetType = (
  profile: { participant_type?: string | null; role?: string | null } | null | undefined
): string | null => { // skipcq: JS-R1005 - Preset resolution intentionally checks paired profile role fields together.
  if (!profile?.participant_type || !profile?.role) return null;
  return profile.participant_type === String(profile.role) ? profile.participant_type : null;
};

/**
 * The user is in their FIRST onboarding when role and participant_type are
 * not yet aligned. Pure module-level helper for the same reason as
 * `resolvePresetType` — keeps the branching out of the React component.
 */
export const isFirstOnboardingFor = (
  profile: { participant_type?: string | null; role?: string | null } | null | undefined
): boolean => resolvePresetType(profile) === null;

/**
 * Lookup from the current onboarding step to the step the back button
 * should navigate to. Replaces the chained ternary in the Onboarding
 * component, removing ~7 cyclomatic-complexity points from its body.
 * Steps not in this map have no back action (the back button hides).
 */
export const BACK_STEP_BY_STEP: Readonly<Partial<Record<OnboardingStep, OnboardingStep>>> = {
  "pick-participant-goal": "pick-type",
  "pick-pro-type": "pick-type",
  "developer-setup": "pick-type",
  "pro-category": "pick-type",
  "pro-verify": "pro-category",
  "pro-services": "pro-verify",
  "pro-availability": "pro-services",
  "pro-video": "pro-availability",
};
