/**
 * Seed mock listings for all modules: Buy, Rent, New Build, Open House.
 * Run: npx tsx scripts/seed-mock-listings.ts
 * Requires: SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Creates 25 listings:
 *   - 5 for sale (private owner)
 *   - 5 for sale (agent) + ensures each agent exists in `professionals`
 *   - 5 for rent (mixed owners)
 *   - 5 new builds (listing_type: "new_build")
 *   - 5 open house
 *
 * Quick Sale listings are NOT in the listings table.
 * They appear only via firesale_requests (investor pipeline).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { assertNotProduction } from "./_prod-guard";
import { getSeedEnv } from "./_seed-env";

// Auto-load .env from project root so the script works without manually sourcing it
try {
  const envPath = resolve(process.cwd(), ".env");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch { /* .env not found — rely on shell environment */ }

const { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY } = getSeedEnv();

assertNotProduction(SUPABASE_URL, "seed-mock-listings.ts");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Lookup seeded owner IDs ────────────────────────────────────────────────────

async function getOwnerIds(): Promise<{ agents: { id: string; email: string; name: string }[]; sellers: string[] }> {
  const agentMeta = [
    { email: "agent1@maiprop.demo", name: "Nikos Papadopoulos" },
    { email: "agent2@maiprop.demo", name: "Elena Stavrou" },
    { email: "agent3@maiprop.demo", name: "Kostas Alexiou" },
  ];
  const sellerEmails = ["seller1@maiprop.demo", "seller2@maiprop.demo", "seller3@maiprop.demo"];

  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const byEmail = new Map(authUsers?.users?.map((u) => [u.email, u.id]) ?? []);

  return {
    agents: agentMeta
      .map((a) => ({ id: byEmail.get(a.email) ?? "", email: a.email, name: a.name }))
      .filter((a) => a.id !== ""),
    sellers: sellerEmails.map((e) => byEmail.get(e)).filter(Boolean) as string[],
  };
}

// ── Ensure agents are in the professionals table ──────────────────────────────

async function ensureAgentProfiles(agents: { id: string; email: string; name: string }[]): Promise<void> {
  for (const agent of agents) {
    const { error } = await supabase.from("professionals").upsert(
      {
        user_id: agent.id,
        display_name: agent.name,
        title: "Real Estate Agent",
        category: "real_estate_agent",
        city: "Athens",
        verified: true,
        subscription_tier: "pro",
        experience_years: 8,
        specialties: ["Residential", "New Builds", "Investment"],
        languages: ["Greek", "English"],
        bio: `Licensed real estate agent based in Athens with 8 years of experience in residential and investment properties. Member of the Hellenic Association of Realtors.`,
      },
      { onConflict: "user_id" }
    );
    if (error) {
      console.error(`  ⚠️  Could not upsert professional profile for ${agent.email}:`, error.message);
    }
  }
}

// ── Firesale requests (Quick Sale pipeline — NOT listings) ────────────────────

function makeFiresaleRequest(ownerId: string, i: number) {
  const entries = [
    { city: "Athens", address: "45 Patision St, Athens", sqm: 78, bedrooms: 2, asking: 180000, offer: 148000, notes: "Owner relocating to Germany, needs fast sale." },
    { city: "Thessaloniki", address: "12 Tsimiski St, Thessaloniki", sqm: 95, bedrooms: 3, asking: 220000, offer: 175000, notes: "Inheritance property — family wants to liquidate quickly." },
    { city: "Glyfada", address: "7 Poseidonos Ave, Glyfada", sqm: 120, bedrooms: 3, asking: 350000, offer: 290000, notes: "Mortgage pressure — must sell within 60 days." },
    { city: "Kifisia", address: "33 Kolokotroni St, Kifisia", sqm: 60, bedrooms: 2, asking: 160000, offer: 132000, notes: "Owner purchasing another property, quick sale needed." },
    { city: "Piraeus", address: "88 Akti Miaouli, Piraeus", sqm: 55, bedrooms: 1, asking: 110000, offer: 90000, notes: "Distressed seller — open to negotiation." },
  ];
  const e = entries[i % entries.length];
  return {
    user_id: ownerId,
    contact_email: `seller${(i % 3) + 1}@maiprop.demo`,
    address: e.address,
    city: e.city,
    sqm: e.sqm,
    bedrooms: e.bedrooms,
    asking_price: e.asking,
    offer_price: e.offer,
    status: (["pending", "pending", "reviewed", "confirmed"] as const)[i % 4],
    notes: e.notes,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍  Looking up seeded owner accounts...");
  const { agents, sellers } = await getOwnerIds();

  if (agents.length === 0 && sellers.length === 0) {
    console.warn("⚠️  No agent or seller accounts found. Run seed-mock-users.ts first.");
  }

  // ── Clean existing mock listings ──────────────────────────────────────────
  console.log("🗑️   Removing existing mock listings...");
  const ownerIds = [...agents.map((a) => a.id), ...sellers].filter(Boolean);
  if (ownerIds.length > 0) {
    const { error: delErr } = await supabase.from("listings").delete().in("owner_id", ownerIds);
    if (delErr) console.error("  Delete error:", delErr.message);
    else console.log("  ✅  Old mock listings removed");
  }

  // Remove firesale listing_type entries left from previous seeds
  const { error: delFiresaleErr } = await supabase.from("listings").delete().eq("listing_type", "firesale");
  if (delFiresaleErr) console.error("  Delete firesale error:", delFiresaleErr.message);

  // ── Ensure agent professional profiles exist ──────────────────────────────
  if (agents.length > 0) {
    console.log("👤  Upserting agent professional profiles...");
    await ensureAgentProfiles(agents);
    console.log(`  ✅  ${agents.length} agent profiles ensured`);
  }

  const pickAgent = (i: number) => agents.length ? agents[i % agents.length].id : null;
  const pickSeller = (i: number) => sellers.length ? sellers[i % sellers.length] : null;
  const pickOwner = (i: number) => [...agents.map((a) => a.id), ...sellers][i % (agents.length + sellers.length)] ?? null;

  // ── For Sale — Private Owner (5 listings) ─────────────────────────────────
  console.log("🏠  Seeding For Sale (private owner) listings...");
  const privateSaleListings = [
    {
      title: "3BR Apartment in Kolonaki — Owner Selling",
      description: "Bright 3-bedroom apartment on the 4th floor in the heart of Kolonaki. 110m², fully renovated in 2021 with oak flooring and marble kitchen. South-facing balcony with Lycabettus Hill views. No agent fees — direct from owner.",
      listing_type: "sale", property_type: "apartment", city: "Athens", address: "14 Skoufa St, Kolonaki, Athens",
      price: 420000, sqm: 110, bedrooms: 3, bathrooms: 2, floor: 4, total_floors: 6, year_built: 1985,
      energy_class: "B", heating_system: "autonomous_gas", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: true, has_ac: true, has_furnished: false,
      is_featured: true, cover_image_url: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80",
      price_per_sqm: 3818, status: "active", latitude: 37.9792, longitude: 23.7350,
      views_count: 342, priority_placement: 1, suitable_investment: false,
    },
    {
      title: "2BR Villa with Pool — Glyfada, Private Sale",
      description: "Detached 2-storey villa in Glyfada, 5 minutes from the beach. 180m² on a 320m² plot with private pool and landscaped garden. Built 2010, energy class A. Rarely available in this neighbourhood. Sold directly by the owner.",
      listing_type: "sale", property_type: "villa", city: "Glyfada", address: "22 Poseidonos Ave, Glyfada",
      price: 780000, sqm: 180, bedrooms: 2, bathrooms: 2, floor: 0, total_floors: 2, year_built: 2010,
      energy_class: "A", heating_system: "heat_pump", has_parking: true, has_elevator: false,
      has_balcony: true, has_view: true, has_pool: true, has_garden: true, has_ac: true, has_furnished: true,
      is_featured: false, cover_image_url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
      price_per_sqm: 4333, status: "active", latitude: 37.8660, longitude: 23.7540,
      views_count: 519, priority_placement: 0, suitable_investment: true,
    },
    {
      title: "1BR Studio in Psyrri — Investor's Opportunity",
      description: "Compact 45m² studio in the vibrant Psyrri district, ground floor with private entrance. Currently rented at €550/month. Perfect lock-and-leave investment or city pied-à-terre. Owner selling due to relocation. No commission.",
      listing_type: "sale", property_type: "apartment", city: "Athens", address: "6 Agion Anargyron, Psyrri, Athens",
      price: 88000, sqm: 45, bedrooms: 1, bathrooms: 1, floor: 0, total_floors: 5, year_built: 1972,
      energy_class: "D", heating_system: "autonomous_gas", has_parking: false, has_elevator: false,
      has_balcony: false, has_view: false, has_ac: true, has_furnished: true,
      is_featured: false, cover_image_url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
      price_per_sqm: 1956, status: "active", latitude: 37.9775, longitude: 23.7175,
      views_count: 214, priority_placement: 0, suitable_investment: true,
    },
    {
      title: "4BR Family House in Kifisia",
      description: "Spacious family home in one of Athens' most sought-after northern suburbs. 220m² across two floors, large private garden, double garage. Excellent school catchment area. Owner has relocated abroad and is motivated to sell.",
      listing_type: "sale", property_type: "house", city: "Kifisia", address: "18 Kifisias Ave, Kifisia",
      price: 650000, sqm: 220, bedrooms: 4, bathrooms: 3, floor: 0, total_floors: 2, year_built: 2001,
      energy_class: "C", heating_system: "autonomous_gas", has_parking: true, has_elevator: false,
      has_balcony: true, has_view: false, has_garden: true, has_ac: true, has_furnished: false,
      is_featured: false, cover_image_url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
      price_per_sqm: 2954, status: "active", latitude: 38.0740, longitude: 23.8110,
      views_count: 287, priority_placement: 0, suitable_investment: false,
    },
    {
      title: "Sea-View Apartment in Voula — Reduced Price",
      description: "Top-floor 3-bedroom apartment with panoramic Saronic Gulf views. 130m², renovated 2019, private parking, storage room. The building has a communal roof terrace. Price reduced from €490k — owner needs fast deal.",
      listing_type: "sale", property_type: "apartment", city: "Voula", address: "55 Apollonos St, Voula",
      price: 460000, sqm: 130, bedrooms: 3, bathrooms: 2, floor: 5, total_floors: 5, year_built: 1990,
      energy_class: "B", heating_system: "autonomous_gas", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: true, has_ac: true, has_furnished: false,
      is_featured: true, cover_image_url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
      price_per_sqm: 3538, status: "active", latitude: 37.8370, longitude: 23.7830,
      views_count: 403, priority_placement: 0, suitable_investment: false,
    },
  ].map((l) => ({ ...l, owner_id: pickSeller(0) }));

  const { error: privSaleErr } = await supabase.from("listings").insert(privateSaleListings);
  if (privSaleErr) console.error("Private sale insert error:", privSaleErr.message);
  else console.log(`  ✅  ${privateSaleListings.length} private-owner sale listings`);

  // ── For Sale — Agent (5 listings) ─────────────────────────────────────────
  console.log("🏢  Seeding For Sale (agent) listings...");
  const agentSaleListings = [
    {
      title: "Luxury 3BR Penthouse — Chalandri",
      description: "Exclusive top-floor penthouse listed by Nikos Papadopoulos. 160m² plus 40m² wraparound terrace with views of Athens basin. Custom German kitchen, underfloor heating, smart home system. Underground parking & storage. Available immediately.",
      listing_type: "sale", property_type: "apartment", city: "Chalandri", address: "9 Ethnikis Antistaseos, Chalandri",
      price: 720000, sqm: 160, bedrooms: 3, bathrooms: 2, floor: 8, total_floors: 8, year_built: 2018,
      energy_class: "A+", heating_system: "underfloor", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: true, has_ac: true, has_furnished: false,
      is_featured: true, cover_image_url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
      price_per_sqm: 4500, status: "active", latitude: 38.0120, longitude: 23.8010,
      views_count: 672, priority_placement: 1, suitable_investment: true,
    },
    {
      title: "2BR Apartment — Nea Smyrni, Near Metro",
      description: "Well-presented 2-bedroom apartment 300m from Nea Smyrni metro station. 85m², 2nd floor, renovated bathroom, new boiler, fitted wardrobes. Ideal for first-time buyers or investors seeking rental income. Presented by Elena Stavrou.",
      listing_type: "sale", property_type: "apartment", city: "Nea Smyrni", address: "31 El. Venizelou St, Nea Smyrni",
      price: 215000, sqm: 85, bedrooms: 2, bathrooms: 1, floor: 2, total_floors: 7, year_built: 1995,
      energy_class: "C", heating_system: "autonomous_gas", has_parking: false, has_elevator: true,
      has_balcony: true, has_view: false, has_ac: true, has_furnished: false,
      is_featured: false, cover_image_url: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80",
      price_per_sqm: 2529, status: "active", latitude: 37.9450, longitude: 23.7150,
      views_count: 318, priority_placement: 0, suitable_investment: true,
    },
    {
      title: "Renovated House — Psychiko",
      description: "Single-family home in the prestigious Psychiko enclave. 240m² across three levels, private garden 450m², marble-clad reception, 4 bedrooms en-suite. Fully renovated 2022. Agent: Kostas Alexiou — viewings by appointment.",
      listing_type: "sale", property_type: "house", city: "Psychiko", address: "4 Alexandras Ave, Psychiko, Athens",
      price: 1150000, sqm: 240, bedrooms: 4, bathrooms: 4, floor: 0, total_floors: 3, year_built: 1975,
      energy_class: "B", heating_system: "autonomous_gas", has_parking: true, has_elevator: false,
      has_balcony: true, has_view: false, has_garden: true, has_ac: true, has_furnished: false,
      is_featured: true, cover_image_url: "https://images.unsplash.com/photo-1605146769289-440113cc3d00?w=800&q=80",
      price_per_sqm: 4792, status: "active", latitude: 37.9990, longitude: 23.7720,
      views_count: 489, priority_placement: 1, suitable_investment: false,
    },
    {
      title: "Seafront Apartment in Faliro — Panoramic Views",
      description: "3-bedroom apartment on the Faliro seafront promenade, 6th floor, 140m². Floor-to-ceiling windows with unobstructed sea views. Building has concierge, gym, and rooftop pool. Listed by Nikos Papadopoulos. Rare find.",
      listing_type: "sale", property_type: "apartment", city: "Faliro", address: "120 Poseidonos Ave, Faliro",
      price: 580000, sqm: 140, bedrooms: 3, bathrooms: 2, floor: 6, total_floors: 10, year_built: 2005,
      energy_class: "A", heating_system: "heat_pump", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: true, has_pool: false, has_ac: true, has_furnished: true,
      is_featured: false, cover_image_url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
      price_per_sqm: 4143, status: "active", latitude: 37.9320, longitude: 23.6860,
      views_count: 561, priority_placement: 0, suitable_investment: true,
    },
    {
      title: "Investment Apartment — Marousi, 7.2% Yield",
      description: "Fully let 2-bedroom apartment in the Marousi business district, 90m². Current tenant paying €750/month (lease until Dec 2026). Ideal buy-to-let with immediate income. Close to OAKA and Metro Line 1. Presented by Elena Stavrou.",
      listing_type: "sale", property_type: "apartment", city: "Marousi", address: "77 Kifisias Ave, Marousi",
      price: 250000, sqm: 90, bedrooms: 2, bathrooms: 1, floor: 3, total_floors: 7, year_built: 2000,
      energy_class: "C", heating_system: "autonomous_gas", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: false, has_ac: true, has_furnished: true,
      is_featured: false, cover_image_url: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800&q=80",
      price_per_sqm: 2778, status: "active", latitude: 38.0500, longitude: 23.8060,
      views_count: 445, priority_placement: 0, suitable_investment: true,
    },
  ].map((l, i) => ({ ...l, owner_id: pickAgent(i) }));

  const { error: agentSaleErr } = await supabase.from("listings").insert(agentSaleListings);
  if (agentSaleErr) console.error("Agent sale insert error:", agentSaleErr.message);
  else console.log(`  ✅  ${agentSaleListings.length} agent sale listings`);

  // ── For Rent (5 listings) ─────────────────────────────────────────────────
  console.log("🏢  Seeding For Rent listings...");
  const rentListings = [
    {
      title: "Modern Studio for Rent — Exarcheia",
      description: "Stylish 35m² studio on the 3rd floor of a recently renovated building in Exarcheia. Fully furnished, fitted kitchen, fast Wi-Fi included, air conditioning. Walk to NTUA and Omonia Metro. Available from 1 April.",
      listing_type: "rent", property_type: "apartment", city: "Athens", address: "28 Stournari St, Exarcheia, Athens",
      price: 550, sqm: 35, bedrooms: 0, bathrooms: 1, floor: 3, total_floors: 5, year_built: 1968,
      energy_class: "D", heating_system: "electric", has_parking: false, has_elevator: false,
      has_balcony: false, has_furnished: true, has_ac: true, pets_allowed: false,
      short_term_rental: false, min_rental_months: 12, deposit_months: 2,
      is_featured: false, cover_image_url: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80",
      price_per_sqm: 16, status: "active", latitude: 37.9850, longitude: 23.7290,
      views_count: 189, priority_placement: 0,
    },
    {
      title: "2BR Apartment for Rent — Glyfada",
      description: "Bright 2-bedroom apartment 400m from the beach in Glyfada. 80m², 1st floor, furnished to high standard, private parking, large balcony. Available immediately. Ideal for family or couple. Long-term preferred.",
      listing_type: "rent", property_type: "apartment", city: "Glyfada", address: "40 Metaxa St, Glyfada",
      price: 1200, sqm: 80, bedrooms: 2, bathrooms: 1, floor: 1, total_floors: 4, year_built: 2003,
      energy_class: "B", heating_system: "autonomous_gas", has_parking: true, has_elevator: true,
      has_balcony: true, has_furnished: true, has_ac: true, pets_allowed: true,
      short_term_rental: false, min_rental_months: 6, deposit_months: 2,
      is_featured: true, cover_image_url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
      price_per_sqm: 15, status: "active", latitude: 37.8660, longitude: 23.7520,
      views_count: 276, priority_placement: 0,
    },
    {
      title: "3BR Villa for Rent — Vouliagmeni",
      description: "Stunning detached villa for seasonal or long-term rent in Vouliagmeni. 200m², private pool, mature garden, 2 covered parking spaces. 5 minutes from Lake Vouliagmeni. Monthly €3,500, available May–October also as short-term.",
      listing_type: "rent", property_type: "villa", city: "Vouliagmeni", address: "11 Litous St, Vouliagmeni",
      price: 3500, sqm: 200, bedrooms: 3, bathrooms: 3, floor: 0, total_floors: 2, year_built: 2008,
      energy_class: "A", heating_system: "heat_pump", has_parking: true, has_elevator: false,
      has_balcony: true, has_view: true, has_pool: true, has_garden: true, has_furnished: true, has_ac: true,
      pets_allowed: false, short_term_rental: true, min_rental_months: 1, deposit_months: 3,
      is_featured: true, cover_image_url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
      price_per_sqm: 18, status: "active", latitude: 37.8080, longitude: 23.7850,
      views_count: 412, priority_placement: 1,
    },
    {
      title: "Office / Studio Apartment — Syntagma",
      description: "Versatile 50m² space on the ground floor near Syntagma Square. Currently used as a professional office but permitted as residential. Separate entrance, kitchenette, bathroom, fibre internet. Ideal for consultant, architect, or remote worker.",
      listing_type: "rent", property_type: "office", city: "Athens", address: "3 Mitropoleos St, Syntagma, Athens",
      price: 900, sqm: 50, bedrooms: 1, bathrooms: 1, floor: 0, total_floors: 6, year_built: 1980,
      energy_class: "E", heating_system: "central_oil", has_parking: false, has_elevator: true,
      has_balcony: false, has_furnished: false, has_ac: true,
      is_featured: false, cover_image_url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
      price_per_sqm: 18, status: "active", latitude: 37.9754, longitude: 23.7350,
      views_count: 153, priority_placement: 0,
    },
    {
      title: "1BR Apartment for Rent — Thessaloniki Centre",
      description: "Well-kept 1-bedroom apartment in central Thessaloniki, steps from the waterfront. 55m², 2nd floor, fitted kitchen, air conditioning throughout. Bills not included. Close to Aristotle University and the Ladadika nightlife district.",
      listing_type: "rent", property_type: "apartment", city: "Thessaloniki", address: "67 Proxenou Koromila, Thessaloniki",
      price: 650, sqm: 55, bedrooms: 1, bathrooms: 1, floor: 2, total_floors: 5, year_built: 1992,
      energy_class: "C", heating_system: "autonomous_gas", has_parking: false, has_elevator: false,
      has_balcony: true, has_furnished: false, has_ac: true, pets_allowed: false,
      short_term_rental: false, min_rental_months: 12, deposit_months: 2,
      is_featured: false, cover_image_url: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80",
      price_per_sqm: 12, status: "active", latitude: 40.6331, longitude: 22.9460,
      views_count: 201, priority_placement: 0,
    },
  ].map((l, i) => ({ ...l, owner_id: pickOwner(i) }));

  const { error: rentErr } = await supabase.from("listings").insert(rentListings);
  if (rentErr) console.error("Rent insert error:", rentErr.message);
  else console.log(`  ✅  ${rentListings.length} rent listings`);

  // ── New Builds (5 listings) ───────────────────────────────────────────────
  console.log("🏗️   Seeding New Build listings...");
  const newBuildListings = [
    {
      title: "Skyline Residences — Pre-Sale Phase I | Marousi",
      description: "Brand-new 68-unit luxury residential tower in Marousi's golden mile. Phase I pre-sale now open. Apartments from 1BR studios to 4BR penthouses. Completion Q3 2027. DEKA certified energy class A+. Rooftop pool, concierge, underground parking.",
      listing_type: "new_build", property_type: "apartment", city: "Marousi", address: "120 Kifisias Ave, Marousi (Plot A)",
      price: 380000, sqm: 90, bedrooms: 2, bathrooms: 2, floor: 5, total_floors: 15, year_built: 2027,
      energy_class: "A+", heating_system: "heat_pump", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: true, has_pool: true, has_ac: true,
      is_featured: true, is_pre_sale: false, construction_status: "under_construction",
      cover_image_url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
      price_per_sqm: 4222, status: "active", latitude: 38.0500, longitude: 23.8100,
      views_count: 891, priority_placement: 2, suitable_investment: true,
    },
    {
      title: "Ellinikon Park Villas — Phase II Pre-Sale",
      description: "Unique opportunity to own a villa within the Ellinikon mega-project. 24 semi-detached villas, 180–260m², private gardens, direct park access. LEED Platinum. Delivery 2028. Only 6 plots remaining in Phase II pre-sale.",
      listing_type: "new_build", property_type: "villa", city: "Ellinikon", address: "Ellinikon Metropolitan Park, Ellinikon",
      price: 1200000, sqm: 200, bedrooms: 4, bathrooms: 3, floor: 0, total_floors: 2, year_built: 2028,
      energy_class: "A+", heating_system: "underfloor", has_parking: true, has_elevator: false,
      has_balcony: true, has_view: true, has_pool: true, has_garden: true, has_ac: true,
      is_featured: true, is_pre_sale: false, construction_status: "pre_construction",
      cover_image_url: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800&q=80",
      price_per_sqm: 6000, status: "active", latitude: 37.8900, longitude: 23.7300,
      views_count: 1204, priority_placement: 2, suitable_investment: true,
    },
    {
      title: "Thessaloniki Waterfront Towers — 1BR from €145k",
      description: "New residential development on Thessaloniki's revitalised waterfront. 3 towers, 200 units. 1BR to 3BR. Energy class A+, underfloor heating, triple-glazed windows. Completion Q1 2027. Pre-sale pricing now — phase 2 price increase expected.",
      listing_type: "new_build", property_type: "apartment", city: "Thessaloniki", address: "88 Nikis Ave, Thessaloniki Waterfront",
      price: 145000, sqm: 50, bedrooms: 1, bathrooms: 1, floor: 3, total_floors: 12, year_built: 2027,
      energy_class: "A+", heating_system: "underfloor", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: true, has_ac: true,
      is_featured: false, is_pre_sale: false, construction_status: "under_construction",
      cover_image_url: "https://images.unsplash.com/photo-1605146769289-440113cc3d00?w=800&q=80",
      price_per_sqm: 2900, status: "active", latitude: 40.6280, longitude: 22.9440,
      views_count: 543, priority_placement: 1, suitable_investment: true,
    },
    {
      title: "Vouliagmeni Sea Residences — Penthouse Pre-Sale",
      description: "Exclusive boutique development of 12 luxury apartments in Vouliagmeni. The penthouse (200m²) is now available for pre-sale. Private infinity pool, panoramic Saronic views, smart home, private lift. Only 3 units remain. Completion 2026.",
      listing_type: "new_build", property_type: "apartment", city: "Vouliagmeni", address: "Kavouri Bay, Vouliagmeni",
      price: 2200000, sqm: 200, bedrooms: 4, bathrooms: 4, floor: 6, total_floors: 6, year_built: 2026,
      energy_class: "A+", heating_system: "underfloor", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: true, has_pool: true, has_ac: true,
      is_featured: true, is_pre_sale: false, construction_status: "finishing",
      cover_image_url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
      price_per_sqm: 11000, status: "active", latitude: 37.8100, longitude: 23.7800,
      views_count: 978, priority_placement: 2, suitable_investment: false,
    },
    {
      title: "Green Quarter Residences — Chalandri",
      description: "Sustainable new development of 40 apartments. All units achieve BREEAM Excellent. 2BR, 3BR options with private terraces. EV charging in every parking bay. Rooftop urban garden. Pre-sale price lock — build commencement June 2025.",
      listing_type: "new_build", property_type: "apartment", city: "Chalandri", address: "Konstantinoupoleos & Frinis, Chalandri",
      price: 320000, sqm: 95, bedrooms: 2, bathrooms: 2, floor: 2, total_floors: 8, year_built: 2027,
      energy_class: "A+", heating_system: "heat_pump", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: false, has_ac: true,
      is_featured: false, is_pre_sale: false, construction_status: "pre_construction",
      cover_image_url: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80",
      price_per_sqm: 3368, status: "active", latitude: 38.0130, longitude: 23.8020,
      views_count: 367, priority_placement: 0, suitable_investment: true,
    },
  ].map((l, i) => ({ ...l, owner_id: pickAgent(i) }));

  const { error: nbErr } = await supabase.from("listings").insert(newBuildListings);
  if (nbErr) console.error("New Build insert error:", nbErr.message);
  else console.log(`  ✅  ${newBuildListings.length} new build listings`);

  // ── Open Houses (5 listings) ──────────────────────────────────────────────
  console.log("📅  Seeding Open House listings...");

  function daysFromNow(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString();
  }

  const openHouseListings = [
    {
      title: "Open House: 3BR Penthouse in Kolonaki — This Saturday",
      description: "Join us for an exclusive open house for this stunning Kolonaki penthouse. 150m² with 50m² private terrace and Acropolis views. Fully renovated, custom Italian kitchen. Hosted by Nikos Papadopoulos. Refreshments served. RSVP via listing.",
      listing_type: "open_house", property_type: "apartment", city: "Athens", address: "3 Patriarchou Ioakeim, Kolonaki, Athens",
      price: 890000, sqm: 150, bedrooms: 3, bathrooms: 2, floor: 7, total_floors: 7, year_built: 1988,
      energy_class: "A", heating_system: "autonomous_gas", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: true, has_ac: true, open_house_date: daysFromNow(5),
      is_featured: true, cover_image_url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
      price_per_sqm: 5933, status: "active", latitude: 37.9792, longitude: 23.7400,
      views_count: 623, priority_placement: 1,
    },
    {
      title: "Open House: 4BR Villa — Kifisia, Sunday 11am–4pm",
      description: "Private guided viewing of a prestigious 4-bedroom villa in Kifisia. 280m² with heated pool, wine cellar, and professional kitchen. This is your only scheduled public viewing — agent Elena Stavrou will be on site for all questions.",
      listing_type: "open_house", property_type: "villa", city: "Kifisia", address: "27 Diligianni St, Kifisia",
      price: 1450000, sqm: 280, bedrooms: 4, bathrooms: 4, floor: 0, total_floors: 2, year_built: 2012,
      energy_class: "A+", heating_system: "underfloor", has_parking: true, has_elevator: false,
      has_balcony: true, has_view: false, has_pool: true, has_garden: true, has_ac: true, open_house_date: daysFromNow(8),
      is_featured: true, cover_image_url: "https://images.unsplash.com/photo-1605146769289-440113cc3d00?w=800&q=80",
      price_per_sqm: 5179, status: "active", latitude: 38.0740, longitude: 23.8050,
      views_count: 744, priority_placement: 2,
    },
    {
      title: "Open House — 2BR in Glyfada, Coastal Living",
      description: "Weekend open house for a beautifully maintained 2-bedroom apartment 200m from the Glyfada waterfront. 95m², renovated 2023, large wrap balcony. Perfect for beach lifestyle buyers. Hosted by Kostas Alexiou. No appointment needed.",
      listing_type: "open_house", property_type: "apartment", city: "Glyfada", address: "14 Lazaraki St, Glyfada",
      price: 320000, sqm: 95, bedrooms: 2, bathrooms: 1, floor: 3, total_floors: 5, year_built: 1998,
      energy_class: "B", heating_system: "autonomous_gas", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: true, has_ac: true, open_house_date: daysFromNow(12),
      is_featured: false, cover_image_url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
      price_per_sqm: 3368, status: "active", latitude: 37.8660, longitude: 23.7500,
      views_count: 391, priority_placement: 0,
    },
    {
      title: "Open House: New-Build Show Flat — Marousi",
      description: "Experience the Skyline Residences show apartment. Walk through the fully furnished 2BR unit and meet the development team. Saturday 10am–3pm. Light refreshments. Bring ID for registration. Units selling fast — only 22 of 68 remain.",
      listing_type: "open_house", property_type: "apartment", city: "Marousi", address: "120 Kifisias Ave, Marousi (Show Suite)",
      price: 395000, sqm: 92, bedrooms: 2, bathrooms: 2, floor: 6, total_floors: 15, year_built: 2027,
      energy_class: "A+", heating_system: "heat_pump", has_parking: true, has_elevator: true,
      has_balcony: true, has_view: true, has_ac: true, is_pre_sale: false, open_house_date: daysFromNow(6),
      is_featured: true, cover_image_url: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800&q=80",
      price_per_sqm: 4293, status: "active", latitude: 38.0510, longitude: 23.8110,
      views_count: 834, priority_placement: 2,
    },
    {
      title: "Open House: Renovated Family Home — Nea Smyrni",
      description: "Open Saturday and Sunday for a fully renovated 3-bedroom family home in Nea Smyrni. 140m², private yard 90m², new roof 2024, solar panels. Great school catchment. Agent Nikos Papadopoulos will present offers on the day if buyer interest is strong.",
      listing_type: "open_house", property_type: "house", city: "Nea Smyrni", address: "8 Platonos St, Nea Smyrni",
      price: 380000, sqm: 140, bedrooms: 3, bathrooms: 2, floor: 0, total_floors: 2, year_built: 1985,
      energy_class: "B", heating_system: "autonomous_gas", has_parking: true, has_elevator: false,
      has_balcony: true, has_view: false, has_garden: true, has_ac: true, open_house_date: daysFromNow(14),
      is_featured: false, cover_image_url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
      price_per_sqm: 2714, status: "active", latitude: 37.9460, longitude: 23.7170,
      views_count: 268, priority_placement: 0,
    },
  ].map((l, i) => ({ is_pre_sale: false, ...l, owner_id: pickAgent(i) }));

  const { error: ohErr } = await supabase.from("listings").insert(openHouseListings);
  if (ohErr) console.error("Open House insert error:", ohErr.message);
  else console.log(`  ✅  ${openHouseListings.length} open house listings`);

  // ── Firesale Requests (pipeline entries for investors — NOT listings) ──────
  const allOwners = [...agents.map((a) => a.id), ...sellers];
  if (allOwners.length > 0) {
    console.log("📋  Seeding Quick Sale pipeline requests...");
    const requests = Array.from({ length: 5 }, (_, i) => makeFiresaleRequest(allOwners[i % allOwners.length], i));
    const { error: reqErr } = await supabase.from("firesale_requests").insert(requests);
    if (reqErr) console.error("Firesale requests error:", reqErr.message);
    else console.log(`  ✅  ${requests.length} firesale pipeline requests`);
  }

  const total = privateSaleListings.length + agentSaleListings.length + rentListings.length + newBuildListings.length + openHouseListings.length;
  console.log(`\n✅  Done. ${total} listings seeded (0 firesale — quick sale visible to investors via pipeline only).`);
}

main().catch(console.error);
