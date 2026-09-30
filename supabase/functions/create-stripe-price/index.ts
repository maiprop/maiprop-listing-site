/**
 * Admin-only: Create a Stripe Price from a pricing_configs row and save the price ID.
 * Used when admin changes amount and needs a new Stripe price (prices are immutable).
 */
import Stripe from "npm:stripe@22.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import {
  createVerifiedStripeClient,
  resolveStripeSoftwareTaxCode,
  STRIPE_DEFAULT_PRODUCT_TAX_CODE,
  STRIPE_DEFAULT_TAX_BEHAVIOR,
} from "../_shared/stripeClient.ts";
import {
  assertMarkedStagingCatalogBoundary,
  MAIPROP_STRIPE_SANDBOX_ACCOUNT_ID,
  stagingCatalogIdempotencyKey,
} from "./stagingCatalog.ts";

const _log = createLogger("create-stripe-price");
const limiter = makeRateLimiter({
  bucket: "create-stripe-price",
  maxRequests: 5,
  windowMs: 60_000,
});

class AdminAuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

interface ProfileRow {
  role?: string | null;
}

interface PricingConfigRow {
  id: string;
  key: string;
  audience?: string | null;
  module?: string | null;
  label?: string | null;
  description?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  unit?: string | null;
  metadata?: Record<string, unknown> | null;
}

const createStripePriceBodySchema = z.object({
  config_id: z.string().trim().min(1, "config_id required").optional(),
  configId: z.string().trim().min(1, "config_id required").optional(),
}).strict().refine((body) => Boolean(body.config_id ?? body.configId), {
  message: "config_id required",
});

function normalizeAudience(raw: string | null | undefined): string | null {
  if (
    raw === "buyer" || raw === "seller" || raw === "participant" ||
    raw === "pro"
  ) return "participant";
  if (
    raw === "agent" || raw === "developer" || raw === "professional" ||
    raw === "investor" || raw === "institutional"
  ) {
    return raw;
  }
  return null;
}

type StripeBillingCycle = "monthly" | "annual";

const PUBLIC_SUBSCRIPTION_MODULES = new Set([
  "user_subscription",
  "agent_subscription",
  "developer_subscription",
  "professional_subscription",
]);

function stripeBillingCycleForUnit(unit: string): StripeBillingCycle | null {
  if (unit === "monthly") return "monthly";
  if (unit === "yearly" || unit === "annual") return "annual";
  return null;
}

function setCycleSpecificPriceMetadata(
  meta: Record<string, unknown>,
  unit: string,
  priceId: string,
  amount: number,
): void {
  const cycle = stripeBillingCycleForUnit(unit);
  if (cycle === "monthly") {
    meta.stripe_price_id_monthly = priceId;
    meta.stripe_monthly_price_id = priceId;
    meta.stripe_last_amount_monthly = String(amount);
    meta.stripe_tax_behavior_monthly = STRIPE_DEFAULT_TAX_BEHAVIOR;
  }
  if (cycle === "annual") {
    meta.stripe_price_id_annual = priceId;
    meta.stripe_annual_price_id = priceId;
    meta.stripe_price_id_yearly = priceId;
    meta.stripe_yearly_price_id = priceId;
    meta.stripe_last_amount_annual = String(amount);
    meta.stripe_tax_behavior_annual = STRIPE_DEFAULT_TAX_BEHAVIOR;
    meta.stripe_tax_behavior_yearly = STRIPE_DEFAULT_TAX_BEHAVIOR;
  }
}

function getStringMetadata(
  meta: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getCyclePriceId(
  meta: Record<string, unknown>,
  cycle: StripeBillingCycle,
): string | undefined {
  if (cycle === "monthly") {
    return getStringMetadata(meta, "stripe_price_id_monthly") ??
      getStringMetadata(meta, "stripe_monthly_price_id");
  }
  return getStringMetadata(meta, "stripe_price_id_annual") ??
    getStringMetadata(meta, "stripe_annual_price_id") ??
    getStringMetadata(meta, "stripe_price_id_yearly") ??
    getStringMetadata(meta, "stripe_yearly_price_id");
}

function applyStripeTaxMetadata(
  meta: Record<string, unknown>,
  taxCode = STRIPE_DEFAULT_PRODUCT_TAX_CODE,
): void {
  meta.stripe_tax_code = taxCode;
  meta.stripe_tax_behavior = STRIPE_DEFAULT_TAX_BEHAVIOR;
}

function productMetadata(
  entitlementMetadata: Record<string, string>,
  taxCode = STRIPE_DEFAULT_PRODUCT_TAX_CODE,
): Record<string, string> {
  return {
    ...entitlementMetadata,
    stripe_tax_code: taxCode,
  };
}

function priceMetadata(
  entitlementMetadata: Record<string, string>,
  billingCycle: string,
): Record<string, string> {
  return {
    ...entitlementMetadata,
    billing_cycle: billingCycle,
    stripe_tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR,
  };
}

function annualCompanionAmountMajor(
  config: PricingConfigRow,
  meta: Record<string, unknown>,
): number {
  const explicit = Number(
    meta.stripe_annual_amount ?? meta.annual_amount ?? meta.annualPrice,
  );
  return Number.isFinite(explicit) && explicit > 0
    ? explicit
    : Number(config.amount ?? 0) * 10;
}

function shouldCreateAnnualCompanionPrice(config: PricingConfigRow): boolean {
  return (config.unit ?? "monthly") === "monthly" &&
    PUBLIC_SUBSCRIPTION_MODULES.has(config.module ?? "");
}

interface DesiredPrice {
  recordedId: string | undefined;
  amount: number;
  cycle: StripeBillingCycle | null;
  interval: "month" | "year" | null;
  idempotencyKind: "monthly" | "annual";
}

function recordedPriceIsOwned(
  price: Stripe.Price,
  productId: string,
  configId: string,
): boolean {
  const actualProductId = typeof price.product === "string"
    ? price.product
    : price.product.id;
  const actualConfigId = price.metadata?.pricing_config_id;
  return actualProductId === productId &&
    (!actualConfigId || actualConfigId === configId);
}

function recordedPriceMatches(
  price: Stripe.Price,
  desired: DesiredPrice,
  currency: string,
): boolean {
  return price.active === true &&
    price.currency.toLowerCase() === currency &&
    Number.isInteger(price.unit_amount) &&
    price.unit_amount === desired.amount &&
    (price.recurring?.interval ?? null) === desired.interval &&
    price.tax_behavior === STRIPE_DEFAULT_TAX_BEHAVIOR;
}

function isVerifiedMissingPrice(error: unknown): boolean {
  const stripeError = error as { statusCode?: number; code?: string };
  return stripeError.statusCode === 404 &&
    stripeError.code === "resource_missing";
}

async function retrieveRecordedPrices(
  stripe: Stripe,
  ids: (string | undefined)[],
): Promise<Map<string, Stripe.Price | null>> {
  const prices = new Map<string, Stripe.Price | null>();
  for (
    const id of new Set(ids.filter((value): value is string => Boolean(value)))
  ) {
    try {
      prices.set(id, await stripe.prices.retrieve(id));
    } catch (error) {
      if (!isVerifiedMissingPrice(error)) throw error;
      prices.set(id, null);
    }
  }
  return prices;
}

function shouldRegisterGenericProProduct(
  audience: string,
  unit: string,
): boolean {
  return ["participant", "agent", "developer", "professional"].includes(
    audience,
  ) &&
    ["monthly", "yearly", "annual"].includes(unit);
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!stripeKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new AdminAuthError("No authorization header", 401);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth
      .getUser(token);
    if (userError || !userData.user) {
      throw new AdminAuthError("Unauthenticated", 401);
    }

    // This billing mutation requires the authoritative admin role. A legacy
    // platform flag alone is not sufficient.
    const { data: profile } = await supabaseClient.from("profiles").select(
      "role",
    ).eq("user_id", userData.user.id).single();
    const adminProfile = profile as ProfileRow | null;
    if (adminProfile?.role !== "admin") {
      throw new AdminAuthError("Platform admin only", 403);
    }

    const body = await parseJsonBody(req, createStripePriceBodySchema);
    const configId = (body.config_id ?? body.configId) as string;

    const { data: configRaw, error: configError } = await supabaseClient
      .from("pricing_configs")
      .select(
        "id, key, audience, module, label, description, amount, currency, unit, metadata",
      )
      .eq("id", configId)
      .single();
    if (configError || !configRaw) throw new Error("Pricing config not found");
    const config = configRaw as PricingConfigRow;

    const amount = Math.round(Number(config.amount ?? 0) * 100); // Stripe uses cents
    const currency = (config.currency ?? "eur").toLowerCase();
    const unit = config.unit ?? "monthly";

    if (amount <= 0) throw new Error("Amount must be greater than 0");

    const markedStagingCatalog = assertMarkedStagingCatalogBoundary(
      config.metadata,
      stripeKey,
      Deno.env.get("STRIPE_EXPECTED_ACCOUNT_ID"),
    );
    const stripe = await createVerifiedStripeClient(
      stripeKey,
      markedStagingCatalog
        ? {
          runtimeMode: "test",
          expectedAccountId: MAIPROP_STRIPE_SANDBOX_ACCOUNT_ID,
        }
        : {},
    );
    const audience = normalizeAudience(config.audience) ?? "participant";
    const entitlementMetadata = {
      pricing_config_key: config.key,
      pricing_config_id: configId,
      plan_key: config.key,
      audience,
      role: audience,
      entitlement_role: audience,
    };

    // Recurring (monthly/yearly) or one-time
    const isRecurring = ["monthly", "yearly", "annual"].includes(unit);
    const interval = stripeBillingCycleForUnit(unit) === "annual"
      ? "year"
      : "month";

    const meta: Record<string, unknown> = { ...(config.metadata ?? {}) };
    const existingProductId = getStringMetadata(meta, "stripe_product_id");
    const productName = config.label || config.key;
    const productDescription = config.description ?? undefined;
    const primaryCycle = stripeBillingCycleForUnit(unit);
    const existingPriceId = primaryCycle
      ? getCyclePriceId(meta, primaryCycle) ??
        getStringMetadata(meta, "stripe_price_id")
      : getStringMetadata(meta, "stripe_price_id");
    const stripeTaxCode = resolveStripeSoftwareTaxCode({
      key: config.key,
      audience,
      module: config.module ?? null,
    });
    const stripeProductMetadata = productMetadata(
      entitlementMetadata,
      stripeTaxCode,
    );

    let productId = existingProductId;
    if (productId) {
      await stripe.products.update(productId, {
        name: productName,
        ...(productDescription ? { description: productDescription } : {}),
        tax_code: stripeTaxCode,
        metadata: stripeProductMetadata,
      });
    } else {
      const product = await stripe.products.create(
        {
          name: productName,
          ...(productDescription ? { description: productDescription } : {}),
          tax_code: stripeTaxCode,
          metadata: stripeProductMetadata,
        },
        markedStagingCatalog
          ? {
            idempotencyKey: stagingCatalogIdempotencyKey({
              configId,
              kind: "product",
              currency,
              amount,
              interval,
            }),
          }
          : undefined,
      );
      productId = product.id;
    }

    const annualCompanion = shouldCreateAnnualCompanionPrice(config);
    const annualAmountMajor = annualCompanion
      ? annualCompanionAmountMajor(config, meta)
      : 0;
    const desiredPrices: DesiredPrice[] = [{
      recordedId: existingPriceId,
      amount,
      cycle: primaryCycle,
      interval: isRecurring ? interval : null,
      idempotencyKind: primaryCycle === "annual" ? "annual" : "monthly",
    }];
    if (annualCompanion) {
      desiredPrices.push({
        recordedId: getCyclePriceId(meta, "annual"),
        amount: Math.round(annualAmountMajor * 100),
        cycle: "annual",
        interval: "year",
        idempotencyKind: "annual",
      });
    }

    // Read every applicable recorded ID before a price write. An unknown
    // companion retrieval failure must not follow an avoidable primary create.
    const recordedPrices = await retrieveRecordedPrices(
      stripe,
      desiredPrices.map((desired) => desired.recordedId),
    );
    const selectedIds: string[] = [];
    for (const desired of desiredPrices) {
      const recorded = desired.recordedId
        ? recordedPrices.get(desired.recordedId)
        : null;
      if (
        recorded && recordedPriceIsOwned(recorded, productId, configId) &&
        recordedPriceMatches(recorded, desired, currency)
      ) {
        selectedIds.push(recorded.id);
        continue;
      }
      const priceParams: Stripe.PriceCreateParams = {
        product: productId,
        currency,
        unit_amount: desired.amount,
        tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR,
        metadata: priceMetadata(
          entitlementMetadata,
          desired.cycle ?? "one_time",
        ),
      };
      if (desired.interval) {
        priceParams.recurring = { interval: desired.interval };
      }
      const created = await stripe.prices.create(
        priceParams,
        markedStagingCatalog
          ? {
            idempotencyKey: stagingCatalogIdempotencyKey({
              configId,
              kind: desired.idempotencyKind,
              currency,
              amount: desired.amount,
              interval: desired.interval ?? interval,
            }),
          }
          : undefined,
      );
      selectedIds.push(created.id);
    }

    const finalPriceIds = new Set(selectedIds);
    for (const [id, recorded] of recordedPrices) {
      if (
        recorded?.active === true && !finalPriceIds.has(id) &&
        recordedPriceIsOwned(recorded, productId, configId)
      ) {
        await stripe.prices.update(id, { active: false });
      }
    }

    const primaryPriceId = selectedIds[0];
    const annualPriceId = annualCompanion ? selectedIds[1] : null;

    meta.stripe_price_id = primaryPriceId;
    meta.stripe_product_id = productId;
    meta.stripe_last_amount = String(Number(config.amount ?? 0));
    meta.stripe_last_label = productName;
    meta.stripe_last_audience = audience;
    applyStripeTaxMetadata(meta, stripeTaxCode);
    setCycleSpecificPriceMetadata(
      meta,
      unit,
      primaryPriceId,
      Number(config.amount ?? 0),
    );
    if (annualPriceId) {
      setCycleSpecificPriceMetadata(
        meta,
        "annual",
        annualPriceId,
        annualAmountMajor,
      );
    }

    const { error: updateError } = await supabaseClient
      .from("pricing_configs")
      .update({ metadata: meta, updated_at: new Date().toISOString() })
      .eq("id", configId);
    if (updateError) {
      throw new Error("Failed to save price ID: " + updateError.message);
    }

    if (shouldRegisterGenericProProduct(audience, unit)) {
      const { error: productError } = await supabaseClient
        .from("pro_product_ids")
        .upsert({ product_id: productId }, { onConflict: "product_id" });
      if (productError) {
        throw new Error(
          "Failed to register Pro product: " + productError.message,
        );
      }
    }

    return new Response(
      JSON.stringify({
        price_id: primaryPriceId,
        annual_price_id: annualPriceId,
        product_id: productId,
        message: "Stripe price created and saved to pricing config",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof SchemaValidationError
      ? 400
      : error instanceof AdminAuthError
      ? error.status
      : 500;
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
