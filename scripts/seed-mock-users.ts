/**
 * Seed mock accounts: 3 of each participant type, with cross-type interactions.
 * Run: npm run seed:users
 * Requires: SUPABASE_SERVICE_ROLE_KEY
 *
 * Types: buyer, seller, investor, agent, institutional, developer, professional
 * Interactions: listings, messages, viewings, favorites, contacts, professionals, consultation requests
 */

import { createClient } from "@supabase/supabase-js";
import { assertNotProduction } from "./_prod-guard";
import { getSeedEnv } from "./_seed-env";

const { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY } = getSeedEnv();

assertNotProduction(SUPABASE_URL, "seed-mock-users.ts");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type RoleKey = "individual" | "seller_landlord" | "investor" | "agent" | "institutional" | "developer" | "professional";

const _ROLES: RoleKey[] = ["individual", "seller_landlord", "investor", "agent", "institutional", "developer", "professional"];

type ParticipantType = "buyer" | "seller" | "investor" | "agent" | "developer" | "professional";

const MOCK_USERS: Array<{ email: string; firstName: string; lastName: string; role: RoleKey; participantType: ParticipantType; investorMode?: boolean }> = [
  { email: "buyer1@maiprop.demo", firstName: "Alex", lastName: "Buyer", role: "individual", participantType: "buyer" },
  { email: "buyer2@maiprop.demo", firstName: "Maria", lastName: "Consumer", role: "individual", participantType: "buyer" },
  { email: "buyer3@maiprop.demo", firstName: "Nikos", lastName: "HomeSeeker", role: "individual", participantType: "buyer" },
  { email: "seller1@maiprop.demo", firstName: "Elena", lastName: "Seller", role: "seller_landlord", participantType: "seller" },
  { email: "seller2@maiprop.demo", firstName: "Yannis", lastName: "Landlord", role: "seller_landlord", participantType: "seller" },
  { email: "seller3@maiprop.demo", firstName: "Sofia", lastName: "Owner", role: "seller_landlord", participantType: "seller" },
  { email: "investor1@maiprop.demo", firstName: "Dimitris", lastName: "Investor", role: "investor", participantType: "investor", investorMode: true },
  { email: "investor2@maiprop.demo", firstName: "Anna", lastName: "DealHunter", role: "investor", participantType: "investor", investorMode: true },
  { email: "investor3@maiprop.demo", firstName: "Christos", lastName: "Capital", role: "investor", participantType: "investor", investorMode: true },
  { email: "agent1@maiprop.demo", firstName: "Katerina", lastName: "Agent", role: "agent", participantType: "agent" },
  { email: "agent2@maiprop.demo", firstName: "Stefanos", lastName: "Broker", role: "agent", participantType: "agent" },
  { email: "agent3@maiprop.demo", firstName: "Georgia", lastName: "Realtor", role: "agent", participantType: "agent" },
  { email: "institutional1@maiprop.demo", firstName: "Fund Alpha", lastName: "Institutional", role: "institutional", participantType: "investor", investorMode: true },
  { email: "institutional2@maiprop.demo", firstName: "Fund Beta", lastName: "Capital", role: "institutional", participantType: "investor", investorMode: true },
  { email: "institutional3@maiprop.demo", firstName: "Fund Gamma", lastName: "Investments", role: "institutional", participantType: "investor", investorMode: true },
  { email: "developer1@maiprop.demo", firstName: "Panos", lastName: "Developer", role: "developer", participantType: "developer" },
  { email: "developer2@maiprop.demo", firstName: "Vasilis", lastName: "Builder", role: "developer", participantType: "developer" },
  { email: "developer3@maiprop.demo", firstName: "Ioannis", lastName: "Project", role: "developer", participantType: "developer" },
  { email: "professional1@maiprop.demo", firstName: "Stella", lastName: "Architect", role: "professional", participantType: "professional" },
  { email: "professional2@maiprop.demo", firstName: "Michalis", lastName: "Lawyer", role: "professional", participantType: "professional" },
  { email: "professional3@maiprop.demo", firstName: "Fotini", lastName: "Valuer", role: "professional", participantType: "professional" },
];

const INDICES = {
  buyer: [0, 1, 2],
  seller: [3, 4, 5],
  investor: [6, 7, 8],
  agent: [9, 10, 11],
  institutional: [12, 13, 14],
  developer: [15, 16, 17],
  professional: [18, 19, 20],
};

function sortParticipants(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function main() {
  const userIds: string[] = [];
  const existingByEmail = new Map<string, string>();

  console.log("Creating 21 mock accounts (3 per type)...");
  const { data: listData } = await supabase.auth.admin.listUsers();
  listData?.users?.forEach((u) => u.email && existingByEmail.set(u.email, u.id));

  for (const u of MOCK_USERS) {
    const existing = existingByEmail.get(u.email);
    if (existing) {
      userIds.push(existing);
      console.log(`  ✓ ${u.email} (${u.role}) [existing]`);
      continue;
    }
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: "Demo2025!",
      email_confirm: true,
      user_metadata: { first_name: u.firstName, last_name: u.lastName },
    });
    if (error) {
      console.error(`  ✗ ${u.email}:`, error.message);
      process.exit(1);
    }
    userIds.push(data.user.id);
    console.log(`  ✓ ${u.email} (${u.role})`);
  }

  console.log("\nGranting roles via seed_grant_role RPC (bypasses profile guard trigger)...");
  const rpcRoles: Array<{ indicesKey: keyof typeof INDICES; role: string }> = [
    { indicesKey: "agent",         role: "agent" },
    { indicesKey: "professional",  role: "professional" },
    { indicesKey: "seller",        role: "seller_landlord" },
    { indicesKey: "investor",      role: "investor" },
    { indicesKey: "institutional", role: "institutional" },
    { indicesKey: "developer",     role: "developer" },
  ];
  for (const { indicesKey, role } of rpcRoles) {
    const ids = INDICES[indicesKey].map((i) => userIds[i]);
    const { error } = await supabase.rpc("seed_grant_role", { user_ids: ids, target_role: role });
    if (error) console.error(`  ✗ seed_grant_role(${role}):`, error.message);
    else console.log(`  ✓ ${role} (${ids.length} users)`);
  }
  console.log("  Roles set");

  console.log("\nUpdating profile details + participant_type...");
  const cities = ["Athens", "Thessaloniki", "Patras", "Athens", "Heraklion", "Volos", "Athens", "Thessaloniki", "Athens", "Athens", "Thessaloniki", "Patras", "Athens", "Athens", "London", "Athens", "Thessaloniki", "Patras", "Athens", "Thessaloniki", "Athens"];
  for (let i = 0; i < MOCK_USERS.length; i++) {
    const u = MOCK_USERS[i];
    await supabase
      .from("profiles")
      .update({
        first_name: u.firstName,
        last_name: u.lastName,
        display_name: `${u.firstName} ${u.lastName}`,
        city: cities[i],
        participant_type: u.participantType,
        investor_mode: u.investorMode ?? false,
      })
      .eq("user_id", userIds[i]);
  }
  console.log("  Profiles updated (including participant_type + investor_mode)");

  // ── Listings: agents + sellers + developer ─────────────────────────────────
  console.log("\nCreating listings...");
  const listingData: Array<{ ownerIdx: number; title: string; city: string; price: number; sqm: number; type: "apartment" | "house"; address: string; listingType: "sale" | "rent" | "open_house"; openHouseDate?: string }> = [
    { ownerIdx: 9, title: "Modern 3BR in Kolonaki", city: "Athens", price: 420000, sqm: 95, type: "apartment", address: "Skoufa 42", listingType: "sale" },
    { ownerIdx: 10, title: "Sea-view 2BR in Kalamaria", city: "Thessaloniki", price: 195000, sqm: 72, type: "apartment", address: "Nikitara 8", listingType: "sale" },
    { ownerIdx: 11, title: "Villa in Vouliagmeni", city: "Athens", price: 1200000, sqm: 220, type: "house", address: "Panorama St", listingType: "sale" },
    { ownerIdx: 3, title: "Private sale – 2BR near metro", city: "Athens", price: 285000, sqm: 75, type: "apartment", address: "Patission 50", listingType: "sale" },
    { ownerIdx: 4, title: "Landlord rental – furnished", city: "Heraklion", price: 850, sqm: 65, type: "apartment", address: "Daedalou 12", listingType: "rent" },
    { ownerIdx: 15, title: "New build – Marina Heights", city: "Athens", price: 320000, sqm: 88, type: "apartment", address: "Faliro", listingType: "sale" },
    { ownerIdx: 9, title: "Open House – 2BR Glyfada", city: "Athens", price: 385000, sqm: 85, type: "apartment", address: "Poseidonos 120", listingType: "open_house", openHouseDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() },
    { ownerIdx: 10, title: "Open House – Penthouse Kalamaria", city: "Thessaloniki", price: 420000, sqm: 125, type: "apartment", address: "Nikis Av. 45", listingType: "open_house", openHouseDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
  ];
  const listingIds: string[] = [];
  for (const L of listingData) {
    const { data, error } = await supabase
      .from("listings")
      .insert({
        owner_id: userIds[L.ownerIdx],
        title: L.title,
        city: L.city,
        address: L.address,
        price: L.price,
        sqm: L.sqm,
        property_type: L.type,
        listing_type: L.listingType,
        status: "active",
        bedrooms: L.sqm > 100 ? 3 : 2,
        bathrooms: 1,
        description: `Property in ${L.city}. Contact for details.`,
        cover_image_url: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800&q=60",
        ...(L.listingType === "open_house" && L.openHouseDate && { open_house_date: L.openHouseDate }),
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  "${L.title}":`, error.message);
      continue;
    }
    listingIds.push(data!.id);
    console.log(`  ✓ ${L.title}`);
  }

  // ── Conversations + messages (cross-type) ───────────────────────────────────
  console.log("\nCreating conversations and messages...");
  const convos: Array<{ a: number; b: number; listingIdx?: number; msgs: Array<{ from: number; text: string }> }> = [
    { a: 0, b: 9, listingIdx: 0, msgs: [{ from: 0, text: "Hi, is this property still available?" }, { from: 9, text: "Yes! Would you like to schedule a viewing?" }, { from: 0, text: "Thursday afternoon works for me." }] },
    { a: 1, b: 3, listingIdx: 3, msgs: [{ from: 1, text: "Interested in your private sale. Can I see it this weekend?" }, { from: 3, text: "Sure, Saturday 10am?" }] },
    { a: 6, b: 10, listingIdx: 1, msgs: [{ from: 6, text: "We're looking for investment properties. ROI potential?" }, { from: 10, text: "Strong rental demand in the area. Happy to share numbers." }] },
    { a: 12, b: 11, listingIdx: 2, msgs: [{ from: 12, text: "Fund Alpha – interested in the Vouliagmeni villa for our portfolio." }, { from: 11, text: "I'll send you the full package." }] },
    { a: 7, b: 9, listingIdx: 0, msgs: [{ from: 7, text: "Considering this for a flip. What's the condition?" }, { from: 9, text: "Recently renovated. I can send a video walkthrough." }] },
    { a: 2, b: 10, msgs: [{ from: 2, text: "Looking for 2BR in Thessaloniki. Any upcoming listings?" }, { from: 10, text: "I have 2 coming on next week. I'll keep you posted." }] },
  ];
  for (const c of convos) {
    const [pa, pb] = sortParticipants(userIds[c.a], userIds[c.b]);
    const { data: existing } = await supabase.from("conversations").select("id").eq("participant_a", pa).eq("participant_b", pb).maybeSingle();
    let convId: string;
    if (existing?.id) convId = existing.id;
    else {
      const { data: ins } = await supabase.from("conversations").insert({ participant_a: pa, participant_b: pb, listing_id: c.listingIdx != null ? listingIds[c.listingIdx] : null }).select("id").single();
      if (!ins?.id) continue;
      convId = ins.id;
    }
    for (const m of c.msgs) {
      await supabase.from("messages").insert({ conversation_id: convId, sender_id: userIds[m.from], content: m.text, status: "sent" });
    }
  }
  console.log(`  ✓ ${convos.length} conversations with messages`);

  // ── Viewings (buyer/investor → agent/seller) ─────────────────────────────────
  console.log("\nCreating viewings...");
  const viewings: Array<{ requesterIdx: number; listingIdx: number; ownerIdx: number }> = [
    { requesterIdx: 0, listingIdx: 0, ownerIdx: 9 },
    { requesterIdx: 1, listingIdx: 3, ownerIdx: 3 },
    { requesterIdx: 6, listingIdx: 1, ownerIdx: 10 },
    { requesterIdx: 12, listingIdx: 2, ownerIdx: 11 },
    { requesterIdx: 7, listingIdx: 0, ownerIdx: 9 },
  ];
  const now = new Date();
  for (let i = 0; i < viewings.length; i++) {
    const v = viewings[i];
    const d = new Date(now);
    d.setDate(d.getDate() + 2 + i);
    d.setHours(14, 0, 0, 0);
    await supabase.from("viewings").insert({
      listing_id: listingIds[v.listingIdx],
      requester_id: userIds[v.requesterIdx],
      owner_id: userIds[v.ownerIdx],
      scheduled_at: d.toISOString(),
      status: i % 2 === 0 ? "confirmed" : "pending",
      viewing_type: "in_person",
    });
  }
  console.log(`  ✓ ${viewings.length} viewings`);

  // ── Favorites (buyers, investors, institutional) ────────────────────────────
  console.log("\nCreating favorites...");
  const favs: Array<{ userIdx: number; listingIdx: number }> = [
    { userIdx: 0, listingIdx: 0 }, { userIdx: 0, listingIdx: 3 }, { userIdx: 1, listingIdx: 1 },
    { userIdx: 6, listingIdx: 0 }, { userIdx: 6, listingIdx: 2 }, { userIdx: 7, listingIdx: 1 },
    { userIdx: 12, listingIdx: 2 }, { userIdx: 2, listingIdx: 5 },
  ];
  for (const f of favs) {
    await supabase.from("favorites").upsert({ user_id: userIds[f.userIdx], listing_id: listingIds[f.listingIdx], price_alert: false }, { onConflict: "user_id,listing_id" });
  }
  console.log(`  ✓ ${favs.length} favorites`);

  // ── Contacts (agents’ CRM – from inquiries) ────────────────────────────────
  console.log("\nCreating contacts (agent CRM)...");
  const contacts = [
    { agentIdx: 9, name: "Alex Buyer", email: "buyer1@maiprop.demo", listingIdx: 0, dealStage: "qualified" },
    { agentIdx: 9, name: "Anna DealHunter", email: "investor2@maiprop.demo", listingIdx: 0, dealStage: "contacted" },
    { agentIdx: 10, name: "Dimitris Investor", email: "investor1@maiprop.demo", listingIdx: 1, dealStage: "interested" },
    { agentIdx: 11, name: "Fund Alpha", email: "institutional1@maiprop.demo", listingIdx: 2, dealStage: "negotiation" },
  ];
  for (const c of contacts) {
    await supabase.from("contacts").insert({
      user_id: userIds[c.agentIdx],
      name: c.name,
      email: c.email,
      listing_id: listingIds[c.listingIdx],
      deal_stage: c.dealStage,
    });
  }
  console.log(`  ✓ ${contacts.length} contacts`);

  // ── Professionals (directory entries) ───────────────────────────────────────
  console.log("\nCreating professionals...");
  const profCategories = ["architect", "lawyer", "valuer"] as const;
  for (let i = 0; i < 3; i++) {
    const idx = INDICES.professional[i];
    const { data: existing } = await supabase.from("professionals").select("id").eq("user_id", userIds[idx]).maybeSingle();
    if (existing) continue;
    await supabase.from("professionals").insert({
      user_id: userIds[idx],
      category: profCategories[i],
      title: ["Registered Architect", "Property Lawyer", "Licensed Valuer"][i],
      display_name: MOCK_USERS[idx].firstName + " " + MOCK_USERS[idx].lastName,
      city: "Athens",
      bio: `Professional services for property in Greece.`,
    });
  }
  console.log("  ✓ 3 professionals in directory");

  // ── Consultation requests (buyers/investors → professionals) ─────────────────
  console.log("\nCreating consultation requests...");
  const professionalIds = INDICES.professional.map((i) => userIds[i]);
  const { data: profRows } = await supabase.from("professionals").select("id, user_id").in("user_id", professionalIds);
  const profIdByUser = new Map(profRows?.map((p) => [p.user_id, p.id]) ?? []);
  const consulReqs = [
    { requesterIdx: 0, professionalIdx: 18, service: "Architectural review" },
    { requesterIdx: 1, professionalIdx: 19, service: "Title check" },
    { requesterIdx: 6, professionalIdx: 20, service: "Valuation report" },
  ];
  for (const r of consulReqs) {
    const profId = profIdByUser.get(userIds[r.professionalIdx]);
    if (!profId) continue;
    const u = MOCK_USERS[r.requesterIdx];
    await supabase.from("consultation_requests").insert({
      professional_id: profId,
      requester_id: userIds[r.requesterIdx],
      requester_name: `${u.firstName} ${u.lastName}`,
      requester_email: u.email,
      request_type: "consultation",
      service: r.service,
      status: "pending",
    });
  }
  console.log(`  ✓ ${consulReqs.length} consultation requests`);

  // ── Open house listings: settings, registrations, offers, conversations ──────
  const ohListingIds = [listingIds[6], listingIds[7]];

  console.log("\nCreating open house settings...");
  const offerDeadline1 = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
  const offerDeadline2 = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const timeslots = [
    { start: "10:00", end: "11:30", max_visitors: 6 },
    { start: "12:00", end: "13:30", max_visitors: 6 },
    { start: "14:00", end: "15:30", max_visitors: 6 },
  ];
  for (let i = 0; i < ohListingIds.length; i++) {
    await supabase.from("open_house_settings").upsert(
      {
        listing_id: ohListingIds[i],
        timeslots,
        max_visitors_per_slot: 6,
        max_total_visitors: 15,
        allow_sealed_bids: true,
        offer_deadline: i === 0 ? offerDeadline1 : offerDeadline2,
      },
      { onConflict: "listing_id" }
    );
  }
  console.log("  ✓ 2 open house settings");

  console.log("\nCreating open house registrations...");
  const nowTs = new Date().toISOString();
  const pastTs = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const regs: Array<{ listingIdx: number; requesterIdx: number; status: "pending" | "approved" | "rejected" | "attended"; idVerified?: boolean; waiverSigned?: boolean; approvedBy?: number; attended?: boolean }> = [
    { listingIdx: 0, requesterIdx: 0, status: "approved", idVerified: true, waiverSigned: true, approvedBy: 9, attended: true },
    { listingIdx: 0, requesterIdx: 1, status: "approved", idVerified: true, waiverSigned: true, approvedBy: 9 },
    { listingIdx: 0, requesterIdx: 6, status: "pending" },
    { listingIdx: 0, requesterIdx: 7, status: "rejected", approvedBy: 9 },
    { listingIdx: 0, requesterIdx: 12, status: "approved", idVerified: true, waiverSigned: true, approvedBy: 9, attended: true },
    { listingIdx: 1, requesterIdx: 1, status: "approved", idVerified: true, waiverSigned: true, approvedBy: 10, attended: true },
    { listingIdx: 1, requesterIdx: 2, status: "pending" },
    { listingIdx: 1, requesterIdx: 6, status: "approved", idVerified: true, waiverSigned: true, approvedBy: 10 },
    { listingIdx: 1, requesterIdx: 8, status: "rejected", approvedBy: 10 },
  ];
  for (const r of regs) {
    const payload: Record<string, unknown> = {
      listing_id: ohListingIds[r.listingIdx],
      requester_id: userIds[r.requesterIdx],
      status: r.status,
      timeslot_index: 0,
      id_doc_type: "passport",
    };
    if (r.idVerified) payload.id_verified_at = pastTs;
    if (r.waiverSigned) payload.waiver_signed_at = pastTs;
    if (r.approvedBy) {
      payload.approved_by = userIds[r.approvedBy];
      payload.approved_at = pastTs;
    }
    if (r.status === "rejected") payload.rejection_reason = "Documentation incomplete.";
    if (r.attended) payload.attended_at = nowTs;
    await supabase.from("open_house_registrations").upsert(payload, { onConflict: "listing_id,requester_id" });
  }
  console.log(`  ✓ ${regs.length} open house registrations`);

  console.log("\nCreating open house offers (sealed bids)...");
  const offers: Array<{ listingIdx: number; bidderIdx: number; amount: number; status: "submitted" | "revealed" | "accepted" | "rejected"; decidedBy?: number }> = [
    { listingIdx: 0, bidderIdx: 0, amount: 395000, status: "accepted", decidedBy: 9 },
    { listingIdx: 0, bidderIdx: 12, amount: 400000, status: "rejected", decidedBy: 9 },
    { listingIdx: 0, bidderIdx: 1, amount: 378000, status: "submitted" },
    { listingIdx: 1, bidderIdx: 1, amount: 410000, status: "revealed", decidedBy: 10 },
    { listingIdx: 1, bidderIdx: 6, amount: 405000, status: "submitted" },
  ];
  for (const o of offers) {
    const payload: Record<string, unknown> = {
      listing_id: ohListingIds[o.listingIdx],
      bidder_id: userIds[o.bidderIdx],
      amount: o.amount,
      currency: "EUR",
      status: o.status,
      message: o.status === "accepted" ? "Ready to proceed. Flexible on closing." : undefined,
    };
    if (o.decidedBy) {
      payload.decided_by = userIds[o.decidedBy];
      payload.decided_at = pastTs;
    }
    if (o.status === "revealed" || o.status === "accepted" || o.status === "rejected") payload.revealed_at = pastTs;
    await supabase.from("open_house_offers").upsert(payload, { onConflict: "listing_id,bidder_id" });
  }
  console.log(`  ✓ ${offers.length} open house offers`);

  console.log("\nCreating open house conversations...");
  const ohConvos: Array<{ a: number; b: number; listingIdx: number; msgs: Array<{ from: number; text: string }> }> = [
    { a: 0, b: 9, listingIdx: 6, msgs: [{ from: 0, text: "I’d like to register for the Glyfada open house. When is the next slot?" }, { from: 9, text: "We have slots at 10am and 12pm. You’ll need to verify ID and sign the waiver." }, { from: 0, text: "Done. Looking forward to it." }] },
    { a: 6, b: 9, listingIdx: 6, msgs: [{ from: 6, text: "I registered for the Glyfada OH. Can I submit an offer before attending?" }, { from: 9, text: "Offers are accepted only after attendance. Deadline is 48h after the event." }] },
    { a: 1, b: 10, listingIdx: 7, msgs: [{ from: 1, text: "I attended the Kalamaria penthouse OH. Submitting my offer now." }, { from: 10, text: "Received. We’ll review after the deadline and get back to you." }] },
    { a: 7, b: 9, listingIdx: 6, msgs: [{ from: 7, text: "Why was my registration for the Glyfada OH rejected?" }, { from: 9, text: "The ID doc was unclear. Please re-register with a clearer scan." }] },
  ];
  for (const c of ohConvos) {
    const [pa, pb] = sortParticipants(userIds[c.a], userIds[c.b]);
    const { data: existing } = await supabase.from("conversations").select("id").eq("participant_a", pa).eq("participant_b", pb).maybeSingle();
    let convId: string;
    if (existing?.id) convId = existing.id;
    else {
      const { data: ins } = await supabase.from("conversations").insert({ participant_a: pa, participant_b: pb, listing_id: listingIds[c.listingIdx] }).select("id").single();
      if (!ins?.id) continue;
      convId = ins.id;
    }
    for (const m of c.msgs) {
      await supabase.from("messages").insert({ conversation_id: convId, sender_id: userIds[m.from], content: m.text, status: "sent" });
    }
  }
  console.log(`  ✓ ${ohConvos.length} open house conversations with messages`);

  // ── Firesale (Quick Sale) requests ───────────────────────────────────────────
  console.log("\nCreating firesale (Quick Sale) requests...");
  const firesaleReqs = [
    { userIdx: 3, address: "Aristotelous 42", city: "Thessaloniki", property_type: "apartment", sqm: 95, bedrooms: 3, condition: "good", asking_price: 145000, ai_estimate: 162000, offer_price: null, status: "pending", contact_email: MOCK_USERS[3].email, contact_phone: "+30 231 555 1001", notes: "Need quick sale due to relocation. Property in good condition.", admin_notes: null },
    { userIdx: 4, address: "Ermou 18", city: "Athens", property_type: "apartment", sqm: 72, bedrooms: 2, condition: "fair", asking_price: 98000, ai_estimate: 115000, offer_price: null, status: "pending", contact_email: MOCK_USERS[4].email, contact_phone: "phone-redacted", notes: "Inherited property, want to sell fast.", admin_notes: null },
    { userIdx: 5, address: "Papagou 7", city: "Athens", property_type: "house", sqm: 140, bedrooms: 4, condition: "excellent", asking_price: 285000, ai_estimate: 320000, offer_price: null, status: "reviewed", contact_email: MOCK_USERS[5].email, contact_phone: "phone-redacted", notes: "Renovated 2 years ago. Motivated seller.", admin_notes: "Strong candidate. Schedule valuation visit." },
    { userIdx: 3, address: "Tsimiski 88", city: "Thessaloniki", property_type: "commercial", sqm: 55, bedrooms: null, condition: "good", asking_price: 88000, ai_estimate: 95000, offer_price: 82000, status: "offer_sent", contact_email: MOCK_USERS[3].email, contact_phone: null, notes: "Small office unit in prime location.", admin_notes: "Terms: Subject to survey. Valid until: 2025-04-15" },
    { userIdx: 4, address: "Kifissias 210", city: "Marousi", property_type: "apartment", sqm: 110, bedrooms: 3, condition: "good", asking_price: 195000, ai_estimate: 220000, offer_price: 185000, status: "closed", contact_email: MOCK_USERS[4].email, contact_phone: "phone-redacted", notes: "Corner unit, lots of light.", admin_notes: "[SELLER:ACCEPTED] Deal closed same day." },
    { userIdx: null, address: "Stratigou Dimitriou 5", city: "Patras", property_type: "apartment", sqm: 68, bedrooms: 2, condition: "fair", asking_price: 72000, ai_estimate: 85000, offer_price: null, status: "pending", contact_email: "anonymous.seller@example.com", contact_phone: "+30 261 555 4004", notes: "Anonymous submission for Quick Sale.", admin_notes: null },
  ];
  for (const r of firesaleReqs) {
    await supabase.from("firesale_requests").insert({
      user_id: r.userIdx !== null ? userIds[r.userIdx] : null,
      address: r.address,
      city: r.city,
      property_type: r.property_type,
      sqm: r.sqm,
      bedrooms: r.bedrooms,
      condition: r.condition,
      asking_price: r.asking_price,
      ai_estimate: r.ai_estimate,
      offer_price: r.offer_price,
      status: r.status,
      contact_email: r.contact_email,
      contact_phone: r.contact_phone,
      notes: r.notes,
      admin_notes: r.admin_notes,
    });
  }
  console.log(`  ✓ ${firesaleReqs.length} firesale (Quick Sale) requests`);

  console.log("\n✅ Seed complete. 21 accounts across 7 types with full cross-type interactions including open house and firesale pipeline.");
  console.log("\nPassword for all: Demo2025!");
  console.log("\nAccounts by type:");
  (Object.keys(INDICES) as Array<keyof typeof INDICES>).forEach((key) => {
    const emails = INDICES[key].map((i) => MOCK_USERS[i].email);
    console.log(`  ${key}: ${emails.join(", ")}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
