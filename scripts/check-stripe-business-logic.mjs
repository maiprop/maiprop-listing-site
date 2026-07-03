#!/usr/bin/env node

/**
 * Read-only sandbox billing catalog audit.
 *
 * Verifies that MaiProp's app-facing business catalog, Supabase pricing rows,
 * and Stripe test-mode products/prices agree. By default this command refuses
 * live keys because it is intended for sandbox release verification.
 */

import { existsSync, readFileSync } from "node:fs";

import { formatStripeKeyEvidence, getStripeSecretKey, stripeKeyMetadata } from "./stripe-readiness-env.mjs";

const STRIPE_API_BASE = "https://api.stripe.com";
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? "2026-06-24.dahlia";
const DEFAULT_TEST_ACCOUNT_ID = "acct_1TnuLbGfkWWBWEyh";
const DEFAULT_LIVE_ACCOUNT_ID = "acct_1TnuLTGfOEgBOxtl";
const EXPECTED_COUNTRY = "GR";
const EXPECTED_CURRENCY = "eur";
const EXPECTED_TAX_BEHAVIOR = "exclusive";

const PUBLIC_SUBSCRIPTION_KEYS = new Set([
  "pro",
  "agent_basic",
  "developer_pro",
  "professional_basic",
]);

const SELF_SERVE_ADDON_KEYS = new Set([
  "valuation_single",
  "valuation_bundle",
  "property_report_single",
  "neighbourhood_report_single",
  "neighbourhood_report_bundle",
]);

const INVITE_ONLY_KEYS = new Set([
  "investor_private",
  "investor_institutional",
]);

const EXPECTED_CATALOG = [
  {
    key: "pro",
    label: "Participant Pro",
    audience: "participant",
    module: "user_subscription",
    unit: "monthly",
    amount: 29,
    access: "public_subscription",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_pro_monthly", amount: 29, recurringInterval: "month" },
      { cycle: "annual", lookupKey: "maiprop_pro_annual", amount: 290, recurringInterval: "year" },
    ],
  },
  {
    key: "agent_basic",
    label: "Agent Pro",
    audience: "agent",
    module: "agent_subscription",
    unit: "monthly",
    amount: 149,
    access: "public_subscription",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_agent_basic_monthly", amount: 149, recurringInterval: "month" },
      { cycle: "annual", lookupKey: "maiprop_agent_basic_annual", amount: 1490, recurringInterval: "year" },
    ],
  },
  {
    key: "developer_pro",
    label: "Developer Pro",
    audience: "developer",
    module: "developer_subscription",
    unit: "monthly",
    amount: 129,
    access: "public_subscription",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_developer_pro_monthly", amount: 129, recurringInterval: "month" },
      { cycle: "annual", lookupKey: "maiprop_developer_pro_annual", amount: 1290, recurringInterval: "year" },
    ],
  },
  {
    key: "professional_basic",
    label: "Professional Pro",
    audience: "professional",
    module: "professional_subscription",
    unit: "monthly",
    amount: 69,
    access: "public_subscription",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_professional_basic_monthly", amount: 69, recurringInterval: "month" },
      { cycle: "annual", lookupKey: "maiprop_professional_basic_annual", amount: 690, recurringInterval: "year" },
    ],
  },
  {
    key: "investor_private",
    label: "Private Investor",
    audience: "investor",
    module: "investor_subscription",
    unit: "annual",
    amount: 0,
    access: "invite_only_payment",
    prices: [],
  },
  {
    key: "investor_institutional",
    label: "Institutional Investor",
    audience: "institutional",
    module: "investor_subscription",
    unit: "annual",
    amount: 0,
    access: "invite_only_payment",
    prices: [],
  },
  {
    key: "valuation_single",
    label: "AI Valuation (single)",
    audience: "participant",
    module: "valuation_reports",
    unit: "per_report",
    amount: 39,
    access: "self_serve_addon",
    credits: 1,
    prices: [
      { cycle: "one_time", lookupKey: "maiprop_valuation_single", amount: 39, recurringInterval: null },
    ],
  },
  {
    key: "valuation_bundle",
    label: "AI Valuation x 5",
    audience: "participant",
    module: "valuation_reports",
    unit: "bundle",
    amount: 149,
    access: "self_serve_addon",
    credits: 5,
    prices: [
      { cycle: "one_time", lookupKey: "maiprop_valuation_bundle", amount: 149, recurringInterval: null },
    ],
  },
  {
    key: "property_report_single",
    label: "Property Report (single)",
    audience: "participant",
    module: "valuation_reports",
    unit: "per_report",
    amount: 49,
    access: "self_serve_addon",
    credits: 1,
    prices: [
      { cycle: "one_time", lookupKey: "maiprop_property_report_single", amount: 49, recurringInterval: null },
    ],
  },
  {
    key: "neighbourhood_report_single",
    label: "Neighbourhood Report",
    audience: "participant",
    module: "valuation_reports",
    unit: "per_report",
    amount: 19,
    access: "self_serve_addon",
    credits: 1,
    prices: [
      { cycle: "one_time", lookupKey: "maiprop_neighbourhood_report_single", amount: 19, recurringInterval: null },
    ],
  },
  {
    key: "neighbourhood_report_bundle",
    label: "Neighbourhood Bundle x 3",
    audience: "participant",
    module: "valuation_reports",
    unit: "bundle",
    amount: 39,
    access: "self_serve_addon",
    credits: 3,
    prices: [
      { cycle: "one_time", lookupKey: "maiprop_neighbourhood_report_bundle", amount: 39, recurringInterval: null },
    ],
  },
  {
    key: "extra_listing",
    label: "Extra listing slot",
    audience: "participant",
    module: "adhoc_charges",
    unit: "per_listing",
    amount: 12,
    access: "manual_addon",
    prices: [
      { cycle: "one_time", lookupKey: "maiprop_extra_listing", amount: 12, recurringInterval: null },
    ],
  },
  {
    key: "featured_listing",
    label: "Featured listing",
    audience: "participant",
    module: "adhoc_charges",
    unit: "per_listing",
    amount: 39,
    access: "manual_addon",
    prices: [
      { cycle: "one_time", lookupKey: "maiprop_featured_listing", amount: 39, recurringInterval: null },
    ],
  },
  {
    key: "priority_placement",
    label: "Priority placement",
    audience: "participant",
    module: "adhoc_charges",
    unit: "per_listing",
    amount: 59,
    access: "manual_addon",
    prices: [
      { cycle: "one_time", lookupKey: "maiprop_priority_placement", amount: 59, recurringInterval: null },
    ],
  },
  {
    key: "featured_priority_bundle",
    label: "Featured + Priority",
    audience: "participant",
    module: "adhoc_charges",
    unit: "per_listing",
    amount: 79,
    access: "manual_addon",
    prices: [
      { cycle: "one_time", lookupKey: "maiprop_featured_priority_bundle", amount: 79, recurringInterval: null },
    ],
  },
  {
    key: "agent_extra_seat",
    label: "Extra agent seat",
    audience: "agent",
    module: "adhoc_charges",
    unit: "monthly",
    amount: 39,
    access: "manual_addon",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_agent_extra_seat_monthly", amount: 39, recurringInterval: "month" },
    ],
  },
  {
    key: "agency_branded_profile",
    label: "Agency-branded profile",
    audience: "agent",
    module: "adhoc_charges",
    unit: "monthly",
    amount: 49,
    access: "manual_addon",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_agency_branded_profile_monthly", amount: 49, recurringInterval: "month" },
    ],
  },
  {
    key: "agency_dedicated_manager",
    label: "Dedicated account manager",
    audience: "agent",
    module: "adhoc_charges",
    unit: "monthly",
    amount: 199,
    access: "manual_addon",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_agency_dedicated_manager_monthly", amount: 199, recurringInterval: "month" },
    ],
  },
  {
    key: "agency_white_label",
    label: "White-label domain",
    audience: "agent",
    module: "adhoc_charges",
    unit: "monthly",
    amount: 149,
    access: "manual_addon",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_agency_white_label_monthly", amount: 149, recurringInterval: "month" },
    ],
  },
  {
    key: "featured_professional",
    label: "Spotlight professional",
    audience: "professional",
    module: "adhoc_charges",
    unit: "monthly",
    amount: 59,
    access: "manual_addon",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_featured_professional_monthly", amount: 59, recurringInterval: "month" },
    ],
  },
  {
    key: "extra_priority_ad",
    label: "Extra Priority Rank Ad",
    audience: "professional",
    module: "adhoc_charges",
    unit: "per_ad",
    amount: 8,
    access: "manual_addon",
    prices: [
      { cycle: "one_time", lookupKey: "maiprop_extra_priority_ad", amount: 8, recurringInterval: null },
    ],
  },
  {
    key: "professional_api_access",
    label: "Professional API access",
    audience: "professional",
    module: "adhoc_charges",
    unit: "monthly",
    amount: 59,
    access: "manual_addon",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_professional_api_access_monthly", amount: 59, recurringInterval: "month" },
    ],
  },
  {
    key: "professional_referral_network",
    label: "Referral network slot",
    audience: "professional",
    module: "adhoc_charges",
    unit: "monthly",
    amount: 39,
    access: "manual_addon",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_professional_referral_network_monthly", amount: 39, recurringInterval: "month" },
    ],
  },
  {
    key: "professional_extra_seat",
    label: "Extra client seat",
    audience: "professional",
    module: "adhoc_charges",
    unit: "monthly",
    amount: 19,
    access: "manual_addon",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_professional_extra_seat_monthly", amount: 19, recurringInterval: "month" },
    ],
  },
  {
    key: "professional_branded_email",
    label: "Branded email templates",
    audience: "professional",
    module: "adhoc_charges",
    unit: "monthly",
    amount: 15,
    access: "manual_addon",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_professional_branded_email_monthly", amount: 15, recurringInterval: "month" },
    ],
  },
  {
    key: "market_intelligence",
    label: "Market Intelligence",
    audience: "participant",
    module: "os_data_products",
    unit: "monthly",
    amount: 199,
    access: "manual_data_product",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_market_intelligence_monthly", amount: 199, recurringInterval: "month" },
    ],
  },
  {
    key: "avm_api",
    label: "AVM API",
    audience: "participant",
    module: "os_data_products",
    unit: "monthly",
    amount: 299,
    access: "manual_data_product",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_avm_api_monthly", amount: 299, recurringInterval: "month" },
    ],
  },
  {
    key: "auction_intelligence",
    label: "Auction Intelligence",
    audience: "participant",
    module: "os_data_products",
    unit: "monthly",
    amount: 149,
    access: "manual_data_product",
    prices: [
      { cycle: "monthly", lookupKey: "maiprop_auction_intelligence_monthly", amount: 149, recurringInterval: "month" },
    ],
  },
];

const EXPECTED_BY_KEY = new Map(EXPECTED_CATALOG.map((item) => [item.key, item]));
const REQUIRED_LOOKUP_KEYS = EXPECTED_CATALOG.flatMap((item) => item.prices.map((price) => price.lookupKey));
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const showJson = args.has("--json");
const allowLive = args.has("--allow-live");
const help = args.has("--help") || args.has("-h");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    let value = match[2].trim();
    const commentIndex = value.search(/\s#/);
    if (commentIndex >= 0) value = value.slice(0, commentIndex).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".stripe.test.env");

function usage() {
  console.log(`Usage: STRIPE_SECRET_KEY=sk_test_... npm run check:stripe-business-logic -- [--json]

Read-only checks:
  - Stripe key belongs to the sandbox account by default
  - Supabase pricing_configs rows match MaiProp business catalog
  - public subscription monthly/annual prices match Stripe products/prices
  - self-serve AI/report top-up prices match Stripe products/prices
  - manual/internal products are configured in Stripe but excluded from self-serve checkout
  - invite-only investor products have no public recurring prices

Environment:
  STRIPE_SECRET_KEY               Stripe secret key. Required.
  STRIPE_EXPECTED_ACCOUNT_ID      Defaults to ${DEFAULT_TEST_ACCOUNT_ID} for test keys.
  STRIPE_API_VERSION              Defaults to ${STRIPE_API_VERSION}.
  VITE_SUPABASE_URL/SUPABASE_URL  Supabase project URL. Required.
  SUPABASE_SERVICE_ROLE_KEY       Service-role key. Required unless another service key env is present.

Safety:
  The command refuses sk_live keys unless --allow-live is passed.
`);
}

if (help) {
  usage();
  process.exit(0);
}

function argValue(name, fallback = "") {
  const index = rawArgs.indexOf(name);
  if (index >= 0 && rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--")) {
    return rawArgs[index + 1];
  }
  const prefix = `${name}=`;
  const inline = rawArgs.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function assertOk(condition, message, issues) {
  if (!condition) issues.push(message);
}

function getStripeKey() {
  const key = getStripeSecretKey(process.env);
  if (key.startsWith("sk_live_") && !allowLive) {
    throw new Error("Refusing to run against live Stripe. Pass --allow-live only for an intentional live audit.");
  }
  return key;
}

function runtimeModeFromKey(key) {
  return stripeKeyMetadata(key).mode;
}

function expectedAccountForMode(mode) {
  return argValue(
    "--expected-account",
    process.env.STRIPE_EXPECTED_ACCOUNT_ID ??
      (mode === "live"
        ? process.env.STRIPE_LIVE_ACCOUNT_ID ?? DEFAULT_LIVE_ACCOUNT_ID
        : process.env.STRIPE_TEST_ACCOUNT_ID ?? DEFAULT_TEST_ACCOUNT_ID),
  );
}

function decodeJwtPayload(value) {
  const payload = value?.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function keyRole(value) {
  if (!value) return "";
  if (value.startsWith("sb_secret_")) return "service_role";
  return decodeJwtPayload(value)?.role ?? "";
}

function getSupabaseUrl() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error("VITE_SUPABASE_URL or SUPABASE_URL must be a Supabase project URL.");
  }
  return url.replace(/\/$/, "");
}

function getSupabaseServiceKey() {
  const candidates = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "SB_SERVICE_ROLE_KEY",
  ];
  for (const name of candidates) {
    const value = process.env[name];
    if (value && keyRole(value) === "service_role") return value;
  }
  throw new Error("A Supabase service-role key is required for pricing catalog verification.");
}

function encodeForm(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
  return params;
}

async function stripeRequest(method, path, key, values = undefined) {
  const url = new URL(`${STRIPE_API_BASE}${path}`);
  const init = {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "stripe-version": STRIPE_API_VERSION,
      "user-agent": "maiprop-stripe-business-logic-check/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  };

  if (method === "GET" && values) {
    const query = encodeForm(values);
    for (const [queryKey, value] of query.entries()) url.searchParams.append(queryKey, value);
  } else if (values) {
    init.headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = encodeForm(values);
  }

  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Stripe API ${response.status}`);
  }
  return body;
}

async function supabaseRest(path, options = {}) {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceKey();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.message ?? body?.error ?? `Supabase REST ${response.status}`);
  }
  return body;
}

async function fetchPricingRows() {
  const select = [
    "key",
    "label",
    "description",
    "audience",
    "module",
    "unit",
    "currency",
    "amount",
    "is_active",
    "metadata",
  ].join(",");
  const rows = await supabaseRest(
    `/rest/v1/pricing_configs?select=${encodeURIComponent(select)}&is_active=eq.true&order=key.asc`,
  );
  return Array.isArray(rows) ? rows : [];
}

async function listPricesByLookupKeys(stripeKey, lookupKeys) {
  const results = [];
  const chunkSize = 10;
  for (let index = 0; index < lookupKeys.length; index += chunkSize) {
    const chunk = lookupKeys.slice(index, index + chunkSize);
    const prices = await stripeRequest("GET", "/v1/prices", stripeKey, {
      active: true,
      limit: 100,
      "expand[]": "data.product",
      "lookup_keys[]": chunk,
    });
    if (Array.isArray(prices.data)) results.push(...prices.data);
  }
  return results;
}

function metadataPriceId(row, cycle) {
  const meta = row?.metadata ?? {};
  if (cycle === "annual") {
    return meta.stripe_price_id_annual ??
      meta.stripe_annual_price_id ??
      meta.stripe_price_id_yearly ??
      meta.stripe_yearly_price_id ??
      (row?.unit === "yearly" || row?.unit === "annual" ? meta.stripe_price_id : null);
  }
  if (cycle === "monthly") {
    return meta.stripe_price_id_monthly ??
      meta.stripe_monthly_price_id ??
      (row?.unit === "monthly" ? meta.stripe_price_id : null);
  }
  return meta.stripe_price_id ?? null;
}

function summarizePrice(price) {
  const product = typeof price.product === "object" ? price.product : null;
  return {
    id: price.id,
    lookup_key: price.lookup_key ?? null,
    active: price.active === true,
    currency: price.currency ?? null,
    unit_amount: price.unit_amount ?? null,
    recurring_interval: price.recurring?.interval ?? null,
    tax_behavior: price.tax_behavior ?? null,
    product_id: product?.id ?? (typeof price.product === "string" ? price.product : null),
    product_name: product?.name ?? null,
    product_active: product ? product.active === true : null,
    product_tax_code: product?.tax_code ?? null,
    product_metadata_key: product?.metadata?.maiprop_key ?? product?.metadata?.pricing_config_key ?? null,
    price_metadata_key: price.metadata?.maiprop_key ?? price.metadata?.pricing_config_key ?? null,
  };
}

function validatePricingRows(rows, issues, warnings) {
  const rowByKey = new Map(rows.map((row) => [row.key, row]));
  const checkedRows = [];

  for (const expected of EXPECTED_CATALOG) {
    const row = rowByKey.get(expected.key);
    checkedRows.push(expected.key);
    if (!row) {
      issues.push(`Missing active Supabase pricing_configs row for ${expected.key}.`);
      continue;
    }

    assertOk(row.audience === expected.audience, `${expected.key} audience=${row.audience}; expected ${expected.audience}.`, issues);
    assertOk(row.module === expected.module, `${expected.key} module=${row.module}; expected ${expected.module}.`, issues);
    assertOk(row.unit === expected.unit, `${expected.key} unit=${row.unit}; expected ${expected.unit}.`, issues);
    assertOk(String(row.currency).toUpperCase() === "EUR", `${expected.key} currency=${row.currency}; expected EUR.`, issues);
    assertOk(Number(row.amount) === expected.amount, `${expected.key} amount=${row.amount}; expected ${expected.amount}.`, issues);

    if (INVITE_ONLY_KEYS.has(expected.key)) {
      const hasPublicPrice = ["stripe_price_id", "stripe_price_id_monthly", "stripe_monthly_price_id", "stripe_price_id_annual", "stripe_annual_price_id"]
        .some((field) => Boolean(row.metadata?.[field]));
      assertOk(!hasPublicPrice, `${expected.key} is invite-only but has public price metadata.`, issues);
      assertOk(row.metadata?.invite_only === true, `${expected.key} must keep metadata.invite_only=true.`, issues);
      assertOk(row.metadata?.custom_annual_amount === true, `${expected.key} must keep metadata.custom_annual_amount=true.`, issues);
      assertOk(Boolean(row.metadata?.stripe_product_id), `${expected.key} should keep a Stripe product id for admin-created investor payments.`, issues);
      continue;
    }

    for (const priceSpec of expected.prices) {
      const configuredPriceId = metadataPriceId(row, priceSpec.cycle);
      assertOk(Boolean(configuredPriceId), `${expected.key} missing ${priceSpec.cycle} Stripe price metadata.`, issues);
    }

    if (PUBLIC_SUBSCRIPTION_KEYS.has(expected.key)) {
      assertOk(Boolean(metadataPriceId(row, "monthly")), `${expected.key} missing monthly price id.`, issues);
      assertOk(Boolean(metadataPriceId(row, "annual")), `${expected.key} missing annual price id.`, issues);
    }

    if (SELF_SERVE_ADDON_KEYS.has(expected.key)) {
      assertOk(row.module === "valuation_reports", `${expected.key} self-serve add-on must stay in valuation_reports.`, issues);
      assertOk(expected.credits > 0, `${expected.key} must have a positive credit grant in the audit catalog.`, issues);
    }
  }

  for (const row of rows) {
    if (!EXPECTED_BY_KEY.has(row.key) && Number(row.amount) > 0) {
      warnings.push(`Active paid pricing_configs row ${row.key} is outside the audited MaiProp catalog.`);
    }
  }

  return { rowByKey, checkedRows };
}

function validateStripePrices({ prices, rowByKey, issues, warnings }) {
  const priceByLookupKey = new Map(prices.map((price) => [price.lookup_key, price]));
  const summarized = [];

  for (const expected of EXPECTED_CATALOG) {
    const row = rowByKey.get(expected.key);
    for (const spec of expected.prices) {
      const price = priceByLookupKey.get(spec.lookupKey);
      if (!price) {
        issues.push(`Missing active Stripe price lookup_key=${spec.lookupKey}.`);
        continue;
      }
      const summary = summarizePrice(price);
      summarized.push({ key: expected.key, access: expected.access, cycle: spec.cycle, ...summary });

      const metadataId = row ? metadataPriceId(row, spec.cycle) : null;
      assertOk(summary.id === metadataId, `${expected.key} ${spec.cycle} Supabase price ${metadataId ?? "missing"} does not match Stripe lookup ${summary.id}.`, issues);
      assertOk(summary.active === true, `${spec.lookupKey} is not active.`, issues);
      assertOk(summary.currency === EXPECTED_CURRENCY, `${spec.lookupKey} currency=${summary.currency}; expected ${EXPECTED_CURRENCY}.`, issues);
      assertOk(Number(summary.unit_amount) === Math.round(spec.amount * 100), `${spec.lookupKey} amount=${summary.unit_amount}; expected ${Math.round(spec.amount * 100)}.`, issues);
      assertOk(summary.recurring_interval === spec.recurringInterval, `${spec.lookupKey} recurring=${summary.recurring_interval}; expected ${spec.recurringInterval}.`, issues);
      assertOk(summary.tax_behavior === EXPECTED_TAX_BEHAVIOR, `${spec.lookupKey} tax_behavior=${summary.tax_behavior}; expected ${EXPECTED_TAX_BEHAVIOR}.`, issues);
      assertOk(summary.product_active === true, `${spec.lookupKey} product is not active.`, issues);
      if (!summary.product_tax_code) {
        warnings.push(`${spec.lookupKey} product has no Stripe tax_code; account default tax code will be used.`);
      }
      if (summary.price_metadata_key && summary.price_metadata_key !== expected.key) {
        issues.push(`${spec.lookupKey} price metadata key=${summary.price_metadata_key}; expected ${expected.key}.`);
      }
      if (summary.product_metadata_key && summary.product_metadata_key !== expected.key) {
        issues.push(`${spec.lookupKey} product metadata key=${summary.product_metadata_key}; expected ${expected.key}.`);
      }
    }
  }

  return summarized;
}

function validateSelfServeBoundaries(issues) {
  const publicSubscriptionKeys = EXPECTED_CATALOG
    .filter((item) => item.access === "public_subscription")
    .map((item) => item.key)
    .sort();
  const selfServeAddonKeys = EXPECTED_CATALOG
    .filter((item) => item.access === "self_serve_addon")
    .map((item) => item.key)
    .sort();
  const inviteOnlyKeys = EXPECTED_CATALOG
    .filter((item) => item.access === "invite_only_payment")
    .map((item) => item.key)
    .sort();

  assertOk(
    JSON.stringify(publicSubscriptionKeys) === JSON.stringify([...PUBLIC_SUBSCRIPTION_KEYS].sort()),
    "Audited public subscription keys diverge from create-checkout public allowlist.",
    issues,
  );
  assertOk(
    JSON.stringify(selfServeAddonKeys) === JSON.stringify([...SELF_SERVE_ADDON_KEYS].sort()),
    "Audited self-serve add-on keys diverge from create-checkout/BillingTab allowlist.",
    issues,
  );
  assertOk(
    JSON.stringify(inviteOnlyKeys) === JSON.stringify([...INVITE_ONLY_KEYS].sort()),
    "Audited invite-only keys diverge from investor payment allowlist.",
    issues,
  );
}

function printHuman(report) {
  console.log(`Stripe business-logic audit (${report.mode}, API ${STRIPE_API_VERSION})`);
  console.log(`Stripe account: ${report.stripe.account_id} (${report.stripe.display_name ?? "unnamed"})`);
  console.log(`Supabase rows checked: ${report.supabase.checked_rows}/${EXPECTED_CATALOG.length}`);
  console.log(`Stripe prices checked: ${report.stripe.checked_prices}/${REQUIRED_LOOKUP_KEYS.length}`);
  console.log(`Public subscriptions: ${report.summary.public_subscriptions.join(", ")}`);
  console.log(`Self-serve add-ons: ${report.summary.self_serve_addons.join(", ")}`);
  console.log(`Manual/internal catalog rows: ${report.summary.manual_catalog_rows.join(", ")}`);
  for (const issue of report.issues) console.log(`ERROR: ${issue}`);
  for (const warning of report.warnings) console.log(`WARN: ${warning}`);
}

async function main() {
  const stripeKey = getStripeKey();
  const mode = runtimeModeFromKey(stripeKey);
  const expectedAccountId = expectedAccountForMode(mode);
  const issues = [];
  const warnings = [];

  const account = await stripeRequest("GET", "/v1/account", stripeKey);
  assertOk(account.id === expectedAccountId, `Stripe account=${account.id}; expected ${expectedAccountId}.`, issues);
  assertOk(String(account.country ?? "").toUpperCase() === EXPECTED_COUNTRY, `Stripe account country=${account.country}; expected ${EXPECTED_COUNTRY}.`, issues);
  assertOk(String(account.default_currency ?? "").toLowerCase() === EXPECTED_CURRENCY, `Stripe account currency=${account.default_currency}; expected ${EXPECTED_CURRENCY}.`, issues);

  const rows = await fetchPricingRows();
  const { rowByKey, checkedRows } = validatePricingRows(rows, issues, warnings);
  validateSelfServeBoundaries(issues);

  const prices = await listPricesByLookupKeys(stripeKey, REQUIRED_LOOKUP_KEYS);
  const summarizedPrices = validateStripePrices({ prices, rowByKey, issues, warnings });

  const report = {
    ok: issues.length === 0,
    mode,
    stripe: {
      account_id: account.id,
      expected_account_id: expectedAccountId,
      display_name: account.display_name ?? account.settings?.dashboard?.display_name ?? null,
      business_profile_name: account.business_profile?.name ?? null,
      country: account.country ?? null,
      default_currency: account.default_currency ?? null,
      checked_prices: summarizedPrices.length,
    },
    supabase: {
      checked_rows: checkedRows.length,
      active_rows: rows.length,
    },
    summary: {
      public_subscriptions: EXPECTED_CATALOG.filter((item) => item.access === "public_subscription").map((item) => item.key),
      self_serve_addons: EXPECTED_CATALOG.filter((item) => item.access === "self_serve_addon").map((item) => item.key),
      manual_catalog_rows: EXPECTED_CATALOG.filter((item) => item.access.startsWith("manual")).map((item) => item.key),
      invite_only: EXPECTED_CATALOG.filter((item) => item.access === "invite_only_payment").map((item) => item.key),
    },
    prices: summarizedPrices,
    issues,
    warnings,
  };

  if (showJson) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(formatStripeKeyEvidence(stripeKey));
    printHuman(report);
  }

  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
