import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { askMaiPropAgent, type AgentAdvice } from '@/lib/agent-client';
import { useAuth } from '@/providers/auth-context';
import type { Listing } from '@/types/domain';
import { useTheme } from '@/hooks/use-theme';

const prompts = [
  'What should I view first?',
  'Find a good auction',
  'Any open houses this week?',
];

export function AgentAdvisor({ listings }: { listings: Listing[] }) {
  const theme = useTheme();
  const { user, activeRole } = useAuth();
  const [message, setMessage] = useState('What should I view first?');
  const [advice, setAdvice] = useState<AgentAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleSuggestions = useMemo(() => advice?.suggestions?.slice(0, 3) ?? [], [advice]);

  async function submit(nextMessage = message) {
    const clean = nextMessage.trim();
    if (!clean || loading) return;
    setMessage(clean);
    setLoading(true);
    setError(null);
    try {
      const result = await askMaiPropAgent({
        message: clean,
        sessionId: user?.id,
        role: activeRole,
        listings,
      });
      setAdvice(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MaiProp advisor is unavailable.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="sparkles-outline" size={22} color={theme.primary} />
        </View>
        <View style={styles.headerCopy}>
          <ThemedText style={styles.title}>MaiProp Advisor</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Ask once. Get the next best move across listings, auctions, open houses, and pros.
          </ThemedText>
        </View>
      </View>

      <View style={[styles.inputRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Ask what to view, compare, or bid on"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          onSubmitEditing={() => submit()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask MaiProp Advisor"
          onPress={() => submit()}
          style={[styles.askButton, { backgroundColor: theme.primary, opacity: loading ? 0.72 : 1 }]}>
          {loading ? <ActivityIndicator color={theme.primaryText} /> : <Ionicons name="arrow-forward" size={18} color={theme.primaryText} />}
        </Pressable>
      </View>

      <View style={styles.promptRow}>
        {prompts.map((prompt) => (
          <Pressable
            key={prompt}
            onPress={() => submit(prompt)}
            style={({ pressed }) => [
              styles.prompt,
              { borderColor: theme.border, backgroundColor: theme.background, opacity: pressed ? 0.72 : 1 },
            ]}>
            <ThemedText type="smallBold">{prompt}</ThemedText>
          </Pressable>
        ))}
      </View>

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}

      {advice ? (
        <View style={styles.answerBlock}>
          <ThemedText type="small" themeColor="textSecondary">
            {advice.answer}
          </ThemedText>
          {visibleSuggestions.length ? (
            <View style={styles.suggestions}>
              {visibleSuggestions.map((item) => (
                <Pressable
                  key={item.listingId}
                  onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.listingId } })}
                  style={({ pressed }) => [
                    styles.suggestion,
                    { borderColor: theme.border, backgroundColor: theme.background, opacity: pressed ? 0.72 : 1 },
                  ]}>
                  <View style={styles.suggestionScore}>
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>
                      {item.score}
                    </ThemedText>
                  </View>
                  <View style={styles.suggestionCopy}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {item.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      {item.reason}
                    </ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={theme.textSecondary} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  inputRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    paddingLeft: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    minHeight: 50,
  },
  askButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    width: 52,
  },
  promptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  prompt: {
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  answerBlock: {
    gap: 12,
  },
  suggestions: {
    gap: 8,
  },
  suggestion: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 70,
    padding: 10,
  },
  suggestionScore: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
  },
  suggestionCopy: {
    flex: 1,
    gap: 2,
  },
});
