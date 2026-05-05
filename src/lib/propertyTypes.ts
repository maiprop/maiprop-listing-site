/**
 * maiProp – Property Types & Subtypes catalogue
 * Single source of truth used across Listings, CreateListing, PropertyDetail, Index.
 */
import {
  Building2, Home, Castle, Landmark, Store, Briefcase, type LucideIcon,
  TreePine, Warehouse, Utensils, Hotel, Stethoscope, LayoutDashboard,
  MonitorPlay, Layers, Wrench, Users2, BedDouble, ParkingCircle, Package,
} from "lucide-react";

export type PropertyTypeKey =
  | "apartment"
  | "house"
  | "villa"
  | "land"
  | "commercial"
  | "office"
  | "studio"
  | "maisonette"
  | "warehouse"
  | "hotel"
  | "mixed_use"
  | "parking"
  | "storage";

export interface PropertySubtype {
  value: string;
  label: string;
  description: string;
  icon?: LucideIcon;
}

export interface PropertyTypeConfig {
  value: PropertyTypeKey;
  label: string;
  labelPlural: string;
  emoji: string;
  icon: LucideIcon;
  description: string;
  keywords: string[];
  accentClass: string;
  bgClass: string;
  subtypes: PropertySubtype[];
  group?: "residence" | "commercial" | "land";
}

export interface PropertyGroup {
  id: "residence" | "commercial" | "land";
  label: string;
  emoji: string;
  types: PropertyTypeKey[];
}

export const PROPERTY_GROUPS: PropertyGroup[] = [
  { id: "residence", label: "Residence", emoji: "🏠", types: ["apartment", "house", "villa", "studio", "maisonette"] },
  { id: "commercial", label: "Commercial", emoji: "🏪", types: ["commercial", "office", "warehouse", "hotel", "mixed_use", "parking", "storage"] },
  { id: "land", label: "Land", emoji: "🌾", types: ["land"] },
];

// Contextual filter chips shown in More Filters per type — not used as dropdown subtypes
export const TYPE_STYLE_FILTERS: Partial<Record<PropertyTypeKey, { value: string; label: string }[]>> = {
  apartment: [
    { value: "penthouse",  label: "🏙️ Penthouse" },
    { value: "loft",       label: "🏭 Loft / Duplex" },
    { value: "maisonette", label: "🏘️ Maisonette" },
  ],
  house: [
    { value: "neoclassical", label: "🏛️ Neoclassical" },
    { value: "traditional",  label: "🪨 Traditional" },
  ],
  villa: [
    { value: "seafront",   label: "🌊 Seafront" },
    { value: "hilltop",    label: "⛰️ Hilltop / View" },
    { value: "countryside",label: "🌄 Countryside" },
    { value: "island",     label: "🏝️ Island Villa" },
    { value: "gated",      label: "🔐 Gated Complex" },
    { value: "golden_visa",label: "🛂 Golden Visa" },
  ],
};

export const PROPERTY_TYPES: PropertyTypeConfig[] = [
  {
    value: "apartment",
    label: "Apartment",
    labelPlural: "Apartments",
    emoji: "🏢",
    icon: Building2,
    description: "Flats & apartments in buildings — studios to penthouses",
    keywords: ["studio", "flat", "penthouse", "maisonette"],
    accentClass: "text-primary",
    bgClass: "bg-primary/10",
    group: "residence",
    subtypes: [
      { value: "studio",       label: "Studio",       description: "Open-plan single room, ideal for singles or short-term rental" },
      { value: "1bedroom",     label: "1-Bedroom",    description: "Compact flat with separate sleeping area" },
      { value: "2bedroom",     label: "2-Bedroom",    description: "Popular choice for couples and small families" },
      { value: "3bedroom",     label: "3-Bedroom",    description: "Spacious family apartment" },
      { value: "4bedroom",     label: "4+ Bedrooms",  description: "Large family or multi-room apartment" },
      { value: "ground_floor", label: "Ground Floor", description: "Street-level unit, often with private garden access" },
      { value: "basement",     label: "Basement",     description: "Lower-ground level" },
    ],
  },
  {
    value: "house",
    label: "House",
    labelPlural: "Houses",
    emoji: "🏠",
    icon: Home,
    description: "Detached, semi-detached, and terraced homes",
    keywords: ["detached", "semi", "townhouse", "bungalow"],
    accentClass: "text-brand-emerald",
    bgClass: "bg-brand-emerald/10",
    group: "residence",
    subtypes: [
      { value: "detached",      label: "Detached",       description: "Freestanding single-family home on its own plot" },
      { value: "semi_detached", label: "Semi-Detached",  description: "Paired home sharing one party wall" },
      { value: "terraced",      label: "Terraced / Row", description: "Mid-terrace home in a row of similar properties" },
      { value: "townhouse",     label: "Townhouse",      description: "Multi-storey home in an urban setting" },
      { value: "bungalow",      label: "Bungalow",       description: "Single-storey home, accessible and easy to maintain" },
    ],
  },
  {
    value: "villa",
    label: "Villa",
    labelPlural: "Villas",
    emoji: "🏡",
    icon: Castle,
    description: "Luxury stand-alone villas — often with pools and sea views",
    keywords: ["luxury", "sea view", "pool", "golden visa"],
    accentClass: "text-brand-gold",
    bgClass: "bg-brand-gold/10",
    group: "residence",
    subtypes: [], // All villa styles are contextual filters
  },
  {
    value: "land",
    label: "Land",
    labelPlural: "Land / Plots",
    emoji: "🌾",
    icon: Landmark,
    description: "Buildable plots, agricultural land, and beachfront parcels",
    keywords: ["buildable", "plot", "agricultural", "coastal"],
    accentClass: "text-brand-sky",
    bgClass: "bg-brand-sky/10",
    group: "land",
    subtypes: [
      { value: "buildable",    label: "Buildable Plot",     description: "Within city plan — approved for residential construction", icon: Layers },
      { value: "agricultural", label: "Agricultural",       description: "Farming or olive grove land, sometimes buildable", icon: TreePine },
      { value: "coastal",      label: "Coastal / Seafront", description: "Adjacent to sea or beach" },
      { value: "forest",       label: "Forest / Woodland",  description: "Wooded land, often outside city plan", icon: TreePine },
      { value: "industrial",   label: "Industrial Zone",    description: "VIPE / VIPA industrial plot for commercial use", icon: Warehouse },
      { value: "tourism",      label: "Tourism Zone",       description: "Approved for tourist development (hotel, resort)", icon: Hotel },
    ],
  },
  {
    value: "commercial",
    label: "Commercial",
    labelPlural: "Commercial",
    emoji: "🏪",
    icon: Store,
    description: "Retail shops, warehouses, offices, clinics, showrooms & more",
    keywords: ["shop", "warehouse", "retail", "office", "investment yield"],
    accentClass: "text-accent",
    bgClass: "bg-accent/10",
    group: "commercial",
    subtypes: [
      { value: "shop",               label: "Retail Shop",          description: "Street-level commercial space for retail or services",          icon: Store },
      { value: "warehouse",          label: "Warehouse / Storage",  description: "Storage or logistics space (Αποθήκη)",                          icon: Warehouse },
      { value: "industrial",         label: "Industrial Space",     description: "Heavy-use manufacturing or processing facility (Βιομηχανικός χώρος)", icon: Wrench },
      { value: "craft_workshop",     label: "Craft / Workshop",     description: "Light production or artisan workshop (Βιοτεχνικός χώρος)",     icon: Wrench },
      { value: "hotel",              label: "Hotel / B&B",          description: "Hospitality property with multiple rooms (Ξενοδοχείο)",         icon: Hotel },
      { value: "commercial_building",label: "Commercial Building",  description: "Multi-unit professional building (Κτίριο επαγγελματικών χώρων)", icon: Building2 },
      { value: "hall",               label: "Hall / Event Space",   description: "Large hall for events, ceremonies, or conferences (Αίθουσα)",  icon: Users2 },
      { value: "showroom",           label: "Showroom / Exhibition",description: "Open-plan display or exhibition space (Εκθεσιακός χώρος)",     icon: MonitorPlay },
      { value: "restaurant",         label: "Restaurant / Café",    description: "Food & beverage premises, often with fitted kitchen",          icon: Utensils },
      { value: "clinic",             label: "Clinic / Medical",     description: "Purpose-built medical or dental practice",                     icon: Stethoscope },
      { value: "mixed_use",          label: "Mixed-Use Building",   description: "Ground-floor commercial with residential above",               icon: LayoutDashboard },
      // Office subtypes merged under Commercial
      { value: "office_private",     label: "Office – Private",     description: "Dedicated closed office space for a single team",             icon: Briefcase },
      { value: "office_open_plan",   label: "Office – Open Plan",   description: "Flexible open layout — ideal for growing teams",              icon: Briefcase },
      { value: "office_coworking",   label: "Coworking / Flex",     description: "Shared space with month-to-month flexibility",                icon: Users2 },
      { value: "office_business",    label: "Business Centre",      description: "Serviced offices with reception and meeting rooms",            icon: Building2 },
      { value: "office_floor",       label: "Whole Floor",          description: "Full building floor — prestige address",                      icon: Layers },
      { value: "other_commercial",   label: "Other",                description: "Other commercial property type (Λοιπές κατηγορίες)" },
    ],
  },
  // ── New typologies added 2026-07-04 ──────────────────────────────────────────
  {
    value: "studio",
    label: "Studio",
    labelPlural: "Studios",
    emoji: "🛏️",
    icon: BedDouble,
    description: "Open-plan studio apartments — ideal for singles or short-term rental",
    keywords: ["studio", "bedsit", "open-plan"],
    accentClass: "text-primary",
    bgClass: "bg-primary/10",
    group: "residence",
    subtypes: [],
  },
  {
    value: "maisonette",
    label: "Maisonette",
    labelPlural: "Maisonettes",
    emoji: "🏘️",
    icon: Home,
    description: "Split-level apartments spanning two floors",
    keywords: ["maisonette", "duplex", "split-level"],
    accentClass: "text-brand-emerald",
    bgClass: "bg-brand-emerald/10",
    group: "residence",
    subtypes: [],
  },
  {
    value: "warehouse",
    label: "Warehouse",
    labelPlural: "Warehouses",
    emoji: "🏭",
    icon: Warehouse,
    description: "Industrial, storage, and logistics warehouse space",
    keywords: ["warehouse", "logistics", "industrial"],
    accentClass: "text-accent",
    bgClass: "bg-accent/10",
    group: "commercial",
    subtypes: [],
  },
  {
    value: "hotel",
    label: "Hotel / B&B",
    labelPlural: "Hotels & B&Bs",
    emoji: "🏨",
    icon: Hotel,
    description: "Operational hotels, boutique properties, and B&Bs",
    keywords: ["hotel", "boutique", "B&B", "hospitality"],
    accentClass: "text-brand-gold",
    bgClass: "bg-brand-gold/10",
    group: "commercial",
    subtypes: [],
  },
  {
    value: "mixed_use",
    label: "Mixed-Use",
    labelPlural: "Mixed-Use Buildings",
    emoji: "🏗️",
    icon: Layers,
    description: "Buildings combining residential and commercial uses",
    keywords: ["mixed-use", "retail", "residential", "investment"],
    accentClass: "text-brand-indigo",
    bgClass: "bg-brand-indigo/10",
    group: "commercial",
    subtypes: [],
  },
  {
    value: "parking",
    label: "Parking",
    labelPlural: "Parking Spaces",
    emoji: "🅿️",
    icon: ParkingCircle,
    description: "Covered or open parking spaces and garages",
    keywords: ["parking", "garage", "car space"],
    accentClass: "text-brand-sky",
    bgClass: "bg-brand-sky/10",
    group: "commercial",
    subtypes: [],
  },
  {
    value: "storage",
    label: "Storage",
    labelPlural: "Storage Units",
    emoji: "📦",
    icon: Package,
    description: "Storage units and cellar spaces",
    keywords: ["storage", "cellar", "unit"],
    accentClass: "text-brand-sky",
    bgClass: "bg-brand-sky/10",
    group: "commercial",
    subtypes: [],
  },
  // "office" kept for DB compatibility but hidden from UI groups — maps to commercial
  {
    value: "office",
    label: "Office",
    labelPlural: "Offices",
    emoji: "🏗️",
    icon: Briefcase,
    description: "Private offices, coworking spaces, and business centres",
    keywords: ["coworking", "business centre", "headquarters"],
    accentClass: "text-brand-indigo",
    bgClass: "bg-brand-indigo/10",
    group: "commercial",
    subtypes: [
      { value: "private_office",  label: "Private Office",   description: "Dedicated closed space for a single team",           icon: Briefcase },
      { value: "open_plan",       label: "Open Plan",        description: "Flexible open layout — ideal for growing teams",     icon: LayoutDashboard },
      { value: "coworking",       label: "Coworking / Flex", description: "Shared space with month-to-month flexibility",       icon: Users2 },
      { value: "business_centre", label: "Business Centre",  description: "Serviced offices with reception and meeting rooms",  icon: Building2 },
      { value: "floor",           label: "Whole Floor",      description: "Full building floor — prestige address",            icon: Layers },
      { value: "converted",       label: "Converted Space",  description: "Repurposed residential or industrial space" },
    ],
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
