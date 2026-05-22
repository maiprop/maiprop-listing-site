import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useListing } from '@/hooks/use-listings';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency, titleCase } from '@/lib/format';
import fallbackImage from '@/assets/images/maiprop-hero.jpg';

export default function ListingDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: listing } = useListing(id);
  const imageUrl = listing?.cover_image_url || listing?.listing_images?.[0]?.url;

  if (!listing) {
    return (
      <Screen title="Property" eyebrow="MaiProp">
        <ThemedText type="small" themeColor="textSecondary">
          Loading property details
        </ThemedText>
      </Screen>
    );
  }

  return (
    <Screen
      title={listing.city}
      eyebrow={titleCase(listing.listing_type)}
      action={
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="chevron-back" size={21} color={theme.text} />
        </Pressable>
      }>
      <Image source={imageUrl ? { uri: imageUrl } : fallbackImage} style={styles.image} contentFit="cover" />

      <View style={styles.titleBlock}>
        <ThemedText style={styles.price}>{formatCurrency(listing.price)}</ThemedText>
        <ThemedText style={styles.title}>{listing.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {listing.address ?? listing.region ?? 'MaiProp verified location'}
        </ThemedText>
      </View>

      <View style={styles.chips}>
        <Chip>{listing.sqm} sqm</Chip>
        {listing.bedrooms ? <Chip>{listing.bedrooms} beds</Chip> : null}
        {listing.bathrooms ? <Chip>{listing.bathrooms} baths</Chip> : null}
        {listing.ai_score ? <Chip>{listing.ai_score} AI score</Chip> : null}
      </View>

      <View style={[styles.description, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText style={styles.sectionTitle}>Overview</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {listing.description ?? 'A curated MaiProp listing with mobile-ready inquiry, viewing, and deal workflow.'}
        </ThemedText>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => Alert.alert('Saved', 'Favorite workflow is ready to wire to the favorites table.')}
          style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="heart-outline" size={18} color={theme.primary} />
          <ThemedText type="smallBold">Save</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert('Viewing', 'Viewing booking can use the existing viewings table next.')}
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
          <Ionicons name="calendar-outline" size={18} color={theme.primaryText} />
          <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
            Book viewing
          </ThemedText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  image: {
    aspectRatio: 16 / 11,
    borderRadius: 8,
    width: '100%',
  },
  titleBlock: {
    gap: 6,
  },
  price: {
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  description: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1.4,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
  },
});
