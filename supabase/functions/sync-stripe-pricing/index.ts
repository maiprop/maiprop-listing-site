/**
 * Admin-only: Sync all pricing_configs to Stripe.
 * - For each active config with amount > 0:
 *   - If no stripe_product_id: create product + price, save IDs
 *   - If product exists but label changed: update product name/description
 *   - If price exists but amount changed (prices are immutable): archive old price, create new price, save new price_id
 * - Returns a summary of actions taken per config.
 */
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const _log = createLogger("sync-stripe-pricing");
const limiter = makeRateLimiter({
  bucket: "sync-stripe-pricing",
  maxRequests: 5,
  windowMs: 60_000,
});

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
  product_id?: string;
  error?: string;
};

/** Subset of `pricing_configs` columns this function touches. The full row
 *  type is not in the generated Supabase types since the table is unregistered. */
type PricingConfigRow = {
  id: string;
  key: string;
  audience?: string | null;
  amount: number | string;
  currency?: string | null;
  unit?: string | null;
  label?: string | null;
  description?: string | null;
  metadata?: Record<string, string> | null;
};

function normalizeAudience(raw: string | null | undefined): string | null { // skipcq: JS-R1005 - Legacy and current audience aliases stay centralized for Stripe price sync.
  if (
    raw === "buyer" ||
    raw === "seller" ||
    raw === "participant" ||
    raw === "user" ||
    raw === "pro"
  )
    return "participant";
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
  const audience =
    normalizeAudience(config.audience) ?? config.audience ?? "participant";
  return {
    pricing_config_key: config.key,
    pricing_config_id: config.id,
    plan_key: config.key,
    audience,
    role: audience,
    entitlement_role: audience,
  };
}

async function registerProProduct( // skipcq: JS-R1005 - Product registration handles absent, mismatched, and already-linked rows in one transaction-like path.
  supabase: unknown,
  productId: string | undefined,
  config: PricingConfigRow,
) {
  if (!productId) return;
  const audience =
    normalizeAudience(config.audience) ?? config.audience ?? "participant";
  const unit = config.unit ?? "monthly";
  if (
    !["participant", "agent", "developer", "professional"].includes(audience) ||
    !["monthly", "yearly"].includes(unit)
  ) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase as { from: any }).from as any)(
    "pro_product_ids",
  ).upsert({ product_id: productId }, { onConflict: "product_id" });
  if (error)
    throw new Error("Failed to register Pro product: " + error.message);
}

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates admin auth, Stripe reads, pricing upserts, and product allowlisting.
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
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
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthenticated");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();
    if ((profile as { role?: string } | null)?.role !== "admin")
      throw new Error("Platform admin only");

    // Optional: sync only specific config IDs, or all active configs
    const body =
      req.method === "POST" && req.body
        ? await req.json().catch(() => ({}))
        : {};
    const configIds: string[] | null = body.config_ids ?? null;

    let query = supabase
      .from("pricing_configs")
      .select("*")
      .eq("is_active", true)
      .gt("amount", 0);
    if (configIds?.length) query = query.in("id", configIds);
    const { data: configs, error: configsError } = await query;
    if (configsError)
      throw new Error("Failed to fetch configs: " + configsError.message);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const results: SyncResult[] = [];

    const typedConfigs = (configs ?? []) as PricingConfigRow[];
    for (const config of typedConfigs) {
      const meta = (config.metadata ?? {}) as Record<string, string>;
      const existingProductId = meta.stripe_product_id;
      const existingPriceId = meta.stripe_price_id;
      const existingAmount = Number(meta.stripe_last_amount ?? -1);
      const existingLabel = meta.stripe_last_label ?? "";
      const existingAudience = meta.stripe_last_audience ?? "";

      const amount = Math.round(Number(config.amount) * 100); // cents
      const currency = (config.currency ?? "EUR").toLowerCase();
      const unit = config.unit ?? "monthly";
      const isRecurring = ["monthly", "yearly"].includes(unit);
      const interval = unit === "yearly" ? "year" : "month";
      const productName = config.label || config.key;
      const productDesc = config.description ?? undefined;
      const entitlementMeta = entitlementMetadata(config);

      const result: SyncResult = {
        id: config.id,
        key: config.key,
        action: "no_change",
      };

      try {
        let productId = existingProductId;
        let priceId = existingPriceId;
        const newMeta = { ...meta };

        // ── Create product if missing ────────────────────────────────────────
        if (!productId) {
          const product = await stripe.products.create({
            name: productName,
            ...(productDesc && { description: productDesc }),
            metadata: entitlementMeta,
          });
          productId = product.id;
          newMeta.stripe_product_id = productId;
          result.action = "created";
        } else if (productName !== existingLabel) {
          // ── Update product name if label changed ─────────────────────────
          await stripe.products.update(productId, {
            name: productName,
            ...(productDesc && { description: productDesc }),
            metadata: entitlementMeta,
          });
          result.action = "product_updated";
        } else if (existingAudience !== entitlementMeta.audience) {
          await stripe.products.update(productId, {
            metadata: entitlementMeta,
          });
          result.action = "product_updated";
        }

        // ── Create price if missing ──────────────────────────────────────────
        if (!productId) {
          throw new Error(
            `Stripe product id missing for pricing config ${config.key}`,
          );
        }

        if (!priceId) {
          const priceParams: Stripe.PriceCreateParams = {
            product: productId,
            currency,
            unit_amount: amount,
            metadata: entitlementMeta,
          };
          if (isRecurring) priceParams.recurring = { interval };
          const price = await stripe.prices.create(priceParams);
          priceId = price.id;
          newMeta.stripe_price_id = priceId;
          newMeta.stripe_last_amount = String(config.amount);
          newMeta.stripe_last_label = productName;
          newMeta.stripe_last_audience = entitlementMeta.audience;
          result.action = "created";
        } else if (amount !== existingAmount) {
          // ── Amount changed: archive old price, create new ────────────────
          await stripe.prices.update(priceId, { active: false });

          const priceParams: Stripe.PriceCreateParams = {
            product: productId,
            currency,
            unit_amount: amount,
            metadata: entitlementMeta,
          };
          if (isRecurring) priceParams.recurring = { interval };
          const newPrice = await stripe.prices.create(priceParams);
          priceId = newPrice.id;
          newMeta.stripe_price_id = priceId;
          newMeta.stripe_last_amount = String(config.amount);
          newMeta.stripe_last_label = productName;
          newMeta.stripe_last_audience = entitlementMeta.audience;
          result.action = "price_updated";
        } else if (productName !== existingLabel) {
          newMeta.stripe_last_label = productName;
          result.action = "product_updated";
        } else if (existingAudience !== entitlementMeta.audience) {
          await stripe.prices.update(priceId, { metadata: entitlementMeta });
          newMeta.stripe_last_audience = entitlementMeta.audience;
          result.action = "product_updated";
        }

        // ── Save updated metadata back to DB ────────────────────────────────
        if (result.action !== "no_change") {
          await supabase
            .from("pricing_configs")
            .update({ metadata: newMeta, updated_at: new Date().toISOString() })
            .eq("id", config.id);
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
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
