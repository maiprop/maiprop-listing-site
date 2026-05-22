import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ProfessionalCard } from '@/components/professional-card';
import { Screen } from '@/components/screen';
import { SectionHeading } from '@/components/section-heading';
import { ThemedText } from '@/components/themed-text';
import { WebStyleHero } from '@/components/web-style-hero';
import { professionalGroups } from '@/data/page-content';
import { useProfessionals } from '@/hooks/use-listings';
import { useTheme } from '@/hooks/use-theme';

export default function ProfessionalsScreen() {
  const params = useLocalSearchParams<{ search?: string }>();
  const theme = useTheme();
  const [search, setSearch] = useState(params.search ?? '');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const { data = [], isFetching } = useProfessionals({ search, categoryGroup: selectedGroup, limit: 40 });

  const filtered = useMemo(() => {
    if (!selectedGroup) return data;
    const group = professionalGroups.find((item) => item.id === selectedGroup);
    if (!group) return data;
    return data.filter((professional) => group.categories.includes(professional.category));
  }, [data, selectedGroup]);

  const activeGroup = professionalGroups.find((item) => item.id === selectedGroup);

  return (
    <Screen title="" contentStyle={styles.screen}>
      <WebStyleHero
        compact
        icon="people-outline"
        eyebrow="Professional Directory"
        title="The right expert,"
        highlight="one click away"
        body="A curated directory of verified property professionals across Greece."
      />

      <View style={styles.categoryPanel}>
        <View style={styles.categoryRow}>
          <Chip active={!selectedGroup} onPress={() => setSelectedGroup(null)}>
            All Professionals
          </Chip>
          {professionalGroups.map((group) => (
            <Chip key={group.id} active={selectedGroup === group.id} onPress={() => setSelectedGroup(group.id)}>
              {group.short}
            </Chip>
          ))}
        </View>
      </View>

      <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, specialty, city..."
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
        />
      </View>

      <SectionHeading
        title="Directory"
        action={isFetching ? 'Loading' : `${filtered.length} professional${filtered.length === 1 ? '' : 's'} found`}
      />
      {activeGroup ? (
        <View style={[styles.activeGroup, { backgroundColor: theme.backgroundElement, borderColor: activeGroup.tone }]}>
          <ThemedText type="smallBold" style={{ color: activeGroup.tone }}>
            {activeGroup.label}
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.list}>
        {filtered.map((professional) => (
          <ProfessionalCard key={professional.id} professional={professional} />
        ))}
      </View>

      <View style={[styles.joinCta, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText style={styles.joinTitle}>Are you a Professional?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Join verified experts and receive qualified property leads.
        </ThemedText>
        <Pressable style={[styles.joinButton, { backgroundColor: theme.accent }]}>
          <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
            Create Pro Profile - Free
          </ThemedText>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 6,
  },
  categoryPanel: {
    gap: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  searchBox: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    minHeight: 48,
  },
  activeGroup: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  list: {
    gap: 12,
  },
  joinCta: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  joinTitle: {
    fontSize: 21,
    fontWeight: '900',
  },
  joinButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 16,
  },
});
