/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { logger } from "@/lib/logger";
import { APP_ORIGIN } from "@/lib/config";
import { validatePassword } from "@/lib/passwordPolicy";
import { recordUserAuthActivity, type AuthActivityEventType } from "@/lib/authActivity";
import {
  parseMutationInput,
  profileUpdateMutationSchema,
  signUpProfileUpdateMutationSchema,
} from "@/lib/mutationSchemas";
import { appQueryClient } from "@/lib/appQueryClient";
import {
  transitionQueryAuthorization,
  transitionQueryIdentity,
} from "@/lib/identityQueryBoundary";
import {
  authSessionIdentityFor,
  buildAuthorizationFingerprint,
  checkoutSessionIdForReconciliation,
  deferredAuthSessionFor,
  emptySubscriptionState,
  isDefinitelyDifferentAuthSession,
  isCheckoutSessionId,
  isKnownSameAuthSession,
  profileNeedsOnboarding,
  unavailableSubscriptionState,
  withSubscriptionDeadline,
} from "./authContextSupport";
import type {
  AuthSessionIdentity,
  InFlightProfileFetch,
  PendingAuthSignOut,
  Profile,
  ProfileFetchMode,
  SubscriptionState,
} from "./authContextSupport";

export {
  buildAuthorizationFingerprint,
  profileNeedsOnboarding,
  profileRoleSwitchInProgress,
  sessionIdFromAccessToken,
  unavailableSubscriptionState,
} from "./authContextSupport";
export type { Profile, SubscriptionState } from "./authContextSupport";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** True while the profile row is being fetched after auth — distinct from auth loading */
  profileLoading: boolean;
  subscription: SubscriptionState;
  /** True when a newly-signed-up user hasn't completed onboarding yet */
  needsOnboarding: boolean;
  signUp: (
    email: string,
    password: string,
    meta: {
      full_name: string;
      business_name?: string;
      tax_id?: string;
      phone?: string;
      license_number?: string;
    },
  ) => Promise<{ error: Error | null; needsEmailConfirm: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (
    updates: Partial<Profile>,
  ) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: (checkoutSessionId?: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SUBSCRIPTION_RETRY_DELAYS_MS = [10_000, 15_000] as const;

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionState>(emptySubscriptionState);

  useEffect(() => {
    const staleUntil = subscription.staleUntil;
    if (!staleUntil) return;

    const expireStaleGrant = () => {
      setSubscription((current) => {
        if (current.staleUntil !== staleUntil) return current;
        return {
          ...emptySubscriptionState(),
          syncStatus: "timeout",
        };
      });
    };
    const remaining = staleUntil - Date.now();
    if (remaining <= 0) {
      expireStaleGrant();
      return;
    }
    const timeoutId = setTimeout(expireStaleGrant, remaining);
    return () => clearTimeout(timeoutId);
  }, [subscription.staleUntil]);

  // Guard: discard profile fetch results that belong to a previous user session
  const expectedUserIdRef = useRef<string | null>(null);
  const profileFetchGenerationRef = useRef(0);
  const profileFetchInProgressRef = useRef<InFlightProfileFetch | null>(null);
  // Subscription work is scoped to one auth identity and generation. A delayed
  // response from a prior account can never update the current account.
  const expectedSubscriptionUserIdRef = useRef<string | null>(null);
  const subscriptionGenerationRef = useRef(0);
  const subscriptionRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionRetryAttemptRef = useRef(0);
  const checkSubscriptionRef = useRef<
    ((currentSession: Session | null, checkoutSessionId?: string | null) => Promise<void>) | null
  >(null);
  const subCheckInProgressRef = useRef<{
    userId: string;
    generation: number;
    checkoutSessionId: string | null;
    promise: Promise<void>;
  } | null>(null);
  const authEventGenerationRef = useRef(0);
  // This is intentionally independent from profile fetch generations. A profile
  // refresh must not make an already-started logout lose authority over the
  // current auth session.
  const authSessionEpochRef = useRef(0);
  const authSessionIdentityRef = useRef<AuthSessionIdentity | null>(null);
  const pendingAuthSignOutRef = useRef<PendingAuthSignOut | null>(null);
  const authMutationTailRef = useRef<Promise<void>>(Promise.resolve());
  // Guard: avoid duplicate auth telemetry from INITIAL_SESSION + getSession races.
  const lastAuthActivityRef = useRef<{ key: string; at: number } | null>(null);

  const adoptAuthSessionIdentity = useCallback((currentSession: Session | null) => {
    const nextIdentity = authSessionIdentityFor(currentSession);
    const previousIdentity = authSessionIdentityRef.current;
    if (!nextIdentity) {
      if (previousIdentity) authSessionEpochRef.current += 1;
      authSessionIdentityRef.current = null;
      return;
    }

    // A malformed same-user event cannot prove a new session. Retaining the
    // last known ID lets a later well-formed event still prove a real boundary.
    if (
      previousIdentity?.userId === nextIdentity.userId &&
      previousIdentity.sessionId !== null &&
      nextIdentity.sessionId === null
    ) return;

    if (!previousIdentity || isDefinitelyDifferentAuthSession(previousIdentity, nextIdentity)) {
      authSessionEpochRef.current += 1;
    }
    authSessionIdentityRef.current = nextIdentity;
  }, []);

  const enqueueAuthMutation = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = authMutationTailRef.current.then(operation, operation);
    authMutationTailRef.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);

  const didAuthSessionChangeSince = useCallback((
    target: AuthSessionIdentity | null,
    epoch: number,
  ) => {
    if (authSessionEpochRef.current === epoch) return false;
    const current = authSessionIdentityRef.current;
    if (target === null || current === null) return target !== current;
    return isDefinitelyDifferentAuthSession(target, current);
  }, []);

  const shouldSuppressAuthStateChange = useCallback((
    event: string,
    currentSession: Session | null,
  ) => {
    const pending = pendingAuthSignOutRef.current;
    if (!pending || event === "SIGNED_OUT" || !currentSession) return false;

    const incoming = deferredAuthSessionFor(currentSession);
    if (pending.phase === "signing_out") {
      if (isKnownSameAuthSession(pending.target, incoming?.identity ?? null)) return true;
      if (
        incoming &&
        (!pending.target || isDefinitelyDifferentAuthSession(pending.target, incoming.identity))
      ) {
        pending.deferred = incoming;
      }
      return true;
    }

    if (!incoming) return true;
    const isMatchingRestoreEvent =
      (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
      pending.restoringSessionId === incoming.identity.sessionId &&
      pending.restoringUserId === incoming.identity.userId;
    if (isMatchingRestoreEvent) return false;
    const restoring = pending.deferred;
    if (!restoring) return true;
    if (isDefinitelyDifferentAuthSession(restoring.identity, incoming.identity)) {
      pending.deferred = incoming;
    }
    return true;
  }, []);

  const cancelSubscriptionRetry = useCallback((resetAttempts = false) => {
    if (subscriptionRetryTimerRef.current) {
      clearTimeout(subscriptionRetryTimerRef.current);
      subscriptionRetryTimerRef.current = null;
    }
    if (resetAttempts) subscriptionRetryAttemptRef.current = 0;
  }, []);

  const scheduleSubscriptionRetry = useCallback((
    currentSession: Session,
    userId: string,
    generation: number,
  ) => {
    if (subscriptionRetryTimerRef.current) return;
    const delay = SUBSCRIPTION_RETRY_DELAYS_MS[subscriptionRetryAttemptRef.current];
    if (delay === undefined) return;
    subscriptionRetryAttemptRef.current += 1;
    subscriptionRetryTimerRef.current = setTimeout(() => {
      subscriptionRetryTimerRef.current = null;
      if (
        expectedSubscriptionUserIdRef.current !== userId ||
        subscriptionGenerationRef.current !== generation
      ) return;
      void checkSubscriptionRef.current?.(currentSession);
    }, delay);
  }, []);

  const fetchProfile = useCallback((
    userId: string,
    mode: ProfileFetchMode = "replace",
  ): Promise<Profile | null> => {
    const existingFetch = profileFetchInProgressRef.current;
    const currentGeneration = profileFetchGenerationRef.current;
    if (
      mode === "coalesce" &&
      existingFetch?.userId === userId &&
      existingFetch.generation === currentGeneration &&
      expectedUserIdRef.current === userId
    ) {
      return existingFetch.promise;
    }

    if (mode === "replace" || expectedUserIdRef.current !== userId) {
      expectedUserIdRef.current = userId;
      profileFetchGenerationRef.current += 1;
    }
    const fetchGeneration = profileFetchGenerationRef.current;
    setProfileLoading(true);

    const inFlight: InFlightProfileFetch = {
      userId,
      generation: fetchGeneration,
      promise: null as unknown as Promise<Profile | null>,
    };
    const fetchAttempt = (() => {
      try {
        const profileQuery = supabase
          .from("profiles")
          .select("*")
          .eq("user_id", userId)
          .single();
        const membershipQuery = supabase
          .from("organization_memberships")
          .select("organization_id, role, status")
          .eq("user_id", userId)
          .eq("status", "active");
        return {
          installSlot: true,
          promise: Promise.all([profileQuery, membershipQuery]).then(([
            profileResult,
            membershipResult,
          ]) => {
            // Discard stale result if the auth user or fetch generation changed.
            if (
              expectedUserIdRef.current !== userId ||
              profileFetchGenerationRef.current !== fetchGeneration
            ) return null;
            const nextProfile: Profile | null = profileResult.data;
            const memberships = membershipResult.data ?? [];
            if (profileResult.error) {
              logger.warn("Profile fetch failed:", profileResult.error);
            }
            if (membershipResult.error) {
              logger.warn("Organization membership fetch failed:", membershipResult.error);
            }
            transitionQueryAuthorization(
              appQueryClient,
              userId,
              buildAuthorizationFingerprint(nextProfile, memberships),
            );
            setProfile(nextProfile);
            return profileResult.data;
          }).finally(() => {
            if (profileFetchInProgressRef.current === inFlight) {
              profileFetchInProgressRef.current = null;
            }
            if (
              expectedUserIdRef.current === userId &&
              profileFetchGenerationRef.current === fetchGeneration
            ) {
              setProfileLoading(false);
            }
          }),
        };
      } catch (err) {
        if (
          expectedUserIdRef.current === userId &&
          profileFetchGenerationRef.current === fetchGeneration
        ) {
          setProfileLoading(false);
        }
        return {
          installSlot: false,
          promise: Promise.reject<Profile | null>(err),
        };
      }
    })();
    if (!fetchAttempt.installSlot) return fetchAttempt.promise;
    inFlight.promise = fetchAttempt.promise;
    profileFetchInProgressRef.current = inFlight;
    return inFlight.promise;
  }, []);

  const adoptSubscriptionUser = useCallback((userId: string | null) => {
    if (expectedSubscriptionUserIdRef.current === userId) return false;
    cancelSubscriptionRetry(true);
    expectedSubscriptionUserIdRef.current = userId;
    subscriptionGenerationRef.current += 1;
    setSubscription(emptySubscriptionState());
    return true;
  }, [cancelSubscriptionRetry]);

  const checkSubscription = useCallback(
    async (
      currentSession: Session | null,
      checkoutSessionId: string | null = null,
    ) => {
      if (!currentSession) {
        adoptSubscriptionUser(null);
        return;
      }
      const userId = currentSession.user.id;
      const generation = subscriptionGenerationRef.current;
      if (expectedSubscriptionUserIdRef.current !== userId) return;

      while (true) {
        const inFlight = subCheckInProgressRef.current;
        if (
          !inFlight ||
          inFlight.userId !== userId ||
          inFlight.generation !== generation
        ) break;
        if (!checkoutSessionId) return;
        const sameExactSession = inFlight.checkoutSessionId === checkoutSessionId;
        await inFlight.promise;
        if (
          expectedSubscriptionUserIdRef.current !== userId ||
          subscriptionGenerationRef.current !== generation
        ) return;
        if (sameExactSession) return;
      }

      let releaseCheck = () => {};
      const currentCheck = new Promise<void>((resolve) => {
        releaseCheck = resolve;
      });
      const currentWork = {
        userId,
        generation,
        checkoutSessionId,
        promise: currentCheck,
      };
      subCheckInProgressRef.current = currentWork;
      cancelSubscriptionRetry();
      setSubscription((prev) => ({ ...prev, loading: true }));
      let shouldRetry = false;
      try {
        const { data, error } = await withSubscriptionDeadline(
          supabase.functions.invoke(
            "check-subscription",
            checkoutSessionId
              ? { body: { checkout_session_id: checkoutSessionId } }
              : {},
          ),
        );
        if (
          expectedSubscriptionUserIdRef.current !== userId ||
          subscriptionGenerationRef.current !== generation
        ) return;
        if (!error && data) {
          if (data.source === "deadline" && data.sync_status === "timeout") {
            shouldRetry = true;
            setSubscription((prev) => unavailableSubscriptionState(prev));
          } else {
            const nextSubscription: SubscriptionState = {
              subscribed: data.subscribed ?? false,
              productId: data.product_id ?? null,
              planKey: typeof data.plan_key === "string" ? data.plan_key : null,
              audience: typeof data.audience === "string" ? data.audience : null,
              billingCycle: typeof data.billing_cycle === "string" ? data.billing_cycle : null,
              subscriptionEnd: data.subscription_end ?? null,
              billingStatus: typeof data.status === "string" ? data.status : null,
              source: data.source === "billing_state" ||
                  data.source === "investor" || data.source === "stripe"
                ? data.source
                : "database",
              syncStatus: data.sync_status === "pending" || data.sync_status === "timeout"
                ? data.sync_status
                : "synced",
              loading: false,
            };
            if (nextSubscription.syncStatus === "timeout") {
              shouldRetry = true;
              setSubscription((previous) => {
                const sameGrant = previous.productId === nextSubscription.productId &&
                  previous.source === nextSubscription.source;
                return unavailableSubscriptionState({
                  ...nextSubscription,
                  staleUntil: sameGrant ? previous.staleUntil : null,
                });
              });
            } else {
              cancelSubscriptionRetry(true);
              setSubscription(nextSubscription);
            }
          }
        } else {
          shouldRetry = true;
          setSubscription((prev) => unavailableSubscriptionState(prev));
        }
      } catch (err: unknown) {
        shouldRetry = true;
        logger.warn(
          "[AuthContext] checkSubscription failed:",
          err instanceof Error ? err.message : err,
        );
        if (
          expectedSubscriptionUserIdRef.current === userId &&
          subscriptionGenerationRef.current === generation
        ) {
          setSubscription((prev) => unavailableSubscriptionState(prev));
        }
      } finally {
        if (subCheckInProgressRef.current === currentWork) {
          subCheckInProgressRef.current = null;
        }
        releaseCheck();
        if (shouldRetry) {
          scheduleSubscriptionRetry(currentSession, userId, generation);
        }
      }
    },
    [
      adoptSubscriptionUser,
      cancelSubscriptionRetry,
      scheduleSubscriptionRetry,
    ],
  );
  checkSubscriptionRef.current = checkSubscription;

  const recordAuthActivity = useCallback(
    (eventType: AuthActivityEventType, currentSession: Session | null, source: string) => {
      if (!currentSession?.user) return;
      const key = [
        eventType,
        currentSession.user.id,
        currentSession.expires_at ?? "no-expiry",
      ].join(":");
      const now = Date.now();
      if (lastAuthActivityRef.current?.key === key && now - lastAuthActivityRef.current.at < 90_000) return;
      lastAuthActivityRef.current = { key, at: now };

      void recordUserAuthActivity({
        eventType,
        metadata: {
          source,
          expires_at: currentSession.expires_at ?? null,
        },
      });
    },
    [],
  );

  const eventToAuthActivity = useCallback((event: string): AuthActivityEventType | null => {
    if (event === "SIGNED_IN") return "sign_in";
    if (event === "INITIAL_SESSION") return "session_restored";
    if (event === "TOKEN_REFRESHED") return "token_refreshed";
    if (event === "USER_UPDATED") return "user_updated";
    if (event === "PASSWORD_RECOVERY") return "password_recovery";
    return null;
  }, []);

  useEffect(() => {
    // Safety: never block the app for more than 8s if Supabase/auth hangs
    const SAFETY_MS = 8_000;
    const safetyTimer = setTimeout(() => setLoading(false), SAFETY_MS);

    // onAuthStateChange is the single source of truth for auth state.
    // CRITICAL: set loading=false immediately so the UI unblocks, then
    // fetch profile + subscription in the background without blocking navigation.
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (shouldSuppressAuthStateChange(_event, sess)) return;
      authEventGenerationRef.current += 1;
      adoptAuthSessionIdentity(sess);
      transitionQueryIdentity(appQueryClient, sess?.user.id ?? null);
      setSession(sess);
      setUser(sess?.user ?? null);

      if (sess?.user) {
        const userChanged = adoptSubscriptionUser(sess.user.id);
        if (userChanged) setProfile(null);
        // Unblock UI immediately — profile arrives shortly after
        setLoading(false);
        // Non-blocking: profile and subscription load in background
        const profileFetchMode: ProfileFetchMode = _event === "INITIAL_SESSION"
          ? "coalesce"
          : "replace";
        fetchProfile(sess.user.id, profileFetchMode).catch((err) => {
          logger.warn("Profile fetch failed:", err);
        });
        // setTimeout(0) avoids a Supabase deadlock when invoking functions
        // inside onAuthStateChange; the dedup ref prevents concurrent calls.
        setTimeout(() => checkSubscription(sess), 0);
        const authActivityType = eventToAuthActivity(_event);
        if (authActivityType) {
          setTimeout(() => recordAuthActivity(authActivityType, sess, "on_auth_state_change"), 0);
        }
      } else {
        // Clear all user-scoped state on sign-out
        profileFetchGenerationRef.current += 1;
        profileFetchInProgressRef.current = null;
        expectedUserIdRef.current = null;
        adoptSubscriptionUser(null);
        setProfile(null);
        setProfileLoading(false);
        setLoading(false);
      }
    });

    // Restore session from storage on mount.
    // Do not rely solely on onAuthStateChange here: on a hard reload with an
    // already-authenticated user, the event can lag behind initial route
    // rendering and leave ProtectedRoute stuck on its loading shell.
    const restoreAuthGeneration = authEventGenerationRef.current;
    supabase.auth
      .getSession()
      .then(({ data: { session: sess } }) => {
        if (authEventGenerationRef.current !== restoreAuthGeneration) return;
        if (shouldSuppressAuthStateChange("get_session_restore", sess)) return;
        adoptAuthSessionIdentity(sess);
        if (!sess) {
          transitionQueryIdentity(appQueryClient, null);
          // No session — stop loading, let login page show
          setLoading(false);
          return;
        }

        transitionQueryIdentity(appQueryClient, sess.user.id);
        setSession(sess);
        setUser(sess.user);
        const userChanged = adoptSubscriptionUser(sess.user.id);
        if (userChanged) setProfile(null);
        setLoading(false);

        fetchProfile(sess.user.id, "coalesce").catch((err) => {
          logger.warn("Profile fetch failed during session restore:", err);
        });
        checkSubscription(
          sess,
          checkoutSessionIdForReconciliation(),
        ).catch((err: unknown) => {
          logger.warn(
            "[AuthContext] subscription restore failed:",
            err instanceof Error ? err.message : err,
          );
        });
        recordAuthActivity("session_restored", sess, "get_session_restore");
      })
      .catch(() => {
        if (authEventGenerationRef.current === restoreAuthGeneration) {
          setLoading(false);
        }
      });

    // Refresh subscription every 5 minutes
    const interval = setInterval(
      () => {
        supabase.auth
          .getSession()
          .then(({ data: { session: sess } }) => {
            if (sess) checkSubscription(sess);
          })
          .catch((err: unknown) =>
            logger.warn(
              "[AuthContext] session refresh failed:",
              err instanceof Error ? err.message : err,
            ),
          );
      },
      5 * 60 * 1000,
    );

    return () => {
      authEventGenerationRef.current += 1;
      authSessionEpochRef.current += 1;
      authSessionIdentityRef.current = null;
      const pendingAuthSignOut = pendingAuthSignOutRef.current;
      if (pendingAuthSignOut) {
        pendingAuthSignOut.deferred = null;
        pendingAuthSignOut.restoringSessionId = null;
        pendingAuthSignOut.restoringUserId = null;
      }
      pendingAuthSignOutRef.current = null;
      profileFetchGenerationRef.current += 1;
      profileFetchInProgressRef.current = null;
      expectedUserIdRef.current = null;
      clearTimeout(safetyTimer);
      cancelSubscriptionRetry(true);
      authSub.unsubscribe();
      clearInterval(interval);
    };
  }, [
    fetchProfile,
    checkSubscription,
    eventToAuthActivity,
    recordAuthActivity,
    adoptSubscriptionUser,
    adoptAuthSessionIdentity,
    cancelSubscriptionRetry,
    shouldSuppressAuthStateChange,
  ]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    const refreshAuthorization = () => {
      void fetchProfile(userId, "replace").catch((err: unknown) => {
        logger.warn(
          "Authorization context refresh failed:",
          err instanceof Error ? err.message : err,
        );
      });
    };
    const channel = supabase
      .channel(`authorization-context:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${userId}`,
        },
        refreshAuthorization,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "organization_memberships",
          filter: `user_id=eq.${userId}`,
        },
        refreshAuthorization,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchProfile, user?.id]);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      meta: {
        full_name: string;
        business_name?: string;
        tax_id?: string;
        phone?: string;
        license_number?: string;
      },
    ) => {
      const pw = validatePassword(password);
      if (!pw.valid) {
        return {
          error: new Error(pw.error ?? "Password does not meet requirements."),
          needsEmailConfirm: false,
        };
      }

      return enqueueAuthMutation(async () => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: meta.full_name },
            emailRedirectTo: `${APP_ORIGIN}/onboarding`,
          },
        });
        const profileUpdates = {
          ...(meta.phone ? { phone: meta.phone } : {}),
        };
        if (data.user && !error && Object.keys(profileUpdates).length > 0) {
          const payload = parseMutationInput(
            signUpProfileUpdateMutationSchema,
            { userId: data.user.id, updates: profileUpdates },
            "signup profile update",
          );
          await supabase
            .from("profiles")
            .update(payload.updates)
            .eq("user_id", payload.userId);
        }
        // needsEmailConfirm = signup succeeded but no session yet (email confirmation required)
        const needsEmailConfirm = !error && !!data.user && !data.session;
        return { error: error as Error | null, needsEmailConfirm };
      });
    },
    [enqueueAuthMutation],
  );

  const signIn = useCallback((email: string, password: string) => {
    return enqueueAuthMutation(async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error as Error | null };
    });
  }, [enqueueAuthMutation]);

  const signOut = useCallback(() => {
    const signOutTarget = authSessionIdentityRef.current;
    const signOutSessionEpoch = authSessionEpochRef.current;
    transitionQueryIdentity(appQueryClient, null);
    profileFetchGenerationRef.current += 1;
    profileFetchInProgressRef.current = null;
    expectedUserIdRef.current = null;
    adoptSubscriptionUser(null);
    setProfile(null);
    setProfileLoading(false);
    try {
      void Promise.resolve(recordUserAuthActivity({
        eventType: "sign_out",
        metadata: { source: "sign_out" },
      })).catch(() => {
        logger.warn("Sign-out activity recording failed");
      });
    } catch {
      logger.warn("Sign-out activity recording failed");
    }

    return enqueueAuthMutation(async () => {
      if (didAuthSessionChangeSince(signOutTarget, signOutSessionEpoch)) return;

      const pending: PendingAuthSignOut = {
        target: signOutTarget,
        phase: "signing_out",
        deferred: null,
        restoringSessionId: null,
        restoringUserId: null,
      };
      pendingAuthSignOutRef.current = pending;
      try {
        await supabase.auth.signOut();
        while (pendingAuthSignOutRef.current === pending && pending.deferred) {
          const candidate = pending.deferred;
          pending.phase = "restoring";
          pending.restoringSessionId = candidate.identity.sessionId;
          pending.restoringUserId = candidate.identity.userId;
          try {
            const { error } = await supabase.auth.setSession({
              access_token: candidate.session.access_token,
              refresh_token: candidate.session.refresh_token,
            });
            if (error) logger.warn("Auth session restoration failed");
          } catch {
            logger.warn("Auth session restoration failed");
          } finally {
            pending.restoringSessionId = null;
            pending.restoringUserId = null;
            if (pending.deferred === candidate) pending.deferred = null;
          }
        }
      } finally {
        if (pendingAuthSignOutRef.current === pending) {
          pending.deferred = null;
          pending.restoringSessionId = null;
          pending.restoringUserId = null;
          pendingAuthSignOutRef.current = null;
        }
      }
    });
  }, [
    adoptSubscriptionUser,
    didAuthSessionChangeSince,
    enqueueAuthMutation,
  ]);

  const updateProfile = useCallback(
    async (updates: Partial<Profile>) => {
      if (!user) return { error: new Error("Not authenticated") };

      // Allowlist: user-editable profile fields only. Privileged account fields
      // must be set server-side via RPC or admin action.
      const ALLOWED_FIELDS: ReadonlySet<keyof Profile> = new Set([
        "display_name",
        "bio",
        "avatar_url",
        "phone",
        "city",
        "first_name",
        "last_name",
        "country",
        "video_link",
        "website_url",
      ] as const);

      const safe: Partial<Tables<"profiles">> = {};
      for (const key of Object.keys(updates) as Array<keyof Profile>) {
        if (ALLOWED_FIELDS.has(key)) {
          (safe as Record<string, unknown>)[key] = updates[key];
        }
      }

      if (Object.keys(safe).length === 0) {
        return { error: new Error("No allowed fields to update") };
      }
      const payload = parseMutationInput(
        profileUpdateMutationSchema,
        { userId: user.id, updates: safe },
        "profile update",
      );

      const { error } = await supabase
        .from("profiles")
        .update(payload.updates)
        .eq("user_id", payload.userId);
      if (!error) await fetchProfile(user.id, "replace");
      return { error: error as Error | null };
    },
    [user, fetchProfile],
  );

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id, "replace");
  }, [user, fetchProfile]);

  const refreshSubscription = useCallback(async (requestedSessionId?: string | null) => {
    const expectedUserId = expectedSubscriptionUserIdRef.current;
    const expectedGeneration = subscriptionGenerationRef.current;
    const checkoutSessionId = requestedSessionId === undefined
      ? checkoutSessionIdForReconciliation()
      : isCheckoutSessionId(requestedSessionId)
        ? requestedSessionId
        : null;
    const {
      data: { session: sess },
    } = await supabase.auth.getSession();
    if (
      expectedSubscriptionUserIdRef.current !== expectedUserId ||
      subscriptionGenerationRef.current !== expectedGeneration ||
      sess?.user.id !== expectedUserId
    ) {
      return;
    }
    await checkSubscription(sess, checkoutSessionId);
  }, [checkSubscription]);

  const needsOnboarding = profileNeedsOnboarding(profile);

  const contextValue = useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      profileLoading,
      subscription,
      needsOnboarding,
      signUp,
      signIn,
      signOut,
      updateProfile,
      refreshProfile,
      refreshSubscription,
    }),
    [
      session,
      user,
      profile,
      loading,
      profileLoading,
      subscription,
      needsOnboarding,
      signUp,
      signIn,
      signOut,
      updateProfile,
      refreshProfile,
      refreshSubscription,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
