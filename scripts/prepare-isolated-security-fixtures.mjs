import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import WebSocket from "ws";
import {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
} from "./staging-load-dataset.mjs";

const STAGING_MUTATION_ACKNOWLEDGEMENT =
  `MUTATE_STAGING_${STAGING_PROJECT_REF}`;
const DISPOSABLE_FIXTURE_MARKER = "isolated-security";

const REQUIRED_ENV = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RLS_USER_A_EMAIL",
  "RLS_USER_B_EMAIL",
  "RLS_USER_PASSWORD",
  "ONBOARDING_TEST_EMAIL",
  "ONBOARDING_TEST_PASSWORD",
];

function requireEnv(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function assertIsolatedStagingTarget(env = process.env) {
  if (env.E2E_SECURITY_USE_ISOLATED_STAGING !== "true") {
    throw new Error("Security fixture preparation is restricted to isolated staging.");
  }
  if (env.E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS !== "true") {
    throw new Error("Destructive E2E safety acknowledgement is required.");
  }

  const projectRef = requireEnv("VITE_SUPABASE_PROJECT_ID", env);
  if (projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error("Refusing to mutate the MaiProp production Supabase project.");
  }
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error(`Staging mutation target must be ${STAGING_PROJECT_REF}.`);
  }
  if (
    requireEnv("STAGING_MUTATION_ACKNOWLEDGEMENT", env) !==
      STAGING_MUTATION_ACKNOWLEDGEMENT
  ) {
    throw new Error(
      `Staging mutation acknowledgement must be ${STAGING_MUTATION_ACKNOWLEDGEMENT}.`,
    );
  }

  const apiUrl = new URL(requireEnv("VITE_SUPABASE_URL", env));
  const expectedHost = `${STAGING_PROJECT_REF}.supabase.co`;
  if (
    apiUrl.protocol !== "https:" ||
    apiUrl.hostname !== expectedHost ||
    apiUrl.port ||
    apiUrl.username ||
    apiUrl.password
  ) {
    throw new Error(
      `Security fixtures require the exact MaiProp staging API host ${expectedHost} over HTTPS.`,
    );
  }

  return {
    projectRef,
    apiUrl: apiUrl.origin,
  };
}

async function listUsersByEmail(admin, expectedEmails) {
  const usersByEmail = new Map();
  for (let page = 1; page <= 20 && usersByEmail.size < expectedEmails.size; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw new Error(
        `Could not validate staging Auth admin privilege: ${error.message}`,
      );
    }
    if (!Array.isArray(data?.users)) {
      throw new Error(
        "Could not validate staging Auth admin privilege: missing users result.",
      );
    }

    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (email && expectedEmails.has(email)) usersByEmail.set(email, user);
    }
    if (data.users.length < 1000) break;
  }
  return usersByEmail;
}

async function assertExistingFixtureUsersAreSafe(admin, existingByEmail) {
  const existingUsers = [...existingByEmail.values()];
  if (existingUsers.length === 0) return;

  const userIds = existingUsers.map((user) => user.id);
  const [profilesResult, rolesResult] = await Promise.all([
    admin
      .from("profiles")
      .select("user_id, role, is_platform_admin")
      .in("user_id", userIds),
    admin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds),
  ]);

  if (profilesResult.error || !Array.isArray(profilesResult.data)) {
    throw new Error(
      `Could not preflight staging fixture profiles: ${
        profilesResult.error?.message ?? "missing profiles result"
      }`,
    );
  }
  if (rolesResult.error || !Array.isArray(rolesResult.data)) {
    throw new Error(
      `Could not preflight staging fixture roles: ${
        rolesResult.error?.message ?? "missing roles result"
      }`,
    );
  }

  const protectedUserIds = new Set(
    profilesResult.data
      .filter((profile) =>
        profile.role === "admin" || profile.is_platform_admin === true
      )
      .map((profile) => profile.user_id),
  );
  for (const role of rolesResult.data) {
    if (role.role === "admin") protectedUserIds.add(role.user_id);
  }

  for (const user of existingUsers) {
    if (protectedUserIds.has(user.id)) {
      throw new Error(
        `Refusing to use protected admin identity ${user.email} as an RLS fixture.`,
      );
    }
    if (user.app_metadata?.e2e_fixture !== DISPOSABLE_FIXTURE_MARKER) {
      throw new Error(
        `Existing user ${user.email} is not a server-owned disposable staging fixture.`,
      );
    }
  }
}

async function ensureAuthUser(admin, existingUser, email, password, { replace = false } = {}) {
  if (existingUser && replace) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(existingUser.id);
    if (deleteError) {
      throw new Error(`Could not reset disposable staging Auth user ${email}: ${deleteError.message}`);
    }
    existingUser = null;
  }

  const attributes = {
    password,
    email_confirm: true,
    app_metadata: {
      ...(existingUser?.app_metadata ?? {}),
      e2e_fixture: DISPOSABLE_FIXTURE_MARKER,
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

async function normalizeNonAdminIdentity(admin, user, { requireIncompleteOnboarding = false } = {}) {
  const { data: currentProfile, error: readProfileError } = await admin
    .from("profiles")
    .select("role, participant_type, is_platform_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readProfileError) {
    throw new Error(`Could not inspect staging profile ${user.email}: ${readProfileError.message}`);
  }
  if (currentProfile?.role === "admin" || currentProfile?.is_platform_admin === true) {
    throw new Error(`Refusing to use admin identity ${user.email} as an RLS fixture.`);
  }
  if (requireIncompleteOnboarding && currentProfile?.participant_type != null) {
    throw new Error(`Onboarding fixture ${user.email} was not reset to an incomplete profile.`);
  }

  const now = new Date().toISOString();
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      user_id: user.id,
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
}

export async function prepareIsolatedSecurityFixtures({
  env = process.env,
  createAdminClient = createClient,
} = {}) {
  for (const name of REQUIRED_ENV) requireEnv(name, env);
  const target = assertIsolatedStagingTarget(env);

  const url = requireEnv("VITE_SUPABASE_URL", env);
  const publishableKey = requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY", env);
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", env);
  if (serviceRoleKey === publishableKey) {
    throw new Error(
      "Staging Auth admin credential must differ from the publishable key.",
    );
  }

  const userAEmail = requireEnv("RLS_USER_A_EMAIL", env).toLowerCase();
  const userBEmail = requireEnv("RLS_USER_B_EMAIL", env).toLowerCase();
  const onboardingEmail = requireEnv("ONBOARDING_TEST_EMAIL", env).toLowerCase();
  const rlsPassword = requireEnv("RLS_USER_PASSWORD", env);
  const onboardingPassword = requireEnv("ONBOARDING_TEST_PASSWORD", env);
  const emails = [userAEmail, userBEmail, onboardingEmail];

  if (new Set(emails).size !== emails.length) {
    throw new Error("RLS and onboarding staging fixture emails must be distinct.");
  }

  const admin = createAdminClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
  });
  const existingByEmail = await listUsersByEmail(admin, new Set(emails));
  await assertExistingFixtureUsersAreSafe(admin, existingByEmail);

  const userA = await ensureAuthUser(admin, existingByEmail.get(userAEmail), userAEmail, rlsPassword);
  const userB = await ensureAuthUser(admin, existingByEmail.get(userBEmail), userBEmail, rlsPassword);
  const onboardingUser = await ensureAuthUser(
    admin,
    existingByEmail.get(onboardingEmail),
    onboardingEmail,
    onboardingPassword,
    { replace: true },
  );

  await normalizeNonAdminIdentity(admin, userA);
  await normalizeNonAdminIdentity(admin, userB);
  await normalizeNonAdminIdentity(admin, onboardingUser, { requireIncompleteOnboarding: true });

  console.log(
    `Prepared three isolated staging security identities for project ${target.projectRef}.`,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  await prepareIsolatedSecurityFixtures();
}
