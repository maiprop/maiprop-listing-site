/**
 * Admin-only: Create a Stripe Price from a pricing_configs row and save the price ID.
 * Used when admin changes amount and needs a new Stripe price (prices are immutable).
 */
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";

const _log = createLogger("create-stripe-price");
const limiter = makeRateLimiter({ bucket: "create-stripe-price", maxRequests: 5, windowMs: 60_000 });

interface ProfileRow {
  role?: string | null;
}

interface PricingConfigRow {
  id: string;
  key: string;
  label?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  unit?: string | null;
  metadata?: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!stripeKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service not configured" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthenticated");

    // Check platform admin
    const { data: profile } = await supabaseClient.from("profiles").select("role").eq("user_id", userData.user.id).single();
    if ((profile as ProfileRow | null)?.role !== "admin") throw new Error("Platform admin only");

    const body = (req.method === "POST" && req.body) ? await req.json().catch(() => ({})) : {};
    const configId = body.config_id ?? body.configId;
    if (!configId) throw new Error("config_id required");

    const { data: configRaw, error: configError } = await supabaseClient
      .from("pricing_configs")
      .select("id, key, label, amount, currency, unit, metadata")
      .eq("id", configId)
      .single();
    if (configError || !configRaw) throw new Error("Pricing config not found");
    const config = configRaw as PricingConfigRow;

    const amount = Math.round(Number(config.amount ?? 0) * 100); // Stripe uses cents
    const currency = (config.currency ?? "eur").toLowerCase();
    const unit = config.unit ?? "monthly";

    if (amount <= 0) throw new Error("Amount must be greater than 0");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Recurring (monthly/yearly) or one-time
    const isRecurring = ["monthly", "yearly"].includes(unit);
    const interval = unit === "yearly" ? "year" : "month";

    const product = await stripe.products.create({
      name: config.label || config.key,
      metadata: { pricing_config_key: config.key },
    });

    const priceParams: Stripe.PriceCreateParams = {
      product: product.id,
      currency,
      unit_amount: amount,
      metadata: { pricing_config_key: config.key, pricing_config_id: configId },
    };
    if (isRecurring) {
      priceParams.recurring = { interval };
    }

    const price = await stripe.prices.create(priceParams);

    const meta: Record<string, unknown> = { ...(config.metadata ?? {}) };
    meta.stripe_price_id = price.id;
    meta.stripe_product_id = product.id;

    const { error: updateError } = await supabaseClient
      .from("pricing_configs")
      .update({ metadata: meta, updated_at: new Date().toISOString() })
      .eq("id", configId);
    if (updateError) throw new Error("Failed to save price ID: " + updateError.message);

    return new Response(JSON.stringify({
      price_id: price.id,
      product_id: product.id,
      message: "Stripe price created and saved to pricing config",
    }), {
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
