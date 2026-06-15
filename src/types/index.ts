/**
 * Central domain types for maiprop.
 *
 * Import shared types from here instead of redefining them in individual pages.
 * DB row types live in supabase/types.ts — use Tables<"tableName"> for those.
 */

// ─── Supabase re-exports ──────────────────────────────────────────────────────
export type { Json, Database } from "@/integrations/supabase/types";
export type { Tables, TablesInsert, TablesUpdate, Enums } from "@/integrations/supabase/types";

// ─── DB enum aliases ──────────────────────────────────────────────────────────
import type { Enums } from "@/integrations/supabase/types";

/** apartment | house | villa | land | commercial | office */
export type PropertyType = Enums<"property_type">;

/** sale | rent | auction | firesale | open_house */
export type ListingType = Enums<"listing_type">;

/** buyer | agent | professional | seller | admin | investor | institutional | developer */
export type UserRole = Enums<"user_role">;

export type ViewingStatus = Enums<"viewing_status">;
export type ViewingType = Enums<"viewing_type">;
export type ProfessionalCategory = Enums<"professional_category">;

// ─── Participant / plan types (re-exported from participantConfig) ─────────────
export type { ParticipantId, PricingAudienceId } from "@/lib/participantConfig";

// ─── Listing card ─────────────────────────────────────────────────────────────
/**
 * UI representation of a listing produced by dbListingToCard().
 * Use this type instead of `any` when passing listing data between components.
 */
export interface ListingCard {
  id: string;
  title: string;
  address: string;
  city: string;
  price: number;
  pricePerSqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqm: number;
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  energyClass?: string;
  images: string[];
  type: PropertyType;
  listingType: ListingType;
  openHouseTransactionType?: "sale" | "rent" | null;
  ownerParticipantType?: "agent" | "seller" | null;
  agent?: { name: string; verified: boolean; avatar?: string };
  auctionDate?: string;
  openHouseDateIso?: string;
  auctionStartingBid?: number;
  aiScore?: number;
  views?: number;
  tags?: string[];
  hasVideo?: boolean;
  hasVirtualTour?: boolean;
  ownershipStatus?: string;
  ownershipPercentage?: number;
  isFeatured?: boolean;
  priorityPlacement?: number;
  isPreSale?: boolean;
  constructionStatus?: string;
  newBuildUnitSizeMin?: number;
  newBuildUnitSizeMax?: number;
  newBuildUnitCount?: number;
  newBuildAvailableUnitCount?: number;
  newBuildDeliveryYear?: number;
  /** Only present when dbListingToCard is called with includeCoordinates: true */
  latitude?: number;
  longitude?: number;
  walkabilityScore?: number;
  safetyScore?: number;
  noiseScore?: number;
  /** Only present when dbListingToCard is called with includeRaw: true */
  _raw?: unknown;
}

// ─── Energy classification ────────────────────────────────────────────────────
export type EnergyClass = "A+" | "A" | "B+" | "B" | "C" | "D" | "E" | "F" | "G" | "Exempt";

export interface EnergyScaleEntry {
  cls: EnergyClass;
  /** Hex fill colour for the gauge bar */
  hex: string;
  /** Percentage along the scale (used for bar width) */
  pct: number;
  /** Human-readable description shown on hover */
  desc: string;
}

/**
 * EU energy-class scale, A+ (best) → G (worst).
 * Single source of truth — previously duplicated in PropertyDetail and NewBuildDetail.
 */
export const ENERGY_SCALE: EnergyScaleEntry[] = [
  { cls: "A+", hex: "#1a9e4f", pct: 8,   desc: "< 33 kWh/m²·yr — Excellent" },
  { cls: "A",  hex: "#2db84e", pct: 17,  desc: "33–50 kWh/m²·yr — Very Good" },
  { cls: "B+", hex: "#7dc73a", pct: 26,  desc: "50–75 kWh/m²·yr — Good" },
  { cls: "B",  hex: "#b5d934", pct: 35,  desc: "75–100 kWh/m²·yr — Above Average" },
  { cls: "C",  hex: "#f5d31b", pct: 50,  desc: "100–125 kWh/m²·yr — Average" },
  { cls: "D",  hex: "#f5a623", pct: 62,  desc: "125–160 kWh/m²·yr — Below Average" },
  { cls: "E",  hex: "#f07320", pct: 74,  desc: "160–200 kWh/m²·yr — Poor" },
  { cls: "F",  hex: "#e84020", pct: 86,  desc: "200–250 kWh/m²·yr — Very Poor" },
  { cls: "G",  hex: "#cc1414", pct: 100, desc: "> 250 kWh/m²·yr — Extremely Poor" },
];

/** Tailwind class pairs for energy-class badge colouring. */
export const ENERGY_COLORS: Record<EnergyClass, string> = {
  "A+":     "bg-[#1a9e4f] text-white",
  "A":      "bg-[#2db84e] text-white",
  "B+":     "bg-[#7dc73a] text-white",
  "B":      "bg-[#b5d934] text-black",
  "C":      "bg-[#f5d31b] text-black",
  "D":      "bg-[#f5a623] text-black",
  "E":      "bg-[#f07320] text-white",
  "F":      "bg-[#e84020] text-white",
  "G":      "bg-[#cc1414] text-white",
  "Exempt": "bg-gray-300 text-black",
};

/** All valid energy-class strings including Exempt (for form selects). */
export const ENERGY_CLASSES: EnergyClass[] = ["A+", "A", "B+", "B", "C", "D", "E", "F", "G", "Exempt"];

// ─── Image upload ─────────────────────────────────────────────────────────────
/** A single image slot in any listing/profile upload flow. */
export interface UploadedImage {
  id: string;
  url: string;
  file?: File;
  uploading?: boolean;
  error?: string;
}

// ─── Filter / search UI primitives ───────────────────────────────────────────
export interface PriceRange {
  label: string;
  value: string;
}

export interface FilterOption<T extends string = string> {
  label: string;
  value: T;
}

export interface SortOption {
  /** i18n key, resolved via t(labelKey) */
  labelKey: string;
  value: string;
}
