/**
 * Plan limits by audience and plan tier (Free vs Pro).
 * Used for dashboard display and (future) enforcement.
 */

import type { ParticipantId } from "@/lib/participantConfig";

export type PlanTier = "free" | "pro";

export type PlanLimits = {
  // Buy / Rent
  savedSearches: number | null;        // null = unlimited
  searchAlerts: number | null;
  contactsPerMonth: number | null;     // messages to agents/sellers
  // Auctions
  auctionListingsVisible: number | null; // max auction rows visible
  auctionAlerts: number | null;
  // Open Houses
  openHouseRsvp: number | null;        // RSVPs per month
  // Viewings
  viewingsPerMonth: number | null;
  // Listings (seller/agent)
  listings: number | null;
  priorityAds: number | null;
  // AI tools
  valuationsPerMonth: number | null;
  reportsPerMonth: number | null;
  // Professionals directory
  professionalsPerCategory: number | null;
};

const LIMITS: Record<ParticipantId, Record<PlanTier, PlanLimits>> = {
  buyer: {
    free: {
      savedSearches: 1, searchAlerts: 1, contactsPerMonth: 1,
      auctionListingsVisible: 60, auctionAlerts: 1,
      openHouseRsvp: 3, viewingsPerMonth: 1,
      listings: 0, priorityAds: 0,
      valuationsPerMonth: 0, reportsPerMonth: 0,
      professionalsPerCategory: 5,
    },
    pro: {
      savedSearches: null, searchAlerts: 5, contactsPerMonth: null,
      auctionListingsVisible: 600, auctionAlerts: 5,
      openHouseRsvp: null, viewingsPerMonth: 10,
      listings: 5, priorityAds: 0,
      valuationsPerMonth: 5, reportsPerMonth: 3,
      professionalsPerCategory: null,
    },
  },
  seller: {
    free: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 60, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: 2, priorityAds: 0,
      valuationsPerMonth: 0, reportsPerMonth: 0,
      professionalsPerCategory: null,
    },
    pro: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 600, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: 5, priorityAds: 1,
      valuationsPerMonth: 5, reportsPerMonth: 3,
      professionalsPerCategory: null,
    },
  },
  agent: {
    free: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 60, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: 3,
      listings: 5, priorityAds: 0,
      valuationsPerMonth: 0, reportsPerMonth: 0,
      professionalsPerCategory: null,
    },
    pro: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 600, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: 10,
      listings: null, priorityAds: 10,
      valuationsPerMonth: null, reportsPerMonth: null,
      professionalsPerCategory: null,
    },
  },
  developer: {
    free: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: null, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: 0, priorityAds: 0,
      valuationsPerMonth: 0, reportsPerMonth: 0,
      professionalsPerCategory: null,
    },
    pro: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: null, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: null, priorityAds: null,
      valuationsPerMonth: null, reportsPerMonth: null,
      professionalsPerCategory: null,
    },
  },
  professional: {
    free: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: null, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: null, priorityAds: null,
      valuationsPerMonth: 0, reportsPerMonth: 0,
      professionalsPerCategory: null,
    },
    pro: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: null, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: null, priorityAds: null,
      valuationsPerMonth: null, reportsPerMonth: null,
      professionalsPerCategory: null,
    },
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
