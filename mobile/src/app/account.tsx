import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { RoleSegment } from '@/components/role-segment';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-context';

export default function AccountScreen() {
  const theme = useTheme();
  const { user, profile, activeRole, setActiveRole, signIn, signOut, signUp } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const result =
      mode === 'sign-in'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, displayName.trim() || email.trim());
    setBusy(false);
    if (result.error) {
      Alert.alert('Account', result.error.message);
      return;
    }
    if (result.needsEmailConfirm) Alert.alert('Account', 'Check your email to confirm the new account.');
  }

  return (
    <Screen title="Account" eyebrow={isSupabaseConfigured ? 'Secure profile' : 'Demo profile'}>
      {user ? (
        <View style={styles.stack}>
          <View style={[styles.profileCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="person-outline" size={28} color={theme.primary} />
            </View>
            <View style={styles.profileText}>
              <ThemedText style={styles.profileName}>{profile?.display_name ?? user.email}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {profile?.city ?? 'MaiProp member'}
              </ThemedText>
            </View>
          </View>

          <RoleSegment value={activeRole} onChange={setActiveRole} />

          <Pressable
            onPress={signOut}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.text, opacity: pressed ? 0.78 : 1 },
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              Sign out
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.stack}>
          {!isSupabaseConfigured ? (
            <EmptyState
              icon="build-outline"
              title="Mobile env not connected"
              body="Add the Expo public Supabase variables to run against live MaiProp data."
            />
          ) : null}

          <View style={styles.modeRow}>
            <Chip active={mode === 'sign-in'} onPress={() => setMode('sign-in')}>
              Sign in
            </Chip>
            <Chip active={mode === 'sign-up'} onPress={() => setMode('sign-up')}>
              Sign up
            </Chip>
          </View>

          {mode === 'sign-up' ? (
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Full name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
            />
          ) : null}

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
          />

          <Pressable
            disabled={busy}
            onPress={submit}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.primary, opacity: pressed || busy ? 0.72 : 1 },
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
              {busy ? 'Working' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </ThemedText>
          </Pressable>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
  },
  profileCard: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '600',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 8,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
});
