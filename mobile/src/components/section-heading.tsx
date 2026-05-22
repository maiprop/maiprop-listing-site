import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const theme = useTheme();
  const actionContent = action ? (
    <ThemedText type="smallBold" style={{ color: theme.primary }}>
      {action}
    </ThemedText>
  ) : null;

  return (
    <View style={styles.row}>
      <ThemedText style={styles.title}>{title}</ThemedText>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={onAction}
          style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.72 : 1 }]}>
          {actionContent}
          <Ionicons name="arrow-forward" size={15} color={theme.primary} />
        </Pressable>
      ) : (
        actionContent
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  actionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minHeight: 32,
  },
});
