export function isPlatformAdmin(
  profile: { role?: string } | null
): boolean {
  if (!profile) return false;
  return profile.role === "admin";
}

/** Sell-side: can create listings (agent, seller, developer, institutional). */
export function isSellSideRole(
  profile: { role?: string; participant_type?: string | null } | null
): boolean {
  if (!profile) return false;
  const sellValues = ["agent", "seller", "developer", "institutional"];
  return sellValues.includes(profile.role ?? "") || sellValues.includes(profile.participant_type ?? "");
}

