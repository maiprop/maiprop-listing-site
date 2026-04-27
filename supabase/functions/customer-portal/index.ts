/* eslint-disable @typescript-eslint/no-explicit-any */
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { verifyBearerToken, AuthError } from "../_shared/auth.ts";

const portalLimiter = makeRateLimiter({ bucket: "customer-portal", maxRequests: 10, windowMs: 60_000 });

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CUSTOMER-PORTAL] ${step}${detailsStr}`);
};

/**
 * Resolve the Stripe customer for the authenticated user. Prefers
 * metadata.user_id (set by create-checkout) so an email change after
 * subscription does not orphan the user from their billing portal. Falls back
 * to email lookup with a metadata backfill for legacy customers.
 */
async function resolveCustomer(
  stripe: Stripe,
  user: { id: string; email: string },
): Promise<string | null> {
  try {
    const search = await stripe.customers.search({
      query: `metadata['user_id']:'${user.id}'`,
      limit: 1,
    });
    if (search.data[0]) return search.data[0].id;
  } catch (_err) {
    // customers.search requires the search API; fall through.
  }
  const byEmail = await stripe.customers.list({ email: user.email, limit: 1 });
  if (byEmail.data[0]) {
    if (!byEmail.data[0].metadata?.user_id) {
      await stripe.customers.update(byEmail.data[0].id, {
        metadata: { ...(byEmail.data[0].metadata ?? {}), user_id: user.id },
      });
    }
    return byEmail.data[0].id;
  }
  return null;
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await portalLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    logStep("Function started");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const user = await verifyBearerToken(req, supabaseClient);
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customerId = await resolveCustomer(stripe, user);
    if (!customerId) {
      return new Response(JSON.stringify({ error: "No Stripe customer found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }
    logStep("Customer found", { customerId });

    const origin = req.headers.get("origin") || "https://portal.maiprop.co";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      // /dashboard/billing is a real route (Dashboard.tsx renders BillingTab for :section=billing).
      // The previous return_url=/pro landed users on the SPA 404 page after Stripe portal exit.
      return_url: `${origin}/dashboard/billing`,
    });

    logStep("Portal session created", { sessionId: portalSession.id });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    const status = error instanceof AuthError ? error.status : 500;
    logStep("ERROR", { message: error.message, status });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
