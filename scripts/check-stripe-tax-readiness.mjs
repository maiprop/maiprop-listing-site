#!/usr/bin/env node

/**
 * Stripe Tax readiness check for MaiProp billing.
 *
 * This is intentionally read-only. It verifies the Stripe account has an
 * active tax registration for the expected jurisdiction and that the Stripe
 * catalog prices/products used by checkout have tax behavior and tax codes.
 */

const STRIPE_API_BASE = "https://api.stripe.com";
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? "2026-06-24.dahlia";
const EXPECTED_COUNTRY = (process.env.STRIPE_TAX_EXPECT_COUNTRY ?? "GR").toUpperCase();

const REQUIRED_PRICE_LOOKUP_KEYS = [
  "maiprop_pro_monthly",
  "maiprop_pro_annual",
  "maiprop_agent_basic_monthly",
  "maiprop_agent_basic_annual",
  "maiprop_developer_pro_monthly",
  "maiprop_developer_pro_annual",
  "maiprop_professional_basic_monthly",
  "maiprop_professional_basic_annual",
  "maiprop_valuation_single",
  "maiprop_valuation_bundle",
  "maiprop_property_report_single",
  "maiprop_neighbourhood_report_single",
  "maiprop_neighbourhood_report_bundle",
];

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const strict = args.has("--strict") ||
  ["1", "true", "yes"].includes(String(process.env.STRIPE_TAX_READINESS_STRICT ?? "").toLowerCase());
const showJson = args.has("--json");
const help = args.has("--help") || args.has("-h");

function argValue(name, fallback = "") {
  const index = rawArgs.indexOf(name);
  if (index >= 0 && rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--")) {
    return rawArgs[index + 1];
  }
  const prefix = `${name}=`;
  const inline = rawArgs.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

const invoiceId = argValue("--invoice", process.env.STRIPE_TAX_CHECK_INVOICE ?? "");
const expectedTaxRate = Number(argValue(
  "--expected-tax-rate",
  process.env.STRIPE_TAX_EXPECT_RATE ?? "0.24",
));

function usage() {
  console.log(`Usage: STRIPE_SECRET_KEY=sk_test_... npm run check:stripe-tax-readiness -- [--strict] [--json] [--invoice in_...] [--expected-tax-rate 0.24]

Read-only checks:
  - active Stripe Tax registration for ${EXPECTED_COUNTRY}
  - required MaiProp Stripe prices exist by lookup_key
  - prices have tax_behavior=exclusive
  - expanded products have tax_code

Environment:
  STRIPE_SECRET_KEY               Stripe secret key. Required.
  STRIPE_API_VERSION              Defaults to ${STRIPE_API_VERSION}.
  STRIPE_TAX_EXPECT_COUNTRY       Defaults to GR.
  STRIPE_TAX_EXPECT_RATE          Defaults to 0.24.
  STRIPE_TAX_CHECK_INVOICE        Optional invoice id to diagnose.
  STRIPE_TAX_READINESS_STRICT     true makes warnings fail the command.
`);
}

if (help) {
  usage();
  process.exit(0);
}

function getStripeKey() {
  const key = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY ?? "";
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is required for Stripe Tax readiness checks.");
  }
  if (!/^sk_(test|live)_/.test(key)) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key.");
  }
  return key;
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

async function stripeRequest(method, path, values = undefined) {
  const secret = getStripeKey();
  const url = new URL(`${STRIPE_API_BASE}${path}`);
  const init = {
    method,
    headers: {
      authorization: `Bearer ${secret}`,
      "stripe-version": STRIPE_API_VERSION,
      "user-agent": "maiprop-stripe-tax-readiness/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  };

  if (method === "GET" && values) {
    const query = encodeForm(values);
    for (const [key, value] of query.entries()) url.searchParams.append(key, value);
  } else if (values) {
    init.headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = encodeForm(values);
  }

  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = body?.error?.message ?? `Stripe API ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function listActiveTaxRegistrations() {
  try {
    const registrations = await stripeRequest("GET", "/v1/tax/registrations", {
      status: "active",
      limit: 100,
    });
    return Array.isArray(registrations.data) ? registrations.data : [];
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function registrationCountry(registration) {
  return String(
    registration.country ??
      registration.country_options?.eu?.country ??
      registration.country_options?.[EXPECTED_COUNTRY.toLowerCase()]?.country ??
      "",
  ).toUpperCase();
}

async function listPricesByLookupKeys(lookupKeys) {
  const prices = await stripeRequest("GET", "/v1/prices", {
    limit: 100,
    active: true,
    "expand[]": "data.product",
    "lookup_keys[]": lookupKeys,
  });
  return Array.isArray(prices.data) ? prices.data : [];
}

async function retrieveInvoice(invoice) {
  if (!invoice) return null;
  return await stripeRequest("GET", `/v1/invoices/${encodeURIComponent(invoice)}`, {
    "expand[]": [
      "customer",
      "lines.data.price.product",
    ],
  });
}

function summarizePrice(price) {
  const product = price.product && typeof price.product === "object" ? price.product : null;
  return {
    lookup_key: price.lookup_key ?? null,
    id: price.id,
    active: price.active === true,
    currency: price.currency,
    unit_amount: price.unit_amount,
    recurring_interval: price.recurring?.interval ?? null,
    tax_behavior: price.tax_behavior ?? null,
    product_id: product?.id ?? (typeof price.product === "string" ? price.product : null),
    product_name: product?.name ?? null,
    product_tax_code: product?.tax_code ?? null,
  };
}

function printHuman(report) {
  console.log(`Stripe Tax readiness (${report.mode}, API ${STRIPE_API_VERSION})`);
  console.log(`Expected tax registration country: ${EXPECTED_COUNTRY}`);
  console.log(`Active ${EXPECTED_COUNTRY} registration: ${report.tax_registration.active ? "yes" : "no"}`);

  if (report.tax_registration.error) {
    console.log(`Tax registration lookup error: ${report.tax_registration.error}`);
  }

  for (const issue of report.issues) console.log(`ERROR: ${issue}`);
  for (const warning of report.warnings) console.log(`WARN: ${warning}`);

  console.log(`Checked prices: ${report.prices.length}/${REQUIRED_PRICE_LOOKUP_KEYS.length}`);
  for (const price of report.prices) {
    console.log(
      `- ${price.lookup_key}: ${price.id}, ${price.unit_amount} ${price.currency}, ` +
        `tax_behavior=${price.tax_behavior ?? "missing"}, product_tax_code=${price.product_tax_code ?? "missing"}`,
    );
  }

  if (report.invoice) {
    console.log(`Invoice ${report.invoice.id}:`);
    console.log(`- customer_country=${report.invoice.customer_country ?? "unknown"}`);
    console.log(`- customer_tax_exempt=${report.invoice.customer_tax_exempt ?? "unknown"}`);
    console.log(`- subtotal=${report.invoice.subtotal} ${report.invoice.currency}`);
    console.log(`- tax_amount=${report.invoice.tax_amount} ${report.invoice.currency}`);
    console.log(`- expected_tax_amount_at_${Math.round(expectedTaxRate * 100)}pct=${report.invoice.expected_tax_amount}`);
    console.log(`- tax_rate_matches=${report.invoice.tax_rate_matches ? "yes" : "no"}`);
    for (const tax of report.invoice.taxes) {
      console.log(`- tax reason=${tax.taxability_reason ?? "unknown"}, amount=${tax.amount}, taxable_amount=${tax.taxable_amount}`);
    }
  }
}

async function main() {
  const secret = getStripeKey();
  const mode = secret.startsWith("sk_live_") ? "live" : "test";
  const issues = [];
  const warnings = [];

  const registrations = await listActiveTaxRegistrations();
  let hasExpectedRegistration = false;
  let taxRegistrationError = null;
  if (Array.isArray(registrations)) {
    hasExpectedRegistration = registrations.some((registration) =>
      registrationCountry(registration) === EXPECTED_COUNTRY ||
      registration.country_options?.eu
    );
  } else {
    taxRegistrationError = registrations.error;
  }

  if (!hasExpectedRegistration) {
    issues.push(
      `No active Stripe Tax registration was found for ${EXPECTED_COUNTRY}. Stripe Tax can return zero VAT until registration is active.`,
    );
  }
  if (taxRegistrationError) {
    issues.push(`Could not verify Stripe Tax registrations: ${taxRegistrationError}`);
  }

  const prices = (await listPricesByLookupKeys(REQUIRED_PRICE_LOOKUP_KEYS)).map(summarizePrice);
  const priceByLookupKey = new Map(prices.map((price) => [price.lookup_key, price]));

  for (const lookupKey of REQUIRED_PRICE_LOOKUP_KEYS) {
    const price = priceByLookupKey.get(lookupKey);
    if (!price) {
      issues.push(`Missing active Stripe price for lookup_key=${lookupKey}`);
      continue;
    }
    if (price.tax_behavior !== "exclusive") {
      issues.push(`${lookupKey} has tax_behavior=${price.tax_behavior ?? "missing"}; expected exclusive.`);
    }
    if (!price.product_tax_code) {
      warnings.push(`${lookupKey} product has no tax_code; Stripe will use the account default tax code.`);
    }
  }

  let invoiceSummary = null;
  if (invoiceId) {
    const invoice = await retrieveInvoice(invoiceId);
    const taxes = invoice.total_taxes ?? invoice.total_tax_amounts ?? [];
    const taxAmount = taxes.reduce((sum, tax) => sum + Number(tax.amount ?? 0), 0);
    const expectedTaxAmount = Math.round(Number(invoice.subtotal ?? 0) * expectedTaxRate);
    const taxRateMatches = Math.abs(taxAmount - expectedTaxAmount) <= 1;
    invoiceSummary = {
      id: invoice.id,
      livemode: invoice.livemode === true,
      currency: invoice.currency,
      customer_country: invoice.customer_address?.country ??
        (typeof invoice.customer === "object" ? invoice.customer?.address?.country : null),
      customer_tax_exempt: invoice.customer_tax_exempt ?? null,
      subtotal: invoice.subtotal,
      tax_amount: taxAmount,
      expected_tax_amount: expectedTaxAmount,
      tax_rate_matches: taxRateMatches,
      automatic_tax: invoice.automatic_tax ?? null,
      taxes: taxes.map((tax) => ({
        amount: tax.amount ?? 0,
        taxable_amount: tax.taxable_amount ?? null,
        taxability_reason: tax.taxability_reason ?? null,
        type: tax.type ?? null,
      })),
    };

    if (!taxRateMatches) {
      issues.push(
        `${invoice.id} tax is ${taxAmount}; expected ${expectedTaxAmount} for ${Math.round(expectedTaxRate * 100)}% VAT on subtotal ${invoice.subtotal}.`,
      );
    }
    if (invoiceSummary.taxes.some((tax) => tax.taxability_reason === "not_collecting")) {
      issues.push(
        `${invoice.id} has taxability_reason=not_collecting. Stripe Tax is not collecting for this jurisdiction in this mode.`,
      );
    }
  }

  const report = {
    ok: issues.length === 0 && (!strict || warnings.length === 0),
    mode,
    expected_country: EXPECTED_COUNTRY,
    tax_registration: {
      active: hasExpectedRegistration,
      error: taxRegistrationError,
    },
    prices,
    invoice: invoiceSummary,
    issues,
    warnings,
  };

  if (showJson) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
