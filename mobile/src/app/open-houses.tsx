import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { FilterToolbar } from '@/components/filter-toolbar';
import { ListingCard } from '@/components/listing-card';
import { Screen } from '@/components/screen';
import { SectionHeading } from '@/components/section-heading';
import { ThemedText } from '@/components/themed-text';
import { useListings } from '@/hooks/use-listings';
import { useTheme } from '@/hooks/use-theme';

const propertyChips = ['All types', 'Apartment', 'House', 'Villa', 'Commercial'];

export default function OpenHousesScreen() {
  const theme = useTheme();
  const [city, setCity] = useState('');
  const [period, setPeriod] = useState<'upcoming' | 'past'>('upcoming');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { data = [], isFetching } = useListings({ listingType: 'open_house', city: city || undefined, limit: 30 });

  const countLabel = useMemo(() => `${data.length} event${data.length === 1 ? '' : 's'} found`, [data.length]);

  return (
    <Screen title="Open Houses" eyebrow="Upcoming property events">
      <View style={[styles.hero, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.heroTop}>
          <View style={[styles.heroIcon, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="calendar-outline" size={24} color={theme.primary} />
          </View>
          <View style={styles.heroText}>
            <ThemedText style={styles.heroTitle}>{period === 'past' ? 'Past Open Houses' : 'Upcoming Open Houses'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {countLabel}. Agents can publish and track attendance from the dashboard.
            </ThemedText>
          </View>
        </View>
        <View style={styles.segment}>
          <Chip active={period === 'upcoming'} onPress={() => setPeriod('upcoming')}>
            Upcoming
          </Chip>
          <Chip active={period === 'past'} onPress={() => setPeriod('past')}>
            Past
          </Chip>
          <Chip>My Open Houses</Chip>
        </View>
      </View>

      <FilterToolbar value={city} onChange={setCity} placeholder="City..." chips={[]} selectedChip="">
        <View style={styles.filterRow}>
          {propertyChips.map((item) => (
            <Chip key={item}>{item}</Chip>
          ))}
          <View style={[styles.viewToggle, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Pressable accessibilityLabel="Grid view" onPress={() => setViewMode('grid')} style={[styles.viewButton, viewMode === 'grid' && { backgroundColor: theme.primary }]}>
              <Ionicons name="grid-outline" size={16} color={viewMode === 'grid' ? theme.primaryText : theme.textSecondary} />
            </Pressable>
            <Pressable accessibilityLabel="List view" onPress={() => setViewMode('list')} style={[styles.viewButton, viewMode === 'list' && { backgroundColor: theme.primary }]}>
              <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? theme.primaryText : theme.textSecondary} />
            </Pressable>
          </View>
        </View>
      </FilterToolbar>

      <SectionHeading title="Events" action={isFetching ? 'Loading' : countLabel} />
      <View style={viewMode === 'grid' ? styles.grid : styles.list}>
        {data.map((listing) => (
          <View key={listing.id} style={viewMode === 'grid' ? styles.gridItem : styles.listItem}>
            <ListingCard listing={listing} compact={viewMode === 'grid'} />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    padding: 16,
  },
  heroTop: {
    flexDirection: 'row',
    gap: 12,
  },
  heroIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  heroText: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  viewToggle: {
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  viewButton: {
    alignItems: 'center',
    borderRadius: 7,
    height: 34,
    justifyContent: 'center',
    width: 38,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    flexBasis: '47%',
    flexGrow: 1,
    maxWidth: '49%',
  },
  listItem: {
    width: '100%',
  },
  list: {
    gap: 14,
  },
});
