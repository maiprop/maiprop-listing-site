import { supabaseRpcJson, type PublicApiEnv } from "./_cache";

export type PublicProfileSummary = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  owner_participant_type: "agent" | "seller" | null;
};

export type PublicProfileDisplay = Pick<
  PublicProfileSummary,
  "user_id" | "display_name" | "avatar_url"
>;

const PUBLIC_PROFILE_CACHE_TTL_MS = 5 * 60_000;
const PUBLIC_PROFILE_CACHE_MAX_ENTRIES = 500;

type CachedPublicProfile = {
  profile: PublicProfileSummary;
  expiresAt: number;
};

const publicProfileCache = new Map<string, CachedPublicProfile>();

function publicProfileCacheKey(
  publicationId: number | null | undefined,
  userId: string,
): string {
  return publicationId == null ? `unscoped:${userId}` : `${publicationId}:${userId}`;
}

function readCachedPublicProfile(
  publicationId: number | null | undefined,
  userId: string,
  nowMs: number,
): PublicProfileSummary | null {
  const cached = publicProfileCache.get(publicProfileCacheKey(publicationId, userId));
  if (!cached || cached.expiresAt <= nowMs) return null;
  return cached.profile;
}

function storePublicProfiles(
  publicationId: number | null | undefined,
  fetched: Map<string, PublicProfileSummary>,
  nowMs: number,
): void {
  for (const [userId, profile] of fetched) {
    const key = publicProfileCacheKey(publicationId, userId);
    if (!publicProfileCache.has(key) && publicProfileCache.size >= PUBLIC_PROFILE_CACHE_MAX_ENTRIES) {
      const oldest = publicProfileCache.keys().next();
      if (!oldest.done) publicProfileCache.delete(oldest.value);
    }
    publicProfileCache.set(key, { profile, expiresAt: nowMs + PUBLIC_PROFILE_CACHE_TTL_MS });
  }
}

export function resetPublicProfileSummaryCacheForTests(): void {
  publicProfileCache.clear();
}

export async function fetchPublicProfileSummaries(
  env: PublicApiEnv,
  ownerIds: Array<string | null | undefined>,
  publicationId?: number | null,
): Promise<Map<string, PublicProfileSummary>> {
  const uniqueOwnerIds = [...new Set(ownerIds.filter((id): id is string => Boolean(id)))];
  if (uniqueOwnerIds.length === 0) return new Map();

  const nowMs = Date.now();
  const profiles = new Map<string, PublicProfileSummary>();
  const missingOwnerIds: string[] = [];
  for (const ownerId of uniqueOwnerIds) {
    const cached = readCachedPublicProfile(publicationId, ownerId, nowMs);
    if (cached) profiles.set(ownerId, cached);
    else missingOwnerIds.push(ownerId);
  }
  if (missingOwnerIds.length === 0) return profiles;

  try {
    const rows = await supabaseRpcJson<PublicProfileSummary>(
      env,
      "get_public_profile_summaries",
      { p_user_ids: missingOwnerIds },
    );
    const fetched = new Map(rows.map((profile) => [profile.user_id, profile]));
    storePublicProfiles(publicationId, fetched, nowMs);
    for (const [userId, profile] of fetched) profiles.set(userId, profile);
    return profiles;
  } catch (error) {
    console.warn("[public-api] Optional public profile enrichment failed", error);
    return profiles;
  }
}

export function publicProfileDisplay(
  profile: PublicProfileSummary | null | undefined,
): PublicProfileDisplay | null {
  if (!profile) return null;
  return {
    user_id: profile.user_id,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
  };
}
