/**
 * Seed mock Open House listings with full settings (timeslots, screening, offer deadlines).
 * Run: npx tsx scripts/seed-mock-open-houses.ts
 * Requires: SUPABASE_SERVICE_ROLE_KEY in env
 *
 * Creates 12 open house listings across Athens, Thessaloniki, and coastal areas,
 * each with open_house_settings (timeslots, offer deadline, proof-of-funds options).
 */

import { createClient } from "@supabase/supabase-js";
import { assertNotProduction } from "./_prod-guard";
import { getSeedEnv } from "./_seed-env";

const { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY } = getSeedEnv();

assertNotProduction(SUPABASE_URL, "seed-mock-open-houses.ts");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function _pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function futureDate(daysFromNow: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function futureDateStr(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ── Static data ────────────────────────────────────────────────────────────────

const COVER_IMAGES = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
  "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80",
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80",
  "https://images.unsplash.com/photo-1605146769289-440113cc3d00?w=800&q=80",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
  "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800&q=80",
  "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80",
  "https://images.unsplash.com/photo-1449844908441-8829872d2607?w=800&q=80",
];

// Timeslot structure matching OHTimeslot interface
function makeTimeslots(dayOffset: number, slotCount: number) {
  const date = futureDateStr(dayOffset);
  const slots = [];
  const startHour = 10;
  for (let i = 0; i < slotCount; i++) {
    const hour = startHour + i * 1;
    slots.push({
      id: crypto.randomUUID(),
      date,
      start: `${String(hour).padStart(2, "0")}:00`,
      end: `${String(hour + 1).padStart(2, "0")}:00`,
      max_visitors: rand(3, 8),
    });
  }
  return slots;
}

// ── Open house definitions ─────────────────────────────────────────────────────

const OPEN_HOUSES = [
  {
    title: "Penthouse Open House — Kolonaki, Athens",
    description:
      "Exclusive open house event for this rare penthouse in Kolonaki. Floor-to-ceiling windows, 260° Acropolis views, private rooftop terrace, and designer interiors throughout. Viewings by appointment only — limited slots available. Refreshments and property portfolio provided on arrival.",
    city: "Athens",
    address: "18 Patriarchou Ioakeim St, Kolonaki",
    price: 1_450_000,
    sqm: 210,
    bedrooms: 3,
    bathrooms: 2,
    floor: 8,
    total_floors: 8,
    year_built: 2019,
    energy_class: "A+",
    property_type: "apartment",
    has_parking: true,
    has_elevator: true,
    has_balcony: true,
    has_view: true,
    has_ac: true,
    has_furnished: true,
    latitude: 37.9754,
    longitude: 23.7432,
    open_house_date: futureDate(5, 11, 0),
    days_ahead: 5,
    slots: 4,
    require_pof: true,
    min_proof_amount: 300_000,
    require_investor: false,
    allow_sealed_bids: true,
    offer_deadline_offset: 9,
    max_visitors: 20,
    max_per_slot: 5,
  },
  {
    title: "Seaside Villa Open House — Vouliagmeni",
    description:
      "Step inside this breathtaking beachfront villa in Vouliagmeni. Direct sea access, private pool, landscaped garden, and smart home system. Only 5 viewing groups will be admitted. Full property disclosure documents available on request for qualified buyers.",
    city: "Athens",
    address: "3 Apollonos St, Vouliagmeni",
    price: 2_800_000,
    sqm: 420,
    bedrooms: 5,
    bathrooms: 4,
    floor: 0,
    total_floors: 2,
    year_built: 2015,
    energy_class: "A",
    property_type: "villa",
    has_parking: true,
    has_elevator: false,
    has_balcony: true,
    has_view: true,
    has_pool: true,
    has_garden: true,
    has_ac: true,
    has_furnished: true,
    latitude: 37.8107,
    longitude: 23.7816,
    open_house_date: futureDate(7, 10, 0),
    days_ahead: 7,
    slots: 5,
    require_pof: true,
    min_proof_amount: 600_000,
    require_investor: true,
    allow_sealed_bids: true,
    offer_deadline_offset: 12,
    max_visitors: 15,
    max_per_slot: 3,
  },
  {
    title: "Modern Apartment Open House — Glyfada",
    description:
      "Come and experience this newly renovated 3-bedroom apartment in the heart of Glyfada. Walking distance to the beach, shopping, and metro. Modern kitchen, large balcony with sea glimpses, underground parking. No prior appointment needed — walk-ins welcome during the open house hours.",
    city: "Athens",
    address: "54 Lazaraki St, Glyfada",
    price: 480_000,
    sqm: 130,
    bedrooms: 3,
    bathrooms: 2,
    floor: 3,
    total_floors: 6,
    year_built: 2021,
    energy_class: "A+",
    property_type: "apartment",
    has_parking: true,
    has_elevator: true,
    has_balcony: true,
    has_view: false,
    has_ac: true,
    latitude: 37.8668,
    longitude: 23.7539,
    open_house_date: futureDate(4, 11, 0),
    days_ahead: 4,
    slots: 6,
    require_pof: false,
    min_proof_amount: null,
    require_investor: false,
    allow_sealed_bids: false,
    offer_deadline_offset: 7,
    max_visitors: 40,
    max_per_slot: 8,
  },
  {
    title: "Investment Opportunity — Open House, Piraeus",
    description:
      "Rare multi-unit residential building in central Piraeus with 4 independent apartments, all currently tenanted. Ideal for investors seeking immediate rental income. Access to all units during open house. Financials and tenancy agreements available on-site.",
    city: "Athens",
    address: "22 Akti Miaouli, Piraeus",
    price: 950_000,
    sqm: 320,
    bedrooms: 8,
    bathrooms: 4,
    floor: 0,
    total_floors: 4,
    year_built: 1998,
    energy_class: "C",
    property_type: "house",
    has_parking: false,
    has_elevator: false,
    has_balcony: true,
    has_view: true,
    has_ac: true,
    latitude: 37.9477,
    longitude: 23.6434,
    open_house_date: futureDate(6, 14, 0),
    days_ahead: 6,
    slots: 4,
    require_pof: true,
    min_proof_amount: 200_000,
    require_investor: true,
    allow_sealed_bids: true,
    offer_deadline_offset: 10,
    max_visitors: 20,
    max_per_slot: 5,
  },
  {
    title: "Family Home Open House — Kifisia",
    description:
      "Spacious family home set in a quiet tree-lined street in Kifisia. Generous garden, large play area, 4 bedrooms, double garage. Walking distance to top private schools and public transport. Ideal for families looking to upsize. Seller motivated — serious offers considered.",
    city: "Athens",
    address: "9 Kefalariou St, Kifisia",
    price: 720_000,
    sqm: 240,
    bedrooms: 4,
    bathrooms: 3,
    floor: 0,
    total_floors: 2,
    year_built: 2005,
    energy_class: "B",
    property_type: "house",
    has_parking: true,
    has_elevator: false,
    has_balcony: true,
    has_view: false,
    has_garden: true,
    has_pool: false,
    has_ac: true,
    latitude: 38.0727,
    longitude: 23.8145,
    open_house_date: futureDate(8, 10, 30),
    days_ahead: 8,
    slots: 5,
    require_pof: false,
    min_proof_amount: null,
    require_investor: false,
    allow_sealed_bids: false,
    offer_deadline_offset: 14,
    max_visitors: 30,
    max_per_slot: 6,
  },
  {
    title: "New Development Preview — Marousi",
    description:
      "Be the first to tour this newly completed building in Marousi before it hits the open market. Two remaining units available: a 2BR and a 3BR. Pre-sale pricing applies for bookings made during the open house. Developer is present. Full legal pack available.",
    city: "Athens",
    address: "37 Amarousiou-Halandriou, Marousi",
    price: 340_000,
    sqm: 95,
    bedrooms: 2,
    bathrooms: 2,
    floor: 4,
    total_floors: 7,
    year_built: 2024,
    energy_class: "A+",
    property_type: "apartment",
    has_parking: true,
    has_elevator: true,
    has_balcony: true,
    has_view: false,
    has_ac: true,
    has_furnished: false,
    is_pre_sale: false,
    latitude: 38.0567,
    longitude: 23.8065,
    open_house_date: futureDate(3, 12, 0),
    days_ahead: 3,
    slots: 6,
    require_pof: false,
    min_proof_amount: null,
    require_investor: false,
    allow_sealed_bids: false,
    offer_deadline_offset: 6,
    max_visitors: 50,
    max_per_slot: 10,
  },
  {
    title: "Luxury Loft Open House — Psiri, Athens",
    description:
      "Industrial-chic loft conversion in the vibrant Psiri neighbourhood. Double-height ceilings, exposed brick, polished concrete floors, and a custom mezzanine bedroom. Perfect for creatives and city professionals. Hosted open house with architect available to answer questions.",
    city: "Athens",
    address: "14 Karaiskaki Square, Psiri",
    price: 390_000,
    sqm: 110,
    bedrooms: 1,
    bathrooms: 2,
    floor: 2,
    total_floors: 5,
    year_built: 2018,
    energy_class: "A",
    property_type: "apartment",
    has_parking: false,
    has_elevator: true,
    has_balcony: false,
    has_view: false,
    has_ac: true,
    has_furnished: true,
    latitude: 37.9773,
    longitude: 23.7205,
    open_house_date: futureDate(10, 15, 0),
    days_ahead: 10,
    slots: 5,
    require_pof: false,
    min_proof_amount: null,
    require_investor: false,
    allow_sealed_bids: false,
    offer_deadline_offset: 14,
    max_visitors: 25,
    max_per_slot: 5,
  },
  {
    title: "Waterfront Apartment — Thessaloniki",
    description:
      "Stunning waterfront apartment on Thessaloniki's seafront promenade. Panoramic Thermaikos Gulf views from every room. 2 bedrooms, open-plan living, private parking. Very limited viewing slots — pre-registration required. Broker presence mandatory.",
    city: "Thessaloniki",
    address: "82 Leoforos Nikis, Thessaloniki",
    price: 620_000,
    sqm: 145,
    bedrooms: 2,
    bathrooms: 2,
    floor: 5,
    total_floors: 9,
    year_built: 2016,
    energy_class: "A",
    property_type: "apartment",
    has_parking: true,
    has_elevator: true,
    has_balcony: true,
    has_view: true,
    has_ac: true,
    latitude: 40.6287,
    longitude: 22.9441,
    open_house_date: futureDate(9, 11, 0),
    days_ahead: 9,
    slots: 4,
    require_pof: true,
    min_proof_amount: 150_000,
    require_investor: false,
    allow_sealed_bids: true,
    offer_deadline_offset: 13,
    max_visitors: 16,
    max_per_slot: 4,
    broker_required: true,
  },
  {
    title: "Villa with Pool — Open House, Chania",
    description:
      "Sun-drenched Cretan villa set on a 1,200m² plot in the hills above Chania old town. Private pool, olive grove, stone-built exterior with modern interiors. Ideal as a holiday home or short-term rental. Agent will walk you through estimated rental yields and legal status.",
    city: "Chania",
    address: "Korakies Village, Chania, Crete",
    price: 530_000,
    sqm: 185,
    bedrooms: 4,
    bathrooms: 3,
    floor: 0,
    total_floors: 2,
    year_built: 2008,
    energy_class: "B",
    property_type: "villa",
    has_parking: true,
    has_elevator: false,
    has_balcony: true,
    has_view: true,
    has_pool: true,
    has_garden: true,
    has_ac: true,
    latitude: 35.5138,
    longitude: 24.0180,
    open_house_date: futureDate(14, 10, 0),
    days_ahead: 14,
    slots: 4,
    require_pof: false,
    min_proof_amount: null,
    require_investor: false,
    allow_sealed_bids: false,
    offer_deadline_offset: 18,
    max_visitors: 20,
    max_per_slot: 5,
  },
  {
    title: "Commercial Space Open House — Syntagma",
    description:
      "Prime commercial floor in the heart of Athens, steps from Syntagma Square. 200m² open-plan office or retail space, full renovation, fibre connectivity, 2 WCs. Excellent for flagship stores, co-working, or professional offices. Viewing is strictly by appointment during listed hours.",
    city: "Athens",
    address: "5 Stadiou St, Syntagma",
    price: 1_100_000,
    sqm: 200,
    bedrooms: 0,
    bathrooms: 2,
    floor: 1,
    total_floors: 6,
    year_built: 2020,
    energy_class: "A",
    property_type: "commercial",
    has_parking: false,
    has_elevator: true,
    has_balcony: false,
    has_view: false,
    has_ac: true,
    latitude: 37.9756,
    longitude: 23.7341,
    open_house_date: futureDate(5, 14, 0),
    days_ahead: 5,
    slots: 4,
    require_pof: true,
    min_proof_amount: 250_000,
    require_investor: false,
    allow_sealed_bids: true,
    offer_deadline_offset: 9,
    max_visitors: 16,
    max_per_slot: 4,
  },
  {
    title: "Renovated Townhouse — Open House, Nea Smyrni",
    description:
      "Beautifully renovated 3-floor townhouse in the family-friendly neighbourhood of Nea Smyrni. Private garden, 3 bedrooms, home office, and a separate self-contained studio on the ground floor. Easy access to the metro and the central square. Open to all — no pre-registration required.",
    city: "Athens",
    address: "29 Eleftheriou Venizelou, Nea Smyrni",
    price: 560_000,
    sqm: 195,
    bedrooms: 3,
    bathrooms: 3,
    floor: 0,
    total_floors: 3,
    year_built: 2003,
    energy_class: "B",
    property_type: "house",
    has_parking: true,
    has_elevator: false,
    has_balcony: true,
    has_view: false,
    has_garden: true,
    has_ac: true,
    latitude: 37.9443,
    longitude: 23.7143,
    open_house_date: futureDate(6, 10, 0),
    days_ahead: 6,
    slots: 6,
    require_pof: false,
    min_proof_amount: null,
    require_investor: false,
    allow_sealed_bids: false,
    offer_deadline_offset: 10,
    max_visitors: 40,
    max_per_slot: 8,
  },
  {
    title: "Golden Visa Eligible — Open House, Athens City Centre",
    description:
      "Golden Visa qualifying property (€250k+ threshold) in central Athens. Fully tenanted at €1,800/month — purchase with immediate rental income. Open house for qualified international buyers only. Legal advisor and tax consultant will be present. Simultaneous translation available.",
    city: "Athens",
    address: "11 Voulis St, Athens Centre",
    price: 290_000,
    sqm: 85,
    bedrooms: 2,
    bathrooms: 1,
    floor: 3,
    total_floors: 5,
    year_built: 2012,
    energy_class: "B",
    property_type: "apartment",
    has_parking: false,
    has_elevator: true,
    has_balcony: true,
    has_view: false,
    has_ac: true,
    has_furnished: true,
    latitude: 37.9744,
    longitude: 23.7319,
    open_house_date: futureDate(11, 16, 0),
    days_ahead: 11,
    slots: 3,
    require_pof: true,
    min_proof_amount: 290_000,
    require_investor: true,
    allow_sealed_bids: false,
    offer_deadline_offset: 15,
    max_visitors: 12,
    max_per_slot: 4,
    broker_required: true,
  },
] as const;

// ── Lookup owner IDs ───────────────────────────────────────────────────────────

async function getOwnerIds(): Promise<string[]> {
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const agentEmails = ["agent1@maiprop.demo", "agent2@maiprop.demo", "agent3@maiprop.demo"];
  const byEmail = new Map(authUsers?.users?.map((u) => [u.email, u.id]) ?? []);
  return agentEmails.map((e) => byEmail.get(e)).filter(Boolean) as string[];
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍  Looking up agent accounts...");
  const agents = await getOwnerIds();
  if (agents.length === 0) {
    console.warn("⚠️  No agent accounts found. Open house listings will have owner_id = null.");
    console.warn("    Run `npm run seed:users` first to create demo accounts.");
  }

  const pickOwner = (i: number): string | null => agents.length ? agents[i % agents.length] : null;

  console.log(`\n📅  Seeding ${OPEN_HOUSES.length} open house listings...`);

  for (let i = 0; i < OPEN_HOUSES.length; i++) {
    const oh = OPEN_HOUSES[i];

    // 1. Insert listing
    const { data: listing, error: listingErr } = await supabase
      .from("listings")
      .insert({
        title: oh.title,
        description: oh.description,
        listing_type: "open_house",
        property_type: oh.property_type,
        city: oh.city,
        address: oh.address,
        price: oh.price,
        sqm: oh.sqm,
        bedrooms: oh.bedrooms,
        bathrooms: oh.bathrooms,
        floor: oh.floor,
        total_floors: oh.total_floors,
        year_built: oh.year_built,
        energy_class: oh.energy_class,
        has_parking: (oh as any).has_parking ?? false,
        has_elevator: (oh as any).has_elevator ?? false,
        has_balcony: (oh as any).has_balcony ?? false,
        has_view: (oh as any).has_view ?? false,
        has_pool: (oh as any).has_pool ?? false,
        has_garden: (oh as any).has_garden ?? false,
        has_ac: (oh as any).has_ac ?? false,
        has_furnished: (oh as any).has_furnished ?? false,
        is_pre_sale: (oh as any).is_pre_sale ?? false,
        is_featured: i % 3 === 0,
        open_house_date: oh.open_house_date,
        cover_image_url: COVER_IMAGES[i % COVER_IMAGES.length],
        price_per_sqm: Math.round(oh.price / oh.sqm),
        status: "active",
        owner_id: pickOwner(i),
        latitude: oh.latitude,
        longitude: oh.longitude,
        views_count: rand(30, 600),
        priority_placement: i < 4 ? 1 : 0,
        suitable_investment: oh.require_pof || oh.require_investor,
      })
      .select("id")
      .single();

    if (listingErr || !listing) {
      console.error(`  ❌  Listing ${i + 1} failed: ${listingErr?.message}`);
      continue;
    }

    // 2. Insert open_house_settings
    const timeslots = makeTimeslots(oh.days_ahead, oh.slots);
    const { error: settingsErr } = await supabase
      .from("open_house_settings")
      .insert({
        listing_id: listing.id,
        timeslots,
        offer_deadline: futureDate(oh.offer_deadline_offset, 23, 59),
        require_proof_of_funds: oh.require_pof,
        min_proof_amount: oh.min_proof_amount ?? null,
        require_investor_declaration: oh.require_investor,
        allow_sealed_bids: oh.allow_sealed_bids,
        max_total_visitors: oh.max_visitors,
        max_visitors_per_slot: oh.max_per_slot,
        broker_required: (oh as any).broker_required ?? false,
      });

    if (settingsErr) {
      console.warn(`  ⚠️  Settings for listing ${i + 1} failed: ${settingsErr.message}`);
    }

    console.log(`  ✅  [${i + 1}/${OPEN_HOUSES.length}] "${oh.title.slice(0, 55)}..."`);
  }

  console.log(`\n✅  Done. ${OPEN_HOUSES.length} open house listings seeded with settings.`);
  console.log("    View them at: /open-houses");
}

main().catch(console.error);
