// Two-session promotion allowance test. Requires Node.js and psql on PATH.
//
// Local PowerShell:
//   $env:PROMOTION_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
//   node supabase/tests/promotion_entitlement_concurrency_test.mjs
//
// Staging PowerShell (never use a production URL):
//   $env:PROMOTION_TEST_DATABASE_URL=$env:SUPABASE_STAGING_DB_URL
//   $env:PROMOTION_TEST_TARGET="staging"
//   node supabase/tests/promotion_entitlement_concurrency_test.mjs

import { spawn } from "node:child_process";
import process from "node:process";

const databaseUrl = process.env.PROMOTION_TEST_DATABASE_URL ?? process.argv[2];
const psqlBin = process.env.PSQL_BIN ?? "psql";

if (!databaseUrl) {
  console.error(
    "Set PROMOTION_TEST_DATABASE_URL or pass the database URL as the first argument.",
  );
  process.exit(2);
}

const targetUrl = new URL(databaseUrl);
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
if (
  !localHosts.has(targetUrl.hostname) &&
  process.env.PROMOTION_TEST_TARGET !== "staging"
) {
  console.error(
    "Remote execution requires PROMOTION_TEST_TARGET=staging; production is not supported.",
  );
  process.exit(2);
}

const fixture = {
  userId: "91000000-0000-4000-8000-000000000001",
  listingA: "92000000-0000-4000-8000-000000000001",
  listingB: "92000000-0000-4000-8000-000000000002",
  subscriptionId: "93000000-0000-4000-8000-000000000001",
};

function psql(sql, applicationName) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      psqlBin,
      [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atq", "-c", sql],
      {
        env: {
          ...process.env,
          PGAPPNAME: applicationName,
        },
        windowsHide: true,
      },
    );
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

const cleanupSql = `
  DELETE FROM public.listing_promotion_allocations
  WHERE owner_id = '${fixture.userId}'::uuid;
  DELETE FROM public.listings
  WHERE id IN ('${fixture.listingA}'::uuid, '${fixture.listingB}'::uuid);
  DELETE FROM public.billing_subscriptions
  WHERE id = '${fixture.subscriptionId}'::uuid;
  DELETE FROM public.profiles
  WHERE user_id = '${fixture.userId}'::uuid;
  DELETE FROM auth.users
  WHERE id = '${fixture.userId}'::uuid;
`;

const setupSql = `
  BEGIN;
  SET LOCAL session_replication_role = replica;
  ${cleanupSql}
  INSERT INTO auth.users (id) VALUES ('${fixture.userId}'::uuid);
  INSERT INTO public.profiles (
    user_id,
    role,
    is_platform_admin,
    subscription_product_id
  ) VALUES (
    '${fixture.userId}'::uuid,
    'seller',
    false,
    'prod_promotion_concurrency'
  );
  INSERT INTO public.billing_subscriptions (
    id,
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_product_id,
    plan_key,
    audience,
    status,
    current_period_start,
    current_period_end,
    runtime_mode,
    livemode
  ) VALUES (
    '${fixture.subscriptionId}'::uuid,
    '${fixture.userId}'::uuid,
    'cus_promotion_concurrency',
    'sub_promotion_concurrency',
    'prod_promotion_concurrency',
    'pro',
    'participant',
    'active',
    now() - interval '1 day',
    now() + interval '90 days',
    public.current_billing_runtime_mode(),
    public.current_billing_runtime_mode() = 'live'
  );
  INSERT INTO public.listings (
    id,
    owner_id,
    title,
    city,
    price,
    sqm,
    property_type,
    listing_type,
    status
  ) VALUES
    (
      '${fixture.listingA}'::uuid,
      '${fixture.userId}'::uuid,
      'Promotion concurrency A',
      'Athens',
      100000,
      80,
      'apartment',
      'sale',
      'active'
    ),
    (
      '${fixture.listingB}'::uuid,
      '${fixture.userId}'::uuid,
      'Promotion concurrency B',
      'Athens',
      110000,
      85,
      'apartment',
      'sale',
      'active'
    );
  COMMIT;
`;

function activationSql(listingId, requestKey) {
  return `
    BEGIN;
    SELECT set_config(
      'request.jwt.claim.sub',
      '${fixture.userId}',
      true
    );
    SELECT public.activate_listing_promotion(
      '${listingId}'::uuid,
      'spotlight',
      '${requestKey}'
    );
    COMMIT;
  `;
}

let setupComplete = false;
try {
  const setup = await psql(setupSql, "promotion-concurrency-setup");
  if (setup.code !== 0) {
    throw new Error(`fixture setup failed: ${setup.stderr || setup.stdout}`);
  }
  setupComplete = true;

  const attempts = await Promise.all([
    psql(
      activationSql(fixture.listingA, "promotion-concurrency-a"),
      "promotion-concurrency-a",
    ),
    psql(
      activationSql(fixture.listingB, "promotion-concurrency-b"),
      "promotion-concurrency-b",
    ),
  ]);

  const successCount = attempts.filter((attempt) => attempt.code === 0).length;
  const expectedRejectionCount = attempts.filter((attempt) =>
    attempt.code !== 0 &&
    attempt.stderr.includes("spotlight_entitlement_required")
  ).length;

  const verification = await psql(
    `
      SELECT count(*)
      FROM public.listing_promotion_allocations
      WHERE owner_id = '${fixture.userId}'::uuid
        AND promotion_type = 'spotlight'
        AND source_type = 'plan'
        AND plan_cycle_start =
          date_trunc('month', now() AT TIME ZONE 'UTC')::date
        AND request_key IN (
          'promotion-concurrency-a',
          'promotion-concurrency-b'
        );
    `,
    "promotion-concurrency-verify",
  );

  if (
    successCount !== 1 ||
    expectedRejectionCount !== 1 ||
    verification.code !== 0 ||
    verification.stdout !== "1"
  ) {
    throw new Error(
      [
        `expected one success and one entitlement rejection; got ${successCount} and ${expectedRejectionCount}`,
        `ledger count: ${verification.stdout || verification.stderr}`,
        ...attempts.map((attempt, index) =>
          `session ${index + 1}: exit=${attempt.code} ${
            attempt.stderr || attempt.stdout
          }`
        ),
      ].join("\n"),
    );
  }

  console.log(
    "PASS: two concurrent listings consumed exactly one Seller Pro Spotlight allowance.",
  );
} finally {
  if (setupComplete) {
    const cleanup = await psql(
      `BEGIN; SET LOCAL session_replication_role = replica; ${cleanupSql} COMMIT;`,
      "promotion-concurrency-cleanup",
    );
    if (cleanup.code !== 0) {
      console.error(
        `fixture cleanup failed: ${cleanup.stderr || cleanup.stdout}`,
      );
      process.exitCode = 1;
    }
  }
}
