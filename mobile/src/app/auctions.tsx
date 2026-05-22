import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { FilterToolbar } from '@/components/filter-toolbar';
import { ListingCard } from '@/components/listing-card';
import { MetricCard } from '@/components/metric-card';
import { Screen } from '@/components/screen';
import { SectionHeading } from '@/components/section-heading';
import { ThemedText } from '@/components/themed-text';
import { WebStyleHero } from '@/components/web-style-hero';
import { useListings } from '@/hooks/use-listings';
import { useTheme } from '@/hooks/use-theme';
import { formatCompactCurrency } from '@/lib/format';

const cityChips = ['All Cities', 'Athens', 'Piraeus', 'Thessaloniki'];
const bidChips = ['Any Bid', '<150K', '150K-300K', '300K+'];

export default function AuctionsScreen() {
  const params = useLocalSearchParams<{ city?: string }>();
  const theme = useTheme();
  const [city, setCity] = useState(params.city ?? '');
  const [bid, setBid] = useState('Any Bid');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { data = [], isFetching } = useListings({ listingType: 'auction', city: city || undefined, limit: 30 });

  const stats = useMemo(() => {
    const avg = data.length ? Math.round(data.reduce((sum, item) => sum + (item.auction_starting_bid ?? item.price), 0) / data.length) : 0;
    return [
      { label: 'This Week', value: String(data.length || 1), tone: 'accent' as const },
      { label: 'Visible Auctions', value: String(data.length), tone: 'primary' as const },
      { label: 'Avg Starting Bid', value: formatCompactCurrency(avg || 142000), tone: 'success' as const },
    ];
  }, [data]);

  return (
    <Screen title="" contentStyle={styles.screen}>
      <WebStyleHero
        compact
        icon="hammer-outline"
        eyebrow="Property Auctions"
        title="Greek court auction opportunities"
        body="Browse auction listings with city, bid, and map-ready filters."
      />

      <View style={styles.metrics}>
        {stats.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </View>

      <View style={[styles.alertBanner, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Ionicons name="notifications-outline" size={20} color={theme.primary} />
        <View style={styles.bannerText}>
          <ThemedText style={styles.bannerTitle}>Auction alerts</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Match the web alert banner pattern for saved auction criteria.
          </ThemedText>
        </View>
      </View>

      <FilterToolbar
        value={city}
        onChange={setCity}
        placeholder="City"
        chips={cityChips.map((item) => ({ label: item, value: item === 'All Cities' ? '' : item }))}
        selectedChip={city}
        onSelectChip={setCity}>
        <View style={styles.filterRow}>
          {bidChips.map((item) => (
            <Chip key={item} active={bid === item} onPress={() => setBid(item)}>
              {item}
            </Chip>
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

      <SectionHeading title="Greek Property Auction Listings" action={isFetching ? 'Loading' : `${data.length} auctions`} />
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
  screen: {
    paddingTop: 6,
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
  },
  alertBanner: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  bannerText: {
    flex: 1,
    gap: 3,
  },
  bannerTitle: {
    fontSize: 17,
    fontWeight: '900',
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
