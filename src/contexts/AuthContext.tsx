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

export type Profile = Tables<"profiles"> & {
  role_switch_in_progress_at?: string | null;
};

export interface SubscriptionState {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
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
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function profileRoleSwitchInProgress(
  profile: { role_switch_in_progress_at?: string | null } | null,
): boolean {
  return Boolean(profile?.role_switch_in_progress_at);
}

export function profileNeedsOnboarding(p: Profile | null): boolean {
  if (!p) return false;
  if (p.role === "admin") return false;
  if (profileRoleSwitchInProgress(p)) return true;
  const explicitType = getExplicitParticipantTypeFromProfile(p);
  const roleText = p.role ? String(p.role) : null;
  // Onboarding is complete only when both role + participant_type are explicitly set.
  // This prevents implicit defaults from being treated as intentional role choice.
  if (explicitType && roleText && explicitType === roleText) return false;
  // Legacy read-only fallback: rows created before participant_type existed and were never backfilled.
  // Safe to remove once DB shows 0 profiles with NULL participant_type and non-null __type: bio.
  if (p.bio && p.bio.startsWith("__type:")) return false;
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionState>({
    subscribed: false,
    productId: null,
    subscriptionEnd: null,
    loading: false,
  });

  // Guard: discard profile fetch results that belong to a previous user session
  const expectedUserIdRef = useRef<string | null>(null);
  // Guard: prevent concurrent subscription checks
  const subCheckInProgressRef = useRef(false);

  const fetchProfile = useCallback(async (userId: string) => {
    expectedUserIdRef.current = userId;
    setProfileLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select(
        "user_id, display_name, avatar_url, role, bio, first_name, last_name, city, country, phone, website_url, is_platform_admin, verified, created_at, updated_at, id, participant_type, investor_mode, subscription_product_id, force_pro_access, role_switch_in_progress_at",
      )
      .eq("user_id", userId)
      .single();
    // Discard stale result if the auth user changed before this resolved
    if (expectedUserIdRef.current !== userId) return null;
    if (data) setProfile(data as unknown as Profile);
    setProfileLoading(false);
    return data;
  }, []);

  const checkSubscription = useCallback(
    async (currentSession: Session | null) => {
      if (!currentSession) {
        setSubscription({
          subscribed: false,
          productId: null,
          subscriptionEnd: null,
          loading: false,
        });
        return;
      }
      if (subCheckInProgressRef.current) return;
      subCheckInProgressRef.current = true;
      setSubscription((prev) => ({ ...prev, loading: true }));
      try {
        const { data, error } = await supabase.functions.invoke(
          "check-subscription",
          {},
        );
        if (!error && data) {
          setSubscription({
            subscribed: data.subscribed ?? false,
            productId: data.product_id ?? null,
            subscriptionEnd: data.subscription_end ?? null,
            loading: false,
          });
        } else {
          setSubscription((prev) => ({ ...prev, loading: false }));
        }
      } catch (err: unknown) {
        logger.warn(
          "[AuthContext] checkSubscription failed:",
          err instanceof Error ? err.message : err,
        );
        setSubscription((prev) => ({ ...prev, loading: false }));
      } finally {
        subCheckInProgressRef.current = false;
      }
    },
    [],
  );

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
      } else {
        // Clear all user-scoped state on sign-out
        expectedUserIdRef.current = null;
        setProfile(null);
        setProfileLoading(false);
        setSubscription({
          subscribed: false,
          productId: null,
          subscriptionEnd: null,
          loading: false,
        });
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
        setLoading(false);

        fetchProfile(sess.user.id).catch((err) => {
          logger.warn("Profile fetch failed during session restore:", err);
          setProfileLoading(false);
        });
        checkSubscription(sess).catch((err: unknown) => {
          logger.warn(
            "[AuthContext] subscription restore failed:",
            err instanceof Error ? err.message : err,
          );
        });
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
  }, [fetchProfile, checkSubscription]);

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
      if (data.user && !error) {
        await supabase
          .from("profiles")
          .update({ ...(meta.phone && { phone: meta.phone }) })
          .eq("user_id", data.user.id);
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
    await supabase.auth.signOut();
    setProfile(null);
    setSubscription({
      subscribed: false,
      productId: null,
      subscriptionEnd: null,
      loading: false,
    });
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<Profile>) => {
      if (!user) return { error: new Error("Not authenticated") };

      // Allowlist: only these fields may be self-updated by the user.
      // Sensitive columns (role, is_platform_admin, subscription_product_id,
      // force_pro_access, stripe_customer_id) are excluded — they must be set
      // server-side via RPC or admin action.
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
        "investor_mode",
        "participant_type",
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

      const { error } = await supabase
        .from("profiles")
        .update(safe)
        .eq("user_id", user.id);
      if (!error) await fetchProfile(user.id);
      return { error: error as Error | null };
    },
    [user, fetchProfile],
  );

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshSubscription = useCallback(async () => {
    const {
      data: { session: sess },
    } = await supabase.auth.getSession();
    await checkSubscription(sess);
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
