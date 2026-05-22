import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { formatCompactNumber, formatCurrency, titleCase } from '@/lib/format';
import type { Listing } from '@/types/domain';
import { useTheme } from '@/hooks/use-theme';
import fallbackImage from '@/assets/images/maiprop-hero.jpg';

function imageSource(listing: Listing) {
  const imageUrl = listing.cover_image_url || listing.listing_images?.[0]?.url;
  return imageUrl ? { uri: imageUrl } : fallbackImage;
}

export function ListingCard({ listing, compact = false }: { listing: Listing; compact?: boolean }) {
  const theme = useTheme();

  return (
    <Link href={{ pathname: '/listing/[id]', params: { id: listing.id } }} asChild>
      <Pressable style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Image source={imageSource(listing)} style={[styles.image, compact && styles.compactImage]} contentFit="cover" />
          <View style={[styles.body, compact && styles.compactBody]}>
            <View style={[styles.titleRow, compact && styles.compactTitleRow]}>
              <View style={styles.titleText}>
                <ThemedText style={[styles.price, compact && styles.compactPrice]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  {formatCurrency(listing.price)}
                </ThemedText>
                <ThemedText style={[styles.title, compact && styles.compactTitle]} numberOfLines={compact ? 3 : 2}>
                  {listing.title}
                </ThemedText>
              </View>
              <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  {titleCase(listing.listing_type)}
                </ThemedText>
              </View>
            </View>

            <View style={[styles.metaRow, compact && styles.compactMetaRow]}>
              <View style={[styles.metaItem, compact && styles.compactMetaItem]}>
                <Ionicons name="location-outline" size={15} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {listing.city}
                </ThemedText>
              </View>
              <View style={[styles.metaItem, compact && styles.compactMetaItem]}>
                <Ionicons name="expand-outline" size={15} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary">
                  {listing.sqm} sqm
                </ThemedText>
              </View>
              {!compact ? (
                <View style={styles.metaItem}>
                <Ionicons name="eye-outline" size={15} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary">
                  {formatCompactNumber(listing.views_count)}
                </ThemedText>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  pressed: {
    opacity: 0.78,
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    aspectRatio: 16 / 10,
    width: '100%',
  },
  compactImage: {
    aspectRatio: 16 / 8,
  },
  body: {
    gap: 12,
    padding: 14,
  },
  compactBody: {
    gap: 8,
    padding: 10,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  compactTitleRow: {
    flexDirection: 'column',
  },
  titleText: {
    flex: 1,
    gap: 4,
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  compactPrice: {
    fontSize: 18,
    lineHeight: 23,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  compactTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  compactMetaRow: {
    gap: 6,
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    maxWidth: '48%',
  },
  compactMetaItem: {
    maxWidth: '100%',
  },
});
