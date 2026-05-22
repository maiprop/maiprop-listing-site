import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { professionalCategoryLabels } from '@/data/page-content';
import { useTheme } from '@/hooks/use-theme';
import type { Professional } from '@/types/domain';

export function ProfessionalCard({ professional }: { professional: Professional }) {
  const theme = useTheme();
  const name = professional.display_name ?? 'Professional';
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const isPro = professional.subscription_tier?.toLowerCase() === 'pro';

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <ThemedText style={{ color: theme.primaryText, fontWeight: '900' }}>{initials}</ThemedText>
        </View>
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <ThemedText style={styles.name} numberOfLines={1}>
              {name}
            </ThemedText>
            {professional.verified ? <Ionicons name="checkmark-circle" size={15} color={theme.primary} /> : null}
            {isPro ? (
              <View style={[styles.proBadge, { backgroundColor: theme.accentSoft }]}>
                <ThemedText type="smallBold" style={{ color: theme.accent, fontSize: 10 }}>
                  Pro
                </ThemedText>
              </View>
            ) : null}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {professional.title ?? professionalCategoryLabels[professional.category] ?? professional.category}
          </ThemedText>
          <View style={styles.location}>
            <Ionicons name="location-outline" size={13} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              {professional.city ?? 'Greece'}
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Ionicons name="star" size={14} color={theme.accent} />
          <ThemedText type="smallBold">{professional.rating ?? '-'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ({professional.reviews_count ?? 0})
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {professional.projects_count ?? 0} projects
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {professional.experience_years ?? 0} yrs
        </ThemedText>
      </View>

      <View style={styles.specialties}>
        {(professional.specialties ?? []).slice(0, 3).map((specialty) => (
          <Chip key={specialty}>{specialty}</Chip>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    gap: 12,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  identity: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
  },
  proBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  location: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  stats: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  specialties: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
