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
export type RoleSwitchContext = {
  userId: string;
  fromType: ParticipantId;
  hadActiveSub: boolean;
  auditId: string;
};

type DurableRoleSwitchOperation = {
  userId: string;
  operationId: string;
  fromType: ParticipantId;
  hadActiveSub: boolean;
  status: "prepared" | "begun";
  createdAt: number;
};

export const ROLE_SWITCH_OPERATION_STORAGE_KEY =
  "maiprop_role_switch_operation_v1";

const ROLE_SWITCH_OPERATION_TTL_MS = 24 * 60 * 60 * 1000;
const ROLE_SWITCH_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_SWITCH_PARTICIPANTS = new Set<ParticipantId>([
  "buyer",
  "seller",
  "agent",
  "developer",
  "professional",
  "investor",
  "institutional",
]);

const isRoleSwitchUserId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128;

const parseDurableRoleSwitchOperation = (
  raw: string | null,
  now: number,
): DurableRoleSwitchOperation | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DurableRoleSwitchOperation>;
    if (
      !isRoleSwitchUserId(parsed.userId) ||
      typeof parsed.operationId !== "string" ||
      !ROLE_SWITCH_UUID_PATTERN.test(parsed.operationId) ||
      typeof parsed.fromType !== "string" ||
      !ROLE_SWITCH_PARTICIPANTS.has(parsed.fromType as ParticipantId) ||
      typeof parsed.hadActiveSub !== "boolean" ||
      (parsed.status !== "prepared" && parsed.status !== "begun") ||
      typeof parsed.createdAt !== "number" ||
      !Number.isFinite(parsed.createdAt) ||
      parsed.createdAt > now + 60_000 ||
      now - parsed.createdAt > ROLE_SWITCH_OPERATION_TTL_MS
    ) return null;
    return parsed as DurableRoleSwitchOperation;
  } catch {
    return null;
  }
};

const persistDurableRoleSwitchOperation = (
  operation: DurableRoleSwitchOperation,
): void => {
  if (typeof window === "undefined") {
    throw new Error("role_switch_storage_unavailable");
  }
  window.localStorage.setItem(
    ROLE_SWITCH_OPERATION_STORAGE_KEY,
    JSON.stringify(operation),
  );
  const persisted = parseDurableRoleSwitchOperation(
    window.localStorage.getItem(ROLE_SWITCH_OPERATION_STORAGE_KEY),
    Date.now(),
  );
  if (
    !persisted || persisted.operationId !== operation.operationId ||
    persisted.userId !== operation.userId
  ) {
    throw new Error("role_switch_storage_unavailable");
  }
};

export const prepareRoleSwitchOperation = ({
  userId,
  fromType,
  hadActiveSub,
  now = Date.now(),
  createId = () => crypto.randomUUID(),
}: {
  userId: string;
  fromType: ParticipantId;
  hadActiveSub: boolean;
  now?: number;
  createId?: () => string;
}): DurableRoleSwitchOperation => {
  if (typeof window === "undefined") {
    throw new Error("role_switch_storage_unavailable");
  }
  if (!isRoleSwitchUserId(userId)) {
    throw new Error("role_switch_user_invalid");
  }
  const existing = parseDurableRoleSwitchOperation(
    window.localStorage.getItem(ROLE_SWITCH_OPERATION_STORAGE_KEY),
    now,
  );
  if (existing?.userId === userId && existing.fromType === fromType) {
    return existing;
  }

  const operationId = createId();
  if (!ROLE_SWITCH_UUID_PATTERN.test(operationId)) {
    throw new Error("role_switch_operation_invalid");
  }
  const operation: DurableRoleSwitchOperation = {
    userId,
    operationId,
    fromType,
    hadActiveSub,
    status: "prepared",
    createdAt: now,
  };
  persistDurableRoleSwitchOperation(operation);
  return operation;
};

export const markRoleSwitchOperationBegun = (
  operationId: string,
  userId: string,
): void => {
  if (typeof window === "undefined") return;
  const operation = parseDurableRoleSwitchOperation(
    window.localStorage.getItem(ROLE_SWITCH_OPERATION_STORAGE_KEY),
    Date.now(),
  );
  if (
    !operation || operation.operationId !== operationId ||
    operation.userId !== userId
  ) {
    throw new Error("role_switch_operation_missing");
  }
  persistDurableRoleSwitchOperation({ ...operation, status: "begun" });
};

export const clearRoleSwitchOperation = (
  operationId: string | undefined,
  userId: string,
): void => {
  if (typeof window === "undefined") return;
  const operation = parseDurableRoleSwitchOperation(
    window.localStorage.getItem(ROLE_SWITCH_OPERATION_STORAGE_KEY),
    Date.now(),
  );
  if (!operation || operation.userId !== userId) return;
  if (operationId && operation.operationId !== operationId) return;
  window.localStorage.removeItem(ROLE_SWITCH_OPERATION_STORAGE_KEY);
};

const parseRoleSwitchContext = (
  raw: string | null,
  userId: string,
): RoleSwitchContext | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      userId?: unknown;
      fromType?: unknown;
      hadActiveSub?: unknown;
      auditId?: unknown;
    };
    if (
      parsed.userId !== userId ||
      typeof parsed.fromType !== "string" ||
      !ROLE_SWITCH_PARTICIPANTS.has(parsed.fromType as ParticipantId) ||
      typeof parsed.auditId !== "string" ||
      !ROLE_SWITCH_UUID_PATTERN.test(parsed.auditId)
    ) return null;
    return {
      userId,
      fromType: parsed.fromType as ParticipantId,
      hadActiveSub: parsed.hadActiveSub === true,
      auditId: parsed.auditId,
    };
  } catch {
    return null;
  }
};

export const readRoleSwitchCtx = (
  userId: string | null | undefined,
): RoleSwitchContext | null => {
  if (typeof window === "undefined" || !isRoleSwitchUserId(userId)) return null;
  const sessionContext = parseRoleSwitchContext(
    window.sessionStorage.getItem("role_switch_ctx"),
    userId,
  );
  if (sessionContext) return sessionContext;

  const durable = parseDurableRoleSwitchOperation(
    window.localStorage.getItem(ROLE_SWITCH_OPERATION_STORAGE_KEY),
    Date.now(),
  );
  if (durable?.status !== "begun" || durable.userId !== userId) return null;
  return {
    userId,
    fromType: durable.fromType,
    hadActiveSub: durable.hadActiveSub,
    auditId: durable.operationId,
  };
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
