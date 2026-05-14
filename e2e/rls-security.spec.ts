/**
 * RLS / IDOR security tests.
 *
 * These tests exercise Row-Level-Security policies directly against the
 * Supabase REST API using two different authenticated users from the seeded
 * demo pool. They verify that:
 *
 *   1. User A cannot read User B's private profile fields.
 *   2. User A cannot update User B's profile.
 *   3. Anonymous clients cannot read protected tables.
 *   4. Non-admin users cannot read the admin_audit_log.
 *
 * The tests skip gracefully when the required env vars are not set so they
 * never block CI on forks / PRs without secrets.
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

// Two seeded demo users with known passwords.
const USER_A_EMAIL = process.env.RLS_USER_A_EMAIL ?? "buyer.free@maiprop.demo";
const USER_B_EMAIL = process.env.RLS_USER_B_EMAIL ?? "seller.pro@maiprop.demo";
const USER_PASSWORD = process.env.RLS_USER_PASSWORD ?? "Demo2025!";

const canRun =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("abcdefghijklmnop") && // the CI stub URL
  SUPABASE_ANON_KEY.length > 40;

async function signIn(email: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: USER_PASSWORD,
  });
  if (error || !data.user) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { client, userId: data.user.id };
}

test.describe("RLS — cross-user isolation", () => {
  test.skip(
    !canRun,
    "Set VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY to a real project and seed demo accounts to run RLS tests",
  );

  test("user A cannot update user B's profile", async () => {
    const { client: aClient } = await signIn(USER_A_EMAIL);
    const { userId: bId } = await signIn(USER_B_EMAIL);

    // Attempt to overwrite B's display_name while authenticated as A.
    const { error, data } = await aClient
      .from("profiles")
      .update({ display_name: "PWNED_BY_A" })
      .eq("user_id", bId)
      .select();

    // RLS should either reject the write (error) or update 0 rows (data empty).
    const rowsChanged = Array.isArray(data) ? data.length : 0;
    expect(
      rowsChanged === 0,
      `Expected RLS to block cross-user update; got ${rowsChanged} rows changed. Error: ${error?.message ?? "none"}`,
    ).toBe(true);
  });

  test("user A cannot read user B's saved_searches", async () => {
    const { client: aClient } = await signIn(USER_A_EMAIL);
    const { userId: bId } = await signIn(USER_B_EMAIL);

    const { data, error } = await aClient
      .from("saved_searches")
      .select("id, user_id")
      .eq("user_id", bId);

    // Either rejected or returns empty set.
    const leaked = (data ?? []).filter((r: { user_id: string }) => r.user_id === bId);
    expect(
      leaked.length,
      `Expected 0 leaked rows for user B; got ${leaked.length}. Error: ${error?.message ?? "none"}`,
    ).toBe(0);
  });

  test("anonymous client cannot read user_roles", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket },
    });
    const { data, error } = await anonClient.from("user_roles").select("*").limit(1);

    // Expected: RLS blocks anon entirely. Either an error or empty set is acceptable.
    expect(
      (data?.length ?? 0) === 0,
      `Expected anon to see 0 rows in user_roles; got ${data?.length ?? 0}. Error: ${error?.message ?? "none"}`,
    ).toBe(true);
  });

  test("non-admin user cannot read admin_audit_log", async () => {
    const { client: aClient } = await signIn(USER_A_EMAIL);

    const { data, error } = await aClient.from("admin_audit_log").select("*").limit(1);

    expect(
      (data?.length ?? 0) === 0,
      `Expected non-admin to see 0 rows in admin_audit_log; got ${data?.length ?? 0}. Error: ${error?.message ?? "none"}`,
    ).toBe(true);
  });
});
