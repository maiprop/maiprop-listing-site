import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ListingCard } from '@/components/listing-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useListings } from '@/hooks/use-listings';
import { useTheme } from '@/hooks/use-theme';
import { titleCase } from '@/lib/format';

const listingTypes = [
  { label: 'All', value: 'all' },
  { label: 'Sale', value: 'sale' },
  { label: 'Rent', value: 'rent' },
  { label: 'Auction', value: 'auction' },
  { label: 'Firesale', value: 'firesale' },
];

export default function SearchScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [listingType, setListingType] = useState('all');
  const { data = [], isFetching } = useListings({ search, listingType, limit: 30 });
  const mapRows = useMemo(() => data.filter((listing) => listing.latitude && listing.longitude).slice(0, 4), [data]);

  return (
    <Screen title="Search" eyebrow="Homes, auctions, firesales">
      <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Ionicons name="search-outline" size={20} color={theme.textSecondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search MaiProp"
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
        />
      </View>

      <View style={styles.chips}>
        {listingTypes.map((item) => (
          <Chip key={item.value} active={listingType === item.value} onPress={() => setListingType(item.value)}>
            {item.label}
          </Chip>
        ))}
      </View>

      <View style={[styles.mapPanel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.mapHeader}>
          <ThemedText style={styles.panelTitle}>Map signals</ThemedText>
          <Ionicons name="map-outline" size={22} color={theme.primary} />
        </View>
        <View style={styles.pinGrid}>
          {mapRows.map((listing) => (
            <View key={listing.id} style={[styles.pin, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {listing.city}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {titleCase(listing.property_type)} · {listing.sqm} sqm
              </ThemedText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>Results</ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          {isFetching ? 'Refreshing' : `${data.length} matches`}
        </ThemedText>
      </View>

      <View style={styles.list}>
        {data.map((listing) => (
          <ListingCard key={listing.id} listing={listing} compact />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    minHeight: 50,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mapPanel: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  mapHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  pinGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pin: {
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 4,
    minHeight: 74,
    padding: 12,
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
