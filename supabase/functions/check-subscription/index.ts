import Stripe from "npm:stripe@18.5.0";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { verifyBearerToken, AuthError } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("check-subscription");

// Called on every auth context refresh — 30/min per IP
const checkSubLimiter = makeRateLimiter({ bucket: "check-subscription", maxRequests: 30, windowMs: 60_000 });

// Redirect the legacy logStep helper through the structured logger.
const logStep = (step: string, details?: unknown): void => {
  log.info(
    step,
    details && typeof details === "object"
      ? (details as Record<string, unknown>)
      : details !== undefined
        ? { details }
        : undefined,
  );
};

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await checkSubLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

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

    // Prefer metadata.user_id (set by create-checkout) so the subscription
    // state survives an auth email change. Fall back to email lookup for
    // legacy customers and backfill the metadata for future calls.
    let customerId: string | null = null;
    try {
      const search = await stripe.customers.search({
        query: `metadata['user_id']:'${user.id}'`,
        limit: 1,
      });
      if (search.data[0]) customerId = search.data[0].id;
    } catch (_err) {
      // customers.search requires the search API; fall through to email path.
    }
    if (!customerId) {
      const byEmail = await stripe.customers.list({ email: user.email, limit: 1 });
      if (byEmail.data[0]) {
        customerId = byEmail.data[0].id;
        if (!byEmail.data[0].metadata?.user_id) {
          await stripe.customers.update(customerId, {
            metadata: { ...(byEmail.data[0].metadata ?? {}), user_id: user.id },
          });
        }
      }
    }

    if (!customerId) {
      logStep("No customer found");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
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
