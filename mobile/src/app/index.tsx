import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { AgentAdvisor } from '@/components/agent-advisor';
import { ListingCard } from '@/components/listing-card';
import { Screen } from '@/components/screen';
import { SectionHeading } from '@/components/section-heading';
import { ThemedText } from '@/components/themed-text';
import { WebStyleHero } from '@/components/web-style-hero';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useListings } from '@/hooks/use-listings';
import { useTheme } from '@/hooks/use-theme';
import logo from '@/assets/images/maiprop-logo.png';
import logoDark from '@/assets/images/maiprop-logo-dark.png';

const quickActions = [
  {
    title: 'Listings',
    body: 'Buy, rent, firesales',
    icon: 'search-outline' as const,
    path: '/listings' as const,
  },
  {
    title: 'Auctions',
    body: 'Court opportunities',
    icon: 'hammer-outline' as const,
    path: '/auctions' as const,
  },
  {
    title: 'Open Houses',
    body: 'Upcoming events',
    icon: 'calendar-outline' as const,
    path: '/open-houses' as const,
  },
  {
    title: 'Professionals',
    body: 'Agents, lawyers, architects',
    icon: 'people-outline' as const,
    path: '/professionals' as const,
  },
];

export default function HomeScreen() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const [query, setQuery] = useState('');
  const brandLogo = colorScheme === 'dark' ? logoDark : logo;
  const { data = [], isFetching } = useListings({ limit: 8 });
  const { data: auctionData = [], isFetching: auctionsFetching } = useListings({ listingType: 'auction', limit: 3 });
  const { data: openHouseData = [], isFetching: openHousesFetching } = useListings({ listingType: 'open_house', limit: 3 });

  const featured = useMemo(
    () => data.filter((listing) => ['sale', 'rent', 'firesale'].includes(String(listing.listing_type))).slice(0, 3),
    [data],
  );
  const auctions = useMemo(() => auctionData.slice(0, 3), [auctionData]);
  const openHouses = useMemo(() => openHouseData.slice(0, 3), [openHouseData]);
  const advisorListings = useMemo(() => [...featured, ...auctions, ...openHouses], [auctions, featured, openHouses]);

  function runSearch() {
    router.push({
      pathname: '/listings',
      params: {
        ...(query ? { search: query } : {}),
      },
    });
  }

  return (
    <Screen scroll title="" contentStyle={styles.screen}>
      <View style={[styles.brandHeader, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Image source={brandLogo} style={[styles.brandLogo, isWide && styles.brandLogoWide]} contentFit="contain" />
        <View style={styles.brandCopy}>
          <ThemedText style={styles.brandCaption}>Real estate. Real decisions.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Search, auctions, open houses, and verified professionals for Greece.
          </ThemedText>
        </View>
      </View>

      <View style={[styles.topLayout, isWide && styles.topLayoutWide]}>
        <View style={styles.heroColumn}>
          <WebStyleHero
            compact={!isWide}
            eyebrow="mAI prop"
            title="Find property in Greece"
            highlight="with confidence">
            <View style={[styles.searchCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.inputRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Ionicons name="location-outline" size={18} color={theme.textSecondary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="City, area, address"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text }]}
                  onSubmitEditing={runSearch}
                />
                <Pressable onPress={runSearch} style={[styles.searchButton, { backgroundColor: theme.primary }]}>
                  <Ionicons name="search" size={18} color={theme.primaryText} />
                </Pressable>
              </View>
            </View>
          </WebStyleHero>
        </View>

        <View style={[styles.section, isWide && styles.destinationPanel]}>
          <SectionHeading title="Start here" />
          <View style={styles.quickGrid}>
            {quickActions.map((item) => (
              <Pressable
                key={item.title}
                onPress={() => router.push(item.path)}
                style={({ pressed }) => [
                  styles.quickCard,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.78 : 1 },
                ]}>
                <View style={styles.quickTopRow}>
                  <View style={[styles.quickIcon, { backgroundColor: theme.backgroundSelected }]}>
                    <Ionicons name={item.icon} size={22} color={theme.primary} />
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                </View>
                <View style={styles.quickText}>
                  <ThemedText style={styles.quickTitle}>{item.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                    {item.body}
                  </ThemedText>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <AgentAdvisor listings={advisorListings} />

      <View style={styles.section}>
        <SectionHeading
          title="Featured Properties"
          action={isFetching ? 'Refreshing' : 'View all'}
          onAction={isFetching ? undefined : () => router.push('/listings')}
        />
        <View style={[styles.featuredGrid, isWide && styles.featuredGridWide]}>
          {featured.map((listing) => (
            <View key={listing.id} style={isWide ? styles.featuredItemWide : styles.featuredItem}>
              <ListingCard listing={listing} compact={isWide} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading
          title="3 Auctions to Watch"
          action={auctionsFetching ? 'Refreshing' : 'View all'}
          onAction={auctionsFetching ? undefined : () => router.push('/auctions')}
        />
        <View style={[styles.featuredGrid, isWide && styles.featuredGridWide]}>
          {auctions.map((listing) => (
            <View key={listing.id} style={isWide ? styles.featuredItemWide : styles.featuredItem}>
              <ListingCard listing={listing} compact={isWide} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading
          title="3 Open Houses This Week"
          action={openHousesFetching ? 'Refreshing' : 'View all'}
          onAction={openHousesFetching ? undefined : () => router.push('/open-houses')}
        />
        <View style={[styles.featuredGrid, isWide && styles.featuredGridWide]}>
          {openHouses.map((listing) => (
            <View key={listing.id} style={isWide ? styles.featuredItemWide : styles.featuredItem}>
              <ListingCard listing={listing} compact={isWide} />
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 6,
  },
  brandHeader: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  brandLogo: {
    height: 58,
    width: 170,
  },
  brandLogoWide: {
    height: 64,
    width: 190,
  },
  topLayout: {
    gap: 18,
  },
  topLayoutWide: {
    alignItems: 'stretch',
    flexDirection: 'row',
  },
  heroColumn: {
    flex: 1.35,
  },
  destinationPanel: {
    flex: 0.9,
    justifyContent: 'center',
  },
  searchCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  inputRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 50,
    paddingLeft: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    minHeight: 48,
  },
  searchButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    width: 52,
  },
  brandCopy: {
    flex: 1,
    gap: 4,
    minWidth: 210,
  },
  brandCaption: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
  },
  section: {
    gap: 14,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickCard: {
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 10,
    minHeight: 106,
    padding: 12,
  },
  quickTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  quickText: {
    gap: 3,
  },
  quickTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  featuredGrid: {
    gap: 14,
  },
  featuredGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featuredItem: {
    width: '100%',
  },
  featuredItemWide: {
    flexBasis: '31%',
    flexGrow: 1,
    maxWidth: '33%',
  },
});
