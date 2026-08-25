import type { Session } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";
import { getExplicitParticipantTypeFromProfile } from "@/lib/participantConfig";

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

  const sessionId = params.get("checkout_session_id") ??
    params.get("session_id");
  return isCheckoutSessionId(sessionId) ? sessionId : null;
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
