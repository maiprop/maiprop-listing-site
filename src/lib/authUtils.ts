/**
 * Auth/role helpers.
 *
 * Source of truth: `role` column in the `profiles` DB table.
 * Do NOT use email-based admin checks — role is authoritative and server-enforced.
 */

export function isPlatformAdmin(
  profile: { role?: string | null } | null
): boolean {
  if (!profile) return false;
  return profile.role === "admin";
}

export function isSellerRole(
  profile: { role?: string | null } | null
): boolean {
  if (!profile) return false;
  return profile.role === "seller";
}

/** Sell-side: can create listings (agent, seller, developer, institutional).
 *  SECURITY: relies solely on the trigger-protected `role` column.
 *  `participant_type` is user-writable and must NOT be used for authorization. */
export function isSellSideRole(
  profile: { role?: string | null } | null
): boolean {
  if (!profile) return false;
  const sellRoles = ["agent", "seller", "developer", "institutional"];
  return sellRoles.includes(profile.role ?? "");
}

