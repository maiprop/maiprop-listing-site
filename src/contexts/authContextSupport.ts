import type { Session } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";
import {
  getExplicitParticipantTypeFromProfile,
  type PricingAudienceId,
} from "@/lib/participantConfig";

export type Profile = Tables<"profiles">;

export type AuthorizationMembership = Pick<
  Tables<"organization_memberships">,
  "organization_id" | "role" | "status"
>;

export type ProfileFetchMode = "replace" | "coalesce";

export type InFlightProfileFetch = {
  userId: string;
  generation: number;
  promise: Promise<Profile | null>;
};

export type AuthSessionIdentity = {
  userId: string;
  sessionId: string | null;
};

export type DeferredAuthSession = {
  session: Session;
  identity: AuthSessionIdentity;
};

export type PendingAuthSignOut = {
  target: AuthSessionIdentity | null;
  phase: "signing_out" | "restoring";
  deferred: DeferredAuthSession | null;
  restoringSessionId: string | null;
  restoringUserId: string | null;
};

const BASE64_URL_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const CHECKOUT_SESSION_ID_RE = /^cs_(?:test|live)_[A-Za-z0-9_]{6,240}$/;
const SUBSCRIPTION_CHECK_TIMEOUT_MS = 6_500;
const SUBSCRIPTION_STALE_GRACE_MS = 30_000;

const decodeBase64UrlSegment = (segment: string): Uint8Array | null => {
  if (!BASE64_URL_SEGMENT_RE.test(segment) || segment.length % 4 === 1) return null;

  try {
    const base64 = segment
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(segment.length / 4) * 4, "=");
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};

export function sessionIdFromAccessToken(accessToken: string): string | null {
  if (typeof accessToken !== "string") return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;

  const decodedSegments = parts.map(decodeBase64UrlSegment);
  if (decodedSegments.some((segment) => segment === null)) return null;
  const payload = decodedSegments[1];
  if (!payload) return null;

  try {
    const decodedPayload = new TextDecoder("utf-8", { fatal: true }).decode(payload);
    const parsedPayload: unknown = JSON.parse(decodedPayload);
    if (!parsedPayload || typeof parsedPayload !== "object" || Array.isArray(parsedPayload)) {
      return null;
    }
    const sessionId = (parsedPayload as { session_id?: unknown }).session_id;
    return typeof sessionId === "string" && sessionId.trim().length > 0
      ? sessionId
      : null;
  } catch {
    return null;
  }
}

export const authSessionIdentityFor = (
  currentSession: Session | null,
): AuthSessionIdentity | null => {
  const currentUser = currentSession?.user;
  if (!currentUser) return null;

  return {
    userId: currentUser.id,
    sessionId: sessionIdFromAccessToken(currentSession.access_token),
  };
};

export const isKnownSameAuthSession = (
  left: AuthSessionIdentity | null,
  right: AuthSessionIdentity | null,
) => Boolean(
  left &&
  right &&
  left.userId === right.userId &&
  left.sessionId !== null &&
  right.sessionId !== null &&
  left.sessionId === right.sessionId,
);

export const isDefinitelyDifferentAuthSession = (
  left: AuthSessionIdentity | null,
  right: AuthSessionIdentity | null,
) => Boolean(
  left &&
  right &&
  (
    left.userId !== right.userId ||
    (left.sessionId !== null &&
      right.sessionId !== null &&
      left.sessionId !== right.sessionId)
  ),
);

export const deferredAuthSessionFor = (
  currentSession: Session | null,
): DeferredAuthSession | null => {
  const identity = authSessionIdentityFor(currentSession);
  if (
    !identity?.sessionId ||
    !currentSession ||
    !currentSession.access_token ||
    !currentSession.refresh_token
  ) return null;

  return { session: currentSession, identity };
};

export const buildAuthorizationFingerprint = (
  profile: Profile | null,
  memberships: readonly AuthorizationMembership[],
) => JSON.stringify({
  profile: profile
    ? {
        role: profile.role,
        participantType: profile.participant_type,
        platformAdmin: profile.is_platform_admin,
        investorMode: profile.investor_mode,
        forcedPro: profile.force_pro_access,
        subscriptionProductId: profile.subscription_product_id,
        roleSwitchInProgress: Boolean(profile.role_switch_in_progress_at),
        accountStatus: profile.account_status,
      }
    : null,
  memberships: [...memberships]
    .map(({ organization_id, role, status }) => ({
      organizationId: organization_id,
      role,
      status,
    }))
    .sort((left, right) => (
      left.organizationId.localeCompare(right.organizationId) ||
      left.role.localeCompare(right.role) ||
      left.status.localeCompare(right.status)
    )),
});

export interface SubscriptionState {
  subscribed: boolean;
  productId: string | null;
  planKey?: string | null;
  audience?: string | null;
  billingCycle?: string | null;
  subscriptionEnd: string | null;
  billingStatus?: string | null;
  source: "billing_state" | "investor" | "database" | "stripe";
  syncStatus: "synced" | "pending" | "timeout";
  /** Temporary fail-soft window after a transport/deadline failure. */
  staleUntil?: number | null;
  loading: boolean;
}

export type SubscriptionCheckoutReceipt = {
  checkout_session_id: string;
  user_id: string;
  kind: "subscription";
  product_id: string;
  plan_key: string;
  audience: PricingAudienceId;
  status: "active" | "trialing";
  subscription_end: string;
};

export type AddonCheckoutReceipt = {
  checkout_session_id: string;
  user_id: string;
  kind: "addon";
  addon_key: string;
  audience: PricingAudienceId;
  quantity: number;
};

export type CheckoutReceipt = SubscriptionCheckoutReceipt | AddonCheckoutReceipt;

export type SubscriptionRefreshOutcome =
  | { status: "verified"; checkoutSessionId: string; userId: string; receipt: CheckoutReceipt }
  | { status: "pending"; checkoutSessionId: string; userId: string; reason: "pending" | "timeout" | "receipt_unavailable" }
  | { status: "error"; checkoutSessionId: string | null; userId: string | null; reason: "invalid_checkout_id" | "missing_checkout_id" | "unauthenticated" | "request_failed" | "invalid_response" }
  | { status: "stale"; checkoutSessionId: string | null; userId: string | null }
  | { status: "refreshed"; checkoutSessionId: null; userId: string | null };

export type CheckoutReturnIdentity =
  | { status: "valid"; checkoutSessionId: string }
  | { status: "missing" | "invalid" | "conflict"; checkoutSessionId: null };

const PRICING_AUDIENCES = new Set<PricingAudienceId>([
  "participant", "agent", "developer", "professional", "investor", "institutional",
]);
const CHECKOUT_RECEIPT_ADDON_KEYS = new Set([
  "valuation_single", "valuation_bundle", "property_report_single",
  "neighbourhood_report_single", "neighbourhood_report_bundle",
  "featured_listing", "priority_placement", "featured_priority_bundle",
]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const isPricingAudience = (value: unknown): value is PricingAudienceId =>
  typeof value === "string" && PRICING_AUDIENCES.has(value as PricingAudienceId);

export function checkoutOutcomeFromResponse({
  data,
  error,
  checkoutSessionId,
  userId,
  audience,
}: {
  data: unknown;
  error: unknown;
  checkoutSessionId: string;
  userId: string;
  audience: PricingAudienceId | null;
}): SubscriptionRefreshOutcome {
  if (error) return { status: "error", checkoutSessionId, userId, reason: "request_failed" };
  if (!isRecord(data)) return { status: "error", checkoutSessionId, userId, reason: "invalid_response" };
  if (data.sync_status === "timeout") return { status: "pending", checkoutSessionId, userId, reason: "timeout" };
  if (data.sync_status === "pending") return { status: "pending", checkoutSessionId, userId, reason: "pending" };
  const rawReceipt = data.verified_checkout;
  if (rawReceipt === undefined && data.sync_status !== "synced") {
    return { status: "pending", checkoutSessionId, userId, reason: "receipt_unavailable" };
  }
  if (rawReceipt === undefined) {
    return { status: "pending", checkoutSessionId, userId, reason: "receipt_unavailable" };
  }
  if (data.sync_status !== "synced" || !isRecord(rawReceipt) ||
      rawReceipt.checkout_session_id !== checkoutSessionId || rawReceipt.user_id !== userId ||
      !isPricingAudience(rawReceipt.audience)) {
    return { status: "error", checkoutSessionId, userId, reason: "invalid_response" };
  }

  if (rawReceipt.kind === "subscription") {
    const end = isNonEmptyString(rawReceipt.subscription_end)
      ? Date.parse(rawReceipt.subscription_end)
      : Number.NaN;
    if (
      !audience || rawReceipt.audience !== audience ||
      !isNonEmptyString(rawReceipt.product_id) || !isNonEmptyString(rawReceipt.plan_key) ||
      (rawReceipt.status !== "active" && rawReceipt.status !== "trialing") ||
      !Number.isFinite(end) || end <= Date.now() || data.source !== "billing_state" ||
      data.subscribed !== true || data.product_id !== rawReceipt.product_id ||
      data.plan_key !== rawReceipt.plan_key || data.audience !== rawReceipt.audience ||
      data.status !== rawReceipt.status || data.subscription_end !== rawReceipt.subscription_end
    ) return { status: "error", checkoutSessionId, userId, reason: "invalid_response" };
    return {
      status: "verified",
      checkoutSessionId,
      userId,
      receipt: rawReceipt as SubscriptionCheckoutReceipt,
    };
  }

  if (
    rawReceipt.kind !== "addon" ||
    !isNonEmptyString(rawReceipt.addon_key) ||
    !CHECKOUT_RECEIPT_ADDON_KEYS.has(rawReceipt.addon_key) ||
    !Number.isInteger(rawReceipt.quantity) || Number(rawReceipt.quantity) < 1
  ) return { status: "error", checkoutSessionId, userId, reason: "invalid_response" };
  return {
    status: "verified",
    checkoutSessionId,
    userId,
    receipt: rawReceipt as AddonCheckoutReceipt,
  };
}

export const emptySubscriptionState = (): SubscriptionState => ({
  subscribed: false,
  productId: null,
  planKey: null,
  audience: null,
  billingCycle: null,
  subscriptionEnd: null,
  billingStatus: null,
  source: "database",
  syncStatus: "synced",
  loading: false,
});

export const unavailableSubscriptionState = (
  previous: SubscriptionState,
  now = Date.now(),
): SubscriptionState => {
  const parsedEnd = previous.subscriptionEnd
    ? Date.parse(previous.subscriptionEnd)
    : null;
  const entitlementExpired = parsedEnd !== null &&
    (!Number.isFinite(parsedEnd) || parsedEnd <= now);

  if (!previous.subscribed || entitlementExpired) {
    return {
      ...emptySubscriptionState(),
      syncStatus: "timeout",
    };
  }

  const existingBoundary = previous.syncStatus === "timeout" &&
      typeof previous.staleUntil === "number"
    ? previous.staleUntil
    : null;
  const staleUntil = existingBoundary ?? now + SUBSCRIPTION_STALE_GRACE_MS;
  if (staleUntil <= now) {
    return {
      ...emptySubscriptionState(),
      syncStatus: "timeout",
    };
  }

  return {
    ...previous,
    syncStatus: "timeout",
    staleUntil,
    loading: false,
  };
};

export const withSubscriptionDeadline = async <T,>(promise: Promise<T>): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Subscription check timed out")),
          SUBSCRIPTION_CHECK_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const checkoutSessionIdForReconciliation = (): string | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const checkoutSucceeded = params.get("checkout") === "success" ||
    params.get("checkout") === "trial_started" ||
    params.get("pro") === "success";
  if (!checkoutSucceeded) return null;

  const identity = checkoutReturnIdentity(params);
  return identity.status === "valid" ? identity.checkoutSessionId : null;
};

export const checkoutReturnIdentity = (
  params: URLSearchParams,
): CheckoutReturnIdentity => {
  const checkoutSessionId = params.get("checkout_session_id");
  const sessionId = params.get("session_id");
  if (checkoutSessionId && sessionId && checkoutSessionId !== sessionId) {
    return { status: "conflict", checkoutSessionId: null };
  }
  const candidate = checkoutSessionId ?? sessionId;
  if (!candidate) return { status: "missing", checkoutSessionId: null };
  const normalized = candidate.trim();
  return isCheckoutSessionId(normalized)
    ? { status: "valid", checkoutSessionId: normalized }
    : { status: "invalid", checkoutSessionId: null };
};

export const isCheckoutSessionId = (
  sessionId: string | null | undefined,
): sessionId is string => Boolean(sessionId && CHECKOUT_SESSION_ID_RE.test(sessionId));

export function profileRoleSwitchInProgress(
  profile: { role_switch_in_progress_at?: string | null } | null,
): boolean {
  return Boolean(profile?.role_switch_in_progress_at);
}

export function profileNeedsOnboarding(profile: Profile | null): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return false;
  if (profileRoleSwitchInProgress(profile)) return true;
  const explicitType = getExplicitParticipantTypeFromProfile(profile);
  const roleText = profile.role ? String(profile.role) : null;
  // Onboarding is complete only when both role + participant_type are explicitly set.
  // This prevents implicit defaults from being treated as intentional role choice.
  return !(explicitType && roleText && explicitType === roleText);
}
