/**
 * Shared participant type configuration.
 * Used by Dashboard, Pricing, Onboarding, and Signup for consistent role/audience mapping.
 */

export type ParticipantId =
  | "buyer"
  | "seller"
  | "agent"
  | "developer"
  | "professional";

/**
 * Derives the participant type (dashboard/audience key) from a user profile.
 * Uses bio __type: prefix for sub-roles; falls back to role when bio is absent.
 */
export function getParticipantTypeFromProfile(
  profile: { role?: string; bio?: string | null } | null
): ParticipantId {
  if (!profile) return "buyer";
  const bio = profile.bio ?? "";
  if (bio.startsWith("__type:developer")) return "developer";
  if (bio.startsWith("__type:seller")) return "seller";
  if (bio.startsWith("__type:professional")) return "professional";
  if (bio.startsWith("__type:agent")) return "agent";
  if (bio.startsWith("__type:buyer")) return "buyer";
  if (profile.role === "admin" || profile.role === "agent") return "agent";
  if (profile.role === "professional") return "professional";
  if (profile.role === "seller_landlord") return "seller";
  if (profile.role === "developer") return "developer";
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
  buyer: "Buyer / Renter",
  seller: "Seller / Landlord",
  agent: "Agent",
  developer: "Developer",
  professional: "Professional",
};
