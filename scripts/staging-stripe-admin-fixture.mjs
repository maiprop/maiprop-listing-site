import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { assertStagingMutationTarget } from "./assert-staging-mutation-target.mjs";

function requireEnv(name, env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertFixtureTarget(env) {
  const projectRef = requireEnv("STAGING_SUPABASE_PROJECT_ID", env);
  assertStagingMutationTarget({
    projectRef,
    acknowledgement: requireEnv("STAGING_MUTATION_ACKNOWLEDGEMENT", env),
  });
  const url = requireEnv("STAGING_SUPABASE_URL", env);
  if (url !== `https://${projectRef}.supabase.co`) {
    throw new Error(
      "Stripe admin session URL must be the exact staging project URL.",
    );
  }
  return url;
}

function authoritativeAdminEmail(env) {
  const email = requireEnv("E2E_ADMIN_EMAIL", env).toLowerCase();
  if (
    email.length > 320 ||
    /[\r\n\s]/.test(email) ||
    !/^[^@]+@[^@]+$/.test(email)
  ) {
    throw new Error("E2E_ADMIN_EMAIL is invalid.");
  }
  return email;
}

async function findExistingAuthUser(admin, email) {
  const matches = [];
  let completedScan = false;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !Array.isArray(data?.users)) {
      throw new Error(
        `Could not inspect staging Auth users: ${error?.message ?? "missing users result"}`,
      );
    }
    matches.push(
      ...data.users.filter(
        (user) => user.email?.trim().toLowerCase() === email,
      ),
    );
    if (data.users.length < 1000) {
      completedScan = true;
      break;
    }
  }
  if (!completedScan) {
    throw new Error(
      "Could not prove authoritative staging admin uniqueness before the Auth pagination cap.",
    );
  }
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one existing authoritative staging admin Auth user; found ${matches.length}.`,
    );
  }
  return matches[0];
}

export async function cleanupStagingStripeAdminFixture({ env, admin, state }) {
  assertFixtureTarget(env);
  if (!state?.userId || !state?.accessToken) {
    throw new Error("Stripe admin session state is invalid.");
  }

  const errors = [];
  const { error: signOutError } = await admin.auth.admin.signOut(
    state.accessToken,
    "local",
  );
  if (signOutError) errors.push(signOutError.message);

  const { data: userData, error: userReadError } =
    await admin.auth.admin.getUserById(state.userId);
  if (userReadError) errors.push(userReadError.message);
  if (!userReadError && userData?.user?.id !== state.userId) {
    errors.push(
      "authoritative staging admin verification returned the wrong user",
    );
  }
  if (errors.length) {
    throw new Error(
      `Stripe admin session cleanup failed: ${errors.join("; ")}`,
    );
  }
}

export async function createStagingStripeAdminFixture({ env, admin, actor }) {
  assertFixtureTarget(env);
  const email = authoritativeAdminEmail(env);
  const existingUser = await findExistingAuthUser(admin, email);
  const userId = existingUser.id;
  if (!userId) throw new Error("Existing staging admin Auth user has no ID.");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("user_id,role,is_platform_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (
    profileError ||
    profile?.user_id !== userId ||
    profile?.role !== "admin" ||
    profile?.is_platform_admin !== true
  ) {
    throw new Error(
      `Configured staging admin is not authoritative: ${profileError?.message ?? "profile privilege mismatch"}`,
    );
  }

  const { data: generated, error: generateError } =
    await admin.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = generated?.properties?.hashed_token;
  if (generateError || !tokenHash || generated?.user?.id !== userId) {
    throw new Error(
      `Could not generate the staging admin one-time token: ${generateError?.message ?? "identity mismatch"}`,
    );
  }

  const { data: verified, error: verifyError } = await actor.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });
  const accessToken = verified?.session?.access_token;
  if (verifyError || !accessToken || verified?.user?.id !== userId) {
    if (accessToken) {
      const { error: signOutError } = await admin.auth.admin.signOut(
        accessToken,
        "local",
      );
      if (signOutError) {
        throw new Error(
          `Staging admin one-time token verification failed; session cleanup failed: ${signOutError.message}`,
        );
      }
    }
    throw new Error(
      `Could not verify the staging admin one-time token: ${verifyError?.message ?? "identity mismatch"}`,
    );
  }
  return { userId, accessToken };
}

function clients(env) {
  const url = assertFixtureTarget(env);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", env);
  const publishableKey = requireEnv("STAGING_SUPABASE_PUBLISHABLE_KEY", env);
  if (serviceKey === publishableKey) {
    throw new Error(
      "Stripe admin session requires a non-public service credential.",
    );
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    admin: createClient(url, serviceKey, options),
    actor: createClient(url, publishableKey, options),
  };
}

async function main() {
  const [mode, statePath] = process.argv.slice(2);
  if (!statePath || !["create", "cleanup"].includes(mode)) {
    throw new Error(
      "Usage: staging-stripe-admin-fixture.mjs <create|cleanup> <state-file>",
    );
  }
  const { admin, actor } = clients(process.env);
  if (mode === "create") {
    const state = await createStagingStripeAdminFixture({
      env: process.env,
      admin,
      actor,
    });
    process.stdout.write(`::add-mask::${state.accessToken}\n`);
    await writeFile(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await chmod(statePath, 0o600);
    process.stdout.write("Created isolated staging Stripe admin session.\n");
    return;
  }

  const state = JSON.parse(await readFile(statePath, "utf8"));
  await cleanupStagingStripeAdminFixture({ env: process.env, admin, state });
  process.stdout.write("Revoked isolated staging Stripe admin session.\n");
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
