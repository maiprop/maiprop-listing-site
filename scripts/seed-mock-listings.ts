/**
 * Seed mock listings for all modules: Buy, Rent, Open House, Quick Sale (firesale).
 * Run: npx tsx scripts/seed-mock-listings.ts
 * Requires: SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Creates ~40 listings spread across listing_type: sale, rent, open_house, firesale
 * plus firesale_requests entries for the Quick Sale pipeline.
 * Uses a seeded owner_id from existing mock agent/seller accounts (or null for anonymous).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "https://qvvicunqcrwpioqnvzxf.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function futureDate(daysFromNow: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

const CITIES = ["Athens", "Thessaloniki", "Patras", "Heraklion", "Rhodes", "Volos", "Chania", "Larissa"];
const AREAS = ["Kolonaki", "Glyfada", "Kifisia", "Piraeus", "Marousi", "Nea Smyrni", "Chalandri", "Psychiko", "Vouliagmeni", "Faliro"];
const PROPERTY_TYPES = ["apartment", "house", "villa", "land", "commercial", "office"] as const;
const ENERGY_CLASSES = ["A+", "A", "B", "C", "D", "E", "F", "G"];
const HEATING = ["autonomous_gas", "central_oil", "heat_pump", "electric", "underfloor"];

// Unsplash property image placeholders (stable, real images)
const COVER_IMAGES = [
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
  "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80",
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
  "https://images.unsplash.com/photo-1605146769289-440113cc3d00?w=800&q=80",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
  "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800&q=80",
];

// ── Lookup seeded owner IDs ───────────────────────────────────────────────────

async function getOwnerIds(): Promise<{ agents: string[]; sellers: string[] }> {
  const agentEmails = ["agent1@maiprop.demo", "agent2@maiprop.demo", "agent3@maiprop.demo"];
  const sellerEmails = ["seller1@maiprop.demo", "seller2@maiprop.demo", "seller3@maiprop.demo"];

  // Look up auth user IDs by email (service role can access auth.admin)
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const byEmail = new Map(authUsers?.users?.map((u) => [u.email, u.id]) ?? []);

  return {
    agents: agentEmails.map((e) => byEmail.get(e)).filter(Boolean) as string[],
    sellers: sellerEmails.map((e) => byEmail.get(e)).filter(Boolean) as string[],
  };
}

// ── Listing factories ─────────────────────────────────────────────────────────

function makeSaleListing(ownerId: string | null, i: number) {
  const city = pick(CITIES);
  const area = pick(AREAS);
  const propType = pick(["apartment", "house", "villa"]);
  const beds = rand(1, 5);
  const baths = rand(1, 3);
  const sqm = rand(55, 280);
  const price = rand(80, 850) * 1000;
  const floor = rand(0, 8);
  return {
    title: `${beds}BR ${propType.charAt(0).toUpperCase() + propType.slice(1)} in ${area}, ${city}`,
    description: `Spacious ${beds}-bedroom ${propType} located in the heart of ${area}, ${city}. Features include ${baths} bathrooms, ${sqm}m² of living space, and stunning city views. Modern finishes throughout with high-quality materials. Ideal for families or as a prime investment property.`,
    listing_type: "sale" as const,
    property_type: propType as typeof PROPERTY_TYPES[number],
    city,
    address: `${rand(1, 150)} ${area} St, ${city}`,
    price,
    sqm,
    bedrooms: beds,
    bathrooms: baths,
    floor,
    total_floors: floor + rand(1, 4),
    year_built: rand(1980, 2023),
    energy_class: pick(ENERGY_CLASSES),
    heating_system: pick(HEATING),
    has_parking: Math.random() > 0.4,
    has_elevator: Math.random() > 0.4,
    has_balcony: Math.random() > 0.3,
    has_view: Math.random() > 0.5,
    has_pool: propType === "villa" && Math.random() > 0.4,
    has_garden: propType !== "apartment" && Math.random() > 0.5,
    has_furnished: Math.random() > 0.6,
    has_ac: Math.random() > 0.3,
    is_featured: i % 4 === 0,
    is_off_market: false,
    is_pre_sale: false,
    cover_image_url: COVER_IMAGES[i % COVER_IMAGES.length],
    price_per_sqm: Math.round(price / sqm),
    status: "active" as const,
    owner_id: ownerId,
    latitude: 37.9 + Math.random() * 0.4,
    longitude: 23.7 + Math.random() * 0.4,
    views_count: rand(10, 800),
    priority_placement: i % 5 === 0 ? 1 : 0,
    suitable_investment: Math.random() > 0.5,
  };
}

function makeRentListing(ownerId: string | null, i: number) {
  const city = pick(CITIES);
  const area = pick(AREAS);
  const propType = pick(["apartment", "house", "villa"]);
  const beds = rand(1, 4);
  const sqm = rand(35, 180);
  const price = rand(450, 3500);
  return {
    title: `${beds}BR ${propType.charAt(0).toUpperCase() + propType.slice(1)} for Rent – ${area}`,
    description: `Well-maintained ${propType} for rent in ${area}, ${city}. ${sqm}m², ${beds > 0 ? `${beds} bedroom${beds > 1 ? "s" : ""},` : ""} fully equipped kitchen. Close to public transport, shops, and schools. Available immediately.`,
    listing_type: "rent" as const,
    property_type: propType as typeof PROPERTY_TYPES[number],
    city,
    address: `${rand(1, 200)} ${area} Ave, ${city}`,
    price,
    sqm,
    bedrooms: beds,
    bathrooms: rand(1, 2),
    floor: rand(0, 6),
    total_floors: rand(3, 8),
    year_built: rand(1990, 2022),
    energy_class: pick(ENERGY_CLASSES),
    heating_system: pick(HEATING),
    has_parking: Math.random() > 0.5,
    has_elevator: Math.random() > 0.4,
    has_balcony: Math.random() > 0.4,
    has_furnished: Math.random() > 0.4,
    has_ac: true,
    pets_allowed: Math.random() > 0.5,
    short_term_rental: Math.random() > 0.7,
    min_rental_months: pick([1, 3, 6, 12]),
    deposit_months: pick([1, 2, 3]),
    is_featured: i % 3 === 0,
    is_off_market: false,
    is_pre_sale: false,
    cover_image_url: COVER_IMAGES[(i + 3) % COVER_IMAGES.length],
    price_per_sqm: Math.round(price / sqm),
    status: "active" as const,
    owner_id: ownerId,
    latitude: 37.9 + Math.random() * 0.4,
    longitude: 23.7 + Math.random() * 0.4,
    views_count: rand(5, 400),
    priority_placement: 0,
    suitable_student: Math.random() > 0.5,
  };
}

function makeOpenHouseListing(ownerId: string | null, i: number) {
  const city = pick(["Athens", "Thessaloniki", "Glyfada", "Kifisia"]);
  const area = pick(AREAS);
  const beds = rand(2, 5);
  const sqm = rand(80, 300);
  const price = rand(250, 1200) * 1000;
  // Open house dates: 3–21 days from now, on weekends
  const daysAhead = rand(3, 21);
  return {
    title: `Open House: ${beds}BR in ${area} — Visit This Weekend`,
    description: `Join us for an exclusive open house viewing of this stunning ${beds}-bedroom property in ${area}. Hosted by our agent, this ${sqm}m² home offers premium finishes, natural light throughout, and a prime location. Refreshments will be served. RSVP to secure your spot.`,
    listing_type: "open_house" as const,
    property_type: pick(["apartment", "house", "villa"]) as typeof PROPERTY_TYPES[number],
    city,
    address: `${rand(1, 80)} ${area} Blvd, ${city}`,
    price,
    sqm,
    bedrooms: beds,
    bathrooms: rand(1, 3),
    floor: rand(0, 5),
    total_floors: rand(2, 7),
    year_built: rand(2000, 2023),
    energy_class: pick(["A+", "A", "B"]),
    has_parking: true,
    has_elevator: true,
    has_balcony: true,
    has_view: Math.random() > 0.4,
    has_pool: Math.random() > 0.6,
    has_ac: true,
    open_house_date: futureDate(daysAhead),
    is_featured: true,
    is_off_market: false,
    is_pre_sale: false,
    cover_image_url: COVER_IMAGES[(i + 1) % COVER_IMAGES.length],
    price_per_sqm: Math.round(price / sqm),
    status: "active" as const,
    owner_id: ownerId,
    latitude: 37.9 + Math.random() * 0.4,
    longitude: 23.7 + Math.random() * 0.4,
    views_count: rand(50, 600),
    priority_placement: 1,
  };
}

function makeFiresaleListing(ownerId: string | null, i: number) {
  const city = pick(CITIES);
  const area = pick(AREAS);
  const beds = rand(1, 4);
  const sqm = rand(50, 200);
  const marketPrice = rand(150, 600) * 1000;
  const discountPct = rand(15, 35);
  const price = Math.round(marketPrice * (1 - discountPct / 100) / 1000) * 1000;
  return {
    title: `Quick Sale – ${beds}BR in ${area} (${discountPct}% Below Market)`,
    description: `Motivated seller — must sell fast. This ${beds}-bedroom property in ${area} is priced ${discountPct}% below current market value at just €${price.toLocaleString()}. Estimated market price: €${marketPrice.toLocaleString()}. Property is in good condition, ${sqm}m², with all utilities connected. Serious buyers only. First come, first served.`,
    listing_type: "firesale" as const,
    property_type: pick(["apartment", "house", "villa"]) as typeof PROPERTY_TYPES[number],
    city,
    address: `${rand(1, 100)} ${area} St, ${city}`,
    price,
    sqm,
    bedrooms: beds,
    bathrooms: rand(1, 2),
    floor: rand(0, 4),
    total_floors: rand(3, 7),
    year_built: rand(1975, 2015),
    energy_class: pick(["C", "D", "E", "F"]),
    heating_system: pick(HEATING),
    has_parking: Math.random() > 0.5,
    has_elevator: Math.random() > 0.5,
    has_balcony: true,
    has_ac: Math.random() > 0.4,
    is_featured: i % 2 === 0,
    is_off_market: false,
    is_pre_sale: false,
    cover_image_url: COVER_IMAGES[(i + 5) % COVER_IMAGES.length],
    price_per_sqm: Math.round(price / sqm),
    tags: ["quick-sale", "motivated-seller", `${discountPct}%-below-market`],
    status: "active" as const,
    owner_id: ownerId,
    latitude: 37.9 + Math.random() * 0.4,
    longitude: 23.7 + Math.random() * 0.4,
    views_count: rand(80, 1200),
    priority_placement: 2,
    suitable_investment: true,
  };
}

// ── Firesale requests (Quick Sale pipeline) ───────────────────────────────────

function makeFiresaleRequest(ownerId: string, i: number) {
  const city = pick(CITIES);
  const beds = rand(1, 4);
  const askingPrice = rand(80, 500) * 1000;
  return {
    user_id: ownerId,
    contact_email: `seller${(i % 3) + 1}@maiprop.demo`,
    address: `${rand(1, 200)} ${pick(AREAS)} St, ${city}`,
    city,
    sqm: rand(55, 200),
    bedrooms: beds,
    asking_price: askingPrice,
    offer_price: Math.round(askingPrice * (1 - rand(10, 30) / 100) / 1000) * 1000,
    status: pick(["pending", "pending", "reviewed", "confirmed"]),
    notes: pick([
      "Owner relocating abroad, needs fast sale.",
      "Inheritance property — family wants to liquidate quickly.",
      "Mortgage pressure — must sell within 60 days.",
      "Owner purchasing another property, quick sale needed.",
      "Distressed seller — open to negotiation.",
    ]),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍  Looking up seeded owner accounts...");
  const { agents, sellers } = await getOwnerIds();

  if (agents.length === 0 && sellers.length === 0) {
    console.warn("⚠️  No agent or seller accounts found. Run seed-mock-users.ts first, or listings will have owner_id = null.");
  }

  const owners = [...agents, ...sellers];
  const pickOwner = (i: number): string | null => owners.length ? owners[i % owners.length] : null;

  // ── For Sale (12 listings) ────────────────────────────────────────────────
  console.log("🏠  Seeding For Sale listings...");
  const saleListings = Array.from({ length: 12 }, (_, i) => makeSaleListing(pickOwner(i), i));
  const { error: saleErr } = await supabase.from("listings").insert(saleListings);
  if (saleErr) console.error("Sale insert error:", saleErr.message);
  else console.log(`  ✅  ${saleListings.length} sale listings`);

  // ── For Rent (10 listings) ────────────────────────────────────────────────
  console.log("🏢  Seeding For Rent listings...");
  const rentListings = Array.from({ length: 10 }, (_, i) => makeRentListing(pickOwner(i), i));
  const { error: rentErr } = await supabase.from("listings").insert(rentListings);
  if (rentErr) console.error("Rent insert error:", rentErr.message);
  else console.log(`  ✅  ${rentListings.length} rent listings`);

  // ── Open Houses (8 listings) ─────────────────────────────────────────────
  console.log("📅  Seeding Open House listings...");
  const openHouseListings = Array.from({ length: 8 }, (_, i) => makeOpenHouseListing(pickOwner(i), i));
  const { error: ohErr } = await supabase.from("listings").insert(openHouseListings);
  if (ohErr) console.error("Open House insert error:", ohErr.message);
  else console.log(`  ✅  ${openHouseListings.length} open house listings`);

  // ── Quick Sale / Firesale (10 listings) ──────────────────────────────────
  console.log("🔥  Seeding Quick Sale listings...");
  const firesaleListings = Array.from({ length: 10 }, (_, i) => makeFiresaleListing(pickOwner(i), i));
  const { error: fsErr } = await supabase.from("listings").insert(firesaleListings);
  if (fsErr) console.error("Firesale insert error:", fsErr.message);
  else console.log(`  ✅  ${firesaleListings.length} firesale listings`);

  // ── Firesale Requests (pipeline entries for investors) ────────────────────
  if (owners.length > 0) {
    console.log("📋  Seeding Quick Sale pipeline requests...");
    const requests = Array.from({ length: 8 }, (_, i) => makeFiresaleRequest(owners[i % owners.length], i));
    const { error: reqErr } = await supabase.from("firesale_requests").insert(requests);
    if (reqErr) console.error("Firesale requests error:", reqErr.message);
    else console.log(`  ✅  ${requests.length} firesale pipeline requests`);
  }

  console.log("\n✅  Done. Total listings seeded:", saleListings.length + rentListings.length + openHouseListings.length + firesaleListings.length);
}

main().catch(console.error);
