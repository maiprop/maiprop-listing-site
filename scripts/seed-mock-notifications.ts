/**
 * Seed mock in-app notifications for demo users.
 * Run: npx tsx scripts/seed-mock-notifications.ts
 * Requires: SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from "@supabase/supabase-js";
import { getSeedEnv } from "./_seed-env";

const { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY } = getSeedEnv();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

async function main() {
  console.log("🔍  Looking up demo user accounts...");
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const allUsers = authUsers?.users ?? [];

  const targetEmails = [
    "buyer1@maiprop.demo",
    "buyer2@maiprop.demo",
    "seller1@maiprop.demo",
    "agent1@maiprop.demo",
    "investor1@maiprop.demo",
  ];
  const byEmail = new Map(allUsers.map(u => [u.email, u.id]));

  const targets = targetEmails
    .map(e => ({ email: e, id: byEmail.get(e) }))
    .filter((u): u is { email: string; id: string } => !!u.id);

  if (targets.length === 0) {
    console.error("❌  No demo users found. Run seed-mock-users.ts first.");
    process.exit(1);
  }

  const notifications: {
    user_id: string;
    title: string;
    body: string;
    type: string;
    read: boolean;
    created_at: string;
  }[] = [];

  for (const user of targets) {
    notifications.push(
      // Quick sale / firesale
      {
        user_id: user.id,
        title: "🔥 New Quick Sale deal in Kolonaki",
        body: "A 2-bedroom apartment at 14 Skoufa St has been added to the Quick Sale pipeline — 28% below market. Express interest before it closes.",
        type: "quick_sale",
        read: false,
        created_at: hoursAgo(1),
      },
      // Auction alert
      {
        user_id: user.id,
        title: "⚖️ Auction alert: Villa in Kifisia this Thursday",
        body: "A 4-bedroom villa (Kifisia, court ref: ATH-2024-0812) has a starting bid of €620,000 — matches your saved search.",
        type: "auction_alert",
        read: false,
        created_at: hoursAgo(3),
      },
      // Viewing confirmation
      {
        user_id: user.id,
        title: "✅ Viewing confirmed — Glyfada Apt",
        body: "Your viewing for '2BR Apartment – Glyfada Riviera' is confirmed for Saturday at 11:00. The agent will meet you on-site.",
        type: "viewing",
        read: false,
        created_at: hoursAgo(6),
      },
      // Open house reminder
      {
        user_id: user.id,
        title: "🚪 Open House tomorrow: Vouliagmeni Villa",
        body: "You are registered for the Vouliagmeni seafront villa open house tomorrow at 14:00. Bring ID and proof of funds.",
        type: "open_house",
        read: true,
        created_at: hoursAgo(18),
      },
      // Message
      {
        user_id: user.id,
        title: "💬 New message from Nikos (Agent)",
        body: "Hi! I've received your enquiry about Kolonaki Residences. I have one 3-bed unit remaining with south-facing balcony. When are you free for a call?",
        type: "message",
        read: true,
        created_at: hoursAgo(26),
      },
      // Second quick sale (read)
      {
        user_id: user.id,
        title: "🔥 Quick Sale closed — Nea Smyrni",
        body: "The Quick Sale listing you expressed interest in (Nea Smyrni, 85m²) has been closed. Another buyer has been selected.",
        type: "quick_sale",
        read: true,
        created_at: hoursAgo(72),
      },
      // General / system
      {
        user_id: user.id,
        title: "✨ Saved search match: 3 new listings in Athens",
        body: "Your saved search \"2BR under €250k in Athens\" has 3 new matches. Check them before they're gone.",
        type: "general",
        read: true,
        created_at: hoursAgo(96),
      },
    );
  }

  console.log(`📨  Inserting ${notifications.length} notifications for ${targets.length} users...`);
  const { error } = await supabase.from("notifications").insert(notifications);
  if (error) {
    console.error("❌  Error:", error.message);
    process.exit(1);
  }
  console.log(`✅  ${notifications.length} notifications seeded`);
  console.log(`    ${notifications.filter(n => !n.read).length} unread, ${notifications.filter(n => n.read).length} read`);
}

main().catch(err => { console.error(err); process.exit(1); });
