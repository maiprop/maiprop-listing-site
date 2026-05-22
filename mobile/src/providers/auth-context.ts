import { createContext, useContext } from 'react';

import type { AppRole, AuthState } from '@/types/domain';

export type SignResult = { error: Error | null; needsEmailConfirm?: boolean };

export type AuthContextValue = AuthState & {
  activeRole: AppRole;
  setActiveRole: (role: AppRole) => void;
  signIn: (email: string, password: string) => Promise<SignResult>;
  signUp: (email: string, password: string, displayName: string) => Promise<SignResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
