/**
 * Pure helpers for the Messages page. Extracted so they can be unit-tested
 * without spinning up the React tree, Supabase client, or react-router.
 */

export type ConversationProfile = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
} | null | undefined;

export type ConversationLike = {
  profile_a?: ConversationProfile;
  profile_b?: ConversationProfile;
} | undefined;

/**
 * Returns the "other" participant profile in a 2-party conversation.
 * If the supplied userId matches profile_a, profile_b is returned and vice versa.
 * Returns null when the conversation is undefined.
 */
export function getOtherProfile(conv: ConversationLike, userId: string): ConversationProfile {
  if (!conv) return null;
  return conv.profile_a?.user_id === userId ? conv.profile_b ?? null : conv.profile_a ?? null;
}

/**
 * Builds 1- or 2-letter initials from a display name. Empty / falsy names
 * return "?" so the avatar placeholder is never blank.
 */
export function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
