/**
 * Shared participant type configuration.
 * Used by Dashboard, Pricing, Onboarding, and Signup for consistent role/audience mapping.
 *
 * DB role enum and participant_type column now share the same values:
 *   buyer | seller | agent | developer | professional | investor | institutional | admin
 */

import { isPlatformAdmin } from "@/lib/authUtils";

/** Internal participant type — used by Dashboard nav and plan limits */
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
export type PricingAudienceId = "participant" | "agent" | "developer" | "professional" | "investor" | "institutional";

function isValidParticipantId(v: string): v is ParticipantId {
  return ["buyer", "seller", "agent", "developer", "professional", "investor", "institutional"].includes(v);
}

/**
 * Strict participant type resolver used by onboarding/route guards.
 * Returns null until onboarding has explicitly written participant_type.
 */
export function getExplicitParticipantTypeFromProfile(
  profile: { participant_type?: string | null } | null
): ParticipantId | null {
  if (!profile?.participant_type) return null;
  return isValidParticipantId(profile.participant_type) ? profile.participant_type : null;
}

/**
 * Derives the participant type from a user profile.
 * Resolution order:
 *   1. participant_type column (primary — set by Onboarding since migration 20260522100000)
 *   2. role column (same values, direct match)
 *   3. bio __type: prefix (READ-ONLY legacy fallback for rows created before participant_type
 *      existed; no new code writes this prefix — safe to remove once all rows are migrated)
 */
export function getParticipantTypeFromProfile(
  profile: { role?: string | null; bio?: string | null; participant_type?: string | null } | null
): ParticipantId {
  if (!profile) return "buyer";

  // Primary: participant_type column
  if (profile.participant_type && isValidParticipantId(profile.participant_type)) {
    return profile.participant_type as ParticipantId;
  }

  // Role column — now uses the same values as ParticipantId
  if (profile.role && isValidParticipantId(profile.role)) {
    return profile.role as ParticipantId;
  }
  if (isPlatformAdmin(profile)) return "agent"; // admin uses agent dashboard tabs

  // Legacy fallback: bio __type: prefix (pre-migration rows only)
  const bio = profile.bio ?? "";
  if (bio.startsWith("__type:developer"))    return "developer";
  if (bio.startsWith("__type:seller"))       return "seller";
  if (bio.startsWith("__type:professional")) return "professional";
  if (bio.startsWith("__type:agent"))        return "agent";
  if (bio.startsWith("__type:buyer"))        return "buyer";

  return "buyer";
}

/** Derive owner type for listing display: agent vs private seller */
export function getOwnerParticipantType(profile: { role?: string | null; bio?: string | null } | null): "agent" | "seller" | null {
  if (!profile) return null;
  if (isPlatformAdmin(profile) || profile.role === "agent" || profile.role === "developer") return "agent";
  if (profile.role === "seller") return "seller";
  // Legacy bio fallback — read-only, new profiles set role directly
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
  profile: { role?: string | null; bio?: string | null; participant_type?: string | null } | null
): PricingAudienceId {
  const pt = getParticipantTypeFromProfile(profile);
  if (pt === "buyer" || pt === "seller") return "participant";
  if (pt === "investor") return "investor";
  if (pt === "institutional") return "institutional";
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
