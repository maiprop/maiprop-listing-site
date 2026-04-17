/* eslint-disable @typescript-eslint/no-explicit-any */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { verifyBearerToken, AuthError } from "../_shared/auth.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const user = await verifyBearerToken(req, supabaseClient);
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No customer found");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Customer found", { customerId });

    // Fetch both active and trialing — consistent with stripe-webhook which treats both as subscribed
    const [activeSubs, trialingSubs] = await Promise.all([
      stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 }),
      stripe.subscriptions.list({ customer: customerId, status: "trialing", limit: 1 }),
    ]);
    const allSubs = [...activeSubs.data, ...trialingSubs.data];

    const hasActiveSub = allSubs.length > 0;
    let subscriptionEnd: string | null = null;
    let productId: string | null = null;

    if (hasActiveSub) {
      const sub = allSubs[0];
      subscriptionEnd = new Date(sub.current_period_end * 1000).toISOString();
      productId = sub.items.data[0].price.product as string;
      logStep("Active subscription found", { subscriptionId: sub.id, status: sub.status, productId });
    } else {
      logStep("No active subscription");
    }

    // Update profiles.subscription_product_id for RLS/limit enforcement
    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({ subscription_product_id: productId })
      .eq("user_id", user.id);
    if (updateError) logStep("Profile subscription update failed", { error: updateError.message });

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      product_id: productId,
      subscription_end: subscriptionEnd,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    const status = error instanceof AuthError ? error.status : 500;
    logStep("ERROR", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
