import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useConversations } from '@/hooks/use-listings';
import { useTheme } from '@/hooks/use-theme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { timeAgo } from '@/lib/format';
import { useAuth } from '@/providers/auth-context';

export default function InboxScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { data = [] } = useConversations(user?.id);
  const needsSignIn = isSupabaseConfigured && !user;

  return (
    <Screen title="Inbox" eyebrow="Messages and leads">
      {needsSignIn ? (
        <Link href="/account" asChild>
          <Pressable>
            <EmptyState icon="lock-closed-outline" title="Sign in to view conversations" body="Your buyer, seller, and pro threads will appear here." />
          </Pressable>
        </Link>
      ) : (
        <View style={styles.list}>
          {data.map((item) => (
            <View key={item.id} style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.primary} />
              </View>
              <View style={styles.message}>
                <View style={styles.messageTop}>
                  <ThemedText style={styles.title}>Conversation</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {timeAgo(item.last_message_at)}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {item.latest_message ?? 'Lead thread ready for follow-up'}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  card: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 84,
    padding: 14,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  message: {
    flex: 1,
    gap: 4,
  },
  messageTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
});
