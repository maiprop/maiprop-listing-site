/**
 * Returns the authenticated user's Stripe invoices + current subscription info.
 * Used by the Billing tab in the dashboard.
 */
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";

const _log = createLogger("get-invoices");
const limiter = makeRateLimiter({ bucket: "get-invoices", maxRequests: 15, windowMs: 60_000 });

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

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user?.email) throw new Error("Unauthenticated");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: userData.user.email, limit: 1 });

    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ invoices: [], subscription: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;

    // Current subscription
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1, expand: ["data.items.data.price.product"] });
    let subscription = null;
    if (subs.data.length > 0) {
      const sub = subs.data[0];
      const price = sub.items.data[0]?.price;
      const product = price?.product as Stripe.Product | null;
      subscription = {
        id: sub.id,
        status: sub.status,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
        plan_name: product?.name ?? "Pro",
        amount: price?.unit_amount ? price.unit_amount / 100 : null,
        currency: price?.currency?.toUpperCase() ?? "EUR",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recurring is missing from the Stripe.Price type for this API version
        interval: (price as any)?.recurring?.interval ?? "month",
      };
    }

    // Recent invoices (last 12)
    const invoiceList = await stripe.invoices.list({ customer: customerId, limit: 12 });
    const invoices = invoiceList.data.map(inv => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amount_paid: inv.amount_paid / 100,
      currency: inv.currency.toUpperCase(),
      created: new Date(inv.created * 1000).toISOString(),
      period_start: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
      period_end: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
      description: (inv.lines.data[0]?.description) ?? null,
    }));

    return new Response(JSON.stringify({ invoices, subscription }), {
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
