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
  // Viewing booking requests. Seller-hosted viewings are not capped here.
  viewingsPerMonth: number | null;
  // Listings (seller/agent)
  listings: number | null;
  spotlightAds: number | null;
  priorityAds: number | null;
  // AI tools
  valuationsPerMonth: number | null;
  reportsPerMonth: number | null;
  // Professionals directory
  professionalsPerCategory: number | null;
};

type RoleLimits = { free: PlanLimits; pro: PlanLimits };

export type PlanAudienceId = ParticipantId | "admin";

const ADMIN_LIMITS: PlanLimits = {
  savedSearches: null,
  searchAlerts: null,
  contactsPerMonth: null,
  auctionListingsVisible: 600,
  auctionAlerts: null,
  openHouseRsvp: null,
  viewingsPerMonth: null,
  listings: null,
  spotlightAds: null,
  priorityAds: null,
  valuationsPerMonth: null,
  reportsPerMonth: null,
  professionalsPerCategory: null,
};

const LIMITS: Record<ParticipantId, RoleLimits> = {
  buyer: {
    free: {
      savedSearches: 1, searchAlerts: 1, contactsPerMonth: 1,
      auctionListingsVisible: 60, auctionAlerts: 1,
      openHouseRsvp: 3, viewingsPerMonth: 1,
      listings: 0, spotlightAds: 0, priorityAds: 0,
      valuationsPerMonth: 5, reportsPerMonth: 0,
      professionalsPerCategory: 5,
    },
    pro: {
      savedSearches: null, searchAlerts: 5, contactsPerMonth: null,
      auctionListingsVisible: 600, auctionAlerts: 5,
      openHouseRsvp: null, viewingsPerMonth: 10,
      listings: 5, spotlightAds: 0, priorityAds: 0,
      valuationsPerMonth: 50, reportsPerMonth: 3,
      professionalsPerCategory: null,
    },
  },
  seller: {
    free: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 60, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: 1,
      listings: 2, spotlightAds: 0, priorityAds: 0,
      valuationsPerMonth: 5, reportsPerMonth: 0,
      professionalsPerCategory: null,
    },
    pro: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 600, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: 10,
      listings: 5, spotlightAds: 1, priorityAds: 0,
      valuationsPerMonth: 50, reportsPerMonth: 3,
      professionalsPerCategory: null,
    },
  },
  agent: {
    free: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 60, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: 3,
      listings: 5, spotlightAds: 0, priorityAds: 0,
      valuationsPerMonth: 5, reportsPerMonth: 0,
      professionalsPerCategory: null,
    },
    pro: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 600, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: 10,
      listings: null, spotlightAds: 0, priorityAds: 10,
      valuationsPerMonth: 50, reportsPerMonth: null,
      professionalsPerCategory: null,
    },
  },
  developer: {
    free: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 60, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: 0, spotlightAds: 0, priorityAds: 0,
      valuationsPerMonth: 0, reportsPerMonth: 0,
      professionalsPerCategory: null,
    },
    pro: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 600, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: null, spotlightAds: 1, priorityAds: 1,
      valuationsPerMonth: 50, reportsPerMonth: null,
      professionalsPerCategory: null,
    },
  },
  professional: {
    free: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 60, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: null, spotlightAds: 0, priorityAds: 0,
      valuationsPerMonth: 5, reportsPerMonth: 0,
      professionalsPerCategory: null,
    },
    pro: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 600, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: null, spotlightAds: 0, priorityAds: 0,
      valuationsPerMonth: 50, reportsPerMonth: null,
      professionalsPerCategory: null,
    },
  },
  investor: {
    free: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 60, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: 0, spotlightAds: 0, priorityAds: 0,
      valuationsPerMonth: 0, reportsPerMonth: 0,
      professionalsPerCategory: null,
    },
    pro: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 600, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: null, spotlightAds: 0, priorityAds: 0,
      valuationsPerMonth: 50, reportsPerMonth: null,
      professionalsPerCategory: null,
    },
  },
  institutional: {
    free: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 60, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: 0, spotlightAds: 0, priorityAds: 0,
      valuationsPerMonth: 0, reportsPerMonth: 0,
      professionalsPerCategory: null,
    },
    pro: {
      savedSearches: null, searchAlerts: null, contactsPerMonth: null,
      auctionListingsVisible: 600, auctionAlerts: null,
      openHouseRsvp: null, viewingsPerMonth: null,
      listings: null, spotlightAds: 0, priorityAds: 0,
      valuationsPerMonth: 50, reportsPerMonth: null,
      professionalsPerCategory: null,
    },
  },
};

export function getPlanLimits(audience: PlanAudienceId, tier: PlanTier): PlanLimits {
  if (audience === "admin") return { ...ADMIN_LIMITS };

  const limits = LIMITS[audience];
  if (!limits) {
    // Fallback to buyer free tier with proper type assertion
    const buyerLimits = LIMITS.buyer as { free: PlanLimits; pro: PlanLimits };
    return tier === "free" ? buyerLimits.free : buyerLimits.pro;
  }

  const def = tier === "free" ? limits.free : limits.pro;
  return { ...def };
}

/** First day of current month (UTC) for viewings count */
export function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
