import { isPlatformAdmin } from "@/lib/authUtils";

type PastDealsProfile = {
  role?: string | null;
  participant_type?: string | null;
  is_platform_admin?: boolean | null;
  role_switch_in_progress_at?: string | null;
} | null;

export const canAccessPastDeals = (
  profile: PastDealsProfile,
  isPro: boolean,
): boolean => {
  if (!isPro || !profile || profile.role_switch_in_progress_at) return false;
  if (isPlatformAdmin(profile)) return true;
  return profile.role === "investor" || profile.role === "institutional";
};
