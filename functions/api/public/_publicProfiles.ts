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

export async function fetchPublicProfileSummaries(
  env: PublicApiEnv,
  ownerIds: Array<string | null | undefined>,
): Promise<Map<string, PublicProfileSummary>> {
  const uniqueOwnerIds = [...new Set(ownerIds.filter((id): id is string => Boolean(id)))];
  if (uniqueOwnerIds.length === 0) return new Map();

  try {
    const rows = await supabaseRpcJson<PublicProfileSummary>(
      env,
      "get_public_profile_summaries",
      { p_user_ids: uniqueOwnerIds },
    );
    return new Map(rows.map((profile) => [profile.user_id, profile]));
  } catch (error) {
    console.warn("[public-api] Optional public profile enrichment failed", error);
    return new Map();
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
