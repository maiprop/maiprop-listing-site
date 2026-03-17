/**
 * Plan limits by audience and plan tier (Free vs Pro).
 * Used for dashboard display and (future) enforcement.
 */

import type { ParticipantId } from "@/lib/participantConfig";

export type PlanTier = "free" | "pro";

export type PlanLimits = {
  savedSearches: number | null;      // null = unlimited
  searchAlerts: number | null;
  viewingsPerMonth: number | null;   // as requester (buyer) or owner (seller/agent)
  auctionAlerts: number | null;
  listings: number | null;            // seller/agent
  professionalsPerCategory?: number | null; // buyer free: 5
};

const LIMITS: Record<ParticipantId, Record<PlanTier, PlanLimits>> = {
  buyer: {
    free:  { savedSearches: 1, searchAlerts: 1, viewingsPerMonth: 1, auctionAlerts: 1, listings: null, professionalsPerCategory: 5 },
    pro:   { savedSearches: null, searchAlerts: 5, viewingsPerMonth: 10, auctionAlerts: 5, listings: null, professionalsPerCategory: null },
  },
  seller: {
    free:  { savedSearches: null, searchAlerts: null, viewingsPerMonth: null, auctionAlerts: null, listings: 2 },
    pro:   { savedSearches: null, searchAlerts: null, viewingsPerMonth: null, auctionAlerts: null, listings: 5 },
  },
  agent: {
    free:  { savedSearches: null, searchAlerts: null, viewingsPerMonth: 3, auctionAlerts: null, listings: 5 },
    pro:   { savedSearches: null, searchAlerts: null, viewingsPerMonth: 10, auctionAlerts: null, listings: null },
  },
  developer: {
    free:  { savedSearches: null, searchAlerts: null, viewingsPerMonth: null, auctionAlerts: null, listings: null },
    pro:   { savedSearches: null, searchAlerts: null, viewingsPerMonth: null, auctionAlerts: null, listings: null },
  },
  professional: {
    free:  { savedSearches: null, searchAlerts: null, viewingsPerMonth: null, auctionAlerts: null, listings: null },
    pro:   { savedSearches: null, searchAlerts: null, viewingsPerMonth: null, auctionAlerts: null, listings: null },
  },
};

export function getPlanLimits(audience: ParticipantId, tier: PlanTier): PlanLimits {
  const def = LIMITS[audience]?.[tier] ?? LIMITS.buyer.free;
  return { ...def };
}

/** First day of current month (UTC) for viewings count */
export function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
