import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

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
  subscription: SubscriptionState;
  /** True when a newly-signed-up user hasn't completed onboarding yet */
  needsOnboarding: boolean;
  signUp: (email: string, password: string, meta: { full_name: string; role: string; business_name?: string; tax_id?: string; phone?: string; license_number?: string }) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function profileNeedsOnboarding(p: Profile | null): boolean {
  if (!p) return false;
  return !p.bio || !p.bio.startsWith("__type:");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionState>({
    subscribed: false,
    productId: null,
    subscriptionEnd: null,
    loading: false,
  });

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (data) setProfile(data);
    return data;
  };

  const checkSubscription = async (currentSession: Session | null) => {
    if (!currentSession) {
      setSubscription({ subscribed: false, productId: null, subscriptionEnd: null, loading: false });
      return;
    }
    setSubscription(prev => ({ ...prev, loading: true }));
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription", {});
      if (!error && data) {
        setSubscription({
          subscribed: data.subscribed ?? false,
          productId: data.product_id ?? null,
          subscriptionEnd: data.subscription_end ?? null,
          loading: false,
        });
      } else {
        setSubscription(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setSubscription(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    // Safety: never block the app for more than 8s if Supabase/auth hangs
    const SAFETY_MS = 8_000;
    const safetyTimer = setTimeout(() => setLoading(false), SAFETY_MS);

    // onAuthStateChange is the single source of truth for auth state.
    // CRITICAL: set loading=false immediately so the UI unblocks, then
    // fetch profile + subscription in the background without blocking navigation.
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (event, sess) => {
        setSession(sess);
        setUser(sess?.user ?? null);

        if (sess?.user) {
          // Unblock UI immediately — profile arrives shortly after
          setLoading(false);
          // Fire-and-forget: don't await, never block the auth flow
          fetchProfile(sess.user.id).catch(() => {});
          setTimeout(() => checkSubscription(sess), 0);
        } else {
          setProfile(null);
          setSubscription({ subscribed: false, productId: null, subscriptionEnd: null, loading: false });
          setLoading(false);
        }
      }
    );

    // Restore session from storage on mount
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      if (!sess) {
        // No session — stop loading, let login page show
        setLoading(false);
      }
      // If there IS a session, onAuthStateChange will fire and handle everything
    }).catch(() => setLoading(false));

    // Refresh subscription every 5 minutes
    const interval = setInterval(() => {
      supabase.auth.getSession().then(({ data: { session: sess } }) => {
        if (sess) checkSubscription(sess);
      });
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(safetyTimer);
      authSub.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const signUp = async (
    email: string,
    password: string,
    meta: { full_name: string; role: string; business_name?: string; tax_id?: string; phone?: string; license_number?: string }
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: meta.full_name },
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    });
    if (data.user && !error) {
      await supabase
        .from("profiles")
        .update({ ...(meta.phone && { phone: meta.phone }) })
        .eq("user_id", data.user.id);
    }
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSubscription({ subscribed: false, productId: null, subscriptionEnd: null, loading: false });
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error("Not authenticated") };
    const { error } = await supabase.from("profiles").update(updates).eq("user_id", user.id);
    if (!error) await fetchProfile(user.id);
    return { error: error as Error | null };
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const refreshSubscription = async () => {
    const { data: { session: sess } } = await supabase.auth.getSession();
    await checkSubscription(sess);
  };

  const needsOnboarding = profileNeedsOnboarding(profile);

  return (
    <AuthContext.Provider value={{
      session, user, profile, loading, subscription, needsOnboarding,
      signUp, signIn, signOut, updateProfile, refreshProfile, refreshSubscription,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
