/**
 * Shared participant type configuration.
 * Used by Dashboard, Pricing, Onboarding, and Signup for consistent role/audience mapping.
 */

/** Detailed internal type — used by Dashboard nav and plan limits */
export type ParticipantId =
  | "buyer"
  | "seller"
  | "agent"
  | "developer"
  | "professional"
  | "investor"
  | "institutional";

/**
 * Top-level pricing audience — buyer and seller are merged into "participant".
 * Used by Pricing page tab strip.
 */
export type PricingAudienceId = "participant" | "agent" | "developer" | "professional";

function isValidParticipantId(v: string): v is ParticipantId {
  return ["buyer", "seller", "agent", "developer", "professional", "investor", "institutional"].includes(v);
}

/**
 * Derives the participant type (dashboard/audience key) from a user profile.
 * Resolution order:
 *   1. participant_type column (clean path, post-migration)
 *   2. bio __type: prefix (legacy fallback)
 *   3. role column (final fallback)
 */
export function getParticipantTypeFromProfile(
  profile: { role?: string; bio?: string | null; participant_type?: string | null } | null
): ParticipantId {
  if (!profile) return "buyer";
  // Primary: dedicated column (clean path)
  if (profile.participant_type && isValidParticipantId(profile.participant_type)) {
    return profile.participant_type as ParticipantId;
  }
  // Fallback: bio __type: prefix (legacy)
  const bio = profile.bio ?? "";
  if (bio.startsWith("__type:developer"))    return "developer";
  if (bio.startsWith("__type:seller"))       return "seller";
  if (bio.startsWith("__type:professional")) return "professional";
  if (bio.startsWith("__type:agent"))        return "agent";
  if (bio.startsWith("__type:buyer"))        return "buyer";
  // Fallback: role column
  if (profile.role === "admin" || profile.role === "agent") return "agent";
  if (profile.role === "professional")    return "professional";
  if (profile.role === "seller_landlord") return "seller";
  if (profile.role === "developer")       return "developer";
  if (profile.role === "investor")        return "investor";
  if (profile.role === "institutional")   return "institutional";
  return "buyer";
}

/** Derive owner type for listing display: agent vs private seller/landlord */
export function getOwnerParticipantType(profile: { role?: string; bio?: string | null } | null): "agent" | "seller" | null {
  if (!profile) return null;
  if (["admin", "agent", "developer"].includes(profile.role || "")) return "agent";
  if (profile.role === "seller_landlord") return "seller";
  const bio = profile.bio ?? "";
  if (bio.startsWith("__type:seller")) return "seller";
  if (bio.startsWith("__type:agent") || bio.startsWith("__type:developer")) return "agent";
  return null;
}

export const PARTICIPANT_LABELS: Record<ParticipantId, string> = {
  buyer:         "Looking for Property",
  seller:        "Selling / Renting Out",
  agent:         "Agent / Agency",
  developer:     "Developer / Builder",
  professional:  "Service Professional",
  investor:      "Investor",
  institutional: "Institutional Investor",
};

/**
 * Maps a profile to the pricing audience tab.
 * Buyers and sellers are both "participant" on the pricing page.
 */
export function getPricingAudienceFromProfile(
  profile: { role?: string; bio?: string | null; participant_type?: string | null } | null
): PricingAudienceId {
  const pt = getParticipantTypeFromProfile(profile);
  if (pt === "buyer" || pt === "seller") return "participant";
  return pt;
}

/**
 * Returns true when the user has opted into investor mode.
 * investor_mode is a boolean feature toggle available to any participant type.
 */
export function isInvestorMode(
  profile: { investor_mode?: boolean | null } | null
): boolean {
  return profile?.investor_mode === true;
}
