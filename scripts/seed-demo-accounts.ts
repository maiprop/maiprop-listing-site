/**
 * seed-demo-accounts.ts
 * Creates one free + one Pro account for every user type on the platform.
 *
 * Run: npx tsx scripts/seed-demo-accounts.ts
 * Requires: SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Password for all accounts: Demo2025!
 *
 * Account matrix:
 *   buyer              free / pro
 *   seller/landlord    free / pro
 *   agent              free / pro
 *   developer          free / pro
 *   professional       free / pro  (architect, lawyer, civil engineer, notary, property manager)
 *   investor           private-tier / institutional-tier  (always Pro — no free investor)
 *   institutional      institutional-tier                 (always Pro — no free institutional)
 *
 * Pro is simulated by setting profiles.subscription_product_id = STRIPE_PRO_PRODUCT_ID.
 * Investor tiers are seeded via investor_subscriptions table.
 * Professional Pro also sets professionals.subscription_tier = "pro".
 *
 * The shared-password demo admin is excluded by default. Set
 * INCLUDE_DEMO_ADMIN=yes only for private, non-production admin testing.
 *
 * Preferred browser-test env keys map to this seeded matrix:
 *   E2E_BUYER_FREE_EMAIL / E2E_BUYER_FREE_PASSWORD
 *   E2E_BUYER_PRO_EMAIL / E2E_BUYER_PRO_PASSWORD
 *   E2E_SELLER_PRO_EMAIL / E2E_SELLER_PRO_PASSWORD
 *   E2E_AGENT_PRO_EMAIL / E2E_AGENT_PRO_PASSWORD
 *   E2E_DEVELOPER_PRO_EMAIL / E2E_DEVELOPER_PRO_PASSWORD
 *   E2E_INVESTOR_PRIVATE_EMAIL
 *   E2E_INVESTOR_INSTITUTIONAL_EMAIL
 *   E2E_ADMIN_EMAIL
 *   E2E_PROFESSIONAL_ARCHITECT_EMAIL
 *   E2E_PROFESSIONAL_LAWYER_EMAIL
 *   E2E_PROFESSIONAL_VALUER_EMAIL
 *   E2E_DEMO_PASSWORD
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
const PRO_PRODUCT_ID = process.env.VITE_STRIPE_PRO_PRODUCT_ID ?? "prod_U8SJbk3fZQ3xgD";

assertNotProduction(SUPABASE_URL, "seed-demo-accounts.ts");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "Demo2025!";

// ── Account definitions ───────────────────────────────────────────────────────

interface AccountDef {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  participantType: string;
  isPro: boolean;
  investorMode?: boolean;
  investorTier?: "private" | "institutional";
  professionalCategory?: string;
  professionalTitle?: string;
  city: string;
  bio?: string;
}

const INCLUDE_DEMO_ADMIN = process.env.INCLUDE_DEMO_ADMIN === "yes";

const BASE_ACCOUNTS: AccountDef[] = [

  // ── Buyers ─────────────────────────────────────────────────────────────────
  {
    email: "buyer.free@maiprop.demo",
    firstName: "Yannis", lastName: "FreeBuyer",
    role: "individual", participantType: "buyer",
    isPro: false, city: "Athens",
    bio: "First-time buyer, free plan. Can browse listings and book viewings.",
  },
  {
    email: "buyer.pro@maiprop.demo",
    firstName: "Niki", lastName: "ProBuyer",
    role: "individual", participantType: "buyer",
    isPro: true, city: "Athens",
    bio: "Active buyer on Pro — full professional directory access, advanced search.",
  },

  // ── Sellers / Landlords ────────────────────────────────────────────────────
  {
    email: "seller.free@maiprop.demo",
    firstName: "Kostas", lastName: "FreeSeller",
    role: "seller_landlord", participantType: "seller",
    isPro: false, city: "Thessaloniki",
    bio: "Private owner selling an apartment. Free plan (2-listing limit).",
  },
  {
    email: "seller.pro@maiprop.demo",
    firstName: "Maria", lastName: "ProSeller",
    role: "seller_landlord", participantType: "seller",
    isPro: true, city: "Glyfada",
    bio: "Multi-property landlord on Pro — unlimited listings, analytics, featured ads.",
  },

  // ── Agents ────────────────────────────────────────────────────────────────
  {
    email: "agent.free@maiprop.demo",
    firstName: "Dimitris", lastName: "FreeAgent",
    role: "agent", participantType: "agent",
    isPro: false, city: "Piraeus",
    bio: "Licensed agent, free tier. Limited listings, basic dashboard.",
  },
  {
    email: "agent.pro@maiprop.demo",
    firstName: "Elena", lastName: "ProAgent",
    role: "agent", participantType: "agent",
    isPro: true, city: "Athens",
    bio: "Full-service agent on Pro — CRM, unlimited listings, featured placement, AI tools.",
  },

  // ── Developers ────────────────────────────────────────────────────────────
  {
    email: "developer.free@maiprop.demo",
    firstName: "Panos", lastName: "FreeDeveloper",
    role: "developer", participantType: "developer",
    isPro: false, city: "Patras",
    bio: "Small developer (1–2 projects). Free plan.",
  },
  {
    email: "developer.pro@maiprop.demo",
    firstName: "Nikos", lastName: "ProDeveloper",
    role: "developer", participantType: "developer",
    isPro: true, city: "Athens",
    bio: "Major Athens developer on Pro — unlimited projects, pre-sale, bulk leads.",
  },

  // ── Investors ──────────────────────────────────────────────────────────────
  // Investor role always implies Pro — no free tier exists for investors.
  {
    email: "investor.private@maiprop.demo",
    firstName: "Christos", lastName: "PrivateInvestor",
    role: "investor", participantType: "investor",
    isPro: true, investorMode: true, investorTier: "private", city: "Athens",
    bio: "Private investor — Pro + active private subscription. Quick sale pipeline & auction alerts.",
  },
  {
    email: "investor.institutional@maiprop.demo",
    firstName: "Alpha", lastName: "Fund",
    role: "institutional", participantType: "investor",
    isPro: true, investorMode: true, investorTier: "institutional", city: "London",
    bio: "Institutional fund — Pro + institutional subscription. Full deal pipeline, bulk acquisition, NDA access.",
  },

  // ── Professionals — Architect ──────────────────────────────────────────────
  {
    email: "architect.free@maiprop.demo",
    firstName: "Stella", lastName: "FreeArchitect",
    role: "professional", participantType: "professional",
    isPro: false, city: "Athens",
    professionalCategory: "architect",
    professionalTitle: "Licensed Architect",
    bio: "Registered architect. Free directory listing, no Pro features.",
  },
  {
    email: "architect.pro@maiprop.demo",
    firstName: "Andreas", lastName: "ProArchitect",
    role: "professional", participantType: "professional",
    isPro: true, city: "Thessaloniki",
    professionalCategory: "architect",
    professionalTitle: "Senior Architect",
    bio: "Senior architect on Pro — booking page, video consults, priority directory placement.",
  },

  // ── Professionals — Lawyer ─────────────────────────────────────────────────
  {
    email: "lawyer.free@maiprop.demo",
    firstName: "Anna", lastName: "FreeLawyer",
    role: "professional", participantType: "professional",
    isPro: false, city: "Athens",
    professionalCategory: "lawyer",
    professionalTitle: "Real Estate Lawyer",
    bio: "Property lawyer on free plan. Basic directory listing.",
  },
  {
    email: "lawyer.pro@maiprop.demo",
    firstName: "Michalis", lastName: "ProLawyer",
    role: "professional", participantType: "professional",
    isPro: true, city: "Athens",
    professionalCategory: "lawyer",
    professionalTitle: "Real Estate Lawyer",
    bio: "Senior conveyancing lawyer on Pro — featured listing, AI lead match.",
  },

  // ── Professionals — Civil Engineer ─────────────────────────────────────────
  {
    email: "engineer.free@maiprop.demo",
    firstName: "Giannis", lastName: "FreeEngineer",
    role: "professional", participantType: "professional",
    isPro: false, city: "Volos",
    professionalCategory: "civil_engineer",
    professionalTitle: "Civil Engineer",
    bio: "Structural engineer on free plan.",
  },
  {
    email: "engineer.pro@maiprop.demo",
    firstName: "Fotini", lastName: "ProEngineer",
    role: "professional", participantType: "professional",
    isPro: true, city: "Athens",
    professionalCategory: "civil_engineer",
    professionalTitle: "Senior Civil Engineer",
    bio: "Structural & seismic specialist on Pro — verified, video consults available.",
  },

  // ── Professionals — Notary ─────────────────────────────────────────────────
  {
    email: "notary.free@maiprop.demo",
    firstName: "Eleni", lastName: "FreeNotary",
    role: "professional", participantType: "professional",
    isPro: false, city: "Patras",
    professionalCategory: "notary",
    professionalTitle: "Notary Public",
    bio: "Notary on free plan. Basic directory listing.",
  },
  {
    email: "notary.pro@maiprop.demo",
    firstName: "Sofia", lastName: "ProNotary",
    role: "professional", participantType: "professional",
    isPro: true, city: "Athens",
    professionalCategory: "notary",
    professionalTitle: "Notary Public",
    bio: "High-volume notary on Pro — featured, verified badge, video available.",
  },

  // ── Professionals — Property Manager ──────────────────────────────────────
  {
    email: "manager.free@maiprop.demo",
    firstName: "Tasos", lastName: "FreeManager",
    role: "professional", participantType: "professional",
    isPro: false, city: "Heraklion",
    professionalCategory: "property_manager",
    professionalTitle: "Property Manager",
    bio: "Property manager on free plan — small portfolio.",
  },
  {
    email: "manager.pro@maiprop.demo",
    firstName: "Katerina", lastName: "ProManager",
    role: "professional", participantType: "professional",
    isPro: true, city: "Kifisia",
    professionalCategory: "property_manager",
    professionalTitle: "Property Manager",
    bio: "Managing 40+ units across Athens. Pro — CRM, tenant portal, analytics.",
  },

  // ── Professionals — Financial Advisor ─────────────────────────────────────
  {
    email: "advisor.pro@maiprop.demo",
    firstName: "Petros", lastName: "ProAdvisor",
    role: "professional", participantType: "professional",
    isPro: true, city: "Athens",
    professionalCategory: "financial_advisor",
    professionalTitle: "Financial Advisor",
    bio: "Mortgage & investment advisor on Pro — AI client matching.",
  },

  // ── Professionals — Valuer ─────────────────────────────────────────────────
  {
    email: "valuer.pro@maiprop.demo",
    firstName: "Irini", lastName: "ProValuer",
    role: "professional", participantType: "professional",
    isPro: true, city: "Athens",
    professionalCategory: "valuer",
    professionalTitle: "Chartered Property Valuer",
    bio: "RICS-aligned valuer on Pro — mortgage valuations, investment analysis.",
  },

];

const DEMO_ADMIN_ACCOUNT: AccountDef = {
  email: "admin@maiprop.demo",
  firstName: "Platform", lastName: "Admin",
  role: "admin", participantType: "admin",
  isPro: true, city: "Athens",
  bio: "Platform administrator - full access to admin panel, listings, and user management.",
};

const ACCOUNTS: AccountDef[] = INCLUDE_DEMO_ADMIN
  ? [...BASE_ACCOUNTS, DEMO_ADMIN_ACCOUNT]
  : BASE_ACCOUNTS;

// ── Helpers ───────────────────────────────────────────────────────────────────

let _userCache: Map<string, string> | null = null;

async function getUserCache(): Promise<Map<string, string>> {
  if (_userCache) return _userCache;
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  _userCache = new Map(data?.users?.map(u => [u.email!, u.id]) ?? []);
  return _userCache;
}

async function getOrCreateUser(acc: AccountDef): Promise<{ id: string; isNew: boolean } | null> {
  const cache = await getUserCache();
  const existingId = cache.get(acc.email);
  if (existingId) return { id: existingId, isNew: false };

  const { data, error } = await supabase.auth.admin.createUser({
    email: acc.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: acc.firstName, last_name: acc.lastName },
  });
  if (error) { console.error(`\n    ✗ create user:`, error.message); return null; }
  cache.set(acc.email, data.user.id);
  return { id: data.user.id, isNew: true };
}

async function setRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase.rpc("seed_grant_role" as any, {
    user_ids: [userId],
    target_role: role,
  });
  if (error) console.error(`\n    ✗ seed_grant_role(${role}):`, error.message);
}

async function setProfile(userId: string, acc: AccountDef): Promise<void> {
  const update: Record<string, unknown> = {
    first_name: acc.firstName,
    last_name: acc.lastName,
    display_name: `${acc.firstName} ${acc.lastName}`,
    city: acc.city,
    bio: acc.bio ?? null,
    participant_type: acc.participantType,
    investor_mode: acc.investorMode ?? false,
    subscription_product_id: acc.isPro ? PRO_PRODUCT_ID : null,
  };
  if (acc.role === "admin") update.is_platform_admin = true;
  const { error } = await supabase.from("profiles").update(update as any).eq("user_id", userId);
  if (error) console.error(`\n    ✗ profile update:`, error.message);
}

async function setInvestorSubscription(userId: string, tier: "private" | "institutional"): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  const { error } = await supabase.from("investor_subscriptions").upsert(
    { user_id: userId, tier, status: "active", expires_at: expiresAt.toISOString() },
    { onConflict: "user_id" }
  );
  if (error) console.error(`\n    ✗ investor_subscription(${tier}):`, error.message);
}

async function ensureProfessional(userId: string, acc: AccountDef): Promise<void> {
  if (!acc.professionalCategory || !acc.professionalTitle) return;
  const { error } = await supabase.from("professionals").upsert(
    {
      user_id: userId,
      category: acc.professionalCategory as any,
      title: acc.professionalTitle,
      display_name: `${acc.firstName} ${acc.lastName}`,
      city: acc.city,
      bio: acc.bio ?? null,
      verified: acc.isPro,
      subscription_tier: acc.isPro ? "pro" : "free",
      experience_years: acc.isPro ? 12 : 3,
      languages: ["Greek", "English"],
      specialties: acc.isPro
        ? ["Residential", "Commercial", "Golden Visa", "Investment"]
        : ["Residential"],
      hourly_rate: acc.isPro ? 120 : null,
    } as any,
    { onConflict: "user_id" }
  );
  if (error) console.error(`\n    ✗ professionals upsert:`, error.message);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSeeding ${ACCOUNTS.length} demo accounts...\n`);

  let created = 0, existing = 0, failed = 0;

  for (const acc of ACCOUNTS) {
    const tierLabel = acc.investorTier
      ? `${acc.role}:${acc.investorTier}`
      : `${acc.role}/${acc.isPro ? "pro" : "free"}`;

    process.stdout.write(`  ${acc.email.padEnd(46)} ${tierLabel} ... `);

    const user = await getOrCreateUser(acc);
    if (!user) { console.log("✗"); failed++; continue; }

    if (acc.role !== "individual") await setRole(user.id, acc.role);
    await setProfile(user.id, acc);
    if (acc.investorTier) await setInvestorSubscription(user.id, acc.investorTier);
    if (acc.professionalCategory) await ensureProfessional(user.id, acc);

    if (user.isNew) { console.log("✓ created"); created++; }
    else { console.log("✓ updated"); existing++; }
  }

  // ── Print credentials table ───────────────────────────────────────────────
  console.log("\n" + "═".repeat(76));
  console.log("  DEMO ACCOUNT CREDENTIALS");
  console.log("═".repeat(76));
  console.log(`  Password (all accounts): ${PASSWORD}`);
  console.log("═".repeat(76));

  const sections: { heading: string; emails: string[] }[] = [
    { heading: "BUYERS", emails: ["buyer.free@maiprop.demo", "buyer.pro@maiprop.demo"] },
    { heading: "SELLERS / LANDLORDS", emails: ["seller.free@maiprop.demo", "seller.pro@maiprop.demo"] },
    { heading: "AGENTS", emails: ["agent.free@maiprop.demo", "agent.pro@maiprop.demo"] },
    { heading: "DEVELOPERS", emails: ["developer.free@maiprop.demo", "developer.pro@maiprop.demo"] },
    { heading: "INVESTORS", emails: ["investor.private@maiprop.demo", "investor.institutional@maiprop.demo"] },
    { heading: "PROFESSIONALS — ARCHITECT", emails: ["architect.free@maiprop.demo", "architect.pro@maiprop.demo"] },
    { heading: "PROFESSIONALS — LAWYER", emails: ["lawyer.free@maiprop.demo", "lawyer.pro@maiprop.demo"] },
    { heading: "PROFESSIONALS — CIVIL ENGINEER", emails: ["engineer.free@maiprop.demo", "engineer.pro@maiprop.demo"] },
    { heading: "PROFESSIONALS — NOTARY", emails: ["notary.free@maiprop.demo", "notary.pro@maiprop.demo"] },
    { heading: "PROFESSIONALS — PROPERTY MANAGER", emails: ["manager.free@maiprop.demo", "manager.pro@maiprop.demo"] },
    { heading: "PROFESSIONALS — FINANCIAL ADVISOR", emails: ["advisor.pro@maiprop.demo"] },
    { heading: "PROFESSIONALS — VALUER", emails: ["valuer.pro@maiprop.demo"] },
  ];
  if (INCLUDE_DEMO_ADMIN) {
    sections.push({ heading: "PLATFORM ADMIN", emails: ["admin@maiprop.demo"] });
  }

  const accountByEmail = new Map(ACCOUNTS.map(a => [a.email, a]));

  for (const section of sections) {
    console.log(`\n  ${section.heading}`);
    for (const email of section.emails) {
      const acc = accountByEmail.get(email);
      if (!acc) continue;
      const tier = acc.investorTier
        ? `investor:${acc.investorTier}`
        : acc.isPro ? "Pro ✦" : "Free";
      console.log(`    ${email.padEnd(46)} ${tier}`);
    }
  }

  console.log("\n" + "═".repeat(76));
  console.log(`  Total: ${ACCOUNTS.length} | Created: ${created} | Updated: ${existing} | Failed: ${failed}`);
  console.log("═".repeat(76) + "\n");
}

main().catch(e => { console.error(e); process.exit(1); });
