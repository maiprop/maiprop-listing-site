/**
 * Shared participant type configuration.
 * Used by Dashboard, Pricing, Onboarding, and Signup for consistent role/audience mapping.
 */

export type ParticipantId =
  | "buyer"
  | "seller"
  | "investor"
  | "agent"
  | "institutional"
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
  if (bio.startsWith("__type:investor")) return "investor";
  if (bio.startsWith("__type:institutional")) return "institutional";
  if (bio.startsWith("__type:developer")) return "developer";
  if (bio.startsWith("__type:seller")) return "seller";
  if (bio.startsWith("__type:professional")) return "professional";
  if (profile.role === "agent") return "agent";
  if (profile.role === "professional") return "professional";
  if (profile.role === "seller_landlord") return "seller";
  return "buyer";
}

export const PARTICIPANT_LABELS: Record<ParticipantId, string> = {
  buyer: "Buyer / Renter",
  seller: "Seller / Landlord",
  investor: "Investor",
  agent: "Real Estate Agent",
  institutional: "Institutional",
  developer: "Developer",
  professional: "Professional",
};
