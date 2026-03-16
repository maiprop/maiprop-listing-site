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
