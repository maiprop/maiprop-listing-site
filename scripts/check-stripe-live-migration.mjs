#!/usr/bin/env node

/**
 * Live Stripe migration gate.
 *
 * This check is intentionally read-only. It requires a restricted live Stripe key
 * and verifies that live Stripe objects, production Supabase pricing metadata,
 * webhooks, Tax, VAT, and Customer Portal are aligned before real payments are
 * enabled.
 */

import { formatStripeKeyEvidence, getStripeReadOnlyKey } from "./stripe-readiness-env.mjs";
import { createStripeLiveMigrationEvidence } from "./verify-stripe-live-migration-evidence.mjs";

const STRIPE_API_BASE = "https://api.stripe.com";
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? "2026-06-24.dahlia";
const EXPECTED_ACCOUNT_ID = process.env.STRIPE_EXPECTED_ACCOUNT_ID ?? "acct_1TnuLTGfOEgBOxtl";
const EXPECTED_COUNTRY = (process.env.STRIPE_TAX_EXPECT_COUNTRY ?? "GR").toUpperCase();
const EXPECTED_CURRENCY = "eur";
const EXPECTED_VAT_ID = (process.env.STRIPE_COMPANY_VAT_ID ?? "EL802708301").replace(/\s+/g, "").toUpperCase();
const EXPECTED_WEBHOOK_URL = process.env.STRIPE_WEBHOOK_EXPECTED_URL ??
  "https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/stripe-webhook";

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
  "invoice.payment_failed",
  "invoice.payment_succeeded",
  "subscription_schedule.aborted",
  "subscription_schedule.canceled",
  "subscription_schedule.completed",
  "subscription_schedule.released",
  "subscription_schedule.updated",
];

const CATALOG = [
  ["pro", "participant", [["monthly", "maiprop_pro_monthly", 29, "month"], ["annual", "maiprop_pro_annual", 290, "year"]]],
  ["agent_basic", "agent", [["monthly", "maiprop_agent_basic_monthly", 149, "month"], ["annual", "maiprop_agent_basic_annual", 1490, "year"]]],
  ["developer_pro", "developer", [["monthly", "maiprop_developer_pro_monthly", 129, "month"], ["annual", "maiprop_developer_pro_annual", 1290, "year"]]],
  ["professional_basic", "professional", [["monthly", "maiprop_professional_basic_monthly", 69, "month"], ["annual", "maiprop_professional_basic_annual", 690, "year"]]],
  ["investor_private", "investor", []],
  ["investor_institutional", "institutional", []],
  ["valuation_single", "participant", [["one_time", "maiprop_valuation_single", 39, null]]],
  ["valuation_bundle", "participant", [["one_time", "maiprop_valuation_bundle", 149, null]]],
  ["property_report_single", "participant", [["one_time", "maiprop_property_report_single", 49, null]]],
  ["neighbourhood_report_single", "participant", [["one_time", "maiprop_neighbourhood_report_single", 19, null]]],
  ["neighbourhood_report_bundle", "participant", [["one_time", "maiprop_neighbourhood_report_bundle", 39, null]]],
  ["extra_listing", "participant", [["one_time", "maiprop_extra_listing", 12, null]]],
  ["featured_listing", "participant", [["one_time", "maiprop_featured_listing", 39, null]]],
  ["priority_placement", "participant", [["one_time", "maiprop_priority_placement", 59, null]]],
  ["featured_priority_bundle", "participant", [["one_time", "maiprop_featured_priority_bundle", 79, null]]],
  ["agent_extra_seat", "agent", [["monthly", "maiprop_agent_extra_seat_monthly", 39, "month"]]],
  ["agency_branded_profile", "agent", [["monthly", "maiprop_agency_branded_profile_monthly", 49, "month"]]],
  ["agency_dedicated_manager", "agent", [["monthly", "maiprop_agency_dedicated_manager_monthly", 199, "month"]]],
  ["agency_white_label", "agent", [["monthly", "maiprop_agency_white_label_monthly", 149, "month"]]],
  ["featured_professional", "professional", [["monthly", "maiprop_featured_professional_monthly", 59, "month"]]],
  ["professional_api_access", "professional", [["monthly", "maiprop_professional_api_access_monthly", 59, "month"]]],
  ["professional_referral_network", "professional", [["monthly", "maiprop_professional_referral_network_monthly", 39, "month"]]],
  ["professional_extra_seat", "professional", [["monthly", "maiprop_professional_extra_seat_monthly", 19, "month"]]],
  ["professional_branded_email", "professional", [["monthly", "maiprop_professional_branded_email_monthly", 15, "month"]]],
  ["market_intelligence", "participant", [["monthly", "maiprop_market_intelligence_monthly", 199, "month"]]],
  ["avm_api", "participant", [["monthly", "maiprop_avm_api_monthly", 299, "month"]]],
  ["auction_intelligence", "participant", [["monthly", "maiprop_auction_intelligence_monthly", 149, "month"]]],
].map(([key, audience, prices]) => ({
  key,
  audience,
  prices: prices.map(([cycle, lookupKey, amountMajor, recurringInterval]) => ({
    cycle,
    lookupKey,
    amountMajor,
    recurringInterval,
  })),
}));

const RETIRED_CATALOG_KEYS = new Set(["extra_priority_ad"]);

const REQUIRED_LOOKUP_KEYS = CATALOG.flatMap((item) => item.prices.map((price) => price.lookupKey));

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

function getStripeKey() {
  return getStripeReadOnlyKey(process.env);
}

async function stripeRequest(path, values = undefined) {
  const url = new URL(`${STRIPE_API_BASE}${path}`);
  const query = encodeForm(values);
  for (const [key, value] of query.entries()) url.searchParams.append(key, value);
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${getStripeKey()}`,
      "stripe-version": STRIPE_API_VERSION,
      "user-agent": "maiprop-stripe-live-migration-check/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Stripe API ${response.status} ${path}`);
  }
  return body;
}

async function listAll(path, values = {}) {
  const rows = [];
  let startingAfter = null;
  do {
    const page = await stripeRequest(path, {
      ...values,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    rows.push(...(Array.isArray(page.data) ? page.data : []));
    startingAfter = page.has_more ? page.data.at(-1)?.id : null;
  } while (startingAfter);
  return rows;
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
  const url = process.env.VITE_SUPABASE_URL ?? "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error("VITE_SUPABASE_URL must be set to the production Supabase URL.");
  }
  return url.replace(/\/$/, "");
}

function getSupabasePublishableKey() {
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SB_SERVICE_ROLE_KEY"]) {
    if (String(process.env[name] ?? "").trim()) {
      throw new Error(`${name} is forbidden for the read-only Stripe readiness producer.`);
    }
  }
  const key = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const isPublishable = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  const isLegacyAnon = keyRole(key) === "anon";
  if (!isPublishable && !isLegacyAnon) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable or legacy anon key.",
    );
  }
  return key;
}

async function supabaseRest(path) {
  const key = getSupabasePublishableKey();
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    headers: {
      apikey: key,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.message ?? body?.error ?? `Supabase REST ${response.status}`);
  return body;
}

async function fetchPricingRows() {
  const select = [
    "key",
    "audience",
    "amount",
    "currency",
    "unit",
    "metadata",
    "is_active",
  ].join(",");
  const rows = await supabaseRest(
    `/rest/v1/pricing_configs?select=${encodeURIComponent(select)}&is_active=eq.true&order=key.asc`,
  );
  return Array.isArray(rows) ? rows : [];
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

function registrationCountry(registration) {
  return String(
    registration.country ??
      registration.country_options?.eu?.country ??
      registration.country_options?.[EXPECTED_COUNTRY.toLowerCase()]?.country ??
      "",
  ).toUpperCase();
}

function normalizeVat(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

function endpointCoversEvents(endpoint) {
  const enabled = endpoint.enabled_events ?? [];
  return enabled.includes("*") || REQUIRED_WEBHOOK_EVENTS.every((event) => enabled.includes(event));
}

async function main() {
  const issues = [];
  const warnings = [];
  const stripeKey = getStripeKey();

  const account = await stripeRequest("/v1/account");
  if (account.id !== EXPECTED_ACCOUNT_ID) {
    issues.push(`Stripe account=${account.id}; expected ${EXPECTED_ACCOUNT_ID}.`);
  }
  if (String(account.country ?? "").toUpperCase() !== EXPECTED_COUNTRY) {
    issues.push(`Stripe account country=${account.country}; expected ${EXPECTED_COUNTRY}.`);
  }
  if (String(account.default_currency ?? "").toLowerCase() !== EXPECTED_CURRENCY) {
    issues.push(`Stripe default currency=${account.default_currency}; expected ${EXPECTED_CURRENCY}.`);
  }

  const products = await listAll("/v1/products", { active: true });
  const productByKey = new Map(products.map((product) => [
    product.metadata?.maiprop_key ?? product.metadata?.pricing_config_key,
    product,
  ]).filter(([key]) => Boolean(key)));

  const prices = [];
  for (let index = 0; index < REQUIRED_LOOKUP_KEYS.length; index += 10) {
    const chunk = REQUIRED_LOOKUP_KEYS.slice(index, index + 10);
    const page = await stripeRequest("/v1/prices", {
      active: true,
      "expand[]": "data.product",
      "lookup_keys[]": chunk,
    });
    prices.push(...(page.data ?? []));
  }
  const priceByLookupKey = new Map(prices.map((price) => [price.lookup_key, price]));

  const rows = await fetchPricingRows();
  const rowByKey = new Map(rows.map((row) => [row.key, row]));

  for (const key of RETIRED_CATALOG_KEYS) {
    if (rowByKey.has(key)) {
      issues.push(`Retired Supabase pricing_configs row ${key} is still active.`);
    }
    if (productByKey.has(key)) {
      issues.push(`Retired live Stripe product ${key} is still active.`);
    }
  }

  for (const item of CATALOG) {
    const row = rowByKey.get(item.key);
    const product = productByKey.get(item.key);
    if (!row) {
      issues.push(`Missing active Supabase pricing_configs row for ${item.key}.`);
    }
    if (!product) {
      issues.push(`Missing active live Stripe product metadata.maiprop_key=${item.key}.`);
    } else {
      if (product.livemode !== true) issues.push(`${item.key} product ${product.id} is not livemode=true.`);
      if (!product.tax_code && !product.tax_details?.tax_code) warnings.push(`${item.key} product has no tax_code.`);
      if (row?.metadata?.stripe_product_id !== product.id) {
        issues.push(`${item.key} Supabase stripe_product_id=${row?.metadata?.stripe_product_id ?? "missing"}; expected live ${product.id}.`);
      }
    }

    for (const spec of item.prices) {
      const price = priceByLookupKey.get(spec.lookupKey);
      if (!price) {
        issues.push(`Missing active live Stripe price lookup_key=${spec.lookupKey}.`);
        continue;
      }
      const productId = typeof price.product === "string" ? price.product : price.product?.id;
      if (price.livemode !== true) issues.push(`${spec.lookupKey} price ${price.id} is not livemode=true.`);
      if (String(price.currency).toLowerCase() !== EXPECTED_CURRENCY) issues.push(`${spec.lookupKey} currency=${price.currency}; expected eur.`);
      if (Number(price.unit_amount) !== Math.round(spec.amountMajor * 100)) {
        issues.push(`${spec.lookupKey} amount=${price.unit_amount}; expected ${Math.round(spec.amountMajor * 100)}.`);
      }
      if ((price.recurring?.interval ?? null) !== spec.recurringInterval) {
        issues.push(`${spec.lookupKey} recurring=${price.recurring?.interval ?? null}; expected ${spec.recurringInterval}.`);
      }
      if (price.tax_behavior !== "exclusive") issues.push(`${spec.lookupKey} tax_behavior=${price.tax_behavior}; expected exclusive.`);
      if (typeof price.product === "object" && price.product?.livemode !== true) {
        issues.push(`${spec.lookupKey} expanded product ${productId} is not livemode=true.`);
      }
      const metadataId = row ? metadataPriceId(row, spec.cycle) : null;
      if (metadataId !== price.id) {
        issues.push(`${item.key} ${spec.cycle} Supabase price=${metadataId ?? "missing"}; expected live ${price.id}.`);
      }
    }
  }

  const registrations = await listAll("/v1/tax/registrations", { status: "active" });
  if (!registrations.some((registration) =>
    registrationCountry(registration) === EXPECTED_COUNTRY || registration.country_options?.eu
  )) {
    issues.push(`No active Stripe Tax registration found for ${EXPECTED_COUNTRY}.`);
  }

  const taxIds = await listAll("/v1/tax_ids");
  if (!taxIds.some((taxId) => normalizeVat(taxId.value) === EXPECTED_VAT_ID && taxId.livemode === true)) {
    issues.push(`No live account tax ID found for ${EXPECTED_VAT_ID}.`);
  }

  const webhooks = await listAll("/v1/webhook_endpoints");
  const webhook = webhooks.find((endpoint) =>
    endpoint.url === EXPECTED_WEBHOOK_URL &&
    endpoint.status === "enabled" &&
    endpoint.livemode === true &&
    endpointCoversEvents(endpoint)
  );
  if (!webhook) {
    issues.push(`No enabled live webhook endpoint covers required events at ${EXPECTED_WEBHOOK_URL}.`);
  }

  const portalConfigs = await listAll("/v1/billing_portal/configurations");
  if (!portalConfigs.some((config) => config.active === true && config.livemode === true)) {
    issues.push("No active live Billing Customer Portal configuration found.");
  }

  const report = {
    ok: issues.length === 0,
    account: {
      id: account.id,
      display_name: account.display_name ?? account.settings?.dashboard?.display_name ?? null,
      country: account.country,
      default_currency: account.default_currency,
    },
    checked: {
      catalog_products: CATALOG.length,
      catalog_prices: REQUIRED_LOOKUP_KEYS.length,
      live_products_seen: products.length,
      live_prices_seen: prices.length,
      supabase_rows_seen: rows.length,
      active_tax_registrations: registrations.length,
      account_tax_ids: taxIds.length,
      webhook_endpoints: webhooks.length,
      portal_configurations: portalConfigs.length,
    },
    webhook: webhook ? { id: webhook.id, url: webhook.url } : null,
    issues,
    warnings,
  };

  const outputJson = process.argv.includes("--json");
  const outputEvidence = process.argv.includes("--evidence-json");
  if (outputJson && outputEvidence) {
    throw new Error("Choose exactly one of --json or --evidence-json.");
  }

  if (outputEvidence) {
    const evidence = createStripeLiveMigrationEvidence({
      report,
      stripeKey,
      apiVersion: STRIPE_API_VERSION,
      provenance: {
        repository: process.env.GITHUB_REPOSITORY,
        release_sha: process.env.RELEASE_SHA,
        source_tree: process.env.SOURCE_TREE,
        workflow_path: ".github/workflows/verify-stripe-live-readiness.yml",
        workflow_ref: process.env.GITHUB_WORKFLOW_REF,
        workflow_sha: process.env.GITHUB_WORKFLOW_SHA,
        event: process.env.GITHUB_EVENT_NAME,
        workflow_run_id: process.env.GITHUB_RUN_ID,
        workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT,
        actor: process.env.GITHUB_ACTOR,
        triggering_actor: process.env.GITHUB_TRIGGERING_ACTOR,
        evidence_nonce: process.env.RELEASE_EVIDENCE_NONCE,
      },
    });
    console.log(JSON.stringify(evidence, null, 2));
  } else if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatStripeKeyEvidence(stripeKey));
    console.log(`Stripe live migration gate (${STRIPE_API_VERSION})`);
    console.log(`Account: ${report.account.id} (${report.account.display_name ?? "unnamed"})`);
    console.log(`Products checked: ${report.checked.live_products_seen}/${report.checked.catalog_products}`);
    console.log(`Prices checked: ${report.checked.live_prices_seen}/${report.checked.catalog_prices}`);
    console.log(`Supabase rows seen: ${report.checked.supabase_rows_seen}`);
    console.log(`Tax registrations: ${report.checked.active_tax_registrations}; account tax IDs: ${report.checked.account_tax_ids}`);
    console.log(`Webhook: ${report.webhook?.id ?? "missing"}`);
    for (const issue of issues) console.log(`ERROR: ${issue}`);
    for (const warning of warnings) console.log(`WARN: ${warning}`);
  }

  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
