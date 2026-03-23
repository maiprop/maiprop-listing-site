/**
 * Auth/role helpers. Use role='admin' as single source of truth.
 * Keeps is_platform_admin fallback for backward compat during migration.
 */

export function isPlatformAdmin(
  profile: { role?: string; is_platform_admin?: boolean } | null
): boolean {
  if (!profile) return false;
  return profile.role === "admin" || !!(profile as { is_platform_admin?: boolean }).is_platform_admin;
}

/** Sell-side: can create listings (agent, seller, developer, institutional).
 *  Checks both `role` (legacy) and `participant_type` (current) — whichever is set. */
export function isSellSideRole(
  profile: { role?: string; participant_type?: string | null } | null
): boolean {
  if (!profile) return false;
  const sellRoles = ["agent", "seller_landlord", "developer", "institutional"];
  const sellTypes = ["agent", "seller", "developer", "institutional"];
  return sellRoles.includes(profile.role ?? "") || sellTypes.includes(profile.participant_type ?? "");
}

/** Buy-side: can access investor dashboard (legacy — no longer used; admin-only access via isPlatformAdmin) */
export function isBuySideRole(_profile: { role?: string } | null): boolean {
  return false;
}
