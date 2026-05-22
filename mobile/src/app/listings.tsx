import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { FilterToolbar } from '@/components/filter-toolbar';
import { ListingCard } from '@/components/listing-card';
import { Screen } from '@/components/screen';
import { SectionHeading } from '@/components/section-heading';
import { useListings } from '@/hooks/use-listings';
import { useTheme } from '@/hooks/use-theme';

const listingTypeChips = [
  { label: 'Buy', value: 'sale' },
  { label: 'Rent', value: 'rent' },
  { label: 'Firesale', value: 'firesale' },
  { label: 'All', value: 'all' },
];

const propertyChips = ['Apartment', 'House', 'Villa', 'Land', 'Commercial'];

export default function ListingsScreen() {
  const params = useLocalSearchParams<{ search?: string; listingType?: string; type?: string }>();
  const theme = useTheme();
  const [search, setSearch] = useState(params.search ?? '');
  const [listingType, setListingType] = useState(params.listingType ?? 'all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { data = [], isFetching } = useListings({ search, listingType, limit: 30 });

  const filtered = useMemo(
    () =>
      params.type
        ? data.filter((listing) => String(listing.property_type).toLowerCase() === String(params.type).toLowerCase())
        : data,
    [data, params.type],
  );

  return (
    <Screen title="Listings" eyebrow="Buy, rent and invest">
      <FilterToolbar
        value={search}
        onChange={setSearch}
        placeholder="City, area, address"
        chips={listingTypeChips}
        selectedChip={listingType}
        onSelectChip={setListingType}>
        <View style={styles.toolbarBottom}>
          <View style={styles.propertyChips}>
            {propertyChips.map((chip) => (
              <Chip key={chip}>{chip}</Chip>
            ))}
          </View>
          <View style={[styles.viewToggle, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Pressable
              accessibilityLabel="Grid view"
              onPress={() => setViewMode('grid')}
              style={[styles.viewButton, viewMode === 'grid' && { backgroundColor: theme.primary }]}>
              <Ionicons name="grid-outline" size={16} color={viewMode === 'grid' ? theme.primaryText : theme.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityLabel="List view"
              onPress={() => setViewMode('list')}
              style={[styles.viewButton, viewMode === 'list' && { backgroundColor: theme.primary }]}>
              <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? theme.primaryText : theme.textSecondary} />
            </Pressable>
          </View>
        </View>
      </FilterToolbar>

      <SectionHeading title="Properties" action={isFetching ? 'Refreshing' : `${filtered.length} properties`} />
      <View style={viewMode === 'grid' ? styles.grid : styles.list}>
        {filtered.map((listing) => (
          <View key={listing.id} style={viewMode === 'grid' ? styles.gridItem : styles.listItem}>
            <ListingCard listing={listing} compact={viewMode === 'grid'} />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbarBottom: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  propertyChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
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
