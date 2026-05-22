import { Ionicons } from '@expo/vector-icons';
import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { useTheme } from '@/hooks/use-theme';

type FilterToolbarProps = PropsWithChildren<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  chips?: Array<{ label: string; value: string }>;
  selectedChip?: string;
  onSelectChip?: (value: string) => void;
}>;

export function FilterToolbar({ value, onChange, placeholder, chips = [], selectedChip, onSelectChip, children }: FilterToolbarProps) {
  const theme = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          returnKeyType="search"
        />
      </View>
      {chips.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {chips.map((chip) => (
            <Chip key={chip.value} active={selectedChip === chip.value} onPress={() => onSelectChip?.(chip.value)}>
              {chip.label}
            </Chip>
          ))}
        </ScrollView>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderTopWidth: 1,
    gap: 10,
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  searchBox: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    minHeight: 44,
  },
  chipRow: {
    gap: 8,
    paddingRight: 18,
  },
});
