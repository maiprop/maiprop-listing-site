/**
 * Admin-only: Create a Stripe Price from a pricing_configs row and save the price ID.
 * Used when admin changes amount and needs a new Stripe price (prices are immutable).
 */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const { data: profile } = await supabaseClient.from("profiles").select("is_platform_admin").eq("user_id", userData.user.id).single();
    if (!(profile as any)?.is_platform_admin) throw new Error("Platform admin only");

    const body = (req.method === "POST" && req.body) ? await req.json().catch(() => ({})) : {};
    const configId = body.config_id ?? body.configId;
    if (!configId) throw new Error("config_id required");

    const { data: config, error: configError } = await supabaseClient
      .from("pricing_configs")
      .select("id, key, label, amount, currency, unit, metadata")
      .eq("id", configId)
      .single();
    if (configError || !config) throw new Error("Pricing config not found");

    const amount = Math.round(Number((config as any).amount ?? 0) * 100); // Stripe uses cents
    const currency = ((config as any).currency ?? "eur").toLowerCase();
    const unit = (config as any).unit ?? "monthly";

    if (amount <= 0) throw new Error("Amount must be greater than 0");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Recurring (monthly/yearly) or one-time
    const isRecurring = ["monthly", "yearly"].includes(unit);
    const interval = unit === "yearly" ? "year" : "month";

    const product = await stripe.products.create({
      name: (config as any).label || (config as any).key,
      metadata: { pricing_config_key: (config as any).key },
    });

    const priceParams: Stripe.PriceCreateParams = {
      product: product.id,
      currency,
      unit_amount: amount,
      metadata: { pricing_config_key: (config as any).key, pricing_config_id: configId },
    };
    if (isRecurring) {
      (priceParams as any).recurring = { interval: interval };
    }

    const price = await stripe.prices.create(priceParams);

    const meta = ((config as any).metadata ?? {}) as Record<string, unknown>;
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
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
