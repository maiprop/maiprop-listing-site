/* eslint-disable @typescript-eslint/no-explicit-any */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { verifyBearerToken, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

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
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set — checkout cannot proceed safely");
    return new Response(JSON.stringify({ error: "Checkout service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  try {
    const user = await verifyBearerToken(req, supabaseClient);
    logStep("User authenticated", { userId: user.id, email: user.email });

    const body = req.method === "POST" && req.body ? await req.json().catch(() => ({})) : {};
    const plan = (body.plan ?? "pro") as string;
    // Redirect URLs are derived from the request origin only — caller-provided URLs are ignored
    // to prevent open-redirect attacks.

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

    const priceId = await getPriceForPlan(supabaseClient, plan);
    logStep("Resolved price", { plan, priceId });

    // Always resolve or create a Stripe customer with user_id in metadata
    // so the webhook can correlate by user_id instead of email.
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing Stripe customer found", { customerId });
      // Backfill user_id in metadata for customers created before this change
      if (!customers.data[0].metadata?.user_id) {
        await stripe.customers.update(customerId, { metadata: { user_id: user.id } });
        logStep("Backfilled user_id on customer metadata", { customerId });
      }
    } else {
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = newCustomer.id;
      logStep("Created Stripe customer with user_id metadata", { customerId });
    }

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://portal.maiprop.co/";
    const success = `${origin}/pricing?checkout=success`;
    const cancel = `${origin}/pricing?checkout=cancelled`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
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
  } catch (error: unknown) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
