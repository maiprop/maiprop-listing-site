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
import { getExplicitParticipantTypeFromProfile } from "@/lib/participantConfig";
import { validatePassword } from "@/lib/passwordPolicy";
import { recordUserAuthActivity, type AuthActivityEventType } from "@/lib/authActivity";
import {
  parseMutationInput,
  profileUpdateMutationSchema,
  signUpProfileUpdateMutationSchema,
} from "@/lib/mutationSchemas";

export type Profile = Tables<"profiles"> & {
  role_switch_in_progress_at?: string | null;
  account_status?: "active" | "suspended" | "banned" | null;
  account_moderation_reason?: string | null;
  account_moderated_at?: string | null;
  account_moderated_by?: string | null;
};

export interface SubscriptionState {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  source: "billing_state" | "investor" | "database" | "stripe";
  syncStatus: "synced" | "pending" | "timeout";
  loading: boolean;
}

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

const CHECKOUT_SESSION_ID_RE = /^cs_(?:test|live)_[A-Za-z0-9_]{6,240}$/;
const SUBSCRIPTION_CHECK_TIMEOUT_MS = 6_500;

const emptySubscriptionState = (): SubscriptionState => ({
  subscribed: false,
  productId: null,
  subscriptionEnd: null,
  source: "database",
  syncStatus: "synced",
  loading: false,
});

const unavailableSubscriptionState = (): SubscriptionState => ({
  ...emptySubscriptionState(),
  syncStatus: "timeout",
});

const withSubscriptionDeadline = async <T,>(promise: Promise<T>): Promise<T> => {
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

const checkoutSessionIdForReconciliation = (): string | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const checkoutSucceeded = params.get("checkout") === "success" ||
    params.get("checkout") === "trial_started" ||
    params.get("pro") === "success";
  if (!checkoutSucceeded) return null;

  const sessionId = params.get("checkout_session_id") ??
    params.get("session_id");
  return sessionId && CHECKOUT_SESSION_ID_RE.test(sessionId) ? sessionId : null;
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function profileRoleSwitchInProgress(
  profile: { role_switch_in_progress_at?: string | null } | null,
): boolean {
  return Boolean(profile?.role_switch_in_progress_at);
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function profileNeedsOnboarding(p: Profile | null): boolean {
  if (!p) return false;
  if (p.role === "admin") return false;
  if (profileRoleSwitchInProgress(p)) return true;
  const explicitType = getExplicitParticipantTypeFromProfile(p);
  const roleText = p.role ? String(p.role) : null;
  // Onboarding is complete only when both role + participant_type are explicitly set.
  // This prevents implicit defaults from being treated as intentional role choice.
  return !(explicitType && roleText && explicitType === roleText);
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionState>(emptySubscriptionState);

  // Guard: discard profile fetch results that belong to a previous user session
  const expectedUserIdRef = useRef<string | null>(null);
  // Subscription work is scoped to one auth identity and generation. A delayed
  // response from a prior account can never update the current account.
  const expectedSubscriptionUserIdRef = useRef<string | null>(null);
  const subscriptionGenerationRef = useRef(0);
  const subCheckInProgressRef = useRef<{
    userId: string;
    generation: number;
    promise: Promise<void>;
  } | null>(null);
  // Guard: avoid duplicate auth telemetry from INITIAL_SESSION + getSession races.
  const lastAuthActivityRef = useRef<{ key: string; at: number } | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    expectedUserIdRef.current = userId;
    setProfileLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select(
        "user_id, display_name, avatar_url, role, bio, first_name, last_name, city, country, phone, website_url, is_platform_admin, verified, created_at, updated_at, id, participant_type, investor_mode, subscription_product_id, force_pro_access, role_switch_in_progress_at, account_status, account_moderation_reason, account_moderated_at, account_moderated_by",
      )
      .eq("user_id", userId)
      .single();
    // Discard stale result if the auth user changed before this resolved
    if (expectedUserIdRef.current !== userId) return null;
    if (data) setProfile(data as unknown as Profile);
    setProfileLoading(false);
    return data;
  }, []);

  const adoptSubscriptionUser = useCallback((userId: string | null) => {
    if (expectedSubscriptionUserIdRef.current === userId) return false;
    expectedSubscriptionUserIdRef.current = userId;
    subscriptionGenerationRef.current += 1;
    setSubscription(emptySubscriptionState());
    return true;
  }, []);

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

      const inFlight = subCheckInProgressRef.current;
      if (
        inFlight?.userId === userId &&
        inFlight.generation === generation
      ) {
        if (!checkoutSessionId) return;
        await inFlight.promise;
        if (
          expectedSubscriptionUserIdRef.current !== userId ||
          subscriptionGenerationRef.current !== generation
        ) return;
      }

      let releaseCheck = () => {};
      const currentCheck = new Promise<void>((resolve) => {
        releaseCheck = resolve;
      });
      const currentWork = { userId, generation, promise: currentCheck };
      subCheckInProgressRef.current = currentWork;
      setSubscription((prev) => ({ ...prev, loading: true }));
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
          setSubscription({
            subscribed: data.subscribed ?? false,
            productId: data.product_id ?? null,
            subscriptionEnd: data.subscription_end ?? null,
            source: data.source === "billing_state" ||
                data.source === "investor" || data.source === "stripe"
              ? data.source
              : "database",
            syncStatus: data.sync_status === "pending" ||
                data.sync_status === "timeout"
              ? data.sync_status
              : "synced",
            loading: false,
          });
        } else {
          setSubscription(unavailableSubscriptionState());
        }
      } catch (err: unknown) {
        logger.warn(
          "[AuthContext] checkSubscription failed:",
          err instanceof Error ? err.message : err,
        );
        if (
          expectedSubscriptionUserIdRef.current === userId &&
          subscriptionGenerationRef.current === generation
        ) {
          setSubscription(unavailableSubscriptionState());
        }
      } finally {
        if (subCheckInProgressRef.current === currentWork) {
          subCheckInProgressRef.current = null;
        }
        releaseCheck();
      }
    },
    [adoptSubscriptionUser],
  );

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
      setSession(sess);
      setUser(sess?.user ?? null);

      if (sess?.user) {
        const userChanged = adoptSubscriptionUser(sess.user.id);
        if (userChanged) setProfile(null);
        // Unblock UI immediately — profile arrives shortly after
        setLoading(false);
        // Non-blocking: profile and subscription load in background
        fetchProfile(sess.user.id).catch((err) => {
          logger.warn("Profile fetch failed:", err);
          setProfileLoading(false);
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
    supabase.auth
      .getSession()
      .then(({ data: { session: sess } }) => {
        if (!sess) {
          // No session — stop loading, let login page show
          setLoading(false);
          return;
        }

        setSession(sess);
        setUser(sess.user);
        const userChanged = adoptSubscriptionUser(sess.user.id);
        if (userChanged) setProfile(null);
        setLoading(false);

        fetchProfile(sess.user.id).catch((err) => {
          logger.warn("Profile fetch failed during session restore:", err);
          setProfileLoading(false);
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
      .catch(() => setLoading(false));

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
      clearTimeout(safetyTimer);
      authSub.unsubscribe();
      clearInterval(interval);
    };
  }, [fetchProfile, checkSubscription, eventToAuthActivity, recordAuthActivity, adoptSubscriptionUser]);

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
    },
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    expectedUserIdRef.current = null;
    adoptSubscriptionUser(null);
    await recordUserAuthActivity({
      eventType: "sign_out",
      metadata: { source: "sign_out" },
    });
    await supabase.auth.signOut();
    setProfile(null);
  }, [adoptSubscriptionUser]);

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
      if (!error) await fetchProfile(user.id);
      return { error: error as Error | null };
    },
    [user, fetchProfile],
  );

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshSubscription = useCallback(async (requestedSessionId?: string | null) => {
    const checkoutSessionId = requestedSessionId === undefined
      ? checkoutSessionIdForReconciliation()
      : requestedSessionId && CHECKOUT_SESSION_ID_RE.test(requestedSessionId)
        ? requestedSessionId
        : null;
    const {
      data: { session: sess },
    } = await supabase.auth.getSession();
    if (sess?.user) adoptSubscriptionUser(sess.user.id);
    await checkSubscription(sess, checkoutSessionId);
  }, [adoptSubscriptionUser, checkSubscription]);

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
