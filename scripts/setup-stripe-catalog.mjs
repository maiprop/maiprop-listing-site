#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const STRIPE_API_BASE = "https://api.stripe.com";
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? "2026-06-24.dahlia";
const CATALOG_VERSION = "2026-06-28";
const STRIPE_SAAS_PERSONAL_TAX_CODE = process.env.STRIPE_SAAS_PERSONAL_TAX_CODE ?? "txcd_10103000";
const STRIPE_SAAS_BUSINESS_TAX_CODE = process.env.STRIPE_SAAS_BUSINESS_TAX_CODE ?? "txcd_10103001";
const STRIPE_AI_PERSONAL_TAX_CODE = process.env.STRIPE_AI_PERSONAL_TAX_CODE ?? "txcd_10105001";
const STRIPE_AI_BUSINESS_TAX_CODE = process.env.STRIPE_AI_BUSINESS_TAX_CODE ?? "txcd_10105002";
const STRIPE_DEFAULT_PRODUCT_TAX_CODE = process.env.STRIPE_PRODUCT_TAX_CODE ?? STRIPE_SAAS_BUSINESS_TAX_CODE;
const STRIPE_DEFAULT_TAX_BEHAVIOR = process.env.STRIPE_TAX_BEHAVIOR ?? "exclusive";

if (!["exclusive", "inclusive"].includes(STRIPE_DEFAULT_TAX_BEHAVIOR)) {
  throw new Error("STRIPE_TAX_BEHAVIOR must be exclusive or inclusive.");
}

const PUBLIC_SUBSCRIPTION_KEYS = new Set([
  "pro",
  "agent_basic",
  "developer_pro",
  "professional_basic",
]);

const PRO_PRODUCT_KEYS = new Set([
  "pro",
  "agent_basic",
  "developer_pro",
  "professional_basic",
]);

const BUSINESS_SOFTWARE_AUDIENCES = new Set([
  "agent",
  "developer",
  "professional",
  "investor",
  "institutional",
]);

const AI_SOFTWARE_KEYS = new Set([
  "valuation_single",
  "valuation_bundle",
  "neighbourhood_report_single",
  "neighbourhood_report_bundle",
]);

const PLAN_PRICE_ENV_ALIASES = {
  pro: {
    monthly: ["STRIPE_PRICE_PARTICIPANT_MONTHLY", "STRIPE_PRICE_PRO_MONTHLY"],
    annual: ["STRIPE_PRICE_PARTICIPANT_ANNUAL", "STRIPE_PRICE_PRO_ANNUAL"],
  },
  agent_basic: {
    monthly: ["STRIPE_PRICE_AGENT_MONTHLY"],
    annual: ["STRIPE_PRICE_AGENT_ANNUAL"],
  },
  developer_pro: {
    monthly: ["STRIPE_PRICE_DEVELOPER_MONTHLY"],
    annual: ["STRIPE_PRICE_DEVELOPER_ANNUAL"],
  },
  professional_basic: {
    monthly: ["STRIPE_PRICE_PROFESSIONAL_MONTHLY"],
    annual: ["STRIPE_PRICE_PROFESSIONAL_ANNUAL"],
  },
};

const FEATURE_NAMES = {
  ai_insights: "AI insights",
  analytics_dashboard: "Analytics dashboard",
  priority_matching: "Priority matching",
  participant_listing_quota_5: "Up to 5 participant listings",
  unlimited_alerts: "Unlimited saved search alerts",
  unlimited_listings: "Unlimited listings",
  agent_crm: "Agent CRM",
  agent_priority_ads_10: "10 priority ads",
  agent_ai_tools: "Agent AI tools",
  developer_projects: "Unlimited developer projects",
  new_build_showcase: "New-build showcase",
  project_ads: "Project advertising",
  floor_plans: "Floor plans",
  professional_priority_leads: "Priority professional leads",
  booking_calendar: "Booking calendar",
  verified_badge: "Verified professional badge",
  professional_ai_tools: "Professional AI tools",
  investor_deal_flow: "Investor deal-flow access",
  investor_ai_matching: "Investor AI matching",
  investor_reports: "Investor report access",
  institutional_pipeline: "Institutional pipeline access",
  bulk_opportunity_view: "Bulk opportunity view",
  dedicated_manager: "Dedicated manager",
  valuation_report: "AI valuation report",
  property_report: "Property report",
  neighbourhood_report: "Neighbourhood report",
  extra_listing_slot: "Extra listing slot",
  featured_listing: "Featured listing",
  priority_placement: "Priority placement",
  agent_extra_seat: "Extra agent seat",
  agency_branding: "Agency branding",
  white_label_domain: "White-label domain",
  featured_professional: "Featured professional placement",
  extra_priority_ad: "Extra priority ad",
  professional_api_access: "Professional API access",
  professional_referral_network: "Professional referral network",
  professional_extra_seat: "Professional extra seat",
  professional_branded_email: "Professional branded email templates",
  market_intelligence: "Market intelligence",
  avm_api: "AVM API",
  auction_intelligence: "Auction intelligence",
};

const CATALOG = [
  {
    key: "pro",
    label: "Participant Pro",
    description: "AI insights, analytics, priority matching and up to 5 listings.",
    audience: "participant",
    role: "participant",
    module: "user_subscription",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 29,
    sortOrder: 2,
    checkoutType: "subscription",
    annualCompanion: true,
    marketingFeatures: [
      "AI insights",
      "Analytics dashboard",
      "Priority matching",
      "Up to 5 listings",
      "Unlimited saved searches",
    ],
    entitlementFeatures: [
      "ai_insights",
      "analytics_dashboard",
      "priority_matching",
      "participant_listing_quota_5",
      "unlimited_alerts",
    ],
  },
  {
    key: "agent_basic",
    label: "Agent Pro",
    description: "Unlimited listings, full CRM, AI tools, analytics and 10 priority ads.",
    audience: "agent",
    role: "agent",
    module: "agent_subscription",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 149,
    sortOrder: 2,
    checkoutType: "subscription",
    annualCompanion: true,
    marketingFeatures: [
      "Unlimited listings",
      "Full CRM",
      "AI listing tools",
      "Analytics",
      "10 priority ads",
    ],
    entitlementFeatures: [
      "unlimited_listings",
      "agent_crm",
      "agent_ai_tools",
      "analytics_dashboard",
      "agent_priority_ads_10",
    ],
  },
  {
    key: "developer_pro",
    label: "Developer Pro",
    description: "Unlimited projects, new building showcase, project ads and floor plans.",
    audience: "developer",
    role: "developer",
    module: "developer_subscription",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 129,
    sortOrder: 1,
    checkoutType: "subscription",
    annualCompanion: true,
    marketingFeatures: [
      "Unlimited projects",
      "New-building showcase",
      "Project ads",
      "Floor plans",
      "Lead capture",
    ],
    entitlementFeatures: [
      "developer_projects",
      "new_build_showcase",
      "project_ads",
      "floor_plans",
      "analytics_dashboard",
    ],
  },
  {
    key: "professional_basic",
    label: "Professional Pro",
    description: "Priority leads, booking calendar, verified badge and AI tools.",
    audience: "professional",
    role: "professional",
    module: "professional_subscription",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 69,
    sortOrder: 1,
    checkoutType: "subscription",
    annualCompanion: true,
    marketingFeatures: [
      "Priority leads",
      "Booking calendar",
      "Verified badge",
      "AI tools",
      "Directory placement",
    ],
    entitlementFeatures: [
      "professional_priority_leads",
      "booking_calendar",
      "verified_badge",
      "professional_ai_tools",
      "analytics_dashboard",
    ],
  },
  {
    key: "investor_private",
    label: "Private Investor",
    description: "Invitation-only investor access with per-application pricing.",
    audience: "investor",
    role: "investor",
    module: "investor_subscription",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 0,
    sortOrder: 1,
    checkoutType: "investor_payment",
    metadata: { by_application: true },
    marketingFeatures: [
      "Private deal flow",
      "AI matching",
      "Investor reports",
      "Admin-managed access",
    ],
    entitlementFeatures: [
      "investor_deal_flow",
      "investor_ai_matching",
      "investor_reports",
    ],
  },
  {
    key: "investor_institutional",
    label: "Institutional Investor",
    description: "Invitation-only institutional investor access with bespoke pricing.",
    audience: "investor",
    role: "institutional",
    module: "investor_subscription",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 0,
    sortOrder: 2,
    checkoutType: "investor_payment",
    metadata: { by_application: true },
    marketingFeatures: [
      "Institutional pipeline",
      "Bulk opportunity view",
      "Dedicated manager",
      "Admin-managed access",
    ],
    entitlementFeatures: [
      "institutional_pipeline",
      "bulk_opportunity_view",
      "dedicated_manager",
    ],
  },
  {
    key: "valuation_single",
    label: "AI Valuation (single)",
    description: "Full AI valuation: market comp, yield estimate and confidence score.",
    audience: "participant",
    role: "participant",
    module: "valuation_reports",
    unit: "per_report",
    currency: "EUR",
    amountMajor: 39,
    sortOrder: 1,
    checkoutType: "addon",
    marketingFeatures: ["Market comp", "Yield estimate", "Confidence score"],
    entitlementFeatures: ["valuation_report"],
  },
  {
    key: "valuation_bundle",
    label: "AI Valuation x 5",
    description: "5 valuation reports at a bundled rate.",
    audience: "participant",
    role: "participant",
    module: "valuation_reports",
    unit: "bundle",
    currency: "EUR",
    amountMajor: 149,
    sortOrder: 2,
    checkoutType: "addon",
    marketingFeatures: ["5 valuation credits", "Bundled rate", "AI market context"],
    entitlementFeatures: ["valuation_report"],
  },
  {
    key: "property_report_single",
    label: "Property Report (single)",
    description: "Full property-level report: ownership history, liens and legal status.",
    audience: "participant",
    role: "participant",
    module: "valuation_reports",
    unit: "per_report",
    currency: "EUR",
    amountMajor: 49,
    sortOrder: 3,
    checkoutType: "addon",
    marketingFeatures: ["Ownership history", "Lien signals", "Legal status"],
    entitlementFeatures: ["property_report"],
  },
  {
    key: "neighbourhood_report_single",
    label: "Neighbourhood Report",
    description: "Price trends, safety, POIs, development projects and investment outlook.",
    audience: "participant",
    role: "participant",
    module: "valuation_reports",
    unit: "per_report",
    currency: "EUR",
    amountMajor: 19,
    sortOrder: 4,
    checkoutType: "addon",
    marketingFeatures: ["Price trends", "POIs", "Investment outlook"],
    entitlementFeatures: ["neighbourhood_report"],
  },
  {
    key: "neighbourhood_report_bundle",
    label: "Neighbourhood Bundle x 3",
    description: "3 neighbourhood reports at a bundled rate.",
    audience: "participant",
    role: "participant",
    module: "valuation_reports",
    unit: "bundle",
    currency: "EUR",
    amountMajor: 39,
    sortOrder: 5,
    checkoutType: "addon",
    marketingFeatures: ["3 report credits", "Bundled rate", "Area intelligence"],
    entitlementFeatures: ["neighbourhood_report"],
  },
  {
    key: "extra_listing",
    label: "Extra listing slot",
    description: "One additional listing beyond plan quota.",
    audience: "participant",
    role: "participant",
    module: "adhoc_charges",
    unit: "per_listing",
    currency: "EUR",
    amountMajor: 12,
    sortOrder: 1,
    checkoutType: "addon",
    marketingFeatures: ["One additional listing", "Beyond plan quota"],
    entitlementFeatures: ["extra_listing_slot"],
  },
  {
    key: "featured_listing",
    label: "Featured listing",
    description: "Homepage carousel and search spotlight for 30 days.",
    audience: "participant",
    role: "participant",
    module: "adhoc_charges",
    unit: "per_listing",
    currency: "EUR",
    amountMajor: 39,
    sortOrder: 2,
    checkoutType: "addon",
    marketingFeatures: ["Homepage carousel", "Search spotlight", "30 days"],
    entitlementFeatures: ["featured_listing"],
  },
  {
    key: "priority_placement",
    label: "Priority placement",
    description: "Pinned above non-priority results in area and type for 30 days.",
    audience: "participant",
    role: "participant",
    module: "adhoc_charges",
    unit: "per_listing",
    currency: "EUR",
    amountMajor: 59,
    sortOrder: 3,
    checkoutType: "addon",
    marketingFeatures: ["Pinned results", "Area and type targeting", "30 days"],
    entitlementFeatures: ["priority_placement"],
  },
  {
    key: "featured_priority_bundle",
    label: "Featured + Priority",
    description: "Featured and priority listing exposure bundled for 30 days.",
    audience: "participant",
    role: "participant",
    module: "adhoc_charges",
    unit: "per_listing",
    currency: "EUR",
    amountMajor: 79,
    sortOrder: 4,
    checkoutType: "addon",
    marketingFeatures: ["Featured listing", "Priority placement", "Bundled rate"],
    entitlementFeatures: ["featured_listing", "priority_placement"],
  },
  {
    key: "agent_extra_seat",
    label: "Extra agent seat",
    description: "Add another agent to an agency under a single Pro plan.",
    audience: "agent",
    role: "agent",
    module: "adhoc_charges",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 39,
    sortOrder: 1,
    checkoutType: "addon",
    marketingFeatures: ["Extra team member", "Shared agency plan"],
    entitlementFeatures: ["agent_extra_seat"],
  },
  {
    key: "agency_branded_profile",
    label: "Agency-branded profile",
    description: "Custom logo, colours and team page on an agency profile.",
    audience: "agent",
    role: "agent",
    module: "adhoc_charges",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 49,
    sortOrder: 2,
    checkoutType: "addon",
    marketingFeatures: ["Custom logo", "Agency colours", "Team page"],
    entitlementFeatures: ["agency_branding"],
  },
  {
    key: "agency_dedicated_manager",
    label: "Dedicated account manager",
    description: "A named account manager for onboarding, training and support.",
    audience: "agent",
    role: "agent",
    module: "adhoc_charges",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 199,
    sortOrder: 3,
    checkoutType: "addon",
    marketingFeatures: ["Named manager", "Onboarding", "Training and support"],
    entitlementFeatures: ["dedicated_manager"],
  },
  {
    key: "agency_white_label",
    label: "White-label domain",
    description: "Serve listings on an agency-owned domain.",
    audience: "agent",
    role: "agent",
    module: "adhoc_charges",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 149,
    sortOrder: 4,
    checkoutType: "addon",
    marketingFeatures: ["Custom domain", "Agency-branded listing experience"],
    entitlementFeatures: ["white_label_domain"],
  },
  {
    key: "featured_professional",
    label: "Featured professional",
    description: "Top-of-category placement in the professional directory.",
    audience: "professional",
    role: "professional",
    module: "adhoc_charges",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 59,
    sortOrder: 1,
    checkoutType: "addon",
    marketingFeatures: ["Top category placement", "Monthly visibility"],
    entitlementFeatures: ["featured_professional"],
  },
  {
    key: "extra_priority_ad",
    label: "Extra priority ad",
    description: "Push any listing to the top of search for its area.",
    audience: "professional",
    role: "professional",
    module: "adhoc_charges",
    unit: "per_ad",
    currency: "EUR",
    amountMajor: 8,
    sortOrder: 2,
    checkoutType: "addon",
    marketingFeatures: ["Priority ad credit", "Area-targeted boost"],
    entitlementFeatures: ["extra_priority_ad"],
  },
  {
    key: "professional_api_access",
    label: "Professional API access",
    description: "Programmatic access to bookings, leads and AI tools.",
    audience: "professional",
    role: "professional",
    module: "adhoc_charges",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 59,
    sortOrder: 3,
    checkoutType: "addon",
    marketingFeatures: ["Booking API", "Lead API", "AI tool access"],
    entitlementFeatures: ["professional_api_access"],
  },
  {
    key: "professional_referral_network",
    label: "Referral network slot",
    description: "Cross-discipline referral network membership.",
    audience: "professional",
    role: "professional",
    module: "adhoc_charges",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 39,
    sortOrder: 4,
    checkoutType: "addon",
    marketingFeatures: ["Referral network", "Cross-discipline leads"],
    entitlementFeatures: ["professional_referral_network"],
  },
  {
    key: "professional_extra_seat",
    label: "Extra client seat",
    description: "Add a colleague or paralegal under a single Pro plan.",
    audience: "professional",
    role: "professional",
    module: "adhoc_charges",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 19,
    sortOrder: 5,
    checkoutType: "addon",
    marketingFeatures: ["Extra colleague", "Shared professional workspace"],
    entitlementFeatures: ["professional_extra_seat"],
  },
  {
    key: "professional_branded_email",
    label: "Branded email templates",
    description: "Send client communications from branded templates.",
    audience: "professional",
    role: "professional",
    module: "adhoc_charges",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 15,
    sortOrder: 6,
    checkoutType: "addon",
    marketingFeatures: ["Branded templates", "Client communications"],
    entitlementFeatures: ["professional_branded_email"],
  },
  {
    key: "market_intelligence",
    label: "Market Intelligence",
    description: "Greek property price index, transaction comps and regional trend reports.",
    audience: "participant",
    role: "participant",
    module: "os_data_products",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 199,
    sortOrder: 1,
    checkoutType: "data_product",
    marketingFeatures: ["Price index", "Transaction comps", "Trend reports"],
    entitlementFeatures: ["market_intelligence"],
  },
  {
    key: "avm_api",
    label: "AVM API",
    description: "Automated valuation endpoint for lenders, advisors and valuers.",
    audience: "participant",
    role: "participant",
    module: "os_data_products",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 299,
    sortOrder: 2,
    checkoutType: "data_product",
    marketingFeatures: ["Automated valuation endpoint", "API access", "B2B workflows"],
    entitlementFeatures: ["avm_api"],
  },
  {
    key: "auction_intelligence",
    label: "Auction Intelligence",
    description: "Court auction schedule, minimum bids and outcome database.",
    audience: "participant",
    role: "participant",
    module: "os_data_products",
    unit: "monthly",
    currency: "EUR",
    amountMajor: 149,
    sortOrder: 3,
    checkoutType: "data_product",
    marketingFeatures: ["Auction schedule", "Minimum bids", "Outcome database"],
    entitlementFeatures: ["auction_intelligence"],
  },
];

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    live: false,
    writeEnv: null,
    writeSql: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--live") parsed.live = true;
    else if (arg === "--write-env") parsed.writeEnv = argv[++index] ?? null;
    else if (arg === "--write-sql") parsed.writeSql = argv[++index] ?? null;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage:
  npm run stripe:setup-catalog -- --dry-run
  STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup-catalog -- --write-env .stripe.test.env --write-sql .tmp/stripe-pricing-metadata.sql

Options:
  --dry-run          Print the planned catalog without calling Stripe.
  --write-env PATH   Write generated Supabase Stripe price env vars.
  --write-sql PATH   Write SQL that upserts pricing_configs Stripe metadata.
  --live             Allow sk_live keys. Omit for test-mode setup.`);
}

function isRecurringUnit(unit) {
  return unit === "monthly" || unit === "yearly" || unit === "annual";
}

function recurringIntervalForUnit(unit) {
  if (unit === "yearly" || unit === "annual") return "year";
  if (unit === "monthly") return "month";
  return null;
}

function priceSpecsForItem(item) {
  if (item.amountMajor <= 0) return [];

  const currency = item.currency.toLowerCase();
  const base = {
    currency,
    amountMajor: item.amountMajor,
    unit: item.unit,
    taxBehavior: item.taxBehavior ?? STRIPE_DEFAULT_TAX_BEHAVIOR,
  };

  if (item.unit === "monthly") {
    const monthly = {
      ...base,
      billingCycle: "monthly",
      recurringInterval: "month",
      lookupKey: `maiprop_${item.key}_monthly`,
    };
    if (!item.annualCompanion) return [monthly];
    return [
      monthly,
      {
        ...base,
        billingCycle: "annual",
        recurringInterval: "year",
        amountMajor: item.amountMajor * 10,
        lookupKey: `maiprop_${item.key}_annual`,
      },
    ];
  }

  if (item.unit === "yearly" || item.unit === "annual") {
    return [{
      ...base,
      billingCycle: "annual",
      recurringInterval: "year",
      lookupKey: `maiprop_${item.key}_annual`,
    }];
  }

  return [{
    ...base,
    billingCycle: "one_time",
    recurringInterval: null,
    lookupKey: `maiprop_${item.key}`,
  }];
}

function stripeMetadataForItem(item) {
  const taxCode = taxCodeForItem(item);
  return {
    maiprop_key: item.key,
    pricing_config_key: item.key,
    plan_key: item.key,
    audience: item.audience,
    role: item.role,
    entitlement_role: item.role,
    module: item.module,
    unit: item.unit,
    checkout_type: item.checkoutType,
    catalog_version: CATALOG_VERSION,
    stripe_tax_code: taxCode,
    stripe_tax_behavior: item.taxBehavior ?? STRIPE_DEFAULT_TAX_BEHAVIOR,
  };
}

function taxCodeForItem(item) {
  if (item.taxCode) return item.taxCode;
  const isBusiness = BUSINESS_SOFTWARE_AUDIENCES.has(item.audience) ||
    BUSINESS_SOFTWARE_AUDIENCES.has(item.role) ||
    item.module === "os_data_products";
  if (AI_SOFTWARE_KEYS.has(item.key)) {
    return isBusiness ? STRIPE_AI_BUSINESS_TAX_CODE : STRIPE_AI_PERSONAL_TAX_CODE;
  }
  return isBusiness ? STRIPE_SAAS_BUSINESS_TAX_CODE : STRIPE_SAAS_PERSONAL_TAX_CODE;
}

function appendFormValue(form, key, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => appendFormValue(form, `${key}[${index}]`, entry));
    return;
  }
  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendFormValue(form, `${key}[${childKey}]`, childValue);
    }
    return;
  }
  form.append(key, String(value));
}

function toForm(params) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    appendFormValue(form, key, value);
  }
  return form;
}

function idempotencyKey(kind, stableKey, params) {
  const hash = createHash("sha256")
    .update(JSON.stringify(params))
    .digest("hex")
    .slice(0, 16);
  return `maiprop-catalog-${kind}-${stableKey}-${hash}`.slice(0, 255);
}

let stripeSecretKey = "";
let entitlementFeatureCache = null;

async function stripeRequest(method, path, params = {}, options = {}) {
  const url = new URL(path, STRIPE_API_BASE);
  const headers = {
    Authorization: `Bearer ${stripeSecretKey}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  const init = { method, headers };

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  if (method === "GET") {
    const form = toForm(params);
    for (const [key, value] of form.entries()) {
      url.searchParams.append(key, value);
    }
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = toForm(params);
  }

  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(json?.error?.message ?? `${method} ${path} failed with ${response.status}`);
    error.status = response.status;
    error.type = json?.error?.type;
    error.param = json?.error?.param;
    throw error;
  }
  return json;
}

async function listAllProducts() {
  const products = [];
  let startingAfter = null;
  do {
    const page = await stripeRequest("GET", "/v1/products", {
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    products.push(...(page.data ?? []));
    startingAfter = page.has_more ? page.data.at(-1)?.id : null;
  } while (startingAfter);
  return products;
}

async function findProductByKey(key) {
  const query = `metadata['maiprop_key']:'${key}'`;
  try {
    const search = await stripeRequest("GET", "/v1/products/search", { query, limit: 1 });
    return search.data?.[0] ?? null;
  } catch (error) {
    if (error.status !== 400 && error.status !== 404) throw error;
    const products = await listAllProducts();
    return products.find((product) => product.metadata?.maiprop_key === key) ?? null;
  }
}

async function ensureProduct(item) {
  const metadata = stripeMetadataForItem(item);
  const params = {
    name: item.label,
    description: item.description,
    active: true,
    tax_code: taxCodeForItem(item),
    metadata,
    marketing_features: item.marketingFeatures.map((name) => ({ name })),
  };

  const existing = await findProductByKey(item.key);
  if (!existing) {
    const product = await stripeRequest("POST", "/v1/products", params, {
      idempotencyKey: idempotencyKey("product", item.key, params),
    });
    return { product, action: "created" };
  }

  const product = await stripeRequest("POST", `/v1/products/${encodeURIComponent(existing.id)}`, params, {
    idempotencyKey: idempotencyKey("product-update", item.key, params),
  });
  return { product, action: "updated" };
}

async function ensureEntitlementFeature(featureKey) {
  const lookupKey = `maiprop.${featureKey}`;
  const name = FEATURE_NAMES[featureKey] ?? featureKey.replaceAll("_", " ");
  const params = {
    name,
    lookup_key: lookupKey,
    metadata: {
      maiprop_feature_key: featureKey,
      catalog_version: CATALOG_VERSION,
    },
  };

  const current = await findEntitlementFeatureByLookupKey(lookupKey);
  if (!current) {
    const feature = await stripeRequest("POST", "/v1/entitlements/features", params, {
      idempotencyKey: idempotencyKey("feature", featureKey, params),
    });
    entitlementFeatureCache?.push(feature);
    return { feature, action: "created" };
  }

  const feature = await stripeRequest("POST", `/v1/entitlements/features/${encodeURIComponent(current.id)}`, {
    name,
    metadata: params.metadata,
  }, {
    idempotencyKey: idempotencyKey("feature-update", featureKey, params),
  });
  if (entitlementFeatureCache) {
    entitlementFeatureCache = entitlementFeatureCache.map((entry) => entry.id === feature.id ? feature : entry);
  }
  return { feature, action: "updated" };
}

async function listAllEntitlementFeatures() {
  const features = [];
  let startingAfter = null;
  do {
    const page = await stripeRequest("GET", "/v1/entitlements/features", {
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    features.push(...(page.data ?? []));
    startingAfter = page.has_more ? page.data.at(-1)?.id : null;
  } while (startingAfter);
  return features;
}

async function findEntitlementFeatureByLookupKey(lookupKey) {
  if (!entitlementFeatureCache) {
    entitlementFeatureCache = await listAllEntitlementFeatures();
  }
  return entitlementFeatureCache.find((feature) => feature.lookup_key === lookupKey) ?? null;
}

async function ensureProductFeature(productId, feature) {
  const existing = await stripeRequest("GET", `/v1/products/${encodeURIComponent(productId)}/features`, {
    limit: 100,
  });
  const alreadyAttached = existing.data?.some((entry) => {
    const entitlementFeature = entry.entitlement_feature;
    return entitlementFeature === feature.id || entitlementFeature?.id === feature.id;
  });
  if (alreadyAttached) return { action: "attached" };

  await stripeRequest("POST", `/v1/products/${encodeURIComponent(productId)}/features`, {
    entitlement_feature: feature.id,
  }, {
    idempotencyKey: idempotencyKey("product-feature", `${productId}-${feature.id}`, {
      productId,
      featureId: feature.id,
    }),
  });
  return { action: "created" };
}

async function findActivePriceByLookupKey(lookupKey) {
  const list = await stripeRequest("GET", "/v1/prices", {
    "lookup_keys[]": lookupKey,
    active: true,
    limit: 1,
  });
  return list.data?.[0] ?? null;
}

function priceMatches(existing, item, spec, productId) {
  const product = typeof existing.product === "string"
    ? existing.product
    : existing.product?.id;
  const interval = existing.recurring?.interval ?? null;
  return product === productId &&
    existing.currency === spec.currency &&
    Number(existing.unit_amount) === Math.round(spec.amountMajor * 100) &&
    interval === spec.recurringInterval &&
    existing.tax_behavior === spec.taxBehavior;
}

async function ensurePrice(item, productId, spec) {
  const metadata = {
    ...stripeMetadataForItem(item),
    billing_cycle: spec.billingCycle,
    stripe_catalog_lookup_key: spec.lookupKey,
  };
  const params = {
    product: productId,
    currency: spec.currency,
    unit_amount: Math.round(spec.amountMajor * 100),
    lookup_key: spec.lookupKey,
    tax_behavior: spec.taxBehavior,
    metadata,
    ...(spec.recurringInterval ? { recurring: { interval: spec.recurringInterval } } : {}),
  };

  const existing = await findActivePriceByLookupKey(spec.lookupKey);
  if (existing && priceMatches(existing, item, spec, productId)) {
    await stripeRequest("POST", `/v1/prices/${encodeURIComponent(existing.id)}`, { metadata }, {
      idempotencyKey: idempotencyKey("price-update", existing.id, metadata),
    });
    return { price: existing, action: "reused" };
  }

  const createParams = existing
    ? { ...params, transfer_lookup_key: true }
    : params;
  const price = await stripeRequest("POST", "/v1/prices", createParams, {
    idempotencyKey: idempotencyKey("price", spec.lookupKey, createParams),
  });

  if (existing && existing.id !== price.id) {
    await stripeRequest("POST", `/v1/prices/${encodeURIComponent(existing.id)}`, { active: false }, {
      idempotencyKey: idempotencyKey("price-archive", existing.id, { active: false }),
    });
  }

  return { price, action: existing ? "replaced" : "created" };
}

function pricingMetadataForResult(result) {
  const metadata = {
    ...(result.item.metadata ?? {}),
    stripe_product_id: result.productId,
    stripe_last_label: result.item.label,
    stripe_last_audience: result.item.audience,
    stripe_catalog_version: CATALOG_VERSION,
  };

  for (const price of result.prices) {
    metadata.stripe_price_id = price.id;
    metadata.stripe_last_amount = String(price.amountMajor);
    if (price.billingCycle === "monthly") {
      metadata.stripe_price_id_monthly = price.id;
      metadata.stripe_monthly_price_id = price.id;
      metadata.stripe_last_amount_monthly = String(price.amountMajor);
    } else if (price.billingCycle === "annual") {
      metadata.stripe_price_id_annual = price.id;
      metadata.stripe_annual_price_id = price.id;
      metadata.stripe_price_id_yearly = price.id;
      metadata.stripe_yearly_price_id = price.id;
      metadata.stripe_last_amount_annual = String(price.amountMajor);
    }
  }

  return metadata;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJsonb(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function buildSql(results) {
  const lines = [
    "-- Generated by scripts/setup-stripe-catalog.mjs",
    "-- Apply with a service-role/admin connection after pricing_configs exists.",
    "BEGIN;",
  ];

  for (const result of results) {
    const item = result.item;
    const metadata = pricingMetadataForResult(result);
    lines.push("");
    lines.push(`INSERT INTO public.pricing_configs (`);
    lines.push("  key, label, description, audience, module, unit, currency, amount, is_active, sort_order, metadata");
    lines.push(") VALUES (");
    lines.push(`  ${sqlLiteral(item.key)},`);
    lines.push(`  ${sqlLiteral(item.label)},`);
    lines.push(`  ${sqlLiteral(item.description)},`);
    lines.push(`  ${sqlLiteral(item.audience)},`);
    lines.push(`  ${sqlLiteral(item.module)},`);
    lines.push(`  ${sqlLiteral(item.unit)},`);
    lines.push(`  ${sqlLiteral(item.currency)},`);
    lines.push(`  ${Number(item.amountMajor).toFixed(2)},`);
    lines.push("  true,");
    lines.push(`  ${Number(item.sortOrder)},`);
    lines.push(`  ${sqlJsonb(metadata)}`);
    lines.push(")");
    lines.push("ON CONFLICT (key) DO UPDATE SET");
    lines.push("  label = EXCLUDED.label,");
    lines.push("  description = EXCLUDED.description,");
    lines.push("  audience = EXCLUDED.audience,");
    lines.push("  module = EXCLUDED.module,");
    lines.push("  unit = EXCLUDED.unit,");
    lines.push("  currency = EXCLUDED.currency,");
    lines.push("  amount = EXCLUDED.amount,");
    lines.push("  is_active = EXCLUDED.is_active,");
    lines.push("  sort_order = EXCLUDED.sort_order,");
    lines.push("  metadata = COALESCE(public.pricing_configs.metadata, '{}'::jsonb) || EXCLUDED.metadata,");
    lines.push("  updated_at = now();");
  }

  const productRows = results
    .filter((result) => PRO_PRODUCT_KEYS.has(result.item.key))
    .map((result) => result.productId)
    .filter(Boolean);

  if (productRows.length > 0) {
    lines.push("");
    lines.push("INSERT INTO public.pro_product_ids (product_id) VALUES");
    lines.push(productRows.map((productId) => `  (${sqlLiteral(productId)})`).join(",\n") + ";");
    lines.push("");
    lines.push("-- Keep this generic product allow-list for legacy SQL checks.");
    lines.push("-- Newer audience-scoped checks read pricing_configs.metadata.stripe_product_id.");
  }

  lines.push("COMMIT;");
  lines.push("");
  return lines.join("\n");
}

function buildEnv(results) {
  const resultByKey = new Map(results.map((result) => [result.item.key, result]));
  const lines = [
    "# Generated Stripe test price IDs for Supabase Edge Function secrets.",
    "# PowerShell:",
    "# $stripePriceSecrets = Get-Content .stripe.test.env | Where-Object { $_ -and -not $_.StartsWith('#') }",
    "# npx supabase secrets set --project-ref qvvicunqcrwpioqnvzxf $stripePriceSecrets",
    "",
  ];

  for (const [key, cycles] of Object.entries(PLAN_PRICE_ENV_ALIASES)) {
    const result = resultByKey.get(key);
    if (!result) continue;
    for (const [cycle, envKeys] of Object.entries(cycles)) {
      const price = result.prices.find((entry) => entry.billingCycle === cycle);
      if (!price) continue;
      for (const envKey of envKeys) {
        lines.push(`${envKey}=${price.id}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

async function writeOutputFile(path, contents) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents, "utf8");
  return absolute;
}

function printDryRun() {
  console.log(`Stripe catalog dry run (${CATALOG.length} products)`);
  console.log(`Stripe API version: ${STRIPE_API_VERSION}`);
  console.log(`Stripe Tax codes: SaaS personal ${STRIPE_SAAS_PERSONAL_TAX_CODE}, SaaS business ${STRIPE_SAAS_BUSINESS_TAX_CODE}, AI personal ${STRIPE_AI_PERSONAL_TAX_CODE}, AI business ${STRIPE_AI_BUSINESS_TAX_CODE}`);
  console.log(`Stripe Tax behavior: ${STRIPE_DEFAULT_TAX_BEHAVIOR}`);
  console.log("");
  for (const item of CATALOG) {
    const specs = priceSpecsForItem(item);
    const prices = specs.length
      ? specs.map((spec) => `${spec.lookupKey} ${spec.amountMajor} ${spec.currency.toUpperCase()} ${spec.billingCycle}`).join(", ")
      : "bespoke checkout amount only";
    console.log(`- ${item.key}: ${item.label} [${item.module}/${item.audience}] -> ${prices}`);
    console.log(`  tax: ${taxCodeForItem(item)}`);
    console.log(`  features: ${item.entitlementFeatures.map((featureKey) => `maiprop.${featureKey}`).join(", ")}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.dryRun) {
    printDryRun();
    return;
  }

  stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is required. Use an sk_test_ key for test mode.");
  }
  if (!args.live && !stripeSecretKey.startsWith("sk_test_")) {
    throw new Error("Refusing to use a non-test Stripe key without --live.");
  }

  const featureResults = new Map();
  for (const featureKey of Object.keys(FEATURE_NAMES)) {
    const ensured = await ensureEntitlementFeature(featureKey);
    featureResults.set(featureKey, ensured.feature);
    console.log(`${ensured.action.padEnd(8)} feature maiprop.${featureKey}`);
  }

  const results = [];
  for (const item of CATALOG) {
    const productResult = await ensureProduct(item);
    const prices = [];
    console.log(`${productResult.action.padEnd(8)} product ${item.key} -> ${productResult.product.id}`);

    for (const featureKey of item.entitlementFeatures) {
      const feature = featureResults.get(featureKey);
      if (!feature) throw new Error(`Missing entitlement feature ${featureKey}`);
      const attachment = await ensureProductFeature(productResult.product.id, feature);
      console.log(`${attachment.action.padEnd(8)} product feature ${item.key} -> maiprop.${featureKey}`);
    }

    for (const spec of priceSpecsForItem(item)) {
      const priceResult = await ensurePrice(item, productResult.product.id, spec);
      prices.push({
        id: priceResult.price.id,
        lookupKey: spec.lookupKey,
        billingCycle: spec.billingCycle,
        amountMajor: spec.amountMajor,
      });
      console.log(`${priceResult.action.padEnd(8)} price ${spec.lookupKey} -> ${priceResult.price.id}`);
    }

    results.push({
      item,
      productId: productResult.product.id,
      prices,
    });
  }

  const envOutput = buildEnv(results);
  const sqlOutput = buildSql(results);

  if (args.writeEnv) {
    const file = await writeOutputFile(args.writeEnv, envOutput);
    console.log(`wrote env ${file}`);
  } else {
    console.log("\n# Edge price secrets\n" + envOutput);
  }

  if (args.writeSql) {
    const file = await writeOutputFile(args.writeSql, sqlOutput);
    console.log(`wrote sql ${file}`);
  } else {
    console.log("\n# Supabase metadata SQL\n" + sqlOutput);
  }

  const createdPriceCount = results.reduce((total, result) => total + result.prices.length, 0);
  const featureCount = Object.keys(FEATURE_NAMES).length;
  const publicPlanCount = results.filter((result) => PUBLIC_SUBSCRIPTION_KEYS.has(result.item.key)).length;
  console.log(`Done. Products: ${results.length}. Prices: ${createdPriceCount}. Features: ${featureCount}. Public plans: ${publicPlanCount}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
