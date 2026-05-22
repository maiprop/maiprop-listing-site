import { PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { AuthContext, type AuthContextValue, type SignResult } from '@/providers/auth-context';
import type { AppRole, Profile } from '@/types/domain';

const profileSelect =
  'user_id, display_name, avatar_url, role, participant_type, city, phone, verified, investor_mode, is_platform_admin';

function roleFromProfile(profile: Profile | null): AppRole {
  if (!profile) return 'buyer';
  if (profile.is_platform_admin || profile.role === 'admin') return 'admin';
  const explicit = profile.participant_type ?? profile.role;
  if (explicit === 'seller') return 'seller';
  if (explicit === 'agent') return 'agent';
  if (explicit === 'developer') return 'developer';
  if (explicit === 'professional') return 'professional';
  if (explicit === 'investor' || profile.investor_mode) return 'investor';
  return 'buyer';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [manualRole, setManualRole] = useState<AppRole | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    if (!supabase) return null;
    setProfileLoading(true);
    const { data, error } = await supabase.from('profiles').select(profileSelect).eq('user_id', userId).maybeSingle();
    setProfileLoading(false);
    if (error) throw error;
    setProfile((data as Profile | null) ?? null);
    return (data as Profile | null) ?? null;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user) {
          fetchProfile(data.session.user.id).catch(() => setProfileLoading(false));
        }
      })
      .finally(() => setLoading(false));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setManualRole(null);
      if (nextSession?.user) {
        fetchProfile(nextSession.user.id).catch(() => setProfileLoading(false));
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignResult> => {
    if (!supabase) return { error: new Error('Supabase is not configured for the mobile app yet.') };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string): Promise<SignResult> => {
    if (!supabase) return { error: new Error('Supabase is not configured for the mobile app yet.') };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: displayName } },
    });
    return { error: error as Error | null, needsEmailConfirm: !error && Boolean(data.user && !data.session) };
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [fetchProfile, user]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      loading,
      profileLoading,
      activeRole: manualRole ?? roleFromProfile(profile),
      setActiveRole: setManualRole,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [loading, manualRole, profile, profileLoading, refreshProfile, session, signIn, signOut, signUp, user],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
