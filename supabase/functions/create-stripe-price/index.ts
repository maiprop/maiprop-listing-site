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
  createStripeClient,
  resolveStripeSoftwareTaxCode,
  STRIPE_DEFAULT_PRODUCT_TAX_CODE,
  STRIPE_DEFAULT_TAX_BEHAVIOR,
} from "../_shared/stripeClient.ts";

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
  is_platform_admin?: boolean | null;
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

function getCycleLastAmount(
  meta: Record<string, unknown>,
  cycle: StripeBillingCycle,
  fallback?: unknown,
): number {
  const value = cycle === "monthly"
    ? meta.stripe_last_amount_monthly ?? fallback
    : meta.stripe_last_amount_annual ?? fallback;
  return Number(value ?? -1);
}

function getCycleTaxBehavior(
  meta: Record<string, unknown>,
  cycle: StripeBillingCycle | null,
): string | undefined {
  if (cycle === "monthly") {
    return getStringMetadata(meta, "stripe_tax_behavior_monthly") ??
      getStringMetadata(meta, "stripe_tax_behavior");
  }
  if (cycle === "annual") {
    return getStringMetadata(meta, "stripe_tax_behavior_annual") ??
      getStringMetadata(meta, "stripe_tax_behavior_yearly") ??
      getStringMetadata(meta, "stripe_tax_behavior");
  }
  return getStringMetadata(meta, "stripe_tax_behavior");
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

async function ensureAnnualCompanionPrice(
  stripe: Stripe,
  productId: string,
  currency: string,
  config: PricingConfigRow,
  meta: Record<string, unknown>,
  newMeta: Record<string, unknown>,
  entitlementMetadata: Record<string, string>,
): Promise<string | null> {
  if (!shouldCreateAnnualCompanionPrice(config)) return null;

  const amountMajor = annualCompanionAmountMajor(config, meta);
  const amount = Math.round(amountMajor * 100);
  let annualPriceId = getCyclePriceId(meta, "annual");
  const existingAnnualAmount = getCycleLastAmount(meta, "annual");
  const existingAnnualTaxBehavior = getCycleTaxBehavior(meta, "annual");

  if (
    !annualPriceId ||
    amountMajor !== existingAnnualAmount ||
    existingAnnualTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR
  ) {
    const previousAnnualPriceId = annualPriceId;
    const annualPrice = await stripe.prices.create({
      product: productId,
      currency,
      unit_amount: amount,
      recurring: { interval: "year" },
      tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR,
      metadata: priceMetadata(entitlementMetadata, "annual"),
    });
    annualPriceId = annualPrice.id;
    if (previousAnnualPriceId) {
      await stripe.prices.update(previousAnnualPriceId, { active: false });
    }
  }

  setCycleSpecificPriceMetadata(
    newMeta,
    "annual",
    annualPriceId,
    amountMajor,
  );
  return annualPriceId;
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

    // Check platform admin
    const { data: profile } = await supabaseClient.from("profiles").select(
      "role,is_platform_admin",
    ).eq("user_id", userData.user.id).single();
    const adminProfile = profile as ProfileRow | null;
    if (adminProfile?.role !== "admin" && !adminProfile?.is_platform_admin) {
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

    const stripe = createStripeClient(stripeKey);
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
    const existingAmountMajor = primaryCycle
      ? getCycleLastAmount(meta, primaryCycle, meta.stripe_last_amount)
      : Number(meta.stripe_last_amount ?? -1);
    const existingPriceTaxBehavior = getCycleTaxBehavior(meta, primaryCycle);
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
      const product = await stripe.products.create({
        name: productName,
        ...(productDescription ? { description: productDescription } : {}),
        tax_code: stripeTaxCode,
        metadata: stripeProductMetadata,
      });
      productId = product.id;
    }

    const priceParams: Stripe.PriceCreateParams = {
      product: productId,
      currency,
      unit_amount: amount,
      tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR,
      metadata: priceMetadata(entitlementMetadata, primaryCycle ?? "one_time"),
    };
    if (isRecurring) {
      priceParams.recurring = { interval };
    }

    const price = !existingPriceId ||
        Number(config.amount ?? 0) !== existingAmountMajor ||
        existingPriceTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR
      ? await stripe.prices.create(priceParams)
      : { id: existingPriceId };
    if (
      existingPriceId &&
      (Number(config.amount ?? 0) !== existingAmountMajor ||
        existingPriceTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR)
    ) {
      await stripe.prices.update(existingPriceId, { active: false });
    }

    meta.stripe_price_id = price.id;
    meta.stripe_product_id = productId;
    meta.stripe_last_amount = String(Number(config.amount ?? 0));
    meta.stripe_last_label = productName;
    meta.stripe_last_audience = audience;
    applyStripeTaxMetadata(meta, stripeTaxCode);
    setCycleSpecificPriceMetadata(
      meta,
      unit,
      price.id,
      Number(config.amount ?? 0),
    );
    const annualPriceId = await ensureAnnualCompanionPrice(
      stripe,
      productId,
      currency,
      config,
      config.metadata ?? {},
      meta,
      entitlementMetadata,
    );

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
        price_id: price.id,
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
