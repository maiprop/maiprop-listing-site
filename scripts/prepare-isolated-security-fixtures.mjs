import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_ENV = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RLS_USER_A_EMAIL",
  "RLS_USER_B_EMAIL",
  "RLS_USER_PASSWORD",
  "ONBOARDING_TEST_EMAIL",
  "ONBOARDING_TEST_PASSWORD",
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function assertIsolatedStagingTarget() {
  if (process.env.E2E_SECURITY_USE_ISOLATED_STAGING !== "true") {
    throw new Error("Security fixture preparation is restricted to isolated staging.");
  }
  if (process.env.E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS !== "true") {
    throw new Error("Destructive E2E safety acknowledgement is required.");
  }

  const projectId = requireEnv("VITE_SUPABASE_PROJECT_ID");
  const allowedRefs = new Set(
    requireEnv("E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!allowedRefs.has(projectId)) {
    throw new Error(`Project ${projectId} is not approved for destructive E2E fixtures.`);
  }

  const host = new URL(requireEnv("VITE_SUPABASE_URL")).hostname;
  if (!host.startsWith(`${projectId}.`)) {
    throw new Error(`Supabase URL host ${host} does not match approved project ${projectId}.`);
  }
}

async function listUsersByEmail(admin, expectedEmails) {
  const usersByEmail = new Map();
  for (let page = 1; page <= 20 && usersByEmail.size < expectedEmails.size; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list staging Auth users: ${error.message}`);

    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (email && expectedEmails.has(email)) usersByEmail.set(email, user);
    }
    if (data.users.length < 1000) break;
  }
  return usersByEmail;
}

async function ensureAuthUser(admin, existingUser, email, password) {
  const attributes = {
    password,
    email_confirm: true,
    user_metadata: {
      ...(existingUser?.user_metadata ?? {}),
      e2e_fixture: "isolated-security",
    },
  };

  if (existingUser) {
    const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, attributes);
    if (error || !data.user) {
      throw new Error(`Could not reset staging Auth user ${email}: ${error?.message ?? "missing user"}`);
    }
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({ email, ...attributes });
  if (error || !data.user) {
    throw new Error(`Could not create staging Auth user ${email}: ${error?.message ?? "missing user"}`);
  }
  return data.user;
}

async function normalizeNonAdminIdentity(admin, user, role, participantType) {
  const now = new Date().toISOString();
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      user_id: user.id,
      role,
      participant_type: participantType,
      account_status: "active",
      account_moderated_at: null,
      account_moderated_by: null,
      account_moderation_reason: null,
      is_platform_admin: false,
      force_pro_access: false,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (profileError) {
    throw new Error(`Could not normalize staging profile ${user.email}: ${profileError.message}`);
  }

  const { error: deleteRoleError } = await admin
    .from("user_roles")
    .delete()
    .eq("user_id", user.id);
  if (deleteRoleError) {
    throw new Error(`Could not clear staging roles for ${user.email}: ${deleteRoleError.message}`);
  }

  const { error: insertRoleError } = await admin
    .from("user_roles")
    .insert({ user_id: user.id, role: "user" });
  if (insertRoleError) {
    throw new Error(`Could not assign staging user role for ${user.email}: ${insertRoleError.message}`);
  }
}

export async function prepareIsolatedSecurityFixtures() {
  for (const name of REQUIRED_ENV) requireEnv(name);
  assertIsolatedStagingTarget();

  const url = requireEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const userAEmail = requireEnv("RLS_USER_A_EMAIL").toLowerCase();
  const userBEmail = requireEnv("RLS_USER_B_EMAIL").toLowerCase();
  const onboardingEmail = requireEnv("ONBOARDING_TEST_EMAIL").toLowerCase();
  const rlsPassword = requireEnv("RLS_USER_PASSWORD");
  const onboardingPassword = requireEnv("ONBOARDING_TEST_PASSWORD");
  const emails = [userAEmail, userBEmail, onboardingEmail];

  if (new Set(emails).size !== emails.length) {
    throw new Error("RLS and onboarding staging fixture emails must be distinct.");
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const existingByEmail = await listUsersByEmail(admin, new Set(emails));

  const userA = await ensureAuthUser(admin, existingByEmail.get(userAEmail), userAEmail, rlsPassword);
  const userB = await ensureAuthUser(admin, existingByEmail.get(userBEmail), userBEmail, rlsPassword);
  const onboardingUser = await ensureAuthUser(
    admin,
    existingByEmail.get(onboardingEmail),
    onboardingEmail,
    onboardingPassword,
  );

  await normalizeNonAdminIdentity(admin, userA, "buyer", "buyer");
  await normalizeNonAdminIdentity(admin, userB, "seller", "seller");
  await normalizeNonAdminIdentity(admin, onboardingUser, "buyer", null);

  console.log(`Prepared three isolated staging security identities for project ${requireEnv("VITE_SUPABASE_PROJECT_ID")}.`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  await prepareIsolatedSecurityFixtures();
}
