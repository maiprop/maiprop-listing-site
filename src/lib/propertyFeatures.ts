/**
 * Builds the feature-group arrays and detail-row table for a listing.
 * Extracted from PropertyDetail to keep that component under manageable size.
 */
import type { ElementType } from "react";
import {
  Building2, Thermometer, Zap, Home, Shield, Eye, Flame,
  Wifi, Wrench, Car, TreePine,
} from "lucide-react";
import { HEATING_TYPES, CONDITION_OPTIONS } from "@/lib/filterConfig";
import type { ListingWithJoins } from "@/hooks/useListings";

export interface FeatureItem {
  icon?: ElementType;
  label: string;
}

export interface PropertyFeatureGroups {
  internalFeatures: FeatureItem[];
  externalFeatures: FeatureItem[];
  constructionFeatures: FeatureItem[];
  suitabilityFeatures: FeatureItem[];
}

export function buildPropertyFeatureGroups(db: ListingWithJoins): PropertyFeatureGroups {
  const internalFeatures: FeatureItem[] = [];
  const externalFeatures: FeatureItem[] = [];
  const constructionFeatures: FeatureItem[] = [];
  const suitabilityFeatures: FeatureItem[] = [];

  if (db.has_elevator) internalFeatures.push({ icon: Building2, label: "Elevator" });
  if (db.has_ac) internalFeatures.push({ icon: Thermometer, label: "Air Conditioning" });
  if (db.has_solar_water) internalFeatures.push({ icon: Zap, label: "Solar Water Heating" });
  if (db.has_storage) internalFeatures.push({ icon: Home, label: "Storage Space" });
  if (db.has_secure_door) internalFeatures.push({ icon: Shield, label: "Secure Door" });
  if (db.has_alarm) internalFeatures.push({ icon: Shield, label: "Alarm" });
  if (db.has_cctv) internalFeatures.push({ icon: Eye, label: "CCTV" });
  if (db.has_security) internalFeatures.push({ icon: Shield, label: "Security System" });
  if (db.has_fireplace) internalFeatures.push({ icon: Flame, label: "Fireplace" });
  if (db.has_underfloor_heating) internalFeatures.push({ icon: Thermometer, label: "Underfloor Heating" });
  if (db.has_furnished) internalFeatures.push({ icon: Home, label: "Furnished" });
  if (db.has_internal_staircase) internalFeatures.push({ label: "Internal Staircase" });
  if (db.has_double_glazing) internalFeatures.push({ label: "Double Glazed Windows" });
  if (db.has_window_screens) internalFeatures.push({ label: "Window Screens" });
  if (db.has_night_power) internalFeatures.push({ icon: Zap, label: "Night Power Rate" });
  if (db.has_attic) internalFeatures.push({ label: "Attic" });
  if (db.has_satellite) internalFeatures.push({ icon: Wifi, label: "Satellite Receiver" });
  if (db.has_smart_home) internalFeatures.push({ icon: Wifi, label: "Smart Home" });
  if (db.has_equipped) internalFeatures.push({ icon: Wrench, label: "Equipped / Fitted-out" });
  if (db.has_three_phase_power) internalFeatures.push({ icon: Zap, label: "3-Phase Electricity" });
  if (db.has_structured_cabling) internalFeatures.push({ label: "Structured Cabling" });

  if (db.has_parking) externalFeatures.push({ icon: Car, label: "Parking Space" });
  if (db.has_balcony) externalFeatures.push({ label: "Balcony" });
  if (db.has_garden) externalFeatures.push({ icon: TreePine, label: "Garden" });
  if (db.has_pool) externalFeatures.push({ label: "Swimming Pool" });
  if (db.has_view) externalFeatures.push({ icon: Eye, label: "View" });
  if (db.has_facade) externalFeatures.push({ label: "Facade" });
  if (db.has_awning) externalFeatures.push({ label: "Awning" });
  if (db.has_disability_access) externalFeatures.push({ label: "Disability Access" });
  if (db.is_corner) externalFeatures.push({ label: "Corner Property" });
  if (db.has_loading_dock) externalFeatures.push({ label: "Loading Dock" });
  if (db.is_buildable) externalFeatures.push({ label: "Buildable" });
  if (db.within_city_plan) externalFeatures.push({ label: "Within City Plan" });
  if (db.within_settlement) externalFeatures.push({ label: "Within Settlement" });
  if (db.has_water_supply) externalFeatures.push({ icon: Wrench, label: "Water Supply" });
  if (db.has_electricity_supply) externalFeatures.push({ icon: Zap, label: "Electricity Supply" });
  if (db.has_land_concession) externalFeatures.push({ label: "Land Concession" });

  if (db.is_penthouse) constructionFeatures.push({ label: "Penthouse" });
  if (db.is_neoclassical) constructionFeatures.push({ label: "Neoclassical" });
  if (db.is_preserved) constructionFeatures.push({ label: "Preserved Building" });
  if (db.has_virtual_tour) constructionFeatures.push({ label: "Virtual Tour" });
  if (db.has_video_tour) constructionFeatures.push({ label: "Video Tour" });

  if (db.suitable_student) suitabilityFeatures.push({ label: "Students" });
  if (db.suitable_holiday) suitabilityFeatures.push({ label: "Holiday Home" });
  if (db.suitable_investment) suitabilityFeatures.push({ label: "Investment" });
  if (db.suitable_commercial_use) suitabilityFeatures.push({ label: "Commercial Use" });

  return { internalFeatures, externalFeatures, constructionFeatures, suitabilityFeatures };
}

export function buildDetailRows(
  db: ListingWithJoins,
  price: number,
  sqm: number,
  pricePerSqm: number | null | undefined,
  isLandType: boolean,
): { label: string; value: string }[] {
  return [
    { label: "Price", value: `€${price.toLocaleString()}` },
    { label: "Price / m²", value: pricePerSqm ? `€${Number(pricePerSqm).toLocaleString()}` : "—" },
    { label: "Surface", value: `${sqm} m²` },
    ...(db.year_built ? [{ label: "Year Built", value: String(db.year_built) }] : []),
    ...(db.floor != null ? [{ label: "Floor", value: db.floor === 0 ? "Ground" : `${db.floor}${db.total_floors ? ` of ${db.total_floors}` : ""}` }] : []),
    ...(db.levels ? [{ label: "Levels", value: String(db.levels) }] : []),
    ...(db.kitchens ? [{ label: "Kitchens", value: String(db.kitchens) }] : []),
    ...(db.living_rooms ? [{ label: "Living Rooms", value: String(db.living_rooms) }] : []),
    ...(db.wc_count ? [{ label: "WC", value: String(db.wc_count) }] : []),
    ...(db.heating_system ? [{ label: "Heating", value: HEATING_TYPES.find((h) => h.value === db.heating_system)?.label ?? db.heating_system.replace(/_/g, " ") }] : []),
    ...(db.energy_class ? [{ label: "Energy Class", value: db.energy_class }] : []),
    ...(db.construction_status ? [{ label: "Condition", value: CONDITION_OPTIONS.find((c) => c.value === db.construction_status)?.label ?? db.construction_status.replace(/_/g, " ") }] : []),
    ...(db.cadastre_number ? [{ label: "Cadastre No.", value: db.cadastre_number }] : []),
    ...(db.enfia_zone ? [{ label: "ENFIA Zone", value: db.enfia_zone }] : []),
    ...(db.postal_code ? [{ label: "Postal Code", value: db.postal_code }] : []),
    ...(db.region ? [{ label: "Region", value: db.region }] : []),
    ...(isLandType && db.coverage_ratio ? [{ label: "Coverage Ratio", value: `${db.coverage_ratio}%` }] : []),
    ...(isLandType && db.building_allowance ? [{ label: "Build Allowance", value: `${db.building_allowance} m²` }] : []),
    ...(isLandType && db.facade_length ? [{ label: "Facade Length", value: `${db.facade_length} m` }] : []),
    ...(isLandType && db.plot_depth ? [{ label: "Plot Depth", value: `${db.plot_depth} m` }] : []),
    ...(isLandType && db.slope ? [{ label: "Slope", value: db.slope }] : []),
    ...(isLandType && db.zone_type ? [{ label: "Zone", value: db.zone_type }] : []),
    ...(isLandType && db.road_type ? [{ label: "Road Type", value: db.road_type }] : []),
    ...(isLandType && db.distance_from_sea ? [{ label: "From Sea", value: `${db.distance_from_sea} m` }] : []),
    ...(isLandType && db.distance_from_city ? [{ label: "From City", value: `${db.distance_from_city} m` }] : []),
    ...(db.commercial_subtype ? [{ label: "Subtype", value: db.commercial_subtype }] : []),
    ...(db.plot_surface ? [{ label: "Plot Surface", value: `${db.plot_surface} m²` }] : []),
    ...(db.floor_height ? [{ label: "Floor Height", value: `${db.floor_height} m` }] : []),
    { label: "Published", value: new Date(db.created_at).toLocaleDateString("en-GB") },
    { label: "Last Updated", value: new Date(db.updated_at).toLocaleDateString("en-GB") },
  ];
}
