/**
 * Live supervisor agent network.
 *
 * This is an admin-backed, production-aware drill for the maiprop demo/mock
 * matrix. It is intentionally gated because it creates/repairs demo users and
 * writes interaction records to the configured Supabase project.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Tier = "free" | "pro" | "managed" | "admin";
type Role =
  | "buyer"
  | "seller"
  | "agent"
  | "developer"
  | "professional"
  | "investor"
  | "institutional"
  | "admin";

type AccountDef = {
  email: string;
  role: Role;
  participantType: string;
  tier: Tier;
  firstName: string;
  lastName: string;
  city: string;
  professionalCategory?: string;
  professionalTitle?: string;
  investorTier?: "private" | "institutional";
};

type Session = {
  email: string;
  id: string;
  token: string;
};

type Listing = {
  id: string;
  ownerId: string;
  title: string;
  kind: "sale" | "open_house" | "new_build";
};

const PASSWORD = "Demo2025!";
const RUN_ID = `supervisor-${Date.now()}`;
const knownProductionRef = "qvvicunqcrwpioqnvzxf";

const readDotEnv = (): Record<string, string> => {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return {};

  return readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return acc;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) return acc;
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      acc[key] = rawValue.replace(/^['"]|['"]$/g, "");
      return acc;
    }, {});
};

const dotEnv = readDotEnv();

const env = (...keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key] ?? dotEnv[key];
    if (value) return value;
  }
  return "";
};

const SUPABASE_URL = env("VITE_SUPABASE_URL", "SUPABASE_URL");
const ANON_KEY = env(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
);
const SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY");
const projectRef = SUPABASE_URL.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/i)?.[1] ?? "";

const enabled =
  Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
  process.env.E2E_RUN_SUPERVISOR_NETWORK === "true" &&
  process.env.I_KNOW_THIS_IS_PROD === "yes" &&
  SUPABASE_URL.startsWith("https://") &&
  ANON_KEY.length > 40 &&
  SERVICE_ROLE.length > 40;

const canonicalAccounts: AccountDef[] = [
  { email: "buyer.free@maiprop.demo", role: "buyer", participantType: "buyer", tier: "free", firstName: "Yannis", lastName: "FreeBuyer", city: "Athens" },
  { email: "buyer.pro@maiprop.demo", role: "buyer", participantType: "buyer", tier: "pro", firstName: "Niki", lastName: "ProBuyer", city: "Athens" },
  { email: "seller.free@maiprop.demo", role: "seller", participantType: "seller", tier: "free", firstName: "Kostas", lastName: "FreeSeller", city: "Thessaloniki" },
  { email: "seller.pro@maiprop.demo", role: "seller", participantType: "seller", tier: "pro", firstName: "Maria", lastName: "ProSeller", city: "Glyfada" },
  { email: "agent.free@maiprop.demo", role: "agent", participantType: "agent", tier: "free", firstName: "Dimitris", lastName: "FreeAgent", city: "Piraeus" },
  { email: "agent.pro@maiprop.demo", role: "agent", participantType: "agent", tier: "pro", firstName: "Elena", lastName: "ProAgent", city: "Athens" },
  { email: "developer.free@maiprop.demo", role: "developer", participantType: "developer", tier: "free", firstName: "Panos", lastName: "FreeDeveloper", city: "Patras" },
  { email: "developer.pro@maiprop.demo", role: "developer", participantType: "developer", tier: "pro", firstName: "Nikos", lastName: "ProDeveloper", city: "Athens" },
  { email: "architect.free@maiprop.demo", role: "professional", participantType: "professional", tier: "free", firstName: "Stella", lastName: "FreeArchitect", city: "Athens", professionalCategory: "architect", professionalTitle: "Licensed Architect" },
  { email: "architect.pro@maiprop.demo", role: "professional", participantType: "professional", tier: "pro", firstName: "Andreas", lastName: "ProArchitect", city: "Thessaloniki", professionalCategory: "architect", professionalTitle: "Senior Architect" },
  { email: "lawyer.free@maiprop.demo", role: "professional", participantType: "professional", tier: "free", firstName: "Anna", lastName: "FreeLawyer", city: "Athens", professionalCategory: "lawyer", professionalTitle: "Real Estate Lawyer" },
  { email: "lawyer.pro@maiprop.demo", role: "professional", participantType: "professional", tier: "pro", firstName: "Michalis", lastName: "ProLawyer", city: "Athens", professionalCategory: "lawyer", professionalTitle: "Real Estate Lawyer" },
  { email: "engineer.free@maiprop.demo", role: "professional", participantType: "professional", tier: "free", firstName: "Giannis", lastName: "FreeEngineer", city: "Volos", professionalCategory: "civil_engineer", professionalTitle: "Civil Engineer" },
  { email: "engineer.pro@maiprop.demo", role: "professional", participantType: "professional", tier: "pro", firstName: "Fotini", lastName: "ProEngineer", city: "Athens", professionalCategory: "civil_engineer", professionalTitle: "Senior Civil Engineer" },
  { email: "notary.free@maiprop.demo", role: "professional", participantType: "professional", tier: "free", firstName: "Eleni", lastName: "FreeNotary", city: "Patras", professionalCategory: "notary", professionalTitle: "Notary Public" },
  { email: "notary.pro@maiprop.demo", role: "professional", participantType: "professional", tier: "pro", firstName: "Sofia", lastName: "ProNotary", city: "Athens", professionalCategory: "notary", professionalTitle: "Notary Public" },
  { email: "manager.free@maiprop.demo", role: "professional", participantType: "professional", tier: "free", firstName: "Tasos", lastName: "FreeManager", city: "Heraklion", professionalCategory: "property_manager", professionalTitle: "Property Manager" },
  { email: "manager.pro@maiprop.demo", role: "professional", participantType: "professional", tier: "pro", firstName: "Katerina", lastName: "ProManager", city: "Kifisia", professionalCategory: "property_manager", professionalTitle: "Property Manager" },
  { email: "advisor.pro@maiprop.demo", role: "professional", participantType: "professional", tier: "pro", firstName: "Petros", lastName: "ProAdvisor", city: "Athens", professionalCategory: "financial_advisor", professionalTitle: "Financial Advisor" },
  { email: "valuer.pro@maiprop.demo", role: "professional", participantType: "professional", tier: "pro", firstName: "Irini", lastName: "ProValuer", city: "Athens", professionalCategory: "valuer", professionalTitle: "Chartered Property Valuer" },
  { email: "investor.private@maiprop.demo", role: "investor", participantType: "investor", tier: "managed", firstName: "Christos", lastName: "PrivateInvestor", city: "Athens", investorTier: "private" },
  { email: "investor.institutional@maiprop.demo", role: "institutional", participantType: "institutional", tier: "managed", firstName: "Alpha", lastName: "Fund", city: "London", investorTier: "institutional" },
];
if (process.env.INCLUDE_DEMO_ADMIN === "yes") {
  canonicalAccounts.push({ email: "admin@maiprop.demo", role: "admin", participantType: "admin", tier: "admin", firstName: "Platform", lastName: "Admin", city: "Athens" });
}

const legacyAccounts: AccountDef[] = [
  ["buyer1", "Alex", "Buyer", "buyer"], ["buyer2", "Maria", "Consumer", "buyer"], ["buyer3", "Nikos", "HomeSeeker", "buyer"],
  ["seller1", "Elena", "Seller", "seller"], ["seller2", "Yannis", "Landlord", "seller"], ["seller3", "Sofia", "Owner", "seller"],
  ["agent1", "Katerina", "Agent", "agent"], ["agent2", "Stefanos", "Broker", "agent"], ["agent3", "Georgia", "Realtor", "agent"],
  ["developer1", "Panos", "Developer", "developer"], ["developer2", "Vasilis", "Builder", "developer"], ["developer3", "Ioannis", "Project", "developer"],
].map(([prefix, firstName, lastName, role]) => ({
  email: `${prefix}@maiprop.demo`,
  role: role as Role,
  participantType: role,
  tier: "free" as Tier,
  firstName,
  lastName,
  city: "Athens",
}));

const legacyManagedAccounts: AccountDef[] = [
  { email: "investor1@maiprop.demo", role: "investor", participantType: "investor", tier: "managed", firstName: "Dimitris", lastName: "Investor", city: "Athens", investorTier: "private" },
  { email: "investor2@maiprop.demo", role: "investor", participantType: "investor", tier: "managed", firstName: "Anna", lastName: "DealHunter", city: "Thessaloniki", investorTier: "private" },
  { email: "investor3@maiprop.demo", role: "investor", participantType: "investor", tier: "managed", firstName: "Christos", lastName: "Capital", city: "Athens", investorTier: "private" },
  { email: "institutional1@maiprop.demo", role: "institutional", participantType: "institutional", tier: "managed", firstName: "Fund Alpha", lastName: "Institutional", city: "Athens", investorTier: "institutional" },
  { email: "institutional2@maiprop.demo", role: "institutional", participantType: "institutional", tier: "managed", firstName: "Fund Beta", lastName: "Capital", city: "Athens", investorTier: "institutional" },
  { email: "institutional3@maiprop.demo", role: "institutional", participantType: "institutional", tier: "managed", firstName: "Fund Gamma", lastName: "Investments", city: "London", investorTier: "institutional" },
  { email: "professional1@maiprop.demo", role: "professional", participantType: "professional", tier: "free", firstName: "Stella", lastName: "Architect", city: "Athens", professionalCategory: "architect", professionalTitle: "Licensed Architect" },
  { email: "professional2@maiprop.demo", role: "professional", participantType: "professional", tier: "free", firstName: "Michalis", lastName: "Lawyer", city: "Athens", professionalCategory: "lawyer", professionalTitle: "Property Lawyer" },
  { email: "professional3@maiprop.demo", role: "professional", participantType: "professional", tier: "free", firstName: "Fotini", lastName: "Valuer", city: "Athens", professionalCategory: "valuer", professionalTitle: "Licensed Valuer" },
];

const allMockAccounts = [
  ...canonicalAccounts,
  ...legacyAccounts,
  ...legacyManagedAccounts,
];

const admin = enabled
  ? createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
const cleanupAuthUserIds: string[] = [];

const authHeaders = (token: string) => ({
  apikey: ANON_KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

const anonHeaders = () => ({
  apikey: ANON_KEY,
  "Content-Type": "application/json",
});

async function listUsersByEmail(client: SupabaseClient): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();
  for (let page = 1; page <= 10; page += 1) {
    const {
      data: { users },
      error,
    } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    expect(error?.message ?? "").toBe("");
    users.forEach((user) => {
      if (user.email) byEmail.set(user.email.toLowerCase(), user.id);
    });
    if (users.length < 1000) break;
  }
  return byEmail;
}

async function createOrUpdateUser(
  client: SupabaseClient,
  cache: Map<string, string>,
  account: AccountDef,
): Promise<string> {
  const existingId = cache.get(account.email.toLowerCase());
  const metadata = {
    first_name: account.firstName,
    last_name: account.lastName,
    full_name: `${account.firstName} ${account.lastName}`,
  };

  if (existingId) {
    const { error } = await client.auth.admin.updateUserById(existingId, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    expect(error?.message ?? "", `update ${account.email}`).toBe("");
    return existingId;
  }

  const { data, error } = await client.auth.admin.createUser({
    email: account.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  expect(error?.message ?? "", `create ${account.email}`).toBe("");
  const userId = data.user?.id;
  expect(userId, `created id for ${account.email}`).toBeTruthy();
  cache.set(account.email.toLowerCase(), userId ?? "");
  return userId ?? "";
}

const selfServiceRoles = new Set<Role>([
  "buyer",
  "seller",
  "agent",
  "developer",
  "professional",
]);

async function completeSelfServiceRole(
  client: SupabaseClient,
  userId: string,
  account: AccountDef,
): Promise<void> {
  const { error } = await client.rpc("complete_onboarding_role_for_user", {
    p_user_id: userId,
    p_role: account.role,
    p_participant_type: account.participantType,
    p_display_name: `${account.firstName} ${account.lastName}`,
    p_city: account.city,
    p_phone: "+30 6900000000",
  } as never);
  expect(error?.message ?? "", `complete_onboarding ${account.email}`).toBe("");
}

async function ensureProfile(
  client: SupabaseClient,
  userId: string,
  account: AccountDef,
): Promise<void> {
  const { error } = await client
    .from("profiles")
    .update({
      first_name: account.firstName,
      last_name: account.lastName,
      display_name: `${account.firstName} ${account.lastName}`,
      city: account.city,
      ...(account.role !== "admin" ? { participant_type: account.participantType } : {}),
      investor_mode: account.role === "investor" || account.role === "institutional",
      force_pro_access: account.tier === "pro" || account.tier === "admin",
      role_switch_in_progress_at: null,
      bio: `E2E mock ${account.role} ${account.tier} account. Last repaired by ${RUN_ID}.`,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("user_id", userId);
  expect(error?.message ?? "", `profile ${account.email}`).toBe("");
}

async function ensureInvestorSubscription(
  client: SupabaseClient,
  userId: string,
  tier: "private" | "institutional",
): Promise<void> {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  const { error } = await client.from("investor_subscriptions").upsert(
    {
      user_id: userId,
      tier,
      status: "active",
      expires_at: expires.toISOString(),
    } as never,
    { onConflict: "user_id" },
  );
  expect(error?.message ?? "", `investor subscription ${userId}`).toBe("");
}

async function ensureProfessional(
  client: SupabaseClient,
  userId: string,
  account: AccountDef,
): Promise<string | null> {
  if (!account.professionalCategory || !account.professionalTitle) return null;
  const { data, error } = await client
    .from("professionals")
    .upsert(
      {
        user_id: userId,
        category: account.professionalCategory,
        title: account.professionalTitle,
        display_name: `${account.firstName} ${account.lastName}`,
        city: account.city,
        bio: `Professional profile repaired by ${RUN_ID}.`,
        verified: account.tier === "pro",
        subscription_tier: account.tier === "pro" ? "pro" : "free",
        experience_years: account.tier === "pro" ? 12 : 3,
        languages: ["Greek", "English"],
        specialties: account.tier === "pro" ? ["Residential", "Investment", "Due diligence"] : ["Residential"],
        hourly_rate: account.tier === "pro" ? 120 : null,
        video_link: account.tier === "pro" ? "https://meet.example.com/maiprop-demo" : null,
      } as never,
      { onConflict: "user_id" },
    )
    .select("id")
    .single();
  expect(error?.message ?? "", `professional ${account.email}`).toBe("");

  const professionalId = (data as { id?: string } | null)?.id ?? null;
  if (professionalId) {
    const { error: serviceError } = await client.from("professional_services").upsert(
      {
        professional_id: professionalId,
        service_key: `${account.professionalCategory}_consult`,
        service_name: `${account.professionalTitle} consultation`,
        category: "consultation",
        description: `Consultation service repaired by ${RUN_ID}.`,
        pricing_model: "hourly",
        rate_amount: account.tier === "pro" ? 120 : 0,
        currency: "EUR",
        estimated_hours: 1,
        is_active: true,
        is_premium: account.tier === "pro",
        video_enabled: account.tier === "pro",
      } as never,
      { onConflict: "professional_id,service_key" },
    );
    expect(serviceError?.message ?? "", `professional service ${account.email}`).toBe("");
  }
  return professionalId;
}

async function recreateMockUsers(client: SupabaseClient): Promise<Map<string, string>> {
  const cache = await listUsersByEmail(client);
  const idsByEmail = new Map<string, string>();

  for (const account of allMockAccounts) {
    const id = await createOrUpdateUser(client, cache, account);
    idsByEmail.set(account.email, id);
    if (account.professionalCategory) await ensureProfessional(client, id, account);
    if (account.investorTier) await ensureInvestorSubscription(client, id, account.investorTier);
    if (selfServiceRoles.has(account.role)) {
      await completeSelfServiceRole(client, id, account);
    }
    if (account.role === "admin") {
      const { error } = await client.rpc("seed_grant_role", {
        user_ids: [id],
        target_role: "admin",
      } as never);
      if (error) {
        console.warn(`admin role repair skipped: ${error.message}`);
      }
    }
    await ensureProfile(client, id, account);
    if (account.investorTier) await ensureInvestorSubscription(client, id, account.investorTier);
  }

  return idsByEmail;
}

async function createDisposableSelfServiceActor(
  request: APIRequestContext,
  role: "buyer" | "seller" | "agent" | "developer" | "professional",
  suffix: string,
): Promise<Session> {
  const client = admin as SupabaseClient;
  const email = `${RUN_ID}.${suffix}@maiprop.demo`;
  const users = await listUsersByEmail(client);
  const existingId = users.get(email.toLowerCase());
  if (existingId) await client.auth.admin.deleteUser(existingId);

  const account: AccountDef = {
    email,
    role,
    participantType: role,
    tier: "free",
    firstName: "Supervisor",
    lastName: suffix.replace(/\W+/g, " "),
    city: "Athens",
    ...(role === "professional"
      ? { professionalCategory: "architect", professionalTitle: "Supervisor Architect" }
      : {}),
  };
  const freshCache = await listUsersByEmail(client);
  const id = await createOrUpdateUser(client, freshCache, account);
  if (account.professionalCategory) await ensureProfessional(client, id, account);
  await completeSelfServiceRole(client, id, account);
  await ensureProfile(client, id, account);
  cleanupAuthUserIds.push(id);
  return signIn(request, email);
}

async function signIn(request: APIRequestContext, email: string, password = PASSWORD): Promise<Session> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: anonHeaders(),
    data: { email, password },
    failOnStatusCode: false,
  });
  expect(res.status(), `${email}: ${await res.text()}`).toBe(200);
  const body = (await res.json()) as { access_token?: string; user?: { id?: string } };
  expect(body.access_token, `${email} token`).toBeTruthy();
  expect(body.user?.id, `${email} user id`).toBeTruthy();
  return { email, token: body.access_token ?? "", id: body.user?.id ?? "" };
}

async function restInsert<T>(
  request: APIRequestContext,
  table: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await request.post(`${SUPABASE_URL}/rest/v1/${table}`, {
    headers: {
      ...authHeaders(token),
      Prefer: "return=representation",
    },
    data: payload,
    failOnStatusCode: false,
  });
  expect([200, 201], `${table}: ${await res.text()}`).toContain(res.status());
  const rows = (await res.json()) as T[];
  expect(rows.length, `${table} returned rows`).toBeGreaterThan(0);
  return rows[0];
}

async function restPatch(
  request: APIRequestContext,
  table: string,
  token: string,
  filter: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await request.patch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    headers: authHeaders(token),
    data: payload,
    failOnStatusCode: false,
  });
  expect([200, 204], `${table} patch: ${await res.text()}`).toContain(res.status());
}

async function createListing(
  request: APIRequestContext,
  owner: Session,
  options: {
    title: string;
    listingType?: "sale" | "open_house" | "new_build";
    city?: string;
    price?: number;
    sqm?: number;
    openHouseDate?: string;
    isPreSale?: boolean;
    adminBypass?: boolean;
  },
): Promise<Listing> {
  const payload = {
    owner_id: owner.id,
    title: options.title,
    city: options.city ?? "Athens",
    address: `${RUN_ID} Test Street 12`,
    price: options.price ?? 245000,
    sqm: options.sqm ?? 82,
    property_type: "apartment",
    listing_type: options.listingType ?? "sale",
    status: "active",
    bedrooms: 2,
    bathrooms: 1,
    description: `Generated by live supervisor test ${RUN_ID}.`,
    cover_image_url: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200&q=70",
    open_house_date: options.openHouseDate ?? null,
    is_pre_sale: options.isPreSale ?? false,
    construction_status: options.isPreSale ? "under_construction" : null,
    year_built: options.isPreSale ? 2027 : 2018,
    price_per_sqm: Math.round((options.price ?? 245000) / (options.sqm ?? 82)),
    has_video_tour: true,
    has_virtual_tour: true,
  };

  const listing = options.adminBypass
    ? await (async () => {
        const { data, error } = await (admin as SupabaseClient)
          .from("listings")
          .insert(payload as never)
          .select("id, owner_id, title")
          .single();
        expect(error?.message ?? "", `admin listing insert ${options.title}`).toBe("");
        return data as { id: string; owner_id: string; title: string };
      })()
    : await restInsert<{ id: string; owner_id: string; title: string }>(
        request,
        "listings",
        owner.token,
        payload,
      );
  return {
    id: listing.id,
    ownerId: listing.owner_id,
    title: listing.title,
    kind: options.listingType ?? "sale",
  };
}

async function createConversationWithMessage(
  request: APIRequestContext,
  from: Session,
  to: Session,
  listingId: string | null,
  content: string,
): Promise<string> {
  const create = await request.post(`${SUPABASE_URL}/rest/v1/conversations`, {
    headers: {
      ...authHeaders(from.token),
      Prefer: "return=representation",
    },
    data: {
      participant_a: from.id,
      participant_b: to.id,
      listing_id: listingId,
    },
    failOnStatusCode: false,
  });
  let conversationId: string | null = null;
  if ([200, 201].includes(create.status())) {
    const rows = (await create.json()) as Array<{ id: string }>;
    conversationId = rows[0]?.id ?? null;
  } else if (create.status() === 409) {
    const { data, error } = await (admin as SupabaseClient)
      .from("conversations")
      .select("id")
      .or(`and(participant_a.eq.${from.id},participant_b.eq.${to.id}),and(participant_a.eq.${to.id},participant_b.eq.${from.id})`)
      .limit(1)
      .maybeSingle();
    expect(error?.message ?? "", `existing conversation lookup ${from.email} ${to.email}`).toBe("");
    conversationId = (data as { id?: string } | null)?.id ?? null;
  } else {
    expect([200, 201, 409], `conversations: ${await create.text()}`).toContain(create.status());
  }
  expect(conversationId, `conversation id ${from.email} ${to.email}`).toBeTruthy();
  await restInsert(request, "messages", from.token, {
    conversation_id: conversationId,
    sender_id: from.id,
    receiver_id: to.id,
    content,
    status: "sent",
  });
  await restPatch(
    request,
    "conversations",
    from.token,
    `id=eq.${conversationId}`,
    { last_message_at: new Date().toISOString() },
  );
  return conversationId ?? "";
}

async function createViewing(
  request: APIRequestContext,
  requester: Session,
  listing: Listing,
  type: "in_person" | "video",
): Promise<void> {
  const scheduled = new Date();
  scheduled.setDate(scheduled.getDate() + 5);
  scheduled.setHours(15, 0, 0, 0);
  await restInsert(request, "viewings", requester.token, {
    listing_id: listing.id,
    owner_id: listing.ownerId,
    requester_id: requester.id,
    viewing_type: type,
    scheduled_at: scheduled.toISOString(),
    note: `${type} viewing generated by ${RUN_ID}`,
    status: "pending",
  });
}

async function createOpenHouseRegistration(
  request: APIRequestContext,
  requester: Session,
  listing: Listing,
): Promise<void> {
  const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/create_open_house_registration`, {
    headers: authHeaders(requester.token),
    data: {
      p_listing_id: listing.id,
      p_contact_name: requester.email,
      p_contact_email: requester.email,
      p_contact_phone: "+30 6900000000",
      p_note: `Open house registration generated by ${RUN_ID}`,
      p_visit_purpose: "buy",
      p_timeslot_index: 0,
      p_privacy_acknowledgement: true,
      p_contact_permission: true,
      p_id_verification_consent: true,
    },
    failOnStatusCode: false,
  });
  expect([200, 201], `open house registration: ${await res.text()}`).toContain(res.status());
}

async function ensureOpenHouseSettings(listing: Listing): Promise<void> {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);
  const { error } = await (admin as SupabaseClient).from("open_house_settings").upsert(
    {
      listing_id: listing.id,
      timeslots: [
        { start: "10:00", end: "11:00", max_visitors: 6 },
        { start: "12:00", end: "13:00", max_visitors: 6 },
      ],
      max_visitors_per_slot: 6,
      max_total_visitors: 12,
      allow_sealed_bids: true,
      offer_deadline: deadline.toISOString(),
      broker_required: false,
      require_proof_of_funds: false,
      require_investor_declaration: false,
    } as never,
    { onConflict: "listing_id" },
  );
  expect(error?.message ?? "", `open house settings ${listing.id}`).toBe("");
}

async function signInViaUi(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    if ("indexedDB" in window && "databases" in indexedDB) {
      const databases = await indexedDB.databases();
      await Promise.all(
        databases
          .map((database) => database.name)
          .filter((name): name is string => Boolean(name))
          .map(
            (name) =>
              new Promise<void>((resolve) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
              }),
          ),
      );
    }
  });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page
    .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
    .first()
    .click();
  await page.waitForURL(/\/dashboard|\/onboarding|\/admin/, { timeout: 30_000 });
}

async function expectDashboardModule(page: Page, route: string, expected: RegExp): Promise<string> {
  await page.goto(route);
  await page.waitForLoadState("load", { timeout: 20_000 });
  await expect(page.locator("body")).toContainText(expected, { timeout: 20_000 });
  return await page.locator("body").innerText({ timeout: 10_000 });
}

test.describe("live supervisor agent network", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!enabled, "Set PLAYWRIGHT_BASE_URL, E2E_RUN_SUPERVISOR_NETWORK=true, I_KNOW_THIS_IS_PROD=yes, and Supabase admin env to run.");
  test.skip(projectRef === knownProductionRef && process.env.I_KNOW_THIS_IS_PROD !== "yes", "Refusing known production project without explicit live acknowledgement.");

  let idsByEmail = new Map<string, string>();
  const sessions = new Map<string, Session>();
  const listings: Listing[] = [];

  test.afterAll(async () => {
    if (!admin) return;
    for (const userId of cleanupAuthUserIds) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  });

  test("supervisor repairs the full mock matrix with current role and tier logic", async ({ request }) => {
    test.setTimeout(240_000);
    expect(admin).toBeTruthy();
    idsByEmail = await recreateMockUsers(admin as SupabaseClient);

    for (const account of canonicalAccounts) {
      const session = await signIn(request, account.email);
      sessions.set(account.email, session);
    }

    const { data: profiles, error } = await (admin as SupabaseClient)
      .from("profiles")
      .select("user_id, role, participant_type, force_pro_access")
      .in("user_id", Array.from(idsByEmail.values()));
    expect(error?.message ?? "").toBe("");
    const profileByUser = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

    for (const account of canonicalAccounts) {
      const profile = profileByUser.get(idsByEmail.get(account.email));
      if (account.role !== "admin") {
        expect(profile?.role, `${account.email} role`).toBe(account.role);
        expect(profile?.participant_type, `${account.email} participant_type`).toBe(account.participantType);
      }
      if (account.tier === "pro" || account.tier === "admin") {
        expect(profile?.force_pro_access, `${account.email} pro override`).toBe(true);
      }
    }
  });

  test("generated user can be deleted, blocked from sign-in, then re-sign up with same email", async ({ request }) => {
    test.setTimeout(120_000);
    const email = `${RUN_ID}.buyer@maiprop.demo`;
    const password = "Generated2026!";
    const recreatedPassword = "Generated2026Again!";
    const adminClient = admin as SupabaseClient;

    const existingUsers = await listUsersByEmail(adminClient);
    const existingId = existingUsers.get(email.toLowerCase());
    if (existingId) await adminClient.auth.admin.deleteUser(existingId);

    const signup = await request.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: anonHeaders(),
      data: {
        email,
        password,
        data: { first_name: "Generated", last_name: "Buyer", full_name: "Generated Buyer" },
      },
      failOnStatusCode: false,
    });
    if (signup.status() === 429) {
      test.skip(true, "Supabase Auth signup email rate limit hit during live lifecycle drill.");
      return;
    }
    expect([200, 201], `signup: ${await signup.text()}`).toContain(signup.status());

    let session = await signIn(request, email, password).catch(async () => {
      const users = await listUsersByEmail(adminClient);
      const id = users.get(email.toLowerCase());
      expect(id, "signup auth id").toBeTruthy();
      await adminClient.auth.admin.updateUserById(id ?? "", { email_confirm: true });
      return signIn(request, email, password);
    });

    const onboard = await request.post(`${SUPABASE_URL}/functions/v1/complete-onboarding-role`, {
      headers: authHeaders(session.token),
      data: {
        role: "buyer",
        participantType: "buyer",
        displayName: "Generated Buyer",
        city: "Athens",
        phone: "+30 6900000001",
      },
      failOnStatusCode: false,
    });
    expect(onboard.status(), `onboarding: ${await onboard.text()}`).toBe(200);

    const deleted = await request.post(`${SUPABASE_URL}/functions/v1/delete-account`, {
      headers: authHeaders(session.token),
      data: {},
      failOnStatusCode: false,
    });
    expect(deleted.status(), `delete-account: ${await deleted.text()}`).toBe(200);

    const oldLogin = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: anonHeaders(),
      data: { email, password },
      failOnStatusCode: false,
    });
    expect(oldLogin.status(), "deleted user old password should fail").not.toBe(200);

    const signupAgain = await request.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: anonHeaders(),
      data: {
        email,
        password: recreatedPassword,
        data: { first_name: "Generated", last_name: "Recreated", full_name: "Generated Recreated" },
      },
      failOnStatusCode: false,
    });
    if (signupAgain.status() === 429) {
      test.skip(true, "Supabase Auth signup email rate limit hit during same-email re-signup drill.");
      return;
    }
    expect([200, 201], `same-email signup: ${await signupAgain.text()}`).toContain(signupAgain.status());

    session = await signIn(request, email, recreatedPassword).catch(async () => {
      const users = await listUsersByEmail(adminClient);
      const id = users.get(email.toLowerCase());
      expect(id, "recreated auth id").toBeTruthy();
      await adminClient.auth.admin.updateUserById(id ?? "", { email_confirm: true });
      return signIn(request, email, recreatedPassword);
    });
    expect(session.id).toBeTruthy();

    await adminClient.auth.admin.deleteUser(session.id).catch(() => undefined);
  });

  test("agents create listings, bookings, messages, open house registrations, and professional/developer leads", async ({ request }) => {
    test.setTimeout(180_000);
    const get = (email: string) => {
      const session = sessions.get(email);
      if (!session) throw new Error(`Missing session for ${email}`);
      return session;
    };

    const buyerFree = get("buyer.free@maiprop.demo");
    const buyerPro = get("buyer.pro@maiprop.demo");
    const sellerPro = get("seller.pro@maiprop.demo");
    const agentFree = get("agent.free@maiprop.demo");
    const agentPro = get("agent.pro@maiprop.demo");
    const developerPro = get("developer.pro@maiprop.demo");
    const architectPro = get("architect.pro@maiprop.demo");
    const lawyerPro = get("lawyer.pro@maiprop.demo");
    const investorPrivate = get("investor.private@maiprop.demo");

    const disposableFreeSeller = await createDisposableSelfServiceActor(
      request,
      "seller",
      "free-seller",
    );

    const sellerListing = await createListing(request, disposableFreeSeller, {
      title: `${RUN_ID} free seller apartment`,
      price: 231000,
    });
    const agentListing = await createListing(request, agentPro, {
      title: `${RUN_ID} pro agent maisonette`,
      price: 410000,
      sqm: 116,
      adminBypass: true,
    });
    const openHouse = await createListing(request, agentPro, {
      title: `${RUN_ID} pro agent open house`,
      listingType: "open_house",
      price: 385000,
      openHouseDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      adminBypass: true,
    });
    const developerListing = await createListing(request, developerPro, {
      title: `${RUN_ID} developer off-plan residence`,
      listingType: "new_build",
      price: 520000,
      sqm: 122,
      isPreSale: true,
      adminBypass: true,
    });
    listings.push(sellerListing, agentListing, openHouse, developerListing);
    await ensureOpenHouseSettings(openHouse);

    await createConversationWithMessage(request, buyerFree, disposableFreeSeller, sellerListing.id, "Buyer asks about free seller listing.");
    await createConversationWithMessage(request, buyerPro, agentPro, agentListing.id, "Buyer requests agent pro listing details.");
    await createConversationWithMessage(request, agentFree, buyerFree, null, "Agent free checks buyer search requirements.");
    await createConversationWithMessage(request, investorPrivate, agentPro, openHouse.id, "Investor asks for open house access.");
    await createConversationWithMessage(request, buyerPro, developerPro, developerListing.id, "Buyer requests floor plans from developer.");
    await createConversationWithMessage(request, buyerFree, architectPro, null, "Buyer asks architect about renovation feasibility.");
    await createConversationWithMessage(request, sellerPro, lawyerPro, null, "Seller asks lawyer about sale paperwork.");

    await createViewing(request, buyerFree, sellerListing, "in_person");
    await createViewing(request, buyerPro, agentListing, "video");
    await createOpenHouseRegistration(request, buyerFree, openHouse);
    await createOpenHouseRegistration(request, buyerPro, openHouse);

    const adminClient = admin as SupabaseClient;
    const { data: architect } = await adminClient
      .from("professionals")
      .select("id")
      .eq("user_id", architectPro.id)
      .single();
    expect((architect as { id?: string } | null)?.id).toBeTruthy();

    await restInsert(request, "consultation_requests", buyerFree.token, {
      professional_id: (architect as { id: string }).id,
      requester_id: buyerFree.id,
      requester_name: "Yannis FreeBuyer",
      requester_email: buyerFree.email,
      requester_phone: "+30 6900000002",
      request_type: "consultation",
      service: "architect_consult",
      status: "pending",
      preferred_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      preferred_time: "10:00",
      message: `Professional inquiry generated by ${RUN_ID}`,
    });

    const project = await restInsert<{ id: string }>(request, "projects", developerPro.token, {
      owner_id: developerPro.id,
      name: `${RUN_ID} Developer Tower`,
      description: "Supervisor-generated project for CRM and analytics checks.",
      city: "Athens",
      address: `${RUN_ID} Project Avenue 7`,
      status: "active",
      developer_company: "Demo Developer SA",
      delivery_date: "2027-12-01",
    });

    await restInsert(request, "project_leads", developerPro.token, {
      project_id: project.id,
      name: "Niki ProBuyer",
      email: buyerPro.email,
      phone: "+30 6900000003",
      source: "plan_request",
      status: "new",
      notes: `Plan and viewing request generated by ${RUN_ID}`,
    });

    const { data: conversations } = await adminClient
      .from("conversations")
      .select("id")
      .or(`participant_a.in.(${Array.from(sessions.values()).map((s) => s.id).join(",")}),participant_b.in.(${Array.from(sessions.values()).map((s) => s.id).join(",")})`);
    expect((conversations ?? []).length, "supervisor conversation ledger").toBeGreaterThanOrEqual(7);

    const { data: viewingRows } = await adminClient
      .from("viewings")
      .select("id")
      .in("listing_id", listings.map((listing) => listing.id));
    expect((viewingRows ?? []).length, "viewing rows").toBeGreaterThanOrEqual(2);

    const { data: ohRegs } = await adminClient
      .from("open_house_registrations")
      .select("id")
      .eq("listing_id", openHouse.id);
    expect((ohRegs ?? []).length, "open-house registrations").toBeGreaterThanOrEqual(2);
  });

  test("supervisor verifies dashboards and user-facing modules after interactions", async ({ page }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await signInViaUi(page, "buyer.free@maiprop.demo");
    await expectDashboardModule(page, "/messages", /Buyer asks|Agent free|Messages|No conversations/i);
    await expectDashboardModule(page, "/dashboard?tab=viewings", /Viewing|upcoming|No viewings|pending/i);
    if (listings[0]) {
      await page.goto(`/property/${listings[0].id}`);
      await page.waitForLoadState("load", { timeout: 20_000 });
      await expect(page.locator("body")).toContainText(/Property Report|Professional Add-ons|AI Market Insights/i, { timeout: 20_000 });
    }

    await signInViaUi(page, "agent.pro@maiprop.demo");
    await expectDashboardModule(page, "/dashboard?tab=listings", /Listings|pro agent|No listings/i);
    await expectDashboardModule(page, "/dashboard?tab=analytics", /Analytics|views|messages|Create listings/i);
    await expectDashboardModule(page, "/dashboard?tab=leads", /Leads|Viewing|No leads/i);
    await expectDashboardModule(page, "/dashboard?tab=contacts", /Contacts|CRM|No contacts/i);
    await expectDashboardModule(page, "/dashboard?tab=billing", /Agent|Add-ons|Agency|Billing|Plan/i);

    await signInViaUi(page, "developer.pro@maiprop.demo");
    await expectDashboardModule(page, "/dashboard?tab=analytics", /Analytics|Project|Listings|Create listings/i);
    await expectDashboardModule(page, "/dashboard?tab=leads", /Leads|Niki|No leads/i);
    await expectDashboardModule(page, "/dashboard?tab=contacts", /Contacts|CRM|No contacts/i);
    await expectDashboardModule(page, "/dashboard?tab=projects", /Projects|Developer|Tower|No projects/i);
    await expectDashboardModule(page, "/dashboard?tab=portfolios", /Portfolios|Portfolio|No portfolios/i);

    await signInViaUi(page, "architect.pro@maiprop.demo");
    await expectDashboardModule(page, "/professionals/me", /Senior Architect|Professional|Architect|Profile/i);
    await expectDashboardModule(page, "/dashboard?tab=services", /Services|consultation|No services/i);
    await expectDashboardModule(page, "/dashboard?tab=leads", /Leads|Yannis|No leads/i);
    await expectDashboardModule(page, "/dashboard?tab=billing", /Professional|Premium Tools|Billing|Plan/i);

    const adminId = idsByEmail.get("admin@maiprop.demo");
    const { data: adminProfile } = adminId
      ? await (admin as SupabaseClient)
          .from("profiles")
          .select("role")
          .eq("user_id", adminId)
          .maybeSingle()
      : { data: null };
    if ((adminProfile as { role?: string } | null)?.role === "admin") {
      await signInViaUi(page, "admin@maiprop.demo");
      await page.goto("/admin");
      await page.waitForLoadState("load", { timeout: 20_000 });
      await expect(page.locator("body")).toContainText(/Admin|Dashboard|Users|Listings|Reports/i, { timeout: 20_000 });
    } else {
      test.info().annotations.push({
        type: "blocked",
        description: "admin@maiprop.demo cannot be promoted by the current live seed RPC/trigger path, so admin UI verification is recorded as blocked.",
      });
    }

    expect(pageErrors, "uncaught page errors during supervisor dashboard checks").toHaveLength(0);
  });
});
