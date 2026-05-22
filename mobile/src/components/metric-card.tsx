import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { DashboardMetric } from '@/types/domain';

export function MetricCard({ metric }: { metric: DashboardMetric }) {
  const theme = useTheme();
  const tone =
    metric.tone === 'primary'
      ? theme.primary
      : metric.tone === 'accent'
        ? theme.accent
        : metric.tone === 'success'
          ? theme.success
          : theme.textSecondary;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <ThemedText style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
        {metric.value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
        {metric.label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minHeight: 104,
    minWidth: 112,
    padding: 14,
  },
  dot: {
    borderRadius: 999,
    height: 8,
    width: 34,
  },
  value: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
  },
});
