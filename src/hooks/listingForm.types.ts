/**
 * Shared types for the listing-form wizard.
 *
 * Extracted from useListingForm.ts to break the circular dependency between
 * useListingForm <-> useListingAI / useListingDraft. Both consumer hooks now
 * import their types from this file (which has no runtime imports), and
 * useListingForm.ts re-exports them for backwards compatibility with existing
 * call sites (`import { type ListingFormData } from "@/hooks/useListingForm"`).
 *
 * See docs/ENTERPRISE_ASSESSMENT_2026-04-27.md (Quadrant I, circular deps).
 */

export type PropertyType = "apartment" | "house" | "villa" | "land" | "commercial" | "office";
export type ListingType = "sale" | "rent" | "auction" | "open_house";
export type WizardStep = "type" | "details" | "features" | "location" | "pricing" | "photos";

export interface AIPriceSuggestion {
  min: number;
  max: number;
  suggested: number;
  confidence: string;
  reasoning: string;
}

export interface ListingFormData {
  listing_type: ListingType;
  property_type: PropertyType;
  title: string;
  description: string;
  sqm: string;
  year_built: string;
  energy_class: string;
  bedrooms: string;
  bathrooms: string;
  wc_count: string;
  kitchens: string;
  living_rooms: string;
  floor: string;
  total_floors: string;
  levels: string;
  heating_system: string;
  construction_status: string;
  commercial_subtype: string;
  plot_surface: string;
  floor_height: string;
  // Boolean features
  has_elevator: boolean; has_ac: boolean; has_solar_water: boolean; has_storage: boolean;
  has_secure_door: boolean; has_alarm: boolean; has_cctv: boolean; has_security: boolean;
  has_smart_home: boolean; has_fireplace: boolean; has_underfloor_heating: boolean;
  has_furnished: boolean; has_internal_staircase: boolean; has_double_glazing: boolean;
  has_window_screens: boolean; has_night_power: boolean; has_attic: boolean;
  has_satellite: boolean; has_painted: boolean;
  has_parking: boolean; has_balcony: boolean; has_garden: boolean; has_pool: boolean;
  has_view: boolean; has_facade: boolean; has_awning: boolean; has_disability_access: boolean;
  is_corner: boolean; is_penthouse: boolean; is_neoclassical: boolean; is_preserved: boolean;
  has_virtual_tour: boolean; has_video_tour: boolean;
  suitable_student: boolean; suitable_holiday: boolean; suitable_investment: boolean; suitable_commercial_use: boolean;
  has_three_phase_power: boolean; has_loading_dock: boolean; has_structured_cabling: boolean; has_equipped: boolean;
  is_pre_sale: boolean; is_off_market: boolean;
  is_buildable: boolean; within_city_plan: boolean; within_settlement: boolean;
  has_water_supply: boolean; has_electricity_supply: boolean; has_land_concession: boolean;
  // Land
  coverage_ratio: string; building_allowance: string; facade_length: string; plot_depth: string;
  slope: string; zone_type: string; road_type: string; land_use: string;
  distance_from_sea: string; distance_from_city: string;
  // Location
  address: string; city: string; region: string; postal_code: string;
  latitude: string; longitude: string;
  cadastre_number: string; enfia_zone: string;
  // Pricing
  price: string; auction_starting_bid: string; auction_date: string; auction_court: string; open_house_date: string;
  deposit_months: string; monthly_expenses: string; agent_fee_included: boolean;
  pets_allowed: boolean; short_term_rental: boolean; available_from: string; min_rental_months: string;
  // Pro
  is_featured: boolean;
  priority_placement: number;
  is_exclusive: boolean;
}
