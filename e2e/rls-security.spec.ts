/**
 * RLS / IDOR security tests.
 *
 * These tests exercise Row-Level-Security policies directly against the
 * Supabase REST API using seeded demo users. They verify that:
 *
 *   1. User A cannot read or update User B's private data.
 *   2. Anonymous clients cannot read protected tables.
 *   3. Org members can read their org but cannot forge organization_id/role.
 *   4. Org non-members are denied cross-org reads.
 *   5. Anonymous/authenticated denial paths do not recurse with 42P17/500.
 *   6. Non-admin users cannot read the admin_audit_log.
 *
 * The tests skip gracefully when the required env vars are not set so they
 * never block CI on forks / PRs without secrets.
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { readCleanEnv } from "./helpers/env";
import { skipUnlessDestructiveLiveE2EAllowed } from "./helpers/liveSafety";

const SUPABASE_URL = readCleanEnv("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = readCleanEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
const SUPABASE_SERVICE_ROLE_KEY = [
  readCleanEnv("SUPABASE_SERVICE_ROLE_KEY"),
  readCleanEnv("SUPABASE_ANON_KEY"),
  readCleanEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
].find((key) => isProbablyServiceRoleKey(key)) ?? "";

const USER_A_EMAIL = process.env.RLS_USER_A_EMAIL ?? "buyer.free@maiprop.demo";
const USER_B_EMAIL = process.env.RLS_USER_B_EMAIL ?? "seller.pro@maiprop.demo";
const USER_PASSWORD = process.env.RLS_USER_PASSWORD ?? "Demo2025!";
const ADMIN_EMAIL = readCleanEnv("RLS_ADMIN_EMAIL", "E2E_ADMIN_EMAIL");
const ADMIN_PASSWORD = readCleanEnv("RLS_ADMIN_PASSWORD", "E2E_ADMIN_PASSWORD", "RLS_USER_PASSWORD") || USER_PASSWORD;

const canRun =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("abcdefghijklmnop") &&
  SUPABASE_ANON_KEY.length > 40;

type PostgrestLikeError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

type OrgFixture = {
  orgAId: string;
  orgBId: string;
  orgCId: string;
  memberBInOrgBId: string;
};

function jwtRole(key: string): string | null {
  if (!key.includes(".")) return null;
  try {
    const payload = key.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

function isProbablyServiceRoleKey(key: string): boolean {
  return key.startsWith("sb_secret_") || jwtRole(key) === "service_role";
}

function createRlsClient(key: string): SupabaseClient {
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
  });
}

async function signIn(email: string): Promise<{ client: SupabaseClient; userId: string }> {
  return signInWithPassword(email, USER_PASSWORD);
}

async function signInWithPassword(email: string, password: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createRlsClient(SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { client, userId: data.user.id };
}

function requireServiceRoleClient(): SupabaseClient {
  test.skip(
    SUPABASE_SERVICE_ROLE_KEY.length <= 40,
    "Requires an actual service role key in SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY",
  );
  skipUnlessDestructiveLiveE2EAllowed();
  return createRlsClient(SUPABASE_SERVICE_ROLE_KEY);
}

function expectNoRlsRecursion(label: string, error: PostgrestLikeError | null | undefined): void {
  const serialized = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
  expect(serialized, `${label} should not fail with recursive RLS policy error`).not.toMatch(/42P17|infinite recursion/i);
}

function expectBlockedRows(label: string, data: unknown[] | null, error: PostgrestLikeError | null): void {
  expectNoRlsRecursion(label, error);
  expect(
    Array.isArray(data) ? data.length : 0,
    `${label} should return no rows. Error: ${error?.message ?? "none"}`,
  ).toBe(0);
}

async function restProbe(table: string, method: "GET" | "PATCH"): Promise<void> {
  // Keep PATCH probes non-mutating even against live projects.
  const neverExistingId = "00000000-0000-0000-0000-000000000000";
  const url =
    method === "GET"
      ? `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`
      : `${SUPABASE_URL}/rest/v1/${table}?id=eq.${neverExistingId}`;
  const response = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: method === "PATCH" ? JSON.stringify({ created_at: new Date(0).toISOString() }) : undefined,
  });
  const text = await response.text();

  expect(response.status, `${method} ${table} should not return HTTP 500. Body: ${text}`).not.toBe(500);
  expect(text, `${method} ${table} should not expose 42P17 recursion`).not.toMatch(/42P17|infinite recursion/i);
  if (method === "PATCH" && response.ok && text.trim()) {
    const parsed = JSON.parse(text) as unknown;
    expect(Array.isArray(parsed) ? parsed.length : 0, `${method} ${table} should not mutate rows`).toBe(0);
  }
}

async function createOrgFixture(admin: SupabaseClient, userAId: string, userBId: string): Promise<OrgFixture> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: orgs, error: orgError } = await admin
    .from("organizations")
    .insert([
      { name: `RLS Org A ${suffix}`, slug: `rls-${suffix}-a`, created_by: userAId },
      { name: `RLS Org B ${suffix}`, slug: `rls-${suffix}-b`, created_by: userAId },
      { name: `RLS Org C ${suffix}`, slug: `rls-${suffix}-c`, created_by: userBId },
    ])
    .select("id, slug");

  expect(orgError, `create org fixture: ${orgError?.message}`).toBeNull();
  const orgBySlug = new Map((orgs ?? []).map((org: { id: string; slug: string }) => [org.slug, org.id]));
  const orgAId = orgBySlug.get(`rls-${suffix}-a`);
  const orgBId = orgBySlug.get(`rls-${suffix}-b`);
  const orgCId = orgBySlug.get(`rls-${suffix}-c`);
  if (!orgAId || !orgBId || !orgCId) throw new Error("Supabase did not return all org fixture ids.");

  const { data: membership, error: membershipError } = await admin
    .from("organization_memberships")
    .insert({
      organization_id: orgBId,
      user_id: userBId,
      role: "member",
      status: "active",
      invited_by: userAId,
    })
    .select("id")
    .single();

  expect(membershipError, `create org membership fixture: ${membershipError?.message}`).toBeNull();
  if (!membership?.id) throw new Error("Supabase did not return the org membership fixture id.");

  return { orgAId, orgBId, orgCId, memberBInOrgBId: membership.id };
}

async function cleanupOrgFixture(admin: SupabaseClient, fixture: OrgFixture): Promise<void> {
  const orgIds = [fixture.orgAId, fixture.orgBId, fixture.orgCId];
  await admin.from("organization_sso_providers").delete().in("organization_id", orgIds);
  await admin.from("organization_domains").delete().in("organization_id", orgIds);
  await admin.from("procurement_evidence").delete().in("organization_id", orgIds);
  await admin.from("organization_memberships").delete().in("organization_id", orgIds);
  await admin.from("organizations").delete().in("id", orgIds);
}

test.describe("RLS - cross-user isolation", () => {
  test.skip(
    !canRun,
    "Set VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY to a real project and seed demo accounts to run RLS tests",
  );

  test("user A cannot update user B's profile", async () => {
    const { client: aClient } = await signIn(USER_A_EMAIL);
    const { userId: bId } = await signIn(USER_B_EMAIL);

    const { error, data } = await aClient
      .from("profiles")
      .update({ display_name: "PWNED_BY_A" })
      .eq("user_id", bId)
      .select();

    expectBlockedRows("cross-user profile update", data, error);
  });

  test("user A cannot read user B's saved_searches", async () => {
    const { client: aClient } = await signIn(USER_A_EMAIL);
    const { userId: bId } = await signIn(USER_B_EMAIL);

    const { data, error } = await aClient
      .from("saved_searches")
      .select("id, user_id")
      .eq("user_id", bId);

    const leaked = (data ?? []).filter((row: { user_id: string }) => row.user_id === bId);
    expectNoRlsRecursion("cross-user saved_searches read", error);
    expect(
      leaked.length,
      `Expected 0 leaked rows for user B; got ${leaked.length}. Error: ${error?.message ?? "none"}`,
    ).toBe(0);
  });

  test("anonymous client cannot read user_roles", async () => {
    const anonClient = createRlsClient(SUPABASE_ANON_KEY);
    const { data, error } = await anonClient.from("user_roles").select("*").limit(1);

    expectBlockedRows("anon user_roles read", data, error);
  });

  test("anonymous org table probes are denied without 500 or 42P17 recursion", async () => {
    const tables = [
      "organizations",
      "organization_memberships",
      "organization_domains",
      "organization_sso_providers",
      "procurement_evidence",
      "organization_audit_ledger",
    ];

    for (const table of tables) {
      await restProbe(table, "GET");
      await restProbe(table, "PATCH");
    }
  });

  test("authenticated users cannot directly append or mutate the org audit ledger", async () => {
    const { client: aClient, userId: aId } = await signIn(USER_A_EMAIL);

    const { data: insertData, error: insertError } = await aClient
      .from("organization_audit_ledger")
      .insert({
        organization_id: null,
        actor_user_id: aId,
        action: "rls.forged_direct_insert",
        metadata: { forged: true },
      })
      .select("id");

    expectBlockedRows("direct org audit ledger insert", insertData, insertError);

    const neverExistingId = "00000000-0000-0000-0000-000000000000";
    const { data: updateData, error: updateError } = await aClient
      .from("organization_audit_ledger")
      .update({ metadata: { forged: true } })
      .eq("id", neverExistingId)
      .select("id");

    expectBlockedRows("direct org audit ledger update", updateData, updateError);

    const { data: deleteData, error: deleteError } = await aClient
      .from("organization_audit_ledger")
      .delete()
      .eq("id", neverExistingId)
      .select("id");

    expectBlockedRows("direct org audit ledger delete", deleteData, deleteError);
  });

  test("anonymous client cannot read a non-active private listing", async () => {
    const admin = requireServiceRoleClient();
    const anonClient = createRlsClient(SUPABASE_ANON_KEY);

    const title = `RLS private fixture ${Date.now()}`;
    const { data: created, error: createError } = await admin
      .from("listings")
      .insert({
        title,
        city: "Athens",
        price: 123456,
        sqm: 55,
        property_type: "apartment",
        listing_type: "sale",
        status: "draft",
      })
      .select("id")
      .single();

    expect(createError, `create private listing fixture: ${createError?.message}`).toBeNull();
    const listingId = created?.id;
    if (!listingId) throw new Error("Supabase did not return a listing fixture id.");

    try {
      const { data, error } = await anonClient
        .from("listings")
        .select("id, title, status")
        .eq("id", listingId);

      expectBlockedRows(`anon draft listing read ${listingId}`, data, error);
    } finally {
      await admin.from("listings").delete().eq("id", listingId);
    }
  });

  test("org member and non-member boundaries deny cross-org reads and forged membership writes", async () => {
    const admin = requireServiceRoleClient();
    const { client: aClient, userId: aId } = await signIn(USER_A_EMAIL);
    const { client: bClient, userId: bId } = await signIn(USER_B_EMAIL);
    const fixture = await createOrgFixture(admin, aId, bId);

    try {
      const { data: memberOrg, error: memberOrgError } = await bClient
        .from("organizations")
        .select("id")
        .eq("id", fixture.orgBId);
      expectNoRlsRecursion("org member own org read", memberOrgError);
      expect(memberOrg ?? [], `org member should read orgB. Error: ${memberOrgError?.message ?? "none"}`).toHaveLength(1);

      const { data: bReadsA, error: bReadsAError } = await bClient
        .from("organizations")
        .select("id")
        .eq("id", fixture.orgAId);
      expectBlockedRows("user B non-member read of orgA", bReadsA, bReadsAError);

      const { data: aReadsC, error: aReadsCError } = await aClient
        .from("organizations")
        .select("id")
        .eq("id", fixture.orgCId);
      expectBlockedRows("user A non-member read of orgC", aReadsC, aReadsCError);

      const { data: forgedRole, error: forgedRoleError } = await bClient
        .from("organization_memberships")
        .update({ role: "owner" })
        .eq("id", fixture.memberBInOrgBId)
        .select("id, role");
      expectBlockedRows("org member forged role update", forgedRole, forgedRoleError);

      const { data: forgedOrg, error: forgedOrgError } = await bClient
        .from("organization_memberships")
        .update({ organization_id: fixture.orgAId, role: "owner" })
        .eq("id", fixture.memberBInOrgBId)
        .select("id, organization_id, role");
      expectBlockedRows("org member forged organization_id update", forgedOrg, forgedOrgError);

      const { data: forgedInsert, error: forgedInsertError } = await bClient
        .from("organization_memberships")
        .insert({
          organization_id: fixture.orgAId,
          user_id: bId,
          role: "owner",
          status: "active",
        })
        .select("id");
      expectBlockedRows("org non-member forged owner insert", forgedInsert, forgedInsertError);
    } finally {
      await cleanupOrgFixture(admin, fixture);
    }
  });

  test("platform admin can read tenant fixtures when explicit admin credentials are provided", async () => {
    test.skip(!ADMIN_EMAIL, "Set RLS_ADMIN_EMAIL/E2E_ADMIN_EMAIL to run platform-admin RLS proof.");

    const admin = requireServiceRoleClient();
    const { userId: aId } = await signIn(USER_A_EMAIL);
    const { userId: bId } = await signIn(USER_B_EMAIL);
    const { client: adminActor } = await signInWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
    const fixture = await createOrgFixture(admin, aId, bId);

    try {
      const { data, error } = await adminActor
        .from("organizations")
        .select("id")
        .in("id", [fixture.orgAId, fixture.orgBId, fixture.orgCId]);

      expectNoRlsRecursion("platform admin tenant fixture read", error);
      expect(data ?? [], `platform admin should read all tenant fixtures. Error: ${error?.message ?? "none"}`).toHaveLength(3);
    } finally {
      await cleanupOrgFixture(admin, fixture);
    }
  });

  test("non-admin user cannot read admin_audit_log", async () => {
    const { client: aClient } = await signIn(USER_A_EMAIL);

    const { data, error } = await aClient.from("admin_audit_log").select("*").limit(1);

    expectBlockedRows("non-admin admin_audit_log read", data, error);
  });
});
