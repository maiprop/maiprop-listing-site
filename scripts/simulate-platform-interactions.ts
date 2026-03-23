/**
 * Full platform E2E interaction simulation.
 * Covers ALL modules: listings, messages, viewings, open house, quick sale (firesale),
 * auctions, saved searches, analytics views, professional consultations, notifications,
 * auction alerts, and investor deal flow.
 *
 * Run: npx tsx scripts/simulate-platform-interactions.ts
 * Requires: SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Assumes seed-mock-users.ts has already run (users exist).
 * If users are missing, seed them first: npm run seed:users
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "https://qvvicunqcrwpioqnvzxf.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("\n❌ Missing SUPABASE_SERVICE_ROLE_KEY.");
  console.error("   Add it to .env: SUPABASE_SERVICE_ROLE_KEY=your_service_role_key");
  console.error("   Find it at: Supabase Dashboard → Project Settings → API → service_role\n");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(role: string, action: string, detail?: string) {
  const icons: Record<string, string> = {
    buyer: "🏠", seller: "🏷️", investor: "💼", agent: "🤝",
    developer: "🏗️", professional: "📋", admin: "⚙️", system: "🔧",
  };
  const icon = icons[role] ?? "▶";
  console.log(`  ${icon} [${role.toUpperCase()}] ${action}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

function ok(label: string) {
  console.log(`    ✓ ${label}`);
}

function skip(label: string) {
  console.log(`    ⟳ ${label} (already exists, skipped)`);
}

function fail(label: string, err: string) {
  console.log(`    ✗ ${label}: ${err}`);
}

function sort2(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function startConv(uid_a: string, uid_b: string, listingId: string | null, msgs: Array<{ from: string; text: string }>) {
  const [pa, pb] = sort2(uid_a, uid_b);
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("participant_1", pa)
    .eq("participant_2", pb)
    .maybeSingle();
  let convId: string;
  if (existing?.id) {
    convId = existing.id;
  } else {
    const { data: ins, error } = await supabase
      .from("conversations")
      .insert({ participant_1: pa, participant_2: pb })
      .select("id")
      .single();
    if (error || !ins) {
      console.log(`    ✗ conversation insert error: ${error?.message ?? "no data"}`);
      return;
    }
    convId = ins.id;
  }
  for (const m of msgs) {
    const receiver_id = m.from === uid_a ? uid_b : uid_a;
    const { error: msgErr } = await supabase.from("messages").insert({ conversation_id: convId, sender_id: m.from, receiver_id, content: m.text, status: "sent" });
    if (msgErr) console.log(`    ✗ message insert error: ${msgErr.message}`);
  }
  return convId;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 maiProp Platform Interaction Simulator\n");
  console.log("   Simulates all roles interacting across every platform module.");

  // ── Step 0: Load user IDs ─────────────────────────────────────────────────
  section("0 · LOAD USER IDs");

  const emails = [
    "buyer1@maiprop.demo",    // 0
    "buyer2@maiprop.demo",    // 1
    "buyer3@maiprop.demo",    // 2
    "seller1@maiprop.demo",   // 3
    "seller2@maiprop.demo",   // 4
    "seller3@maiprop.demo",   // 5
    "investor1@maiprop.demo", // 6
    "investor2@maiprop.demo", // 7
    "investor3@maiprop.demo", // 8
    "agent1@maiprop.demo",    // 9
    "agent2@maiprop.demo",    // 10
    "agent3@maiprop.demo",    // 11
    "institutional1@maiprop.demo", // 12
    "institutional2@maiprop.demo", // 13
    "institutional3@maiprop.demo", // 14
    "developer1@maiprop.demo",     // 15
    "developer2@maiprop.demo",     // 16
    "developer3@maiprop.demo",     // 17
    "professional1@maiprop.demo",  // 18
    "professional2@maiprop.demo",  // 19
    "professional3@maiprop.demo",  // 20
  ];

  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const byEmail = new Map(listData?.users?.map(u => [u.email!, u.id]) ?? []);

  const U: string[] = [];
  for (const email of emails) {
    const id = byEmail.get(email);
    if (!id) {
      console.error(`\n❌ User not found: ${email}`);
      console.error("   Run: npm run seed:users  first\n");
      process.exit(1);
    }
    U.push(id);
    ok(`${email} → ${id.slice(0, 8)}…`);
  }

  // Short aliases
  const buyer1 = U[0], buyer2 = U[1], buyer3 = U[2];
  const seller1 = U[3], seller2 = U[4], seller3 = U[5];
  const investor1 = U[6], investor2 = U[7], investor3 = U[8];
  const agent1 = U[9], agent2 = U[10], agent3 = U[11];
  const institutional1 = U[12];
  const developer1 = U[15], developer2 = U[16];
  const pro1 = U[18], pro2 = U[19], pro3 = U[20];

  // ── Step 1: Listings ──────────────────────────────────────────────────────
  section("1 · LISTINGS — Sellers, Agents, Developers post properties");

  const futureDate = (days: number) => new Date(Date.now() + days * 86400_000).toISOString();
  const pastDate   = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();

  const LISTINGS: Array<{
    owner: string; ownerLabel: string; title: string; city: string; address: string;
    price: number; sqm: number; bedrooms: number; bathrooms: number;
    type: string; listingType: string; tags?: string[];
    openHouseDate?: string; auctionDate?: string; auctionStartingBid?: number;
    isPreSale?: boolean; constructionStatus?: string;
  }> = [
    // Agent listings
    { owner: agent1,    ownerLabel: "agent1",    title: "3BR Kolonaki – Agent Katerina", city: "Athens", address: "Skoufa 42", price: 420000, sqm: 95, bedrooms: 3, bathrooms: 2, type: "apartment", listingType: "sale", tags: ["Parking", "Elevator"] },
    { owner: agent2,    ownerLabel: "agent2",    title: "Sea-view 2BR Kalamaria", city: "Thessaloniki", address: "Nikitara 8", price: 195000, sqm: 72, bedrooms: 2, bathrooms: 1, type: "apartment", listingType: "sale" },
    { owner: agent3,    ownerLabel: "agent3",    title: "Luxury Villa Vouliagmeni – For Sale", city: "Athens", address: "Panorama St 12", price: 1200000, sqm: 220, bedrooms: 4, bathrooms: 3, type: "house", listingType: "sale", tags: ["Pool", "Garden"] },
    // Seller listings
    { owner: seller1,   ownerLabel: "seller1",   title: "Private 2BR Near Metro – Elena's", city: "Athens", address: "Patission 50", price: 285000, sqm: 75, bedrooms: 2, bathrooms: 1, type: "apartment", listingType: "sale" },
    { owner: seller2,   ownerLabel: "seller2",   title: "Furnished Rental – Heraklion", city: "Heraklion", address: "Daedalou 12", price: 850, sqm: 65, bedrooms: 1, bathrooms: 1, type: "apartment", listingType: "rent" },
    // Developer new build
    { owner: developer1, ownerLabel: "developer1", title: "Marina Heights – New Build Pre-Sale", city: "Athens", address: "Faliro Coast Rd", price: 320000, sqm: 88, bedrooms: 2, bathrooms: 2, type: "apartment", listingType: "sale", isPreSale: true, constructionStatus: "under_construction", tags: ["New Build", "Smart Home"] },
    { owner: developer2, ownerLabel: "developer2", title: "Skyline Residences – Off-Plan", city: "Thessaloniki", address: "Dekelias 77", price: 250000, sqm: 78, bedrooms: 2, bathrooms: 1, type: "apartment", listingType: "sale", isPreSale: true, constructionStatus: "planning" },
    // Open house listings
    { owner: agent1,    ownerLabel: "agent1",    title: "Open House – 2BR Glyfada Premium", city: "Athens", address: "Poseidonos 120", price: 385000, sqm: 85, bedrooms: 2, bathrooms: 1, type: "apartment", listingType: "open_house", openHouseDate: futureDate(5) },
    { owner: agent2,    ownerLabel: "agent2",    title: "Open House – Penthouse Kalamaria", city: "Thessaloniki", address: "Nikis Av. 45", price: 420000, sqm: 125, bedrooms: 3, bathrooms: 2, type: "apartment", listingType: "open_house", openHouseDate: futureDate(7) },
    // Auction listing
    { owner: agent3,    ownerLabel: "agent3",    title: "Auction: Commercial Unit Piraeus", city: "Piraeus", address: "Akti Miaouli 88", price: 90000, sqm: 55, bedrooms: 0, bathrooms: 1, type: "commercial", listingType: "auction", auctionDate: futureDate(10), auctionStartingBid: 75000 },
  ];

  const listingIds: string[] = [];
  for (const L of LISTINGS) {
    log(L.ownerLabel.replace(/\d/, ""), `Posts: "${L.title}"`);
    const { data, error } = await supabase
      .from("listings")
      .insert({
        owner_id: L.owner,
        title: L.title,
        city: L.city,
        address: L.address,
        price: L.price,
        sqm: L.sqm,
        bedrooms: L.bedrooms,
        bathrooms: L.bathrooms,
        property_type: L.type,
        listing_type: L.listingType,
        status: "active",
        description: `Listing by ${L.ownerLabel}. Full details available on request.`,
        cover_image_url: "https://images.unsplash.com/photo-1565182999561-18d7dc61c393?w=800&q=60",
        tags: L.tags ?? [],
        ...(L.openHouseDate && { open_house_date: L.openHouseDate }),
        ...(L.auctionDate && { auction_date: L.auctionDate }),
        ...(L.auctionStartingBid && { auction_starting_bid: L.auctionStartingBid }),
        ...(L.isPreSale && { is_pre_sale: true }),
        ...(L.constructionStatus && { construction_status: L.constructionStatus }),
      })
      .select("id")
      .single();
    if (error) { fail(L.title, error.message); listingIds.push(""); }
    else { ok(L.title); listingIds.push(data!.id); }
  }

  const [saleL1, saleL2, saleL3, sellerL1, rentL1, newBuildL1, newBuildL2, ohL1, ohL2, auctionL1] = listingIds;

  // ── Step 1b: Ensure profiles exist for all users ─────────────────────────
  section("1b · PROFILES — Ensure all user profiles exist");

  const profileDefs = [
    { user_id: buyer1,        first_name: "Alex",        last_name: "Buyer",       role: "individual" },
    { user_id: buyer2,        first_name: "Maria",       last_name: "Consumer",    role: "individual" },
    { user_id: buyer3,        first_name: "Nikos",       last_name: "HomeSeeker",  role: "individual" },
    { user_id: seller1,       first_name: "Elena",       last_name: "Owner",       role: "seller_landlord" },
    { user_id: seller2,       first_name: "Kostas",      last_name: "Landlord",    role: "seller_landlord" },
    { user_id: seller3,       first_name: "Sofia",       last_name: "Seller",      role: "seller_landlord" },
    { user_id: investor1,     first_name: "Dimitris",    last_name: "Investor",    role: "investor" },
    { user_id: investor2,     first_name: "Anna",        last_name: "DealHunter",  role: "investor" },
    { user_id: investor3,     first_name: "Giorgos",     last_name: "Portfolio",   role: "investor" },
    { user_id: agent1,        first_name: "Katerina",    last_name: "Agent",       role: "agent" },
    { user_id: agent2,        first_name: "Stefanos",    last_name: "Broker",      role: "agent" },
    { user_id: agent3,        first_name: "Eleni",       last_name: "Realtor",     role: "agent" },
    { user_id: institutional1, first_name: "Fund",       last_name: "Alpha",       role: "institutional" },
    { user_id: U[13],         first_name: "Fund",        last_name: "Beta",        role: "institutional" },
    { user_id: U[14],         first_name: "Fund",        last_name: "Gamma",       role: "institutional" },
    { user_id: developer1,    first_name: "Panos",       last_name: "Developer",   role: "developer" },
    { user_id: developer2,    first_name: "Thanos",      last_name: "Builder",     role: "developer" },
    { user_id: U[17],         first_name: "Leo",         last_name: "Constructor", role: "developer" },
    { user_id: pro1,          first_name: "Stella",      last_name: "Architect",   role: "professional" },
    { user_id: pro2,          first_name: "Michalis",    last_name: "Lawyer",      role: "professional" },
    { user_id: pro3,          first_name: "Fotini",      last_name: "Valuer",      role: "professional" },
  ];
  for (const p of profileDefs) {
    const { error } = await supabase.from("profiles").upsert(
      { user_id: p.user_id, first_name: p.first_name, last_name: p.last_name, role: p.role as any },
      { onConflict: "user_id" }
    );
    if (error) fail(`profile ${p.first_name}`, error.message);
    else ok(`profile ${p.first_name} ${p.last_name}`);
  }

  // ── Step 2: Buyer/Investor browsing → Favourites ─────────────────────────
  section("2 · BROWSING — Buyers & Investors save favourites");

  const favs = [
    { user: buyer1,       listing: saleL1,    label: "buyer1 saves Kolonaki 3BR" },
    { user: buyer1,       listing: sellerL1,  label: "buyer1 saves Elena's 2BR" },
    { user: buyer2,       listing: saleL2,    label: "buyer2 saves Kalamaria sea-view" },
    { user: investor1,    listing: saleL1,    label: "investor1 saves Kolonaki (investment)" },
    { user: investor1,    listing: saleL3,    label: "investor1 saves Vouliagmeni Villa" },
    { user: investor2,    listing: saleL2,    label: "investor2 saves Kalamaria" },
    { user: institutional1, listing: saleL3, label: "fund1 saves Vouliagmeni Villa" },
    { user: buyer3,       listing: newBuildL1, label: "buyer3 saves Marina Heights new build" },
    { user: investor3,    listing: newBuildL2, label: "investor3 saves Skyline Residences off-plan" },
  ];
  for (const f of favs) {
    if (!f.listing) continue;
    log("buyer", f.label);
    const { error } = await supabase
      .from("favorites")
      .upsert({ user_id: f.user, listing_id: f.listing, price_alert: false }, { onConflict: "user_id,listing_id" });
    if (error) fail(f.label, error.message);
    else ok(f.label);
  }

  // ── Step 3: Saved searches ────────────────────────────────────────────────
  section("3 · SAVED SEARCHES — Buyers set up alerts");

  const savedSearches = [
    { user: buyer1, label: "buyer1: 2-3BR Athens sale <€350k", filters: { city: "Athens", listingType: "sale", minBedrooms: 2, maxPrice: 350000 } },
    { user: buyer2, label: "buyer2: Any Thessaloniki apartment <€250k", filters: { city: "Thessaloniki", propertyType: "apartment", maxPrice: 250000 } },
    { user: investor1, label: "investor1: Investment properties Athens", filters: { city: "Athens", listingType: "sale", minPrice: 150000 } },
    { user: investor2, label: "investor2: New builds Greece-wide", filters: { isPreSale: true } },
  ];
  for (const s of savedSearches) {
    log("buyer", s.label);
    const { error } = await supabase
      .from("saved_searches")
      .insert({ user_id: s.user, name: s.label.split(": ")[1] ?? s.label, filters: s.filters, email_alerts: true });
    if (error && error.code !== "23505") fail(s.label, error.message);
    else ok(s.label);
  }

  // ── Step 4: Messages / conversations ─────────────────────────────────────
  section("4 · MESSAGES — Cross-role conversations");

  const conversations = [
    {
      label: "buyer1 → agent1 re: Kolonaki 3BR",
      a: buyer1, b: agent1, listing: saleL1,
      msgs: [
        { from: buyer1, text: "Hi Katerina, is the Kolonaki 3BR still available?" },
        { from: agent1, text: "Yes! Just re-listed. Would you like to schedule a viewing this week?" },
        { from: buyer1, text: "Thursday afternoon works great for me." },
        { from: agent1, text: "Confirmed for Thursday at 15:00. I'll send you the address details." },
      ],
    },
    {
      label: "buyer2 → seller1 re: Private 2BR",
      a: buyer2, b: seller1, listing: sellerL1,
      msgs: [
        { from: buyer2, text: "Elena, I saw your private 2BR listing on maiProp. Very interested." },
        { from: seller1, text: "Thank you! The property is available from next month. Happy to show you this Saturday?" },
        { from: buyer2, text: "Saturday at 11am would be perfect." },
      ],
    },
    {
      label: "investor1 → agent2 re: Kalamaria (ROI)",
      a: investor1, b: agent2, listing: saleL2,
      msgs: [
        { from: investor1, text: "Stefanos, what's the estimated rental yield on the Kalamaria property?" },
        { from: agent2, text: "Based on current market, you're looking at 5.2–5.8% gross yield. Strong demand from university professionals." },
        { from: investor1, text: "That's interesting. Can you share the full investment pack?" },
        { from: agent2, text: "Absolutely. I'll send the financials and comparable sales report tonight." },
      ],
    },
    {
      label: "institutional1 → agent3 re: Vouliagmeni Villa",
      a: institutional1, b: agent3, listing: saleL3,
      msgs: [
        { from: institutional1, text: "Fund Alpha here – we're interested in the Vouliagmeni villa for our portfolio. What's the flexibility on price?" },
        { from: agent3, text: "The seller has some flexibility. They'd consider €1.1M with a 60-day closing. I'll need to see proof of funds." },
        { from: institutional1, text: "We can provide an LOI and bank reference within 48 hours." },
      ],
    },
    {
      label: "buyer3 → developer1 re: Marina Heights",
      a: buyer3, b: developer1, listing: newBuildL1,
      msgs: [
        { from: buyer3, text: "Hi Panos, I'm interested in Marina Heights. When is the expected delivery?" },
        { from: developer1, text: "Q4 2026. We're currently at foundation stage. Pre-sale units are 15% below estimated completion value." },
        { from: buyer3, text: "Can I reserve a unit now? What's the deposit structure?" },
        { from: developer1, text: "10% to reserve, 20% on contract signing, remainder on delivery. Notary handles the contract." },
      ],
    },
    {
      label: "investor2 → agent1 re: Open House Glyfada",
      a: investor2, b: agent1, listing: ohL1,
      msgs: [
        { from: investor2, text: "I registered for the Glyfada Open House. Can I also submit an offer before attending?" },
        { from: agent1, text: "Offers are submitted only after attending and within 48h of the event. We do sealed bids." },
        { from: investor2, text: "Understood. What documents should I bring on the day?" },
        { from: agent1, text: "Your ID (passport or national ID), proof of funds, and the signed waiver you'll receive on approval." },
      ],
    },
    {
      label: "buyer1 → professional1 (architect consultation)",
      a: buyer1, b: pro1, listing: null,
      msgs: [
        { from: buyer1, text: "Stella, I'm looking at a 1960s apartment. Would you do a structural review before I buy?" },
        { from: pro1, text: "Of course. I charge €350 for a full structural assessment. I can be available next week." },
        { from: buyer1, text: "Perfect. I'll book through the platform." },
      ],
    },
    {
      label: "investor1 → professional2 (legal due diligence)",
      a: investor1, b: pro2, listing: saleL3,
      msgs: [
        { from: investor1, text: "Michalis, I'm buying the Vouliagmeni villa. Need a full title check and tax clearance verification." },
        { from: pro2, text: "Standard due diligence for properties above €500k takes 7–10 days. My fee is €850 including all registry searches." },
        { from: investor1, text: "That's fine. I'll send you the property details by email." },
      ],
    },
    {
      label: "buyer2 → professional3 (valuation)",
      a: buyer2, b: pro3, listing: saleL2,
      msgs: [
        { from: buyer2, text: "Fotini, I'd like an independent valuation on a Kalamaria 2BR I'm about to make an offer on." },
        { from: pro3, text: "I can do that. RICS-standard valuation report for €450. Turnaround is 3 working days." },
        { from: buyer2, text: "Great – let's proceed. I'll book via the platform." },
      ],
    },
    {
      label: "seller3 → agent1 (seller enquiry)",
      a: seller3, b: agent1, listing: null,
      msgs: [
        { from: seller3, text: "Katerina, I'm thinking of listing my Kifissia apartment. What's your commission and service?" },
        { from: agent1, text: "Happy to help! My commission is 2% + VAT. I offer professional photography, 3D floor plan, and full marketing." },
        { from: seller3, text: "That sounds great. Can we meet for a valuation next week?" },
        { from: agent1, text: "Absolutely. How does Wednesday at 10am work?" },
      ],
    },
  ];

  for (const c of conversations) {
    log("system", c.label);
    const convId = await startConv(c.a, c.b, c.listing, c.msgs.map(m => ({ from: m.from, text: m.text })));
    if (convId) ok(`Conversation + ${c.msgs.length} messages`);
    else fail(c.label, "failed to create");
  }

  // ── Step 5: Viewings ──────────────────────────────────────────────────────
  section("5 · VIEWINGS — Buyers & Investors schedule viewings");

  const viewings = [
    { requester: buyer1,  listing: saleL1,  owner: agent1,   label: "buyer1 → Kolonaki 3BR (agent1)", daysOut: 2, type: "in_person",  status: "confirmed" },
    { requester: buyer2,  listing: sellerL1, owner: seller1, label: "buyer2 → Elena's 2BR (seller1)",  daysOut: 3, type: "in_person",  status: "pending" },
    { requester: investor1, listing: saleL2, owner: agent2,  label: "investor1 → Kalamaria (agent2)",  daysOut: 4, type: "video", status: "confirmed" },
    { requester: institutional1, listing: saleL3, owner: agent3, label: "fund1 → Vouliagmeni Villa",  daysOut: 5, type: "in_person",  status: "confirmed" },
    { requester: investor2, listing: saleL1, owner: agent1,  label: "investor2 → Kolonaki (agent1)",   daysOut: 6, type: "in_person",  status: "pending" },
    { requester: buyer3,  listing: newBuildL1, owner: developer1, label: "buyer3 → Marina Heights (developer1)", daysOut: 7, type: "video", status: "confirmed" },
  ];
  for (const v of viewings) {
    if (!v.listing) continue;
    log(v.requester === buyer1 || v.requester === buyer2 || v.requester === buyer3 ? "buyer" : "investor", v.label);
    const scheduledAt = new Date(Date.now() + v.daysOut * 86400_000);
    scheduledAt.setHours(14, 0, 0, 0);
    const { error } = await supabase.from("viewings").insert({
      listing_id: v.listing,
      requester_id: v.requester,
      owner_id: v.owner,
      scheduled_at: scheduledAt.toISOString(),
      status: v.status,
      viewing_type: v.type,
      note: `Scheduled via maiProp platform simulation.`,
    });
    if (error && error.code !== "23505") fail(v.label, error.message);
    else ok(v.label);
  }

  // ── Step 6: Open House full flow ──────────────────────────────────────────
  section("6 · OPEN HOUSE — Full screening, approval, bidding flow");

  // 6a. Open house settings
  console.log("\n  6a. Host configures open house settings");
  const ohTimeslots = [
    { start: "10:00", end: "11:30", max_visitors: 6 },
    { start: "12:00", end: "13:30", max_visitors: 6 },
    { start: "14:00", end: "15:30", max_visitors: 4 },
  ];
  for (const [ohId, agentId, label] of [[ohL1, agent1, "Glyfada OH (agent1)"], [ohL2, agent2, "Kalamaria Penthouse OH (agent2)"]] as const) {
    if (!ohId) continue;
    log("agent", `Configures: ${label}`);
    const { error } = await supabase.from("open_house_settings").upsert({
      listing_id: ohId,
      timeslots: ohTimeslots,
      max_visitors_per_slot: 6,
      max_total_visitors: 15,
      allow_sealed_bids: true,
      offer_deadline: futureDate(8),
      require_investor_declaration: true,
      require_proof_of_funds: true,
    }, { onConflict: "listing_id" });
    if (error) fail(label, error.message);
    else ok(`${label} → settings saved`);
    void agentId; // suppress unused warning
  }

  // 6b. Registrations (with screening data)
  console.log("\n  6b. Participants register (with screening)");
  const ohRegs = [
    { listing: ohL1, requester: buyer1,       requesterLabel: "buyer1",        status: "approved",  idVerified: true,  waiverSigned: true,  approvedBy: agent1, mortgage: "pre_approved",   budget: "350000_500000" },
    { listing: ohL1, requester: buyer2,       requesterLabel: "buyer2",        status: "approved",  idVerified: true,  waiverSigned: true,  approvedBy: agent1, mortgage: "in_progress",    budget: "250000_400000" },
    { listing: ohL1, requester: investor1,    requesterLabel: "investor1",     status: "pending",   idVerified: false, waiverSigned: false, approvedBy: null,   mortgage: "cash",           budget: "500000_plus" },
    { listing: ohL1, requester: investor2,    requesterLabel: "investor2",     status: "rejected",  idVerified: false, waiverSigned: false, approvedBy: agent1, mortgage: "cash",           budget: "350000_500000" },
    { listing: ohL1, requester: institutional1, requesterLabel: "fund1",       status: "approved",  idVerified: true,  waiverSigned: true,  approvedBy: agent1, mortgage: "cash",           budget: "500000_plus" },
    { listing: ohL2, requester: buyer2,       requesterLabel: "buyer2",        status: "approved",  idVerified: true,  waiverSigned: true,  approvedBy: agent2, mortgage: "in_progress",    budget: "350000_500000" },
    { listing: ohL2, requester: buyer3,       requesterLabel: "buyer3",        status: "pending",   idVerified: false, waiverSigned: false, approvedBy: null,   mortgage: "pre_approved",   budget: "350000_500000" },
    { listing: ohL2, requester: investor1,    requesterLabel: "investor1",     status: "approved",  idVerified: true,  waiverSigned: true,  approvedBy: agent2, mortgage: "cash",           budget: "500000_plus" },
    { listing: ohL2, requester: investor3,    requesterLabel: "investor3",     status: "rejected",  idVerified: false, waiverSigned: false, approvedBy: agent2, mortgage: "not_started",    budget: "250000_400000" },
  ];
  for (const r of ohRegs) {
    if (!r.listing) continue;
    log(r.requesterLabel.replace(/\d/, ""), `Registers for OH (${r.status})`);
    const payload: Record<string, unknown> = {
      listing_id: r.listing,
      requester_id: r.requester,
      status: r.status,
      timeslot_index: 0,
      id_doc_type: "passport",
    };
    if (r.idVerified) payload.id_verified_at = pastDate(1);
    if (r.waiverSigned) payload.waiver_signed_at = pastDate(1);
    if (r.approvedBy) {
      payload.approved_by = r.approvedBy;
      payload.approved_at = pastDate(1);
    }
    if (r.status === "rejected") payload.rejection_reason = "Documentation incomplete or budget insufficient.";
    const { error } = await supabase
      .from("open_house_registrations")
      .upsert(payload, { onConflict: "listing_id,requester_id" });
    if (error) fail(`${r.requesterLabel} → OH`, error.message);
    else ok(`${r.requesterLabel} → ${r.status}`);
  }

  // 6c. Mark attended
  console.log("\n  6c. Approved participants attend the open house");
  const attended = [
    { listing: ohL1, user: buyer1, label: "buyer1 attended Glyfada OH" },
    { listing: ohL1, user: buyer2, label: "buyer2 attended Glyfada OH" },
    { listing: ohL1, user: institutional1, label: "fund1 attended Glyfada OH" },
    { listing: ohL2, user: buyer2, label: "buyer2 attended Kalamaria OH" },
    { listing: ohL2, user: investor1, label: "investor1 attended Kalamaria OH" },
  ];
  for (const a of attended) {
    if (!a.listing) continue;
    log("buyer", a.label);
    const { error } = await supabase
      .from("open_house_registrations")
      .update({ attended_at: new Date().toISOString(), status: "attended" })
      .eq("listing_id", a.listing)
      .eq("requester_id", a.user);
    if (error) fail(a.label, error.message);
    else ok(a.label);
  }

  // 6d. Sealed bids / offers
  console.log("\n  6d. Post-viewing: participants submit sealed bids");
  const ohOffers = [
    { listing: ohL1, bidder: buyer1,       amount: 395000, status: "accepted", label: "buyer1 bids €395k on Glyfada", decidedBy: agent1 },
    { listing: ohL1, bidder: institutional1, amount: 400000, status: "rejected", label: "fund1 bids €400k on Glyfada",  decidedBy: agent1 },
    { listing: ohL1, bidder: buyer2,       amount: 378000, status: "submitted", label: "buyer2 bids €378k on Glyfada" },
    { listing: ohL2, bidder: buyer2,       amount: 410000, status: "revealed",  label: "buyer2 bids €410k on Kalamaria", decidedBy: agent2 },
    { listing: ohL2, bidder: investor1,    amount: 405000, status: "submitted", label: "investor1 bids €405k on Kalamaria" },
  ];
  for (const o of ohOffers) {
    if (!o.listing) continue;
    log("buyer", o.label);
    const payload: Record<string, unknown> = {
      listing_id: o.listing,
      bidder_id: o.bidder,
      amount: o.amount,
      currency: "EUR",
      status: o.status,
      message: o.status === "accepted" ? "Ready to proceed immediately. Flexible on closing date." : "Please consider my offer.",
    };
    if (o.decidedBy) {
      payload.decided_by = o.decidedBy;
      payload.decided_at = pastDate(0);
      payload.revealed_at = pastDate(0);
    }
    const { error } = await supabase
      .from("open_house_offers")
      .upsert(payload, { onConflict: "listing_id,bidder_id" });
    if (error) fail(o.label, error.message);
    else ok(o.label);
  }

  // ── Step 7: Auctions ──────────────────────────────────────────────────────
  section("7 · AUCTIONS — Investors set alerts, auction bids");

  console.log("\n  7a. Buyers/investors set auction alerts");
  const auctionAlerts = [
    { user: investor1, city: "Athens",       maxBid: 150000, label: "investor1 alert: Athens <€150k" },
    { user: investor2, city: "Piraeus",      maxBid: 100000, label: "investor2 alert: Piraeus <€100k" },
    { user: institutional1, city: "Athens",  maxBid: 500000, label: "fund1 alert: Athens <€500k" },
    { user: buyer3,    city: "Thessaloniki", maxBid: 250000, label: "buyer3 alert: Thessaloniki <€250k" },
  ];
  for (const a of auctionAlerts) {
    log("investor", a.label);
    const { error } = await supabase
      .from("auction_alerts")
      .insert({ user_id: a.user, city: a.city, max_price: a.maxBid, active: true });
    if (error) fail(a.label, error.message);
    else ok(a.label);
  }

  // ── Step 8: Quick Sale (Firesale) full flow ───────────────────────────────
  section("8 · QUICK SALE — Submission → Admin review → Investor notification");

  console.log("\n  8a. Sellers submit Quick Sale applications");
  const firesaleReqs = [
    {
      user: seller1, label: "seller1: Aristotelous 42 Thessaloniki",
      address: "Aristotelous 42", city: "Thessaloniki", property_type: "apartment",
      sqm: 95, bedrooms: 3, condition: "good", asking_price: 145000, ai_estimate: 162000,
      status: "pending", notes: "Need quick sale due to relocation. Recently renovated.", contact_email: "seller1@maiprop.demo",
    },
    {
      user: seller2, label: "seller2: Inherited property Athens",
      address: "Ermou 18", city: "Athens", property_type: "apartment",
      sqm: 72, bedrooms: 2, condition: "fair", asking_price: 98000, ai_estimate: 115000,
      status: "pending", notes: "Inherited property, motivated seller.", contact_email: "seller2@maiprop.demo",
    },
    {
      user: seller3, label: "seller3: Renovated house Athens",
      address: "Papagou 7", city: "Athens", property_type: "house",
      sqm: 140, bedrooms: 4, condition: "excellent", asking_price: 285000, ai_estimate: 320000,
      status: "reviewed", notes: "Renovated 2 years ago. Motivated seller.", contact_email: "seller3@maiprop.demo",
      admin_notes: "Strong candidate. Schedule valuation visit.",
    },
    {
      user: seller1, label: "seller1: Office unit Thessaloniki – Offer Sent",
      address: "Tsimiski 88", city: "Thessaloniki", property_type: "commercial",
      sqm: 55, bedrooms: 0, condition: "good", asking_price: 88000, ai_estimate: 95000,
      offer_price: 82000, status: "offer_sent", notes: "Small office unit in prime commercial corridor.",
      contact_email: "seller1@maiprop.demo",
      admin_notes: "Terms: Subject to survey. Offer valid 30 days.",
    },
    {
      user: seller2, label: "seller2: Marousi apartment – Closed deal",
      address: "Kifissias 210", city: "Marousi", property_type: "apartment",
      sqm: 110, bedrooms: 3, condition: "good", asking_price: 195000, ai_estimate: 220000,
      offer_price: 185000, status: "closed", notes: "Corner unit, lots of natural light.",
      contact_email: "seller2@maiprop.demo",
      admin_notes: "[SELLER:ACCEPTED] Deal closed same day.",
    },
    {
      user: null, label: "Anonymous: Patras 2BR",
      address: "Stratigou Dimitriou 5", city: "Patras", property_type: "apartment",
      sqm: 68, bedrooms: 2, condition: "fair", asking_price: 72000, ai_estimate: 85000,
      status: "pending", notes: "Anonymous submission for Quick Sale.", contact_email: "anon.seller@example.com",
    },
  ];
  const firesaleIds: string[] = [];
  for (const r of firesaleReqs) {
    log("seller", r.label);
    const { data, error } = await supabase
      .from("firesale_requests")
      .insert({
        user_id: r.user,
        address: r.address,
        city: r.city,
        property_type: r.property_type,
        sqm: r.sqm,
        bedrooms: (r as any).bedrooms || null,
        condition: r.condition,
        asking_price: r.asking_price,
        ai_estimate: r.ai_estimate,
        offer_price: (r as any).offer_price ?? null,
        status: r.status,
        contact_email: r.contact_email,
        notes: r.notes,
        admin_notes: (r as any).admin_notes ?? null,
      })
      .select("id")
      .single();
    if (error) { fail(r.label, error.message); firesaleIds.push(""); }
    else { ok(r.label + ` [${r.status}]`); firesaleIds.push(data!.id); }
  }

  console.log("\n  8b. Admin sends offer → investors notified via notifications table");
  // The "offer_sent" status already triggers investor notifications in AdminFiresalePipeline.
  // Here we simulate the fan-out directly:
  const { data: investorProfiles } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("investor_mode", true);
  const investorIds = investorProfiles?.map(p => p.user_id) ?? [];

  if (investorIds.length > 0 && firesaleIds[3]) {
    log("admin", `Fan-out notification to ${investorIds.length} investors re: office unit offer`);
    const notifs = investorIds.map(uid => ({
      user_id: uid,
      title: "New Quick Sale: Commercial Unit Thessaloniki",
      body: "An exclusive off-market deal has been sourced at €82,000 — 14% below AI estimate. Respond within 30 days.",
      type: "quick_sale",
      read: false,
    }));
    const { error } = await supabase.from("notifications").insert(notifs);
    if (error) fail("Investor notifications", error.message);
    else ok(`${investorIds.length} investor notifications sent`);
  }

  // ── Step 9: Professional consultations ────────────────────────────────────
  section("9 · PROFESSIONALS — Consultation requests & bookings");

  const { data: profRows } = await supabase
    .from("professionals")
    .select("id, user_id")
    .in("user_id", [pro1, pro2, pro3]);
  const profIdByUser = new Map(profRows?.map(p => [p.user_id, p.id]) ?? []);

  const consultations = [
    { requesterIdx: buyer1,    prof: pro1, label: "buyer1 → architect Stella (structural review)", service: "Architectural review & structural assessment" },
    { requesterIdx: buyer2,    prof: pro3, label: "buyer2 → valuer Fotini (independent valuation)", service: "RICS valuation report" },
    { requesterIdx: investor1, prof: pro2, label: "investor1 → lawyer Michalis (title check)", service: "Full legal due diligence & title check" },
    { requesterIdx: investor1, prof: pro3, label: "investor1 → valuer Fotini (portfolio valuation)", service: "Portfolio valuation for 3 properties" },
    { requesterIdx: seller3,   prof: pro1, label: "seller3 → architect (pre-listing survey)", service: "Pre-listing condition report" },
    { requesterIdx: developer1, prof: pro2, label: "developer1 → lawyer (planning permission review)", service: "Planning permission & title review" },
  ];
  for (const c of consultations) {
    const profId = profIdByUser.get(c.prof);
    if (!profId) { fail(c.label, "professional not found – run seed:professionals first"); continue; }
    log("buyer", c.label);
    const userIdx = c.requesterIdx;
    const mockUser = [
      { email: "buyer1@maiprop.demo", firstName: "Alex", lastName: "Buyer" },
      { email: "buyer2@maiprop.demo", firstName: "Maria", lastName: "Consumer" },
      null, null, null, null,
      { email: "investor1@maiprop.demo", firstName: "Dimitris", lastName: "Investor" },
    ];
    const u = mockUser[Object.values(U).indexOf(userIdx)] ?? { email: "user@maiprop.demo", firstName: "User", lastName: "" };
    const { error } = await supabase.from("consultation_requests").insert({
      professional_id: profId,
      requester_id: userIdx,
      requester_name: `${u.firstName} ${u.lastName}`,
      requester_email: u.email,
      request_type: "consultation",
      service: c.service,
      status: "pending",
    });
    if (error && error.code !== "23505") fail(c.label, error.message);
    else ok(c.label);
  }

  // ── Step 10: Notifications ────────────────────────────────────────────────
  section("10 · NOTIFICATIONS — System alerts to users");

  const notifications = [
    { user: buyer1,    title: "Viewing confirmed: Kolonaki 3BR", body: "Your viewing on Thursday 15:00 is confirmed with Katerina Agent.", type: "viewing" },
    { user: buyer2,    title: "New match for your search", body: "A new 2BR in Thessaloniki at €192k matches your saved search.", type: "saved_search" },
    { user: investor1, title: "Auction alert: Athens property", body: "A new auction listing in Athens at €95k starting bid just went live.", type: "auction_alert" },
    { user: investor2, title: "Quick Sale: New deal sourced", body: "An exclusive off-market property in Athens has been sourced for investors.", type: "quick_sale" },
    { user: seller1,   title: "You have a new enquiry", body: "A buyer is interested in your property at Aristotelous 42.", type: "enquiry" },
    { user: seller3,   title: "Quick Sale offer received", body: "maiProp has prepared a formal offer for your property. Review it now.", type: "quick_sale" },
    { user: agent1,    title: "New open house registration", body: "Nikos HomeSeeker has registered for the Glyfada open house — pending approval.", type: "open_house" },
    { user: developer1, title: "New interest registered", body: "Maria Consumer has enquired about Marina Heights. Reply to confirm details.", type: "enquiry" },
    { user: pro1,      title: "New consultation request", body: "Alex Buyer has requested an architectural review. Click to respond.", type: "consultation" },
  ];
  for (const n of notifications) {
    const { error } = await supabase.from("notifications").insert({ user_id: n.user, title: n.title, body: n.body, type: n.type, read: false });
    if (error) fail(n.title, error.message);
    else ok(n.title);
  }

  // ── Step 11: Analytics view events (simulate views_count) ─────────────────
  section("11 · ANALYTICS — Simulate property view counts");

  const viewCounts: Array<{ id: string; count: number }> = [
    { id: saleL1,    count: 142 },
    { id: saleL2,    count: 87  },
    { id: saleL3,    count: 203 },
    { id: sellerL1,  count: 64  },
    { id: rentL1,    count: 55  },
    { id: newBuildL1, count: 118 },
    { id: newBuildL2, count: 76 },
    { id: ohL1,      count: 94  },
    { id: ohL2,      count: 71  },
    { id: auctionL1, count: 156 },
  ];
  for (const v of viewCounts) {
    if (!v.id) continue;
    const { error } = await supabase.from("listings").update({ views_count: v.count }).eq("id", v.id);
    if (error) fail(`views_count on ${v.id.slice(0, 8)}`, error.message);
    else ok(`${v.id.slice(0, 8)}… → ${v.count} views`);
  }

  // ── Step 12: Agent CRM contacts ───────────────────────────────────────────
  section("12 · AGENT CRM — Contacts & pipeline");

  const crmContacts = [
    { agent: agent1, name: "Alex Buyer",          email: "buyer1@maiprop.demo",         listing: saleL1,   stage: "qualified",    label: "agent1 CRM: Alex Buyer" },
    { agent: agent1, name: "Anna DealHunter",     email: "investor2@maiprop.demo",       listing: saleL1,   stage: "contacted",    label: "agent1 CRM: Anna DealHunter" },
    { agent: agent2, name: "Dimitris Investor",   email: "investor1@maiprop.demo",       listing: saleL2,   stage: "qualified",   label: "agent2 CRM: Dimitris Investor" },
    { agent: agent3, name: "Fund Alpha",          email: "institutional1@maiprop.demo",  listing: saleL3,   stage: "negotiation",  label: "agent3 CRM: Fund Alpha" },
    { agent: agent1, name: "Maria Consumer",      email: "buyer2@maiprop.demo",          listing: sellerL1, stage: "qualified",   label: "agent1 CRM: Maria Consumer" },
    { agent: agent2, name: "Sofia Owner",         email: "seller3@maiprop.demo",         listing: null,     stage: "new",          label: "agent2 CRM: Sofia Owner (seller lead)" },
  ];
  for (const c of crmContacts) {
    log("agent", c.label);
    const { error } = await supabase.from("contacts").insert({
      user_id: c.agent,
      name: c.name,
      email: c.email,
      listing_id: c.listing,
      deal_stage: c.stage,
    });
    if (error && error.code !== "23505") fail(c.label, error.message);
    else ok(c.label);
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  ✅ SIMULATION COMPLETE");
  console.log("═".repeat(60));
  console.log(`
  Summary of simulated interactions:
  · ${LISTINGS.length} listings (sale, rent, open house, auction, new build, pre-sale)
  · ${favs.length} saved favourites
  · ${savedSearches.length} saved searches with email alerts
  · ${conversations.length} conversations with ${conversations.reduce((a, c) => a + c.msgs.length, 0)} messages
  · ${viewings.length} viewings (in-person + video call)
  · ${ohRegs.length} open house registrations (screening: ID, mortgage status, budget)
  · ${attended.length} attendances recorded
  · ${ohOffers.length} sealed bids / offers submitted
  · ${auctionAlerts.length} auction price alerts
  · ${firesaleReqs.length} Quick Sale applications (all statuses)
  · Investor fan-out notifications for offer_sent deals
  · ${consultations.length} professional consultation requests
  · ${notifications.length} platform notifications
  · ${viewCounts.length} analytics view counts seeded
  · ${crmContacts.length} agent CRM contact entries

  Login credentials (all accounts): Demo2025!

  Role         | Email examples
  -------------|------------------------------
  Buyer        | buyer1@maiprop.demo
  Seller       | seller1@maiprop.demo
  Investor     | investor1@maiprop.demo
  Agent        | agent1@maiprop.demo
  Institutional| institutional1@maiprop.demo
  Developer    | developer1@maiprop.demo
  Professional | professional1@maiprop.demo
`);
}

main().catch(e => { console.error(e); process.exit(1); });
