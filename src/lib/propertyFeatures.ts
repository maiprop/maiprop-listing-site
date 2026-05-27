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
import { getSubtypeLabel, getTypeLabel } from "@/lib/propertyTypes";
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

export interface DetailGroup {
  title: string;
  rows: { label: string; value: string | number | null | undefined }[];
}

const hasDetailValue = (value: string | number | null | undefined) =>
  value !== null && value !== undefined && value !== "";

const compactGroups = (groups: DetailGroup[]) =>
  groups
    .map((group) => ({ ...group, rows: group.rows.filter((row) => hasDetailValue(row.value)) }))
    .filter((group) => group.rows.length > 0);

const formatNumber = (value: number) =>
  Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const formatCurrency = (value: number | null | undefined) =>
  value !== null && value !== undefined ? `\u20ac${Number(value).toLocaleString()}` : null;

const formatArea = (value: number | null | undefined) =>
  value !== null && value !== undefined ? `${formatNumber(Number(value))} m2` : null;

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-GB") : null;

const formatBoolean = (value: boolean | null | undefined) =>
  value === true ? "Yes" : value === false ? "No" : null;

const humanize = (value: string | null | undefined) =>
  value ? value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : null;

const formatFloor = (floor: number | null | undefined, totalFloors: number | null | undefined) => {
  if (floor === null || floor === undefined) return null;
  const base = floor === -1 ? "Basement" : floor === 0 ? "Ground" : String(floor);
  return totalFloors ? `${base} / ${totalFloors}` : base;
};

const getOwnershipDetailRows = (tags: string[] | null | undefined) => {
  const ownershipStatus = tags?.find((tag) => tag.startsWith("ownership:") && !tag.startsWith("ownership_pct:"))?.replace("ownership:", "");
  const ownershipPct = tags?.find((tag) => tag.startsWith("ownership_pct:"))?.replace("ownership_pct:", "");

  return [
    { label: "Ownership", value: humanize(ownershipStatus) },
    { label: "Ownership Share", value: ownershipPct ? `${ownershipPct}%` : null },
  ];
};

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

export function buildDetailGroups(
  db: ListingWithJoins,
  price: number,
  sqm: number,
  pricePerSqm: number | null | undefined,
  isLandType: boolean,
): DetailGroup[] {
  const priceLabel =
    db.listing_type === "rent"
      ? "Monthly Rent"
      : db.listing_type === "auction"
        ? "First Offer Price"
        : "Price";
  const typeLabel = getTypeLabel(db.property_type);
  const subtypeLabel = db.commercial_subtype
    ? getSubtypeLabel(db.property_type, db.commercial_subtype)
    : null;
  const heatingLabel = HEATING_TYPES.find((h) => h.value === db.heating_system)?.label
    ?? humanize(db.heating_system);
  const conditionLabel = CONDITION_OPTIONS.find((c) => c.value === db.construction_status)?.label
    ?? humanize(db.construction_status);
  const floorValue = formatFloor(db.floor, db.total_floors);

  return compactGroups([
    {
      title: "Core",
      rows: [
        { label: "Property Type", value: typeLabel },
        { label: "Subtype", value: subtypeLabel },
        { label: "Surface", value: formatArea(sqm) },
        { label: "Bedrooms", value: db.bedrooms },
        { label: "Bathrooms", value: db.bathrooms },
        { label: "WC", value: db.wc_count },
        { label: "Floor", value: db.listing_type === "auction" ? floorValue ?? "Not provided" : floorValue },
        { label: "Levels", value: db.levels },
        { label: "Kitchens", value: db.kitchens },
        { label: "Living Rooms", value: db.living_rooms },
        { label: "Plot Surface", value: formatArea(db.plot_surface) },
      ],
    },
    {
      title: "Building",
      rows: [
        { label: "Year Built", value: db.year_built },
        { label: "Condition", value: conditionLabel },
        { label: "Heating", value: heatingLabel },
        { label: "Energy Class", value: db.energy_class },
        { label: "Floor Height", value: db.floor_height ? `${db.floor_height} m` : null },
      ],
    },
    {
      title: "Listing",
      rows: [
        { label: priceLabel, value: formatCurrency(price) },
        { label: "Price / m2", value: pricePerSqm ? formatCurrency(Number(pricePerSqm)) : null },
        { label: "Published", value: formatDate(db.created_at) },
        { label: "Last Updated", value: formatDate(db.updated_at) },
      ],
    },
    {
      title: "Rental Terms",
      rows: db.listing_type === "rent"
        ? [
            { label: "Deposit", value: db.deposit_months ? `${db.deposit_months} months` : null },
            { label: "Monthly Expenses", value: formatCurrency(db.monthly_expenses) },
            { label: "Available From", value: formatDate(db.available_from) },
            { label: "Minimum Lease", value: db.min_rental_months ? `${db.min_rental_months} months` : null },
            { label: "Pets Allowed", value: formatBoolean(db.pets_allowed) },
            { label: "Short-term Rental", value: formatBoolean(db.short_term_rental) },
            { label: "Agent Fee Included", value: formatBoolean(db.agent_fee_included) },
          ]
        : [],
    },
    {
      title: "Auction",
      rows: [
        { label: "Auction Date", value: formatDate(db.auction_date) },
        { label: "Auction Court", value: db.auction_court },
        ...getOwnershipDetailRows(db.tags),
      ],
    },
    {
      title: "Open House",
      rows: [
        { label: "Open House Date", value: formatDate(db.open_house_date) },
      ],
    },
    {
      title: "Location & Legal",
      rows: [
        { label: "Region", value: db.region },
        { label: "Postal Code", value: db.postal_code },
        { label: "Cadastre No.", value: db.cadastre_number },
        { label: "ENFIA Zone", value: db.enfia_zone },
      ],
    },
    {
      title: "Land & Planning",
      rows: isLandType
        ? [
            { label: "Coverage Ratio", value: db.coverage_ratio ? `${db.coverage_ratio}%` : null },
            { label: "Build Allowance", value: formatArea(db.building_allowance) },
            { label: "Facade Length", value: db.facade_length ? `${db.facade_length} m` : null },
            { label: "Plot Depth", value: db.plot_depth ? `${db.plot_depth} m` : null },
            { label: "Slope", value: humanize(db.slope) },
            { label: "Zone", value: humanize(db.zone_type) },
            { label: "Road Type", value: humanize(db.road_type) },
            { label: "From Sea", value: db.distance_from_sea ? `${db.distance_from_sea} m` : null },
            { label: "From City", value: db.distance_from_city ? `${db.distance_from_city} m` : null },
            { label: "Land Use", value: humanize(db.land_use) },
          ]
        : [],
    },
  ]);
}
