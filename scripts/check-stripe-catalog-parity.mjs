#!/usr/bin/env node

/**
 * Read-only Stripe sandbox/live catalog parity gate.
 *
 * Compares MaiProp product and price shapes across test and live Stripe
 * accounts while intentionally ignoring environment-specific object IDs.
 */

import { existsSync, readFileSync } from "node:fs";

const STRIPE_API_BASE = "https://api.stripe.com";
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? "2026-06-24.dahlia";
const DEFAULT_TEST_ACCOUNT_ID = "acct_1TnuLbGfkWWBWEyh";
const DEFAULT_LIVE_ACCOUNT_ID = "acct_1TnuLTGfOEgBOxtl";
const EXPECTED_COUNTRY = (process.env.STRIPE_TAX_EXPECT_COUNTRY ?? "GR").toUpperCase();
const EXPECTED_VAT_ID = (process.env.STRIPE_COMPANY_VAT_ID ?? "EL802708301").replace(/\s+/g, "").toUpperCase();

const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "credit_note.created",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.paused",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.resumed",
  "customer.subscription.deleted",
  "invoice.created",
  "invoice.finalized",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
  "subscription_schedule.aborted",
  "subscription_schedule.canceled",
  "subscription_schedule.completed",
  "subscription_schedule.released",
  "subscription_schedule.updated",
];

const CATALOG = [
  ["pro", [["maiprop_pro_monthly", 2900, "month"], ["maiprop_pro_annual", 29000, "year"]]],
  ["agent_basic", [["maiprop_agent_basic_monthly", 14900, "month"], ["maiprop_agent_basic_annual", 149000, "year"]]],
  ["developer_pro", [["maiprop_developer_pro_monthly", 12900, "month"], ["maiprop_developer_pro_annual", 129000, "year"]]],
  ["professional_basic", [["maiprop_professional_basic_monthly", 6900, "month"], ["maiprop_professional_basic_annual", 69000, "year"]]],
  ["valuation_single", [["maiprop_valuation_single", 3900, null]]],
  ["valuation_bundle", [["maiprop_valuation_bundle", 14900, null]]],
  ["property_report_single", [["maiprop_property_report_single", 4900, null]]],
  ["neighbourhood_report_single", [["maiprop_neighbourhood_report_single", 1900, null]]],
  ["neighbourhood_report_bundle", [["maiprop_neighbourhood_report_bundle", 3900, null]]],
].map(([key, prices]) => ({
  key,
  prices: prices.map(([lookupKey, unitAmount, recurringInterval]) => ({
    lookupKey,
    unitAmount,
    recurringInterval,
  })),
}));

const REQUIRED_LOOKUP_KEYS = CATALOG.flatMap((item) => item.prices.map((price) => price.lookupKey));
const args = new Set(process.argv.slice(2));

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    let value = match[2].trim();
    const commentIndex = value.search(/\s#/);
    if (commentIndex >= 0) value = value.slice(0, commentIndex).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".stripe.test.env");
loadEnvFile(".stripe.live.env");

function encodeForm(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
  return params;
}

function normalizeVat(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

function endpointCoversEvents(endpoint) {
  const enabled = endpoint.enabled_events ?? [];
  return enabled.includes("*") || REQUIRED_WEBHOOK_EVENTS.every((event) => enabled.includes(event));
}

function registrationCountry(registration) {
  return String(
    registration.country ??
      registration.country_options?.eu?.country ??
      registration.country_options?.[EXPECTED_COUNTRY.toLowerCase()]?.country ??
      "",
  ).toUpperCase();
}

function getKeys() {
  const testKey = process.env.STRIPE_SANDBOX_SECRET_KEY ??
    process.env.STRIPE_TEST_SECRET_KEY ??
    process.env.STRIPE_SECRET_KEY_TEST ??
    "";
  const liveKey = process.env.STRIPE_LIVE_SECRET_KEY ??
    process.env.STRIPE_SECRET_KEY_LIVE ??
    "";
  if (!testKey.startsWith("sk_test_")) {
    throw new Error("STRIPE_SANDBOX_SECRET_KEY or STRIPE_TEST_SECRET_KEY must be an sk_test_ key.");
  }
  if (!liveKey.startsWith("sk_live_")) {
    throw new Error("STRIPE_LIVE_SECRET_KEY or STRIPE_SECRET_KEY_LIVE must be an sk_live_ key.");
  }
  return { testKey, liveKey };
}

async function stripeRequest(key, path, values = {}) {
  const url = new URL(`${STRIPE_API_BASE}${path}`);
  const query = encodeForm(values);
  for (const [name, value] of query.entries()) url.searchParams.append(name, value);
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${key}`,
      "stripe-version": STRIPE_API_VERSION,
      "user-agent": "maiprop-stripe-catalog-parity/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(body?.error?.message ?? `Stripe API ${response.status} ${path}`);
  return body;
}

async function listAll(key, path, values = {}) {
  const rows = [];
  let startingAfter = null;
  do {
    const page = await stripeRequest(key, path, {
      ...values,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    rows.push(...(Array.isArray(page.data) ? page.data : []));
    startingAfter = page.has_more ? page.data.at(-1)?.id : null;
  } while (startingAfter);
  return rows;
}

async function listPrices(key) {
  const prices = [];
  for (let index = 0; index < REQUIRED_LOOKUP_KEYS.length; index += 10) {
    const chunk = REQUIRED_LOOKUP_KEYS.slice(index, index + 10);
    const page = await stripeRequest(key, "/v1/prices", {
      active: true,
      "expand[]": "data.product",
      "lookup_keys[]": chunk,
    });
    prices.push(...(page.data ?? []));
  }
  return prices;
}

function normalizedPrice(price) {
  const product = typeof price.product === "object" ? price.product : null;
  return {
    lookup_key: price.lookup_key ?? null,
    active: price.active === true,
    currency: String(price.currency ?? "").toLowerCase(),
    unit_amount: Number(price.unit_amount ?? 0),
    recurring_interval: price.recurring?.interval ?? null,
    tax_behavior: price.tax_behavior ?? null,
    product_active: product ? product.active === true : null,
    product_key: product?.metadata?.maiprop_key ?? product?.metadata?.pricing_config_key ?? null,
    product_tax_code: product?.tax_code ?? null,
    trial_days: Number(price.recurring?.trial_period_days ?? 0),
  };
}

async function auditEnvironment(label, key, expectedAccountId) {
  const issues = [];
  const account = await stripeRequest(key, "/v1/account");
  if (account.id !== expectedAccountId) issues.push(`${label} account=${account.id}; expected ${expectedAccountId}.`);
  if (String(account.country ?? "").toUpperCase() !== EXPECTED_COUNTRY) issues.push(`${label} country=${account.country}; expected ${EXPECTED_COUNTRY}.`);

  const priceByLookup = new Map((await listPrices(key)).map((price) => [price.lookup_key, normalizedPrice(price)]));
  for (const item of CATALOG) {
    for (const spec of item.prices) {
      const price = priceByLookup.get(spec.lookupKey);
      if (!price) {
        issues.push(`${label} missing price ${spec.lookupKey}.`);
        continue;
      }
      if (price.product_key && price.product_key !== item.key) issues.push(`${label} ${spec.lookupKey} product key=${price.product_key}; expected ${item.key}.`);
      if (price.unit_amount !== spec.unitAmount) issues.push(`${label} ${spec.lookupKey} amount=${price.unit_amount}; expected ${spec.unitAmount}.`);
      if (price.recurring_interval !== spec.recurringInterval) issues.push(`${label} ${spec.lookupKey} recurring=${price.recurring_interval}; expected ${spec.recurringInterval}.`);
      if (price.tax_behavior !== "exclusive") issues.push(`${label} ${spec.lookupKey} tax_behavior=${price.tax_behavior}; expected exclusive.`);
    }
  }

  const registrations = await listAll(key, "/v1/tax/registrations", { status: "active" });
  if (!registrations.some((registration) =>
    registrationCountry(registration) === EXPECTED_COUNTRY || registration.country_options?.eu
  )) {
    issues.push(`${label} has no active Stripe Tax registration for ${EXPECTED_COUNTRY}.`);
  }

  const taxIds = await listAll(key, "/v1/tax_ids");
  if (!taxIds.some((taxId) => normalizeVat(taxId.value) === EXPECTED_VAT_ID)) {
    issues.push(`${label} has no account tax ID ${EXPECTED_VAT_ID}.`);
  }

  const portals = await listAll(key, "/v1/billing_portal/configurations");
  if (!portals.some((portal) => portal.active === true)) {
    issues.push(`${label} has no active Billing Portal configuration.`);
  }

  const webhooks = await listAll(key, "/v1/webhook_endpoints");
  if (!webhooks.some((endpoint) => endpoint.status === "enabled" && endpointCoversEvents(endpoint))) {
    issues.push(`${label} has no enabled webhook endpoint covering required billing events.`);
  }

  return {
    label,
    account: {
      id: account.id,
      display_name: account.display_name ?? account.settings?.dashboard?.display_name ?? null,
    },
    prices: Object.fromEntries(priceByLookup.entries()),
    checked: {
      prices: priceByLookup.size,
      tax_registrations: registrations.length,
      tax_ids: taxIds.length,
      portal_configurations: portals.length,
      webhook_endpoints: webhooks.length,
    },
    issues,
  };
}

function comparePrices(testAudit, liveAudit) {
  const issues = [];
  for (const lookupKey of REQUIRED_LOOKUP_KEYS) {
    const testPrice = testAudit.prices[lookupKey];
    const livePrice = liveAudit.prices[lookupKey];
    if (!testPrice || !livePrice) continue;
    for (const field of [
      "active",
      "currency",
      "unit_amount",
      "recurring_interval",
      "tax_behavior",
      "product_key",
      "product_tax_code",
      "trial_days",
    ]) {
      if (testPrice[field] !== livePrice[field]) {
        issues.push(`${lookupKey} ${field} sandbox=${testPrice[field] ?? "null"} live=${livePrice[field] ?? "null"}.`);
      }
    }
  }
  return issues;
}

async function main() {
  const { testKey, liveKey } = getKeys();
  const testAudit = await auditEnvironment(
    "sandbox",
    testKey,
    process.env.STRIPE_SANDBOX_ACCOUNT_ID ?? DEFAULT_TEST_ACCOUNT_ID,
  );
  const liveAudit = await auditEnvironment(
    "live",
    liveKey,
    process.env.STRIPE_LIVE_ACCOUNT_ID ?? DEFAULT_LIVE_ACCOUNT_ID,
  );
  const parityIssues = comparePrices(testAudit, liveAudit);
  const report = {
    ok: testAudit.issues.length === 0 && liveAudit.issues.length === 0 && parityIssues.length === 0,
    api_version: STRIPE_API_VERSION,
    sandbox: testAudit,
    live: liveAudit,
    parity_issues: parityIssues,
    required_webhook_events: REQUIRED_WEBHOOK_EVENTS,
  };

  if (args.has("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Stripe catalog parity (${STRIPE_API_VERSION})`);
    console.log(`Sandbox: ${testAudit.account.id} (${testAudit.account.display_name ?? "unnamed"})`);
    console.log(`Live: ${liveAudit.account.id} (${liveAudit.account.display_name ?? "unnamed"})`);
    console.log(`Prices checked: sandbox ${testAudit.checked.prices}, live ${liveAudit.checked.prices}`);
    for (const issue of [...testAudit.issues, ...liveAudit.issues, ...parityIssues]) {
      console.log(`ERROR: ${issue}`);
    }
  }

  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
