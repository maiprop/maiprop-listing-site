/**
 * Admin-only: Sync all pricing_configs to Stripe.
 * - For each active config with amount > 0:
 *   - If no stripe_product_id: create product + price, save IDs
 *   - If product exists but label changed: update product name/description
 *   - If price exists but amount changed (prices are immutable): archive old price, create new price, save new price_id
 * - Returns a summary of actions taken per config.
 */
import Stripe from "npm:stripe@22.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import {
  createStripeClient,
  resolveStripeSoftwareTaxCode,
  STRIPE_DEFAULT_PRODUCT_TAX_CODE,
  STRIPE_DEFAULT_TAX_BEHAVIOR,
} from "../_shared/stripeClient.ts";

const _log = createLogger("sync-stripe-pricing");
const limiter = makeRateLimiter({
  bucket: "sync-stripe-pricing",
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

type SyncResult = {
  id: string;
  key: string;
  action:
    | "created"
    | "price_updated"
    | "product_updated"
    | "no_change"
    | "skipped"
    | "error";
  price_id?: string;
  annual_price_id?: string;
  product_id?: string;
  error?: string;
};

/** Subset of `pricing_configs` columns this function touches. The full row
 *  type is not in the generated Supabase types since the table is unregistered. */
type PricingConfigRow = {
  id: string;
  key: string;
  audience?: string | null;
  module?: string | null;
  amount: number | string;
  currency?: string | null;
  unit?: string | null;
  label?: string | null;
  description?: string | null;
  metadata?: Record<string, string> | null;
};

const syncStripePricingBodySchema = z.object({
  config_ids: z.array(z.string().trim().min(1, "Invalid pricing config id"))
    .max(500, "Invalid pricing config id").optional(),
}).strict();

function normalizeAudience(raw: string | null | undefined): string | null { // skipcq: JS-R1005 - Legacy and current audience aliases stay centralized for Stripe price sync.
  if (
    raw === "buyer" ||
    raw === "seller" ||
    raw === "participant" ||
    raw === "user" ||
    raw === "pro"
  ) {
    return "participant";
  }
  if (
    raw === "agent" ||
    raw === "developer" ||
    raw === "professional" ||
    raw === "investor" ||
    raw === "institutional"
  ) {
    return raw;
  }
  return null;
}

function entitlementMetadata(config: PricingConfigRow): Record<string, string> {
  const audience = normalizeAudience(config.audience) ?? config.audience ??
    "participant";
  return {
    pricing_config_key: config.key,
    pricing_config_id: config.id,
    plan_key: config.key,
    audience,
    role: audience,
    entitlement_role: audience,
  };
}

type StripeBillingCycle = "monthly" | "annual";
type StripeCatalogBillingCycle = StripeBillingCycle | "one_time";

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

function getCyclePriceId(
  meta: Record<string, string>,
  cycle: StripeBillingCycle,
): string | undefined {
  if (cycle === "monthly") {
    return meta.stripe_price_id_monthly ?? meta.stripe_monthly_price_id;
  }
  return meta.stripe_price_id_annual ??
    meta.stripe_annual_price_id ??
    meta.stripe_price_id_yearly ??
    meta.stripe_yearly_price_id;
}

function getCycleLastAmount(
  meta: Record<string, string>,
  cycle: StripeBillingCycle,
  fallback?: string,
): number {
  const value = cycle === "monthly"
    ? meta.stripe_last_amount_monthly ?? fallback
    : meta.stripe_last_amount_annual ?? fallback;
  return Number(value ?? -1);
}

function setCycleSpecificPriceMetadata(
  meta: Record<string, string>,
  cycle: StripeBillingCycle,
  priceId: string,
  amountMajor: number,
): void {
  if (cycle === "monthly") {
    meta.stripe_price_id_monthly = priceId;
    meta.stripe_monthly_price_id = priceId;
    meta.stripe_last_amount_monthly = String(amountMajor);
    meta.stripe_tax_behavior_monthly = STRIPE_DEFAULT_TAX_BEHAVIOR;
    return;
  }
  meta.stripe_price_id_annual = priceId;
  meta.stripe_annual_price_id = priceId;
  meta.stripe_price_id_yearly = priceId;
  meta.stripe_yearly_price_id = priceId;
  meta.stripe_last_amount_annual = String(amountMajor);
  meta.stripe_tax_behavior_annual = STRIPE_DEFAULT_TAX_BEHAVIOR;
  meta.stripe_tax_behavior_yearly = STRIPE_DEFAULT_TAX_BEHAVIOR;
}

function getCycleTaxBehavior(
  meta: Record<string, string>,
  cycle: StripeCatalogBillingCycle,
): string | undefined {
  if (cycle === "monthly") {
    return meta.stripe_tax_behavior_monthly ?? meta.stripe_tax_behavior;
  }
  if (cycle === "annual") {
    return meta.stripe_tax_behavior_annual ??
      meta.stripe_tax_behavior_yearly ??
      meta.stripe_tax_behavior;
  }
  return meta.stripe_tax_behavior;
}

function applyStripeTaxMetadata(
  meta: Record<string, string>,
  taxCode = STRIPE_DEFAULT_PRODUCT_TAX_CODE,
): void {
  meta.stripe_tax_code = taxCode;
  meta.stripe_tax_behavior = STRIPE_DEFAULT_TAX_BEHAVIOR;
}

function stripeLookupKeyForConfig(
  config: PricingConfigRow,
  cycle: StripeCatalogBillingCycle,
): string {
  if (cycle === "monthly") return `maiprop_${config.key}_monthly`;
  if (cycle === "annual") return `maiprop_${config.key}_annual`;
  return `maiprop_${config.key}`;
}

function priceMetadata(
  entitlementMeta: Record<string, string>,
  cycle: StripeCatalogBillingCycle,
  lookupKey: string,
): Record<string, string> {
  return {
    ...entitlementMeta,
    billing_cycle: cycle,
    stripe_catalog_lookup_key: lookupKey,
    stripe_tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR,
  };
}

function productMetadata(
  entitlementMeta: Record<string, string>,
  taxCode = STRIPE_DEFAULT_PRODUCT_TAX_CODE,
): Record<string, string> {
  return {
    ...entitlementMeta,
    stripe_tax_code: taxCode,
  };
}

async function findActivePriceByLookupKey(
  stripe: Stripe,
  lookupKey: string,
): Promise<Stripe.Price | null> {
  const prices = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  return prices.data[0] ?? null;
}

function priceMatches(
  price: Stripe.Price,
  productId: string,
  currency: string,
  unitAmount: number,
  interval: "month" | "year" | null,
): boolean {
  const priceProduct = typeof price.product === "string"
    ? price.product
    : price.product?.id;
  return priceProduct === productId &&
    price.currency === currency &&
    Number(price.unit_amount) === unitAmount &&
    (price.recurring?.interval ?? null) === interval &&
    price.tax_behavior === STRIPE_DEFAULT_TAX_BEHAVIOR;
}

async function archiveActiveLookupPrice(
  stripe: Stripe,
  activeLookupPrice: Stripe.Price | null,
  replacedPriceId: string | undefined,
): Promise<void> {
  if (activeLookupPrice && activeLookupPrice.id !== replacedPriceId) {
    await stripe.prices.update(activeLookupPrice.id, { active: false });
  }
}

function annualCompanionAmountMajor(
  config: PricingConfigRow,
  meta: Record<string, string>,
): number {
  const explicitAnnualAmount = Number(
    meta.stripe_annual_amount ?? meta.annual_amount ?? meta.annualPrice,
  );
  return Number.isFinite(explicitAnnualAmount) && explicitAnnualAmount > 0
    ? explicitAnnualAmount
    : Number(config.amount) * 10;
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
  meta: Record<string, string>,
  newMeta: Record<string, string>,
  entitlementMeta: Record<string, string>,
): Promise<
  { priceId: string; action: "created" | "price_updated" | "no_change" }
> {
  const amountMajor = annualCompanionAmountMajor(config, meta);
  const amount = Math.round(amountMajor * 100);
  const existingAnnualPriceId = getCyclePriceId(meta, "annual");
  const existingAnnualAmount = getCycleLastAmount(meta, "annual");
  const existingAnnualTaxBehavior = getCycleTaxBehavior(meta, "annual");
  const lookupKey = stripeLookupKeyForConfig(config, "annual");
  const activeLookupPrice = await findActivePriceByLookupKey(stripe, lookupKey);

  let priceId = existingAnnualPriceId;
  let action: "created" | "price_updated" | "no_change" = "no_change";
  if (
    !priceId &&
    activeLookupPrice &&
    priceMatches(activeLookupPrice, productId, currency, amount, "year")
  ) {
    priceId = activeLookupPrice.id;
  } else if (!priceId) {
    const price = await stripe.prices.create({
      product: productId,
      currency,
      unit_amount: amount,
      recurring: { interval: "year" },
      tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR,
      lookup_key: lookupKey,
      transfer_lookup_key: Boolean(activeLookupPrice),
      metadata: priceMetadata(entitlementMeta, "annual", lookupKey),
    });
    priceId = price.id;
    action = "created";
    await archiveActiveLookupPrice(stripe, activeLookupPrice, priceId);
  } else if (
    amountMajor !== existingAnnualAmount ||
    existingAnnualTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR
  ) {
    const price = await stripe.prices.create({
      product: productId,
      currency,
      unit_amount: amount,
      recurring: { interval: "year" },
      tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR,
      lookup_key: lookupKey,
      transfer_lookup_key: Boolean(activeLookupPrice),
      metadata: priceMetadata(entitlementMeta, "annual", lookupKey),
    });
    await stripe.prices.update(priceId, { active: false });
    priceId = price.id;
    action = "price_updated";
    await archiveActiveLookupPrice(stripe, activeLookupPrice, priceId);
  }

  setCycleSpecificPriceMetadata(newMeta, "annual", priceId, amountMajor);
  return { priceId, action };
}

function mergeStripeSyncAction(
  current: SyncResult["action"],
  next: "created" | "price_updated" | "no_change",
): SyncResult["action"] {
  if (next === "no_change") return current;
  if (current === "created") return current;
  if (next === "created") return "created";
  return "price_updated";
}

async function registerProProduct( // skipcq: JS-R1005 - Product registration handles absent, mismatched, and already-linked rows in one transaction-like path.
  supabase: unknown,
  productId: string | undefined,
  config: PricingConfigRow,
) {
  if (!productId) return;
  const audience = normalizeAudience(config.audience) ?? config.audience ??
    "participant";
  const unit = config.unit ?? "monthly";
  if (
    !["participant", "agent", "developer", "professional"].includes(audience) ||
    !["monthly", "yearly", "annual"].includes(unit)
  ) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as { from: any }).from("pro_product_ids")
    .upsert({ product_id: productId }, { onConflict: "product_id" });
  if (error) {
    throw new Error("Failed to register Pro product: " + error.message);
  }
}

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates admin auth, Stripe reads, pricing upserts, and product allowlisting.
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token,
    );
    if (userError || !userData.user) {
      throw new AdminAuthError("Unauthenticated", 401);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role,is_platform_admin")
      .eq("user_id", userData.user.id)
      .single();
    const adminProfile = profile as {
      role?: string;
      is_platform_admin?: boolean;
    } | null;
    if (adminProfile?.role !== "admin" && !adminProfile?.is_platform_admin) {
      throw new AdminAuthError("Platform admin only", 403);
    }

    // Optional: sync only specific config IDs, or all active configs
    const body = await parseJsonBody(req, syncStripePricingBodySchema);
    const configIds: string[] | null = body.config_ids ?? null;

    let query = supabase
      .from("pricing_configs")
      .select("*")
      .eq("is_active", true)
      .gt("amount", 0);
    if (configIds?.length) query = query.in("id", configIds);
    const { data: configs, error: configsError } = await query;
    if (configsError) {
      throw new Error("Failed to fetch configs: " + configsError.message);
    }

    const stripe = createStripeClient(stripeKey);
    const results: SyncResult[] = [];

    const typedConfigs = (configs ?? []) as PricingConfigRow[];
    for (const config of typedConfigs) {
      const meta = (config.metadata ?? {}) as Record<string, string>;
      const existingProductId = meta.stripe_product_id;
      const existingLabel = meta.stripe_last_label ?? "";
      const existingAudience = meta.stripe_last_audience ?? "";
      const existingTaxCode = meta.stripe_tax_code ?? "";

      const amountMajor = Number(config.amount);
      const amount = Math.round(amountMajor * 100); // cents
      const currency = (config.currency ?? "EUR").toLowerCase();
      const unit = config.unit ?? "monthly";
      const primaryCycle = stripeBillingCycleForUnit(unit);
      const existingPriceId = primaryCycle
        ? getCyclePriceId(meta, primaryCycle) ?? meta.stripe_price_id
        : meta.stripe_price_id;
      const existingAmount = primaryCycle
        ? getCycleLastAmount(meta, primaryCycle, meta.stripe_last_amount)
        : Number(meta.stripe_last_amount ?? -1);
      const isRecurring = ["monthly", "yearly", "annual"].includes(unit);
      const interval = primaryCycle === "annual" ? "year" : "month";
      const catalogCycle: StripeCatalogBillingCycle = primaryCycle ??
        "one_time";
      const lookupKey = stripeLookupKeyForConfig(config, catalogCycle);
      const productName = config.label || config.key;
      const productDesc = config.description ?? undefined;
      const entitlementMeta = entitlementMetadata(config);
      const stripeTaxCode = resolveStripeSoftwareTaxCode({
        key: config.key,
        audience: entitlementMeta.audience,
        role: entitlementMeta.role,
        module: config.module ?? null,
      });
      const stripeProductMetadata = productMetadata(
        entitlementMeta,
        stripeTaxCode,
      );
      const existingPriceTaxBehavior = getCycleTaxBehavior(
        meta,
        catalogCycle,
      );

      const result: SyncResult = {
        id: config.id,
        key: config.key,
        action: "no_change",
      };

      try {
        let productId = existingProductId;
        let priceId = existingPriceId;
        const newMeta = { ...meta };
        let activeLookupPrice: Stripe.Price | null = null;

        // ── Create product if missing ────────────────────────────────────────
        if (!productId) {
          const product = await stripe.products.create({
            name: productName,
            ...(productDesc && { description: productDesc }),
            tax_code: stripeTaxCode,
            metadata: stripeProductMetadata,
          });
          productId = product.id;
          newMeta.stripe_product_id = productId;
          result.action = "created";
        } else if (
          productName !== existingLabel ||
          existingTaxCode !== stripeTaxCode
        ) {
          // ── Update product name if label changed ─────────────────────────
          await stripe.products.update(productId, {
            name: productName,
            ...(productDesc && { description: productDesc }),
            tax_code: stripeTaxCode,
            metadata: stripeProductMetadata,
          });
          result.action = "product_updated";
        } else if (existingAudience !== entitlementMeta.audience) {
          await stripe.products.update(productId, {
            tax_code: stripeTaxCode,
            metadata: stripeProductMetadata,
          });
          result.action = "product_updated";
        }

        // ── Create price if missing ──────────────────────────────────────────
        if (!productId) {
          throw new Error(
            `Stripe product id missing for pricing config ${config.key}`,
          );
        }

        activeLookupPrice = await findActivePriceByLookupKey(stripe, lookupKey);

        if (
          !priceId &&
          activeLookupPrice &&
          priceMatches(
            activeLookupPrice,
            productId,
            currency,
            amount,
            isRecurring ? interval : null,
          )
        ) {
          priceId = activeLookupPrice.id;
          newMeta.stripe_price_id = priceId;
          newMeta.stripe_last_amount = String(amountMajor);
          newMeta.stripe_last_label = productName;
          newMeta.stripe_last_audience = entitlementMeta.audience;
          if (primaryCycle) {
            setCycleSpecificPriceMetadata(
              newMeta,
              primaryCycle,
              priceId,
              amountMajor,
            );
          }
          result.action = result.action === "no_change"
            ? "product_updated"
            : result.action;
        } else if (!priceId) {
          const priceParams: Stripe.PriceCreateParams = {
            product: productId,
            currency,
            unit_amount: amount,
            tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR,
            lookup_key: lookupKey,
            transfer_lookup_key: Boolean(activeLookupPrice),
            metadata: priceMetadata(entitlementMeta, catalogCycle, lookupKey),
          };
          if (isRecurring) priceParams.recurring = { interval };
          const price = await stripe.prices.create(priceParams);
          priceId = price.id;
          newMeta.stripe_price_id = priceId;
          newMeta.stripe_last_amount = String(amountMajor);
          newMeta.stripe_last_label = productName;
          newMeta.stripe_last_audience = entitlementMeta.audience;
          if (primaryCycle) {
            setCycleSpecificPriceMetadata(
              newMeta,
              primaryCycle,
              priceId,
              amountMajor,
            );
          }
          result.action = "created";
          await archiveActiveLookupPrice(stripe, activeLookupPrice, priceId);
        } else if (
          amountMajor !== existingAmount ||
          existingPriceTaxBehavior !== STRIPE_DEFAULT_TAX_BEHAVIOR
        ) {
          // ── Amount changed: archive old price, create new ────────────────
          const priceParams: Stripe.PriceCreateParams = {
            product: productId,
            currency,
            unit_amount: amount,
            tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR,
            lookup_key: lookupKey,
            transfer_lookup_key: Boolean(activeLookupPrice),
            metadata: priceMetadata(entitlementMeta, catalogCycle, lookupKey),
          };
          if (isRecurring) priceParams.recurring = { interval };
          const newPrice = await stripe.prices.create(priceParams);
          await stripe.prices.update(priceId, { active: false });
          priceId = newPrice.id;
          newMeta.stripe_price_id = priceId;
          newMeta.stripe_last_amount = String(amountMajor);
          newMeta.stripe_last_label = productName;
          newMeta.stripe_last_audience = entitlementMeta.audience;
          if (primaryCycle) {
            setCycleSpecificPriceMetadata(
              newMeta,
              primaryCycle,
              priceId,
              amountMajor,
            );
          }
          result.action = "price_updated";
          await archiveActiveLookupPrice(stripe, activeLookupPrice, priceId);
        } else if (productName !== existingLabel) {
          newMeta.stripe_last_label = productName;
          result.action = "product_updated";
        } else if (existingAudience !== entitlementMeta.audience) {
          await stripe.prices.update(priceId, {
            metadata: priceMetadata(entitlementMeta, catalogCycle, lookupKey),
          });
          newMeta.stripe_last_audience = entitlementMeta.audience;
          result.action = "product_updated";
        }
        applyStripeTaxMetadata(newMeta, stripeTaxCode);
        if (primaryCycle && priceId) {
          const before = JSON.stringify(newMeta);
          setCycleSpecificPriceMetadata(
            newMeta,
            primaryCycle,
            priceId,
            amountMajor,
          );
          if (
            before !== JSON.stringify(newMeta) && result.action === "no_change"
          ) {
            result.action = "product_updated";
          }
        }

        if (productId && shouldCreateAnnualCompanionPrice(config)) {
          const annual = await ensureAnnualCompanionPrice(
            stripe,
            productId,
            currency,
            config,
            meta,
            newMeta,
            entitlementMeta,
          );
          result.annual_price_id = annual.priceId;
          result.action = mergeStripeSyncAction(result.action, annual.action);
        }

        // ── Save updated metadata back to DB ────────────────────────────────
        if (result.action !== "no_change") {
          const { error: updateError } = await supabase
            .from("pricing_configs")
            .update({ metadata: newMeta, updated_at: new Date().toISOString() })
            .eq("id", config.id);
          if (updateError) {
            throw new Error(
              "Failed to save Stripe pricing metadata: " + updateError.message,
            );
          }
        }

        await registerProProduct(supabase, productId, config);

        result.price_id = priceId;
        result.product_id = productId;
      } catch (err: unknown) {
        result.action = "error";
        result.error = err instanceof Error ? err.message : String(err);
      }

      results.push(result);
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.action === "created").length,
      price_updated: results.filter((r) => r.action === "price_updated").length,
      product_updated: results.filter((r) => r.action === "product_updated")
        .length,
      no_change: results.filter((r) => r.action === "no_change").length,
      errors: results.filter((r) => r.action === "error").length,
    };

    return new Response(JSON.stringify({ summary, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
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
