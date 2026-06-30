#!/usr/bin/env node

/**
 * Read-only guard that verifies the Stripe secret key points at the expected
 * MaiProp Stripe account before catalog syncs, tax checks, or deploy cutovers.
 */

const STRIPE_API_BASE = "https://api.stripe.com";
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? "2026-06-24.dahlia";
const LIVE_ACCOUNT_ID = process.env.STRIPE_LIVE_ACCOUNT_ID ?? "";
const TEST_ACCOUNT_ID = process.env.STRIPE_TEST_ACCOUNT_ID ?? "";

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const help = args.has("--help") || args.has("-h");
const showJson = args.has("--json");

function argValue(name, fallback = "") {
  const index = rawArgs.indexOf(name);
  if (index >= 0 && rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--")) {
    return rawArgs[index + 1];
  }
  const prefix = `${name}=`;
  const inline = rawArgs.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function usage() {
  console.log(`Usage: STRIPE_SECRET_KEY=sk_... npm run check:stripe-account -- [--expected-account acct_...] [--json]

Environment:
  STRIPE_SECRET_KEY          Stripe secret key. Required.
  STRIPE_API_VERSION         Defaults to ${STRIPE_API_VERSION}.
  STRIPE_EXPECTED_ACCOUNT_ID Explicit account id expected for this command.
  STRIPE_TEST_ACCOUNT_ID     Sandbox/test account id fallback for sk_test keys.
  STRIPE_LIVE_ACCOUNT_ID     Live account id fallback for sk_live keys.

MaiProp account routing:
  test/sandbox: acct_1TnuLbGfkWWBWEyh (mAI prop sandbox)
  live:         acct_1TnuLTGfOEgBOxtl (mAI prop)
`);
}

if (help) {
  usage();
  process.exit(0);
}

function getStripeKey() {
  const key = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY ?? "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is required.");
  if (!/^sk_(test|live)_/.test(key)) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key.");
  }
  return key;
}

function runtimeModeFromKey(key) {
  return key.startsWith("sk_live_") ? "live" : "test";
}

function expectedAccountIdForMode(mode) {
  return argValue(
    "--expected-account",
    process.env.STRIPE_EXPECTED_ACCOUNT_ID ??
      (mode === "live" ? LIVE_ACCOUNT_ID : TEST_ACCOUNT_ID),
  );
}

async function stripeRequest(path, key) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    headers: {
      authorization: `Bearer ${key}`,
      "stripe-version": STRIPE_API_VERSION,
      "user-agent": "maiprop-stripe-account-check/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Stripe API ${response.status}`);
  }
  return body;
}

async function main() {
  const key = getStripeKey();
  const mode = runtimeModeFromKey(key);
  const expectedAccountId = expectedAccountIdForMode(mode);
  if (!expectedAccountId) {
    throw new Error(
      "Expected account id is required. Set STRIPE_EXPECTED_ACCOUNT_ID, " +
        "or set STRIPE_TEST_ACCOUNT_ID/STRIPE_LIVE_ACCOUNT_ID for the key mode.",
    );
  }

  const account = await stripeRequest("/v1/account", key);
  const ok = account.id === expectedAccountId;
  const report = {
    ok,
    mode,
    account_id: account.id,
    expected_account_id: expectedAccountId,
    display_name: account.display_name ?? account.settings?.dashboard?.display_name ?? null,
    business_profile_name: account.business_profile?.name ?? null,
    country: account.country ?? null,
    default_currency: account.default_currency ?? null,
  };

  if (showJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Stripe account check (${mode})`);
    console.log(`- actual:   ${report.account_id} (${report.display_name ?? report.business_profile_name ?? "unnamed"})`);
    console.log(`- expected: ${report.expected_account_id}`);
    console.log(`- country:  ${report.country ?? "unknown"}`);
    console.log(`- currency: ${report.default_currency ?? "unknown"}`);
  }

  if (!ok) {
    console.error("ERROR: Stripe key is attached to the wrong account for this environment.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
