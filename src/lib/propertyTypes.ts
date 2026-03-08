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
  group?: "residence" | "commercial" | "land";
}

export interface PropertyGroup {
  id: "residence" | "commercial" | "land";
  label: string;
  emoji: string;
  types: PropertyTypeKey[];
}

export const PROPERTY_GROUPS: PropertyGroup[] = [
  { id: "residence", label: "Residence", emoji: "🏠", types: ["apartment", "house", "villa"] },
  { id: "commercial", label: "Commercial", emoji: "🏪", types: ["commercial", "office"] },
  { id: "land", label: "Land", emoji: "🌾", types: ["land"] },
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
    subtypes: [
      { value: "studio",       label: "Studio",        description: "Open-plan single room, ideal for singles or short-term rental" },
      { value: "1bedroom",     label: "1-Bedroom",     description: "Compact flat with separate sleeping area" },
      { value: "2bedroom",     label: "2-Bedroom",     description: "Popular choice for couples and small families" },
      { value: "3bedroom",     label: "3-Bedroom",     description: "Spacious family apartment" },
      { value: "4bedroom",     label: "4+ Bedrooms",   description: "Large family or multi-room apartment" },
      { value: "penthouse",    label: "Penthouse",     description: "Top-floor prestige unit with terrace and panoramic views" },
      { value: "maisonette",   label: "Maisonette",    description: "Two-storey flat with private internal staircase" },
      { value: "loft",         label: "Loft / Duplex", description: "Industrial-style open plan or two-level layout" },
      { value: "ground_floor", label: "Ground Floor",  description: "Street-level unit, often with private garden access" },
      { value: "basement",     label: "Basement",      description: "Lower-ground level, frequently used for storage or commercial" },
    ],
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
    subtypes: [
      { value: "detached",     label: "Detached",       description: "Freestanding single-family home on its own plot" },
      { value: "semi_detached",label: "Semi-Detached",  description: "Paired home sharing one party wall" },
      { value: "terraced",     label: "Terraced / Row", description: "Mid-terrace home in a row of similar properties" },
      { value: "townhouse",    label: "Townhouse",      description: "Multi-storey home in an urban setting" },
      { value: "bungalow",     label: "Bungalow",       description: "Single-storey home, accessible and easy to maintain" },
      { value: "traditional",  label: "Traditional",    description: "Classic Greek stone or plaster construction" },
      { value: "neoclassical", label: "Neoclassical",   description: "19th–20th century neo-classical architecture" },
    ],
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
    subtypes: [
      { value: "seafront",    label: "Seafront",      description: "Directly on or within walking distance of the beach" },
      { value: "hilltop",     label: "Hilltop / View",description: "Panoramic views over sea, valleys, or city" },
      { value: "countryside", label: "Countryside",   description: "Rural retreat surrounded by nature" },
      { value: "island",      label: "Island Villa",  description: "Cyclades, Ionian, or Dodecanese island property" },
      { value: "gated",       label: "Gated Complex", description: "Within a managed, secured villa complex" },
      { value: "golden_visa", label: "Golden Visa",   description: "Qualifies for Greek Golden Visa investment (€250k+)" },
    ],
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
    subtypes: [
      { value: "buildable",    label: "Buildable Plot",     description: "Within city plan — approved for residential construction" },
      { value: "agricultural", label: "Agricultural",       description: "Farming or olive grove land, sometimes buildable" },
      { value: "coastal",      label: "Coastal / Seafront", description: "Adjacent to sea or beach — high value and demand" },
      { value: "forest",       label: "Forest / Woodland",  description: "Wooded land, often outside city plan" },
      { value: "industrial",   label: "Industrial Zone",    description: "VIPE / VIPA industrial plot for commercial use" },
      { value: "tourism",      label: "Tourism Zone",       description: "Approved for tourist development (hotel, resort)" },
    ],
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
    subtypes: [
      { value: "shop",               label: "Retail Shop",          description: "Street-level commercial space for retail or services" },
      { value: "warehouse",          label: "Warehouse / Storage",  description: "Storage or logistics space (Αποθήκη)" },
      { value: "industrial",         label: "Industrial Space",     description: "Heavy-use manufacturing or processing facility (Βιομηχανικός χώρος)" },
      { value: "craft_workshop",     label: "Craft / Workshop",     description: "Light production or artisan workshop (Βιοτεχνικός χώρος)" },
      { value: "hotel",              label: "Hotel / B&B",          description: "Hospitality property with multiple rooms (Ξενοδοχείο)" },
      { value: "commercial_building",label: "Commercial Building",  description: "Multi-unit professional building (Κτίριο επαγγελματικών χώρων)" },
      { value: "hall",               label: "Hall / Event Space",   description: "Large hall for events, ceremonies, or conferences (Αίθουσα)" },
      { value: "showroom",           label: "Showroom / Exhibition",description: "Open-plan display or exhibition space (Εκθεσιακός χώρος)" },
      { value: "restaurant",         label: "Restaurant / Café",    description: "Food & beverage premises, often with fitted kitchen" },
      { value: "clinic",             label: "Clinic / Medical",     description: "Purpose-built medical or dental practice" },
      { value: "mixed_use",          label: "Mixed-Use Building",   description: "Ground-floor commercial with residential above" },
      { value: "other_commercial",   label: "Other",                description: "Other commercial property type (Λοιπές κατηγορίες)" },
    ],
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
    subtypes: [
      { value: "private_office",  label: "Private Office",  description: "Dedicated closed space for a single team" },
      { value: "open_plan",       label: "Open Plan",       description: "Flexible open layout — ideal for growing teams" },
      { value: "coworking",       label: "Coworking / Flex",description: "Shared space with month-to-month flexibility" },
      { value: "business_centre", label: "Business Centre", description: "Serviced offices with reception and meeting rooms" },
      { value: "floor",           label: "Whole Floor",     description: "Full building floor — prestige address" },
      { value: "converted",       label: "Converted Space", description: "Repurposed residential or industrial space" },
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
