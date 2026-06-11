/**
 * Seed mock new-build listings.
 * Run: npx tsx scripts/seed-mock-new-builds.ts
 * Requires: SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from "@supabase/supabase-js";
import { assertNotProduction } from "./_prod-guard";
import { getSeedEnv } from "./_seed-env";

const { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY } = getSeedEnv();

assertNotProduction(SUPABASE_URL, "seed-mock-new-builds.ts");

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
    property_type: "apartment", listing_type: "new_build",
    price: 380000, price_per_sqm: 6200, sqm: 62,
    bedrooms: 2, bathrooms: 1, floor: 4, total_floors: 8,
    year_built: 2026, energy_class: "A+",
    construction_status: "under_construction",
    is_pre_sale: false, is_featured: true, priority_placement: 8,
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
    property_type: "apartment", listing_type: "new_build",
    price: 520000, price_per_sqm: 7800, sqm: 68,
    bedrooms: 2, bathrooms: 2, floor: 3, total_floors: 6,
    year_built: 2025, energy_class: "A+",
    construction_status: "shell_complete",
    is_pre_sale: false, is_featured: true, priority_placement: 9,
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
    property_type: "apartment", listing_type: "new_build",
    price: 145000, price_per_sqm: 4200, sqm: 34,
    bedrooms: 0, bathrooms: 1, floor: 7, total_floors: 15,
    year_built: 2027, energy_class: "A",
    construction_status: "foundation",
    is_pre_sale: false, is_featured: true, priority_placement: 7,
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
    property_type: "villa", listing_type: "new_build",
    price: 1850000, price_per_sqm: 5200, sqm: 356,
    bedrooms: 4, bathrooms: 4, floor: 0, total_floors: 2,
    year_built: 2025, energy_class: "A+",
    construction_status: "topping_out",
    is_pre_sale: false, is_featured: true, priority_placement: 10,
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
    property_type: "apartment", listing_type: "new_build",
    price: 290000, price_per_sqm: 4800, sqm: 62,
    bedrooms: 2, bathrooms: 1, floor: 5, total_floors: 10,
    year_built: 2026, energy_class: "A",
    construction_status: "under_construction",
    is_pre_sale: false, is_featured: false, priority_placement: 0,
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
    property_type: "apartment", listing_type: "new_build",
    price: 195000, price_per_sqm: 3900, sqm: 50,
    bedrooms: 1, bathrooms: 1, floor: 3, total_floors: 9,
    year_built: 2026, energy_class: "A",
    construction_status: "planning",
    is_pre_sale: false, is_featured: false, priority_placement: 0,
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
    property_type: "house", listing_type: "new_build",
    price: 340000, price_per_sqm: 3800, sqm: 92,
    bedrooms: 2, bathrooms: 2, floor: 0, total_floors: 2,
    year_built: 2025, energy_class: "B",
    construction_status: "shell_complete",
    is_pre_sale: false, is_featured: true, priority_placement: 6,
    has_parking: false, has_view: true, has_balcony: true, has_ac: true,
    latitude: 35.5138, longitude: 24.0141, views_count: 260,
    cover_image_url: COVER_IMAGES[6],
    tags: ["historic", "golden-visa", "venetian", "holiday-rental"],
  },
  {
    title: "Rhodes New Marina Residences — Early-Bird Phase",
    description: "Off-plan seafront apartments adjacent to the new Mandraki Marina expansion. Phase 1 launches at pre-construction prices — expected 20–30% capital appreciation on delivery. 1, 2, and 3-bedroom options. Fully managed rental programme available post-completion. EU Golden Visa eligible.",
    city: "Rhodes", address: "12 Mandraki Harbour, Rhodes Town", region: "South Aegean",
    property_type: "apartment", listing_type: "new_build",
    price: 285000, price_per_sqm: 5100, sqm: 56,
    bedrooms: 1, bathrooms: 1, floor: 2, total_floors: 5,
    year_built: 2027, energy_class: "A+",
    construction_status: "planning",
    is_pre_sale: false, is_featured: false, priority_placement: 0,
    has_elevator: true, has_parking: true, has_pool: true,
    has_security: true, has_view: true, has_balcony: true,
    latitude: 36.4450, longitude: 28.2261, views_count: 145,
    cover_image_url: COVER_IMAGES[7],
    tags: ["golden-visa", "marina", "early-bird", "managed-rental"],
  },
];

// ── New-build FOR RENT ────────────────────────────────────────────────────────
// Developer-managed rental units in newly completed or near-complete buildings
const NEW_BUILD_RENTALS = [
  {
    title: "Kolonaki Residences — Managed Rental Studio",
    description: "Brand-new A+ studio (34m²) in the newly delivered Kolonaki Residences. Fully furnished and equipped. Managed by the developer — utilities and building maintenance included. Ideal for professionals or expats. Minimum 6-month lease. Available immediately.",
    city: "Athens", address: "14 Skoufa St, Kolonaki", region: "Attica",
    property_type: "apartment", listing_type: "rent",
    price: 1450, price_per_sqm: 43, sqm: 34,
    bedrooms: 0, bathrooms: 1, floor: 2, total_floors: 8,
    year_built: 2025, energy_class: "A+",
    construction_status: "new",
    is_pre_sale: false, is_featured: true, priority_placement: 5,
    has_elevator: true, has_parking: false, has_smart_home: true,
    has_security: true, has_furnished: true, has_ac: true, has_balcony: true,
    min_rental_months: 6, deposit_months: 2,
    latitude: 37.9795, longitude: 23.7424, views_count: 220,
    cover_image_url: COVER_IMAGES[0],
    tags: ["new-build", "managed-rental", "furnished", "A+"],
  },
  {
    title: "Glyfada Riviera — New 2BR Sea-View Rental",
    description: "Freshly completed 2-bedroom apartment in Glyfada Riviera. Direct sea views from the living room and master bedroom. Fully furnished to hotel standard — linen, appliances, smart TV included. Underground parking space included. Available on 12-month lease.",
    city: "Glyfada", address: "3 Poseidonos Ave, Glyfada", region: "Attica",
    property_type: "apartment", listing_type: "rent",
    price: 2800, price_per_sqm: 41, sqm: 68,
    bedrooms: 2, bathrooms: 2, floor: 4, total_floors: 6,
    year_built: 2025, energy_class: "A+",
    construction_status: "new",
    is_pre_sale: false, is_featured: true, priority_placement: 4,
    has_elevator: true, has_parking: true, has_pool: true,
    has_security: true, has_view: true, has_furnished: true, has_ac: true, has_balcony: true,
    min_rental_months: 12, deposit_months: 2,
    short_term_rental: false,
    latitude: 37.8630, longitude: 23.7516, views_count: 380,
    cover_image_url: COVER_IMAGES[1],
    tags: ["new-build", "sea-view", "furnished", "parking"],
  },
  {
    title: "Marousi Central — New 1BR Corporate Rental",
    description: "Just completed 1-bedroom apartment in Marousi Central, ideal for business professionals. 5-minute walk to Marousi metro. High-speed fibre, ergonomic workspace, fully fitted kitchen. Flexible lease terms from 3 months. Bills not included.",
    city: "Marousi", address: "32 Amarousiou-Chalandriou St", region: "Attica",
    property_type: "apartment", listing_type: "rent",
    price: 1100, price_per_sqm: 22, sqm: 50,
    bedrooms: 1, bathrooms: 1, floor: 5, total_floors: 9,
    year_built: 2026, energy_class: "A",
    construction_status: "new",
    is_pre_sale: false, is_featured: false, priority_placement: 0,
    has_elevator: true, has_parking: true, has_furnished: true, has_ac: true,
    has_security: true,
    min_rental_months: 3, deposit_months: 1,
    short_term_rental: false,
    latitude: 38.0556, longitude: 23.8080, views_count: 95,
    cover_image_url: COVER_IMAGES[5],
    tags: ["new-build", "corporate-rental", "metro", "furnished"],
  },
  {
    title: "Thessaloniki Waterfront — New 2BR Long-Let",
    description: "Newly delivered 2-bedroom apartment with stunning sea views over the Thermaic Gulf. Contemporary design, marble bathrooms, American kitchen, 2 full bathrooms. Underground parking. Quiet residential building with concierge. 12-month lease preferred.",
    city: "Thessaloniki", address: "5 Nikis Ave, Paralía", region: "Central Macedonia",
    property_type: "apartment", listing_type: "rent",
    price: 1600, price_per_sqm: 26, sqm: 62,
    bedrooms: 2, bathrooms: 2, floor: 6, total_floors: 10,
    year_built: 2026, energy_class: "A",
    construction_status: "new",
    is_pre_sale: false, is_featured: false, priority_placement: 0,
    has_elevator: true, has_parking: true, has_view: true, has_balcony: true,
    has_furnished: false, has_ac: true,
    has_security: true,
    min_rental_months: 12, deposit_months: 2,
    latitude: 40.6284, longitude: 22.9474, views_count: 112,
    cover_image_url: COVER_IMAGES[4],
    tags: ["new-build", "sea-view", "thessaloniki", "long-let"],
  },
  {
    title: "Athens Skyline Tower — New Studio for Rent",
    description: "Brand-new studio apartment on the 10th floor of Athens Skyline Tower with unobstructed city-wide views. A-rated energy, triple-glazed windows, heat-pump HVAC. Suitable for single professional or couple. Short or long-term available. Ideal Airbnb / serviced apartment opportunity.",
    city: "Athens", address: "88 Pireos St, Metaxourgeio", region: "Attica",
    property_type: "apartment", listing_type: "rent",
    price: 950, price_per_sqm: 28, sqm: 34,
    bedrooms: 0, bathrooms: 1, floor: 10, total_floors: 15,
    year_built: 2026, energy_class: "A",
    construction_status: "new",
    is_pre_sale: false, is_featured: false, priority_placement: 0,
    has_elevator: true, has_parking: false, has_smart_home: true,
    has_security: true, has_view: true, has_ac: true, has_furnished: true,
    min_rental_months: 1, deposit_months: 1,
    short_term_rental: true,
    latitude: 37.9803, longitude: 23.7188, views_count: 67,
    cover_image_url: COVER_IMAGES[2],
    tags: ["new-build", "city-view", "short-term", "airbnb-ready"],
  },
  {
    title: "Kifisia — New 3BR Family Villa for Rent",
    description: "Newly completed standalone villa with private garden and pool in prime Kifisia. Spacious 3-bedroom layout across 2 floors, fully equipped kitchen, 2 bathrooms + guest WC. Large covered terrace, BBQ area, 2-car garage. Ideal for families seeking long-term rental in a safe, green neighbourhood.",
    city: "Kifisia", address: "5 Kastanias St, Kifisia", region: "Attica",
    property_type: "villa", listing_type: "rent",
    price: 4500, price_per_sqm: 20, sqm: 230,
    bedrooms: 3, bathrooms: 2, floor: 0, total_floors: 2,
    year_built: 2025, energy_class: "A+",
    construction_status: "new",
    is_pre_sale: false, is_featured: true, priority_placement: 3,
    has_elevator: false, has_parking: true, has_pool: true, has_garden: true,
    has_smart_home: true, has_security: true, has_ac: true,
    has_underfloor_heating: true, has_view: false,
    min_rental_months: 12, deposit_months: 3,
    latitude: 38.0780, longitude: 23.8090, views_count: 290,
    cover_image_url: COVER_IMAGES[3],
    tags: ["new-build", "villa", "family", "pool", "garden"],
  },
];

async function main() {
  console.log("🔍  Looking up developer account...");
  const ownerId = await getDeveloperOwnerId();
  if (!ownerId) {
    console.warn("⚠️  No developer/agent found. Listings will have owner_id = null. Run seed-mock-users.ts first.");
  }

  const saleListings = NEW_BUILDS.map(l => ({ ...l, owner_id: ownerId, status: "active" as const }));
  const rentListings = NEW_BUILD_RENTALS.map(l => ({ ...l, owner_id: ownerId, status: "active" as const }));
  const allListings = [...saleListings, ...rentListings];

  console.log(`🏗️  Seeding ${saleListings.length} new-build FOR SALE listings...`);
  const { error: saleErr } = await supabase.from("listings").insert(saleListings);
  if (saleErr) { console.error("❌  Sale error:", saleErr.message); process.exit(1); }
  console.log(`  ✅  ${saleListings.length} inserted`);

  console.log(`🏠  Seeding ${rentListings.length} new-build FOR RENT listings...`);
  const { error: rentErr } = await supabase.from("listings").insert(rentListings);
  if (rentErr) { console.error("❌  Rent error:", rentErr.message); process.exit(1); }
  console.log(`  ✅  ${rentListings.length} inserted`);

  console.log(`\n✅  Total: ${allListings.length} new-build listings seeded`);
  console.log(`    ${allListings.filter(l => (l as any).is_featured).length} featured`);
  console.log(`    ${saleListings.length} for sale (pre-sale), ${rentListings.length} for rent (new)`);
}

main().catch(err => { console.error(err); process.exit(1); });
