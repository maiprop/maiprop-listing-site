import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ListingCard } from '@/components/listing-card';
import { MetricCard } from '@/components/metric-card';
import { RoleSegment } from '@/components/role-segment';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useDashboardMetrics, useListings } from '@/hooks/use-listings';
import { getRoleActions } from '@/hooks/use-role-actions';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-context';

export default function WorkspaceScreen() {
  const theme = useTheme();
  const { activeRole, setActiveRole, user, profile } = useAuth();
  const { data: metrics = [] } = useDashboardMetrics(user?.id);
  const { data: myListings = [] } = useListings({ ownerId: user?.id, limit: 3 });
  const actions = getRoleActions(activeRole);

  return (
    <Screen title="Workspace" eyebrow={profile?.display_name ?? 'All-in-one console'}>
      <RoleSegment value={activeRole} onChange={setActiveRole} />

      <View style={styles.metrics}>
        {metrics.slice(0, 5).map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </View>

      <View style={styles.actionList}>
        {actions.map((action) => (
          <View key={action.title} style={[styles.actionCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={[styles.actionIcon, { backgroundColor: action.accent }]}>
              <Ionicons name="flash-outline" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.actionText}>
              <ThemedText style={styles.actionTitle}>{action.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {action.body}
              </ThemedText>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>Portfolio</ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          {user ? 'Owned stock' : 'Preview'}
        </ThemedText>
      </View>

      <View style={styles.list}>
        {myListings.slice(0, 3).map((listing) => (
          <ListingCard key={listing.id} listing={listing} compact />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionList: {
    gap: 10,
  },
  actionCard: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 86,
    padding: 14,
  },
  actionIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  actionText: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  list: {
    gap: 14,
  },
});
