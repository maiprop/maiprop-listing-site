import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import heroImage from '@/assets/images/maiprop-hero.jpg';

type WebStyleHeroProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  highlight?: string;
  body?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
}>;

export function WebStyleHero({ eyebrow, title, highlight, body, icon = 'sparkles-outline', compact = false, children }: WebStyleHeroProps) {
  const theme = useTheme();
  return (
    <View style={[styles.hero, compact && styles.compactHero]}>
      <Image source={heroImage} style={styles.heroImage} contentFit="cover" />
      <View style={styles.overlay} />
      <View style={styles.content}>
        <View style={[styles.eyebrow, { borderColor: 'rgba(255,255,255,0.32)' }]}>
          <Ionicons name={icon} size={14} color="#5EEAD4" />
          <ThemedText type="smallBold" style={styles.eyebrowText}>
            {eyebrow}
          </ThemedText>
        </View>
        <ThemedText style={styles.title}>
          {title}
          {highlight ? <ThemedText style={[styles.highlight, { color: theme.primary }]}>{`\n${highlight}`}</ThemedText> : null}
        </ThemedText>
        {body ? <ThemedText style={styles.body}>{body}</ThemedText> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 8,
    minHeight: 420,
    overflow: 'hidden',
  },
  compactHero: {
    minHeight: 260,
  },
  heroImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  overlay: {
    backgroundColor: 'rgba(16, 12, 8, 0.66)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  content: {
    flex: 1,
    gap: 14,
    justifyContent: 'flex-end',
    padding: 18,
  },
  eyebrow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  eyebrowText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 39,
  },
  highlight: {
    color: '#5EEAD4',
    fontSize: 35,
    fontWeight: '900',
    lineHeight: 40,
  },
  body: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
});
