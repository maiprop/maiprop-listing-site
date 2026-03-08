/**
 * maiProp – Property Types & Subtypes catalogue
 * Single source of truth used across Listings, CreateListing, PropertyDetail, Index.
 */

export type PropertyTypeKey = "apartment" | "house" | "villa" | "land" | "commercial" | "office";

export interface PropertySubtype {
  value: string;
  label: string;
  description: string;
}

export interface PropertyTypeConfig {
  value: PropertyTypeKey;
  label: string;
  labelPlural: string;
  emoji: string;
  description: string;
  keywords: string[];
  accentClass: string;
  bgClass: string;
  subtypes: PropertySubtype[];
  /** Which group this type belongs to (for dropdown grouping) */
  group?: "residence" | "commercial" | "land";
}

export interface PropertyGroup {
  id: "residence" | "commercial" | "land";
  label: string;
  emoji: string;
  types: PropertyTypeKey[];
}

export const PROPERTY_GROUPS: PropertyGroup[] = [
  {
    id: "residence",
    label: "Residence",
    emoji: "🏠",
    types: ["apartment", "house", "villa"],
  },
  {
    id: "commercial",
    label: "Commercial",
    emoji: "🏪",
    types: ["commercial", "office"],
  },
  {
    id: "land",
    label: "Land",
    emoji: "🌾",
    types: ["land"],
  },
];

export const PROPERTY_TYPES: PropertyTypeConfig[] = [
  {
    value: "apartment",
    label: "Apartment",
    labelPlural: "Apartments",
    emoji: "🏢",
    description: "Flats & apartments in buildings — studios to penthouses",
    keywords: ["studio", "flat", "penthouse", "maisonette"],
    accentClass: "text-primary",
    bgClass: "bg-primary/10",
    group: "residence",
    subtypes: [],
  },
  {
    value: "house",
    label: "House",
    labelPlural: "Houses",
    emoji: "🏠",
    description: "Detached, semi-detached, and terraced homes",
    keywords: ["detached", "semi", "townhouse", "bungalow"],
    accentClass: "text-brand-emerald",
    bgClass: "bg-brand-emerald/10",
    group: "residence",
    subtypes: [],
  },
  {
    value: "villa",
    label: "Villa",
    labelPlural: "Villas",
    emoji: "🏡",
    description: "Luxury stand-alone villas — often with pools and sea views",
    keywords: ["luxury", "sea view", "pool", "golden visa"],
    accentClass: "text-brand-gold",
    bgClass: "bg-brand-gold/10",
    group: "residence",
    subtypes: [],
  },
  {
    value: "land",
    label: "Land",
    labelPlural: "Land / Plots",
    emoji: "🌾",
    description: "Buildable plots, agricultural land, and beachfront parcels",
    keywords: ["buildable", "plot", "agricultural", "coastal"],
    accentClass: "text-brand-sky",
    bgClass: "bg-brand-sky/10",
    group: "land",
    subtypes: [],
  },
  {
    value: "commercial",
    label: "Commercial",
    labelPlural: "Commercial",
    emoji: "🏪",
    description: "Retail shops, warehouses, clinics, showrooms & more",
    keywords: ["shop", "warehouse", "retail", "investment yield"],
    accentClass: "text-accent",
    bgClass: "bg-accent/10",
    group: "commercial",
    subtypes: [],
  },
  {
    value: "office",
    label: "Office",
    labelPlural: "Offices",
    emoji: "🏗️",
    description: "Private offices, coworking spaces, and business centres",
    keywords: ["coworking", "business centre", "headquarters"],
    accentClass: "text-brand-cyan",
    bgClass: "bg-brand-cyan/10",
    group: "commercial",
    subtypes: [],
  },
];

/** Fast lookup by key */
export const PROPERTY_TYPE_MAP: Record<PropertyTypeKey, PropertyTypeConfig> =
  Object.fromEntries(PROPERTY_TYPES.map(t => [t.value, t])) as Record<PropertyTypeKey, PropertyTypeConfig>;

/** Display label for a type value */
export function getTypeLabel(type: string): string {
  return PROPERTY_TYPE_MAP[type as PropertyTypeKey]?.label ?? type;
}

/** Display label for a subtype value within a parent type */
export function getSubtypeLabel(type: string, subtype: string): string {
  const config = PROPERTY_TYPE_MAP[type as PropertyTypeKey];
  return config?.subtypes.find(s => s.value === subtype)?.label ?? subtype;
}
