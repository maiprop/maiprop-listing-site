import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

/** Plan keys: env STRIPE_PRICE_<UPPERCASE_KEY>, or DB pricing_configs.metadata.stripe_price_id, or STRIPE_PRICE_DEFAULT. No hardcoded fallback in production. */
async function getPriceForPlan(supabase: ReturnType<typeof createClient>, planKey: string): Promise<string> {
  const envKey = `STRIPE_PRICE_${planKey.toUpperCase().replace(/-/g, "_")}`;
  const envPrice = Deno.env.get(envKey);
  if (envPrice) return envPrice;

  const { data } = await supabase.from("pricing_configs").select("metadata").eq("key", planKey).maybeSingle();
  const stripePriceId = (data as any)?.metadata?.stripe_price_id;
  if (stripePriceId) return stripePriceId;

  const defaultPrice = Deno.env.get("STRIPE_PRICE_DEFAULT");
  if (!defaultPrice) throw new Error("STRIPE_PRICE_DEFAULT or pricing_configs.metadata.stripe_price_id required");
  return defaultPrice;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set — checkout cannot proceed safely");
    return new Response(JSON.stringify({ error: "Checkout service unavailable" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user?.email) throw new Error("Unauthenticated");

    const user = userData.user;
    logStep("User authenticated", { userId: user.id, email: user.email });

    const body = (req.method === "POST" && req.body) ? await req.json().catch(() => ({})) : {};
    const plan = (body.plan ?? "pro") as string;
    const successUrl = body.success_url;
    const cancelUrl = body.cancel_url;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

    const priceId = await getPriceForPlan(supabaseClient, plan);
    logStep("Resolved price", { plan, priceId });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing Stripe customer found", { customerId });
    }

    const origin = req.headers.get("origin") || "https://maiprop-listing-site.lovable.app";
    const success = successUrl ?? (plan.startsWith("professional") ? `${origin}/dashboard?pro=success` : `${origin}/pro?success=1`);
    const cancel = cancelUrl ?? (plan.startsWith("professional") ? `${origin}/pricing` : `${origin}/pro?cancelled=1`);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: success,
      cancel_url: cancel,
      metadata: { user_id: user.id, plan },
    });

    logStep("Checkout session created", { sessionId: session.id, plan });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
