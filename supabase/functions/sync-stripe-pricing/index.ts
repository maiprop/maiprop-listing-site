/**
 * Admin-only reconciliation of active pricing configs with the Stripe catalog.
 * Preflight cycle ownership, recover positively identified products, select
 * canonical immutable prices, then archive owned replacements and save aliases.
 * Remote operations and local metadata persistence remain non-transactional.
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
  createVerifiedStripeClient,
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
  const price = prices.data[0] ?? null;
  if (price && (price.active !== true || price.lookup_key !== lookupKey)) {
    throw new Error(`Invalid active Stripe lookup result for ${lookupKey}`);
  }
  return price;
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
  return price.active === true && priceProduct === productId &&
    price.currency === currency &&
    Number(price.unit_amount) === unitAmount &&
    (price.recurring?.interval ?? null) === interval &&
    price.tax_behavior === STRIPE_DEFAULT_TAX_BEHAVIOR;
}

function priceProductId(price: Stripe.Price): string | undefined {
  return typeof price.product === "string" ? price.product : price.product?.id;
}

function ownedPrice(
  price: Stripe.Price,
  productId: string,
  configId: string,
): boolean {
  const identity = price.metadata?.pricing_config_id;
  return priceProductId(price) === productId &&
    (!identity || identity === configId);
}

type CyclePlan = {
  cycle: StripeCatalogBillingCycle;
  amountMajor: number;
  interval: "month" | "year" | null;
  lookupKey: string;
  recordedId?: string;
  lookup: Stripe.Price | null;
  recorded?: Stripe.Price | null;
  selected?: Stripe.Price;
};

async function retrieveRecordedPrice(
  stripe: Stripe,
  id: string,
): Promise<Stripe.Price | null> {
  try {
    return await stripe.prices.retrieve(id);
  } catch (error) {
    // A failed request is not evidence that a recorded resource is absent.
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.statusCode === 404 && error.code === "resource_missing"
    ) return null;
    throw error;
  }
}

async function reconcileCycle(
  stripe: Stripe,
  plan: CyclePlan,
  productId: string,
  currency: string,
  entitlementMeta: Record<string, string>,
): Promise<"created" | "price_updated" | "no_change"> {
  if (plan.selected) return "no_change";
  const activeLookupPrice = plan.lookup;
  const lookupKey = plan.lookupKey;
  plan.selected = await stripe.prices.create({
    product: productId,
    currency,
    unit_amount: Math.round(plan.amountMajor * 100),
    ...(plan.interval ? { recurring: { interval: plan.interval } } : {}),
    tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR,
    lookup_key: lookupKey,
    transfer_lookup_key: Boolean(activeLookupPrice),
    metadata: priceMetadata(entitlementMeta, plan.cycle, lookupKey),
  });
  return plan.recordedId || plan.lookup ? "price_updated" : "created";
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

    const stripe = await createVerifiedStripeClient(stripeKey);
    const results: SyncResult[] = [];

    const typedConfigs = (configs ?? []) as PricingConfigRow[];
    for (const config of typedConfigs) {
      const meta = (config.metadata ?? {}) as Record<string, string>;
      const existingProductId = meta.stripe_product_id;
      const existingLabel = meta.stripe_last_label ?? "";
      const existingAudience = meta.stripe_last_audience ?? "";
      const existingTaxCode = meta.stripe_tax_code ?? "";

      const amountMajor = Number(config.amount);
      const currency = (config.currency ?? "EUR").toLowerCase();
      const unit = config.unit ?? "monthly";
      const primaryCycle = stripeBillingCycleForUnit(unit);
      const existingPriceId = primaryCycle
        ? getCyclePriceId(meta, primaryCycle) ?? meta.stripe_price_id
        : meta.stripe_price_id;
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
      const result: SyncResult = {
        id: config.id,
        key: config.key,
        action: "no_change",
      };

      try {
        let productId = existingProductId;
        const newMeta = { ...meta };
        const plans: CyclePlan[] = [{
          cycle: catalogCycle,
          amountMajor,
          interval: isRecurring ? interval : null,
          lookupKey,
          recordedId: existingPriceId,
          lookup: null,
        }];
        if (shouldCreateAnnualCompanionPrice(config)) {
          plans.push({
            cycle: "annual",
            amountMajor: annualCompanionAmountMajor(config, meta),
            interval: "year",
            lookupKey: stripeLookupKeyForConfig(config, "annual"),
            recordedId: getCyclePriceId(meta, "annual"),
            lookup: null,
          });
        }

        // Read every applicable cycle before any product or price mutation.
        for (const plan of plans) {
          plan.lookup = await findActivePriceByLookupKey(
            stripe,
            plan.lookupKey,
          );
        }
        if (!productId) {
          const found = plans.flatMap((plan) =>
            plan.lookup ? [plan.lookup] : []
          );
          if (found.length) {
            const recoveredId = priceProductId(found[0]);
            if (
              !recoveredId ||
              found.some((price) => !ownedPrice(price, recoveredId, config.id))
            ) {
              throw new Error(
                `Conflicting Stripe lookup ownership for ${config.key}`,
              );
            }
            const product = await stripe.products.retrieve(recoveredId);
            if (
              product.deleted || !product.active ||
              product.metadata.pricing_config_id !== config.id
            ) {
              throw new Error(
                `Unverified Stripe product ownership for ${config.key}`,
              );
            }
            productId = recoveredId;
            newMeta.stripe_product_id = productId;
            result.action = "product_updated";
          }
          // Empty lookups cannot distinguish a fresh config from an earlier
          // failed/concurrent creation. Preserve creation; this is not a lock.
        }

        const retrieved = new Map<string, Stripe.Price | null>();
        for (const plan of plans) {
          if (plan.lookup) retrieved.set(plan.lookup.id, plan.lookup);
          if (
            plan.lookup &&
            (!productId || !ownedPrice(plan.lookup, productId, config.id))
          ) {
            throw new Error(
              `Conflicting Stripe lookup ownership for ${config.key}`,
            );
          }
        }
        for (const plan of plans) {
          if (
            productId && plan.lookup &&
            priceMatches(
              plan.lookup,
              productId,
              currency,
              Math.round(plan.amountMajor * 100),
              plan.interval,
            )
          ) {
            plan.selected = plan.lookup;
            continue;
          }
          if (plan.recordedId) {
            if (!retrieved.has(plan.recordedId)) {
              retrieved.set(
                plan.recordedId,
                await retrieveRecordedPrice(stripe, plan.recordedId),
              );
            }
            plan.recorded = retrieved.get(plan.recordedId);
          }
          if (
            productId && !plan.lookup && plan.recorded &&
            ownedPrice(plan.recorded, productId, config.id) &&
            priceMatches(
              plan.recorded,
              productId,
              currency,
              Math.round(plan.amountMajor * 100),
              plan.interval,
            )
          ) {
            plan.selected = plan.recorded;
          }
        }

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
          productName !== existingLabel || existingTaxCode !== stripeTaxCode ||
          existingAudience !== entitlementMeta.audience
        ) {
          await stripe.products.update(productId, {
            name: productName,
            ...(productDesc && { description: productDesc }),
            tax_code: stripeTaxCode,
            metadata: stripeProductMetadata,
          });
          result.action = "product_updated";
        }

        const oldPrices = new Map<string, Stripe.Price>();
        for (const plan of plans) {
          const replacing = !plan.selected;
          const action = await reconcileCycle(
            stripe,
            plan,
            productId,
            currency,
            entitlementMeta,
          );
          result.action = mergeStripeSyncAction(result.action, action);
          if (replacing) {
            for (const old of [plan.lookup, plan.recorded]) {
              if (old?.active && ownedPrice(old, productId, config.id)) {
                oldPrices.set(old.id, old);
              }
            }
          }
        }
        // A stale alias can be shared by two cycles. Never archive a price
        // retained by either cycle, even when the other needed replacement.
        const selectedIds = new Set(plans.map((plan) => plan.selected!.id));
        for (const old of oldPrices.values()) {
          if (!selectedIds.has(old.id)) {
            await stripe.prices.update(old.id, { active: false });
          }
        }
        const priceId = plans[0].selected!.id;
        if (
          existingAudience !== entitlementMeta.audience &&
          existingPriceId === priceId
        ) {
          await stripe.prices.update(priceId, {
            metadata: priceMetadata(entitlementMeta, catalogCycle, lookupKey),
          });
        }
        newMeta.stripe_price_id = priceId;
        newMeta.stripe_last_amount = String(amountMajor);
        newMeta.stripe_last_label = productName;
        newMeta.stripe_last_audience = entitlementMeta.audience;
        applyStripeTaxMetadata(newMeta, stripeTaxCode);
        for (const plan of plans) {
          if (plan.cycle !== "one_time") {
            setCycleSpecificPriceMetadata(
              newMeta,
              plan.cycle,
              plan.selected!.id,
              plan.amountMajor,
            );
          }
        }
        if (plans.length > 1) result.annual_price_id = plans[1].selected!.id;
        if (
          JSON.stringify(newMeta) !== JSON.stringify(meta) &&
          result.action === "no_change"
        ) {
          result.action = "product_updated";
        }

        // Save only after every required remote operation succeeds.
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
