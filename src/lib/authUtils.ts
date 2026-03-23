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

/** Sell-side: can create listings (agent, seller_landlord, developer, institutional) */
export function isSellSideRole(profile: { role?: string } | null): boolean {
  if (!profile?.role) return false;
  return ["agent", "seller_landlord", "developer", "institutional"].includes(profile.role);
}

/** Buy-side: can access investor dashboard (legacy — no longer used; admin-only access via isPlatformAdmin) */
export function isBuySideRole(_profile: { role?: string } | null): boolean {
  return false;
}
