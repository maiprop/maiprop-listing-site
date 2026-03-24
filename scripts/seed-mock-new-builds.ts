/**
 * Seed mock new-build / pre-sale listings.
 * Run: npx tsx scripts/seed-mock-new-builds.ts
 * Requires: SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "https://qvvicunqcrwpioqnvzxf.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getDeveloperOwnerId(): Promise<string | null> {
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const devEmails = ["developer1@maiprop.demo", "agent1@maiprop.demo"];
  const byEmail = new Map(authUsers?.users?.map(u => [u.email, u.id]) ?? []);
  for (const e of devEmails) { if (byEmail.has(e)) return byEmail.get(e)!; }
  return null;
}

const COVER_IMAGES = [
  "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80",
  "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&q=80",
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&q=80",
  "https://images.unsplash.com/photo-1464082354059-27db6ce50048?w=800&q=80",
  "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=80",
  "https://images.unsplash.com/photo-1531971589569-0d9370cbe1e5?w=800&q=80",
  "https://images.unsplash.com/photo-1517581177682-a085bb7ffb15?w=800&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80",
];

const NEW_BUILDS = [
  {
    title: "Kolonaki Residences — Pre-sale Luxury Apartments",
    description: "An exclusive collection of 24 apartments in the heart of Kolonaki, Athens. Designed by award-winning architects with panoramic Acropolis views from upper floors. Units range from 1-bedroom studios to 3-bedroom penthouses. A+ energy rated, smart home system, rooftop infinity pool. Delivery Q2 2026.",
    city: "Athens", address: "14 Skoufa St, Kolonaki", region: "Attica",
    property_type: "apartment", listing_type: "sale",
    price: 380000, price_per_sqm: 6200, sqm: 62,
    bedrooms: 2, bathrooms: 1, floor: 4, total_floors: 8,
    year_built: 2026, energy_class: "A+",
    construction_status: "under_construction",
    is_pre_sale: true, is_featured: true, priority_placement: 8,
    has_elevator: true, has_parking: true, has_pool: true, has_smart_home: true,
    has_security: true, has_view: true, has_balcony: true,
    latitude: 37.9795, longitude: 23.7424, views_count: 312,
    cover_image_url: COVER_IMAGES[0],
    tags: ["pre-sale", "luxury", "acropolis-view", "smart-home"],
  },
  {
    title: "Glyfada Riviera — Beachfront Pre-sale Residences",
    description: "50 seafront apartments in Glyfada, just steps from the beach. Minimal Scandinavian design, open-plan living, floor-to-ceiling glazing with direct sea views. Concierge service, underground parking, communal gardens. Completion expected Q4 2025.",
    city: "Glyfada", address: "3 Poseidonos Ave, Glyfada", region: "Attica",
    property_type: "apartment", listing_type: "sale",
    price: 520000, price_per_sqm: 7800, sqm: 68,
    bedrooms: 2, bathrooms: 2, floor: 3, total_floors: 6,
    year_built: 2025, energy_class: "A+",
    construction_status: "shell_complete",
    is_pre_sale: true, is_featured: true, priority_placement: 9,
    has_elevator: true, has_parking: true, has_pool: true,
    has_security: true, has_view: true, has_balcony: true, has_ac: true,
    latitude: 37.8630, longitude: 23.7516, views_count: 540,
    cover_image_url: COVER_IMAGES[1],
    tags: ["sea-view", "beachfront", "concierge", "pre-sale"],
  },
  {
    title: "Athens Skyline Tower — Off-plan Studios & 1-Beds",
    description: "The most anticipated tower development in central Athens. 80 units across 15 floors, all with unobstructed city views. Ideal for investors — projected rental yield 6–7% p.a. Studios from €145k, 1-beds from €210k. Payment plans available. Delivery 2027.",
    city: "Athens", address: "88 Pireos St, Metaxourgeio", region: "Attica",
    property_type: "apartment", listing_type: "sale",
    price: 145000, price_per_sqm: 4200, sqm: 34,
    bedrooms: 0, bathrooms: 1, floor: 7, total_floors: 15,
    year_built: 2027, energy_class: "A",
    construction_status: "foundation",
    is_pre_sale: true, is_featured: true, priority_placement: 7,
    has_elevator: true, has_parking: false, has_smart_home: true,
    has_security: true, has_view: true, suitable_investment: true,
    latitude: 37.9803, longitude: 23.7188, views_count: 780,
    cover_image_url: COVER_IMAGES[2],
    tags: ["investment", "off-plan", "city-view", "payment-plan"],
  },
  {
    title: "Kifisia Green Villas — 4 Exclusive Off-plan Villas",
    description: "An intimate development of just 4 standalone villas set within private landscaped grounds in Kifisia. Each villa features 4 bedrooms, private pool, home cinema room, wine cellar, and a 4-car garage. Bespoke finishes to buyer specification. Delivery December 2025.",
    city: "Kifisia", address: "21 Kifisias Ave, Kifisia", region: "Attica",
    property_type: "villa", listing_type: "sale",
    price: 1850000, price_per_sqm: 5200, sqm: 356,
    bedrooms: 4, bathrooms: 4, floor: 0, total_floors: 2,
    year_built: 2025, energy_class: "A+",
    construction_status: "topping_out",
    is_pre_sale: true, is_featured: true, priority_placement: 10,
    has_elevator: false, has_parking: true, has_pool: true, has_garden: true,
    has_smart_home: true, has_security: true, has_underfloor_heating: true,
    has_storage: true, has_view: true, has_ac: true,
    latitude: 38.0780, longitude: 23.8090, views_count: 410,
    cover_image_url: COVER_IMAGES[3],
    tags: ["villa", "private-pool", "pre-sale", "bespoke"],
  },
  {
    title: "Thessaloniki Waterfront Residences",
    description: "A landmark development on the Thessaloniki waterfront. 36 luxury apartments with sea views across the Thermaic Gulf. Contemporary Greek architecture with traditional materials — marble, stone, brushed oak. 2 and 3-bedroom options. First units ready Q3 2026.",
    city: "Thessaloniki", address: "5 Nikis Ave, Paralía", region: "Central Macedonia",
    property_type: "apartment", listing_type: "sale",
    price: 290000, price_per_sqm: 4800, sqm: 62,
    bedrooms: 2, bathrooms: 1, floor: 5, total_floors: 10,
    year_built: 2026, energy_class: "A",
    construction_status: "under_construction",
    is_pre_sale: true, is_featured: false, priority_placement: 0,
    has_elevator: true, has_parking: true, has_pool: false,
    has_security: true, has_view: true, has_balcony: true,
    latitude: 40.6284, longitude: 22.9474, views_count: 190,
    cover_image_url: COVER_IMAGES[4],
    tags: ["sea-view", "waterfront", "thessaloniki", "pre-sale"],
  },
  {
    title: "Marousi Central — Mixed-Use New Development",
    description: "40 residential units above ground-floor retail in the business heart of Marousi. Ideal for buy-to-let investors targeting the corporate rental market. Excellent transport links — 5 min walk to Marousi metro. Studios, 1-beds and 2-beds available. Projected 5.5–6.5% yield.",
    city: "Marousi", address: "32 Amarousiou-Chalandriou St", region: "Attica",
    property_type: "apartment", listing_type: "sale",
    price: 195000, price_per_sqm: 3900, sqm: 50,
    bedrooms: 1, bathrooms: 1, floor: 3, total_floors: 9,
    year_built: 2026, energy_class: "A",
    construction_status: "planning",
    is_pre_sale: true, is_featured: false, priority_placement: 0,
    has_elevator: true, has_parking: true,
    has_security: true, suitable_investment: true,
    latitude: 38.0556, longitude: 23.8080, views_count: 88,
    cover_image_url: COVER_IMAGES[5],
    tags: ["investment", "buy-to-let", "metro", "pre-sale"],
  },
  {
    title: "Chania Old Town Boutique Residences",
    description: "6 restored Venetian townhouses in the historic old town of Chania, Crete. Each property is being carefully renovated to preserve original features — stone arches, vaulted ceilings, Venetian plasterwork — while adding modern kitchens, bathrooms, and air conditioning. Ideal for holiday rentals or golden visa purposes.",
    city: "Chania", address: "7 Skridlof St, Old Town", region: "Crete",
    property_type: "house", listing_type: "sale",
    price: 340000, price_per_sqm: 3800, sqm: 92,
    bedrooms: 2, bathrooms: 2, floor: 0, total_floors: 2,
    year_built: 2025, energy_class: "B",
    construction_status: "shell_complete",
    is_pre_sale: true, is_featured: true, priority_placement: 6,
    has_parking: false, has_view: true, has_balcony: true, has_ac: true,
    latitude: 35.5138, longitude: 24.0141, views_count: 260,
    cover_image_url: COVER_IMAGES[6],
    tags: ["historic", "golden-visa", "venetian", "holiday-rental"],
  },
  {
    title: "Rhodes New Marina Residences — Early-Bird Phase",
    description: "Off-plan seafront apartments adjacent to the new Mandraki Marina expansion. Phase 1 launches at pre-construction prices — expected 20–30% capital appreciation on delivery. 1, 2, and 3-bedroom options. Fully managed rental programme available post-completion. EU Golden Visa eligible.",
    city: "Rhodes", address: "12 Mandraki Harbour, Rhodes Town", region: "South Aegean",
    property_type: "apartment", listing_type: "sale",
    price: 285000, price_per_sqm: 5100, sqm: 56,
    bedrooms: 1, bathrooms: 1, floor: 2, total_floors: 5,
    year_built: 2027, energy_class: "A+",
    construction_status: "planning",
    is_pre_sale: true, is_featured: false, priority_placement: 0,
    has_elevator: true, has_parking: true, has_pool: true,
    has_security: true, has_view: true, has_balcony: true,
    latitude: 36.4450, longitude: 28.2261, views_count: 145,
    cover_image_url: COVER_IMAGES[7],
    tags: ["golden-visa", "marina", "early-bird", "managed-rental"],
  },
];

async function main() {
  console.log("🔍  Looking up developer account...");
  const ownerId = await getDeveloperOwnerId();
  if (!ownerId) {
    console.warn("⚠️  No developer/agent found. Listings will have owner_id = null. Run seed-mock-users.ts first.");
  }

  const listings = NEW_BUILDS.map(l => ({ ...l, owner_id: ownerId, status: "active" as const }));

  console.log(`🏗️  Seeding ${listings.length} new-build listings...`);
  const { error } = await supabase.from("listings").insert(listings);
  if (error) {
    console.error("❌  Error:", error.message);
    process.exit(1);
  }
  console.log(`✅  ${listings.length} new-build listings seeded successfully`);
  console.log(`    ${listings.filter(l => l.is_featured).length} are featured`);
  console.log(`    ${listings.filter(l => l.is_pre_sale).length} are pre-sale`);
}

main().catch(err => { console.error(err); process.exit(1); });
