/**
 * Contextual filter configuration per property type & subtype.
 * Defines which filter sections are shown in the advanced filter panel.
 */

export type FilterSection =
  | "size"
  | "bedrooms"
  | "bathrooms"
  | "floor"
  | "year_built"
  | "heating"
  | "energy_class"
  | "construction_status"
  | "features_residential"
  | "features_commercial"
  | "features_land"
  | "features_office"
  | "land_details"
  | "rental_extras"
  | "commercial_details";

export interface FilterConfig {
  sections: FilterSection[];
  priceLabel: string;
  sizeLabelSqm: string;
  bedsLabel?: string;
}

// ── Residential (apartment / house / villa) ──────────────────────────────────
const RESIDENTIAL_BASE: FilterSection[] = [
  "size", "bedrooms", "bathrooms", "floor", "year_built",
  "heating", "energy_class", "construction_status", "features_residential",
];

// ── Commercial subtypes ──────────────────────────────────────────────────────
const COMMERCIAL_BASE: FilterSection[] = [
  "size", "floor", "year_built", "energy_class",
  "commercial_details", "features_commercial",
];

// ── Office ───────────────────────────────────────────────────────────────────
const OFFICE_BASE: FilterSection[] = [
  "size", "floor", "year_built", "energy_class",
  "heating", "construction_status", "features_office",
];

// ── Land ─────────────────────────────────────────────────────────────────────
const LAND_BASE: FilterSection[] = [
  "size", "land_details",
];

// ─── Per-type defaults ────────────────────────────────────────────────────────
const TYPE_DEFAULTS: Record<string, FilterConfig> = {
  apartment: {
    sections: [...RESIDENTIAL_BASE, "rental_extras"],
    priceLabel: "Price",
    sizeLabelSqm: "Size (m²)",
    bedsLabel: "Bedrooms",
  },
  house: {
    sections: RESIDENTIAL_BASE,
    priceLabel: "Price",
    sizeLabelSqm: "Size (m²)",
    bedsLabel: "Bedrooms",
  },
  villa: {
    sections: RESIDENTIAL_BASE,
    priceLabel: "Price",
    sizeLabelSqm: "Size (m²)",
    bedsLabel: "Bedrooms",
  },
  land: {
    sections: LAND_BASE,
    priceLabel: "Price",
    sizeLabelSqm: "Plot Size (m²)",
  },
  commercial: {
    sections: COMMERCIAL_BASE,
    priceLabel: "Price / Rent",
    sizeLabelSqm: "Usable Area (m²)",
  },
  office: {
    sections: OFFICE_BASE,
    priceLabel: "Price / Rent",
    sizeLabelSqm: "Office Area (m²)",
  },
  // fallback / all types
  "": {
    sections: [
      "size", "bedrooms", "bathrooms", "floor", "year_built",
      "heating", "energy_class", "construction_status", "features_residential",
    ],
    priceLabel: "Price",
    sizeLabelSqm: "Size (m²)",
    bedsLabel: "Bedrooms",
  },
};

// ── Subtype overrides (merge over type default) ───────────────────────────────
const SUBTYPE_OVERRIDES: Record<string, Partial<FilterConfig>> = {
  // Apartment subtypes
  studio: {
    sections: ["size", "floor", "year_built", "heating", "energy_class", "construction_status", "features_residential", "rental_extras"],
    bedsLabel: undefined, // studios have no separate bedrooms
  },
  penthouse: {
    sections: [...RESIDENTIAL_BASE],
    bedsLabel: "Bedrooms",
  },
  loft: {
    sections: ["size", "floor", "year_built", "heating", "energy_class", "features_residential"],
    bedsLabel: "Rooms",
  },

  // Land subtypes
  buildable: {
    sections: ["size", "land_details"],
    sizeLabelSqm: "Plot Area (m²)",
  },
  agricultural: {
    sections: ["size", "land_details"],
    sizeLabelSqm: "Land Area (m²)",
  },
  coastal: {
    sections: ["size", "land_details"],
    sizeLabelSqm: "Coastal Plot (m²)",
  },

  // Commercial subtypes
  warehouse: {
    sections: ["size", "floor", "year_built", "commercial_details", "features_commercial"],
    sizeLabelSqm: "Storage Area (m²)",
  },
  industrial: {
    sections: ["size", "year_built", "commercial_details", "features_commercial"],
    sizeLabelSqm: "Industrial Area (m²)",
  },
  craft_workshop: {
    sections: ["size", "floor", "year_built", "commercial_details", "features_commercial"],
    sizeLabelSqm: "Workshop Area (m²)",
  },
  shop: {
    sections: ["size", "floor", "year_built", "energy_class", "commercial_details", "features_commercial"],
    sizeLabelSqm: "Shop Area (m²)",
  },
  hotel: {
    sections: ["size", "year_built", "bedrooms", "bathrooms", "energy_class", "construction_status", "features_commercial"],
    sizeLabelSqm: "Total Area (m²)",
    bedsLabel: "Rooms",
  },
  commercial_building: {
    sections: ["size", "floor", "year_built", "energy_class", "construction_status", "commercial_details", "features_commercial"],
    sizeLabelSqm: "Building Area (m²)",
  },
  hall: {
    sections: ["size", "floor", "year_built", "commercial_details", "features_commercial"],
    sizeLabelSqm: "Hall Area (m²)",
  },
  showroom: {
    sections: ["size", "floor", "year_built", "commercial_details", "features_commercial"],
    sizeLabelSqm: "Showroom Area (m²)",
  },
  restaurant: {
    sections: ["size", "floor", "year_built", "energy_class", "commercial_details", "features_commercial"],
    sizeLabelSqm: "Premises Area (m²)",
  },
  clinic: {
    sections: ["size", "floor", "year_built", "energy_class", "heating", "construction_status", "features_commercial"],
    sizeLabelSqm: "Clinical Area (m²)",
  },
  mixed_use: {
    sections: ["size", "floor", "bedrooms", "year_built", "energy_class", "construction_status", "commercial_details", "features_commercial"],
    sizeLabelSqm: "Total Area (m²)",
    bedsLabel: "Residential Units",
  },

  // Office subtypes
  coworking: {
    sections: ["size", "floor", "year_built", "features_office"],
    sizeLabelSqm: "Desk / Area (m²)",
  },
  business_centre: {
    sections: ["size", "floor", "year_built", "energy_class", "features_office"],
    sizeLabelSqm: "Office Area (m²)",
  },
};

export function getFilterConfig(type: string, subtype: string): FilterConfig {
  const base: FilterConfig = TYPE_DEFAULTS[type] ?? TYPE_DEFAULTS[""];
  const override = subtype ? SUBTYPE_OVERRIDES[subtype] : undefined;
  if (!override) return base;
  return {
    ...base,
    ...override,
    sections: override.sections ?? base.sections,
  };
}

// ── Feature sets per context ──────────────────────────────────────────────────
export const FEATURES_RESIDENTIAL = [
  { key: "has_parking",        label: "🚗 Parking" },
  { key: "has_elevator",       label: "🛗 Elevator" },
  { key: "has_balcony",        label: "🏞️ Balcony" },
  { key: "has_pool",           label: "🏊 Pool" },
  { key: "pets_allowed",       label: "🐾 Pet Friendly" },
  { key: "has_furnished",      label: "🛋️ Furnished" },
  { key: "has_garden",         label: "🌿 Garden" },
  { key: "has_ac",             label: "❄️ AC" },
  { key: "has_fireplace",      label: "🔥 Fireplace" },
  { key: "has_storage",        label: "📦 Storage" },
  { key: "has_view",           label: "👁️ View" },
  { key: "has_smart_home",     label: "🏡 Smart Home" },
  { key: "has_attic",          label: "🔼 Attic" },
  { key: "has_double_glazing", label: "🪟 Double Glazing" },
  { key: "has_secure_door",    label: "🔒 Secure Door" },
  { key: "has_alarm",          label: "🚨 Alarm" },
];

export const FEATURES_COMMERCIAL = [
  { key: "has_parking",          label: "🚗 Parking" },
  { key: "has_elevator",         label: "🛗 Elevator" },
  { key: "has_loading_dock",     label: "🚛 Loading Dock" },
  { key: "has_three_phase_power",label: "⚡ 3-Phase Power" },
  { key: "has_cctv",             label: "📹 CCTV" },
  { key: "has_alarm",            label: "🚨 Alarm" },
  { key: "has_ac",               label: "❄️ AC" },
  { key: "has_storage",          label: "📦 Storage" },
  { key: "has_disability_access",label: "♿ Accessibility" },
  { key: "has_structured_cabling",label: "🔌 Cabling" },
  { key: "has_facade",           label: "🏪 Shop Facade" },
  { key: "has_night_power",      label: "🌙 Night Power" },
];

export const FEATURES_OFFICE = [
  { key: "has_parking",           label: "🚗 Parking" },
  { key: "has_elevator",          label: "🛗 Elevator" },
  { key: "has_ac",                label: "❄️ AC" },
  { key: "has_alarm",             label: "🚨 Alarm" },
  { key: "has_cctv",              label: "📹 CCTV" },
  { key: "has_structured_cabling",label: "🔌 Structured Cabling" },
  { key: "has_disability_access", label: "♿ Accessibility" },
  { key: "has_smart_home",        label: "🏢 Smart Building" },
  { key: "has_storage",           label: "📦 Storage" },
];

export const FEATURES_LAND = [
  { key: "has_electricity_supply", label: "⚡ Electricity" },
  { key: "has_water_supply",       label: "💧 Water Supply" },
  { key: "is_buildable",           label: "🏗️ Buildable" },
  { key: "within_city_plan",       label: "🗺️ Within City Plan" },
  { key: "within_settlement",      label: "🏘️ Within Settlement" },
  { key: "has_land_concession",    label: "📜 Land Concession" },
];

export const ENERGY_CLASSES = ["A+", "A", "B+", "B", "C", "D", "E", "F", "G"];
export const HEATING_TYPES = [
  { value: "autonomous", label: "Autonomous" },
  { value: "central",    label: "Central" },
  { value: "floor",      label: "Underfloor" },
  { value: "none",       label: "None" },
];
export const CONSTRUCTION_STATUSES = [
  { value: "new",                label: "New Build" },
  { value: "under_construction", label: "Under Construction" },
  { value: "renovated",          label: "Renovated" },
  { value: "needs_renovation",   label: "Needs Renovation" },
  { value: "preserved",          label: "Preserved" },
  { value: "neoclassical",       label: "Neoclassical" },
];
export const ROAD_TYPES = [
  { value: "main",       label: "Main Road" },
  { value: "secondary",  label: "Secondary Road" },
  { value: "pedestrian", label: "Pedestrian" },
  { value: "corner",     label: "Corner Plot" },
];
export const SLOPE_TYPES = [
  { value: "flat",     label: "Flat" },
  { value: "slight",   label: "Slight Slope" },
  { value: "steep",    label: "Steep" },
];
