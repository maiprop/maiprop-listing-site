import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { isStripeMockMode } from "../_shared/stripeMode.ts";

const log = createLogger("get-invoices");
const limiter = makeRateLimiter({
  bucket: "get-invoices",
  maxRequests: 15,
  windowMs: 60_000,
});

function isStripeSubscribed(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

async function listOwnedCustomers(stripe: Stripe, userId: string) {
  const search = await stripe.customers.search({
    query: `metadata['user_id']:'${userId}'`,
    limit: 10,
  });
  return search.data.filter((customer) =>
    customer.metadata?.user_id === userId
  );
}

async function resolveCustomer(stripe: Stripe, userId: string) {
  const candidates = await listOwnedCustomers(stripe, userId);
  let chosenCustomer: Stripe.Customer | null = null;
  let chosenSubscription: Stripe.Subscription | null = null;

  for (const customer of candidates) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 10,
      expand: ["data.items.data.price.product"],
    });
    const preferred = subscriptions.data.find((subscription) =>
      isStripeSubscribed(subscription.status)
    );
    if (preferred) {
      chosenCustomer = customer;
      chosenSubscription = preferred;
      break;
    }
    if (!chosenCustomer && subscriptions.data[0]) {
      chosenCustomer = customer;
      chosenSubscription = subscriptions.data[0];
    }
  }

  if (!chosenCustomer && candidates[0]) {
    chosenCustomer = candidates[0];
  }

  return { customer: chosenCustomer, subscription: chosenSubscription };
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
    );
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token,
    );
    if (userError || !userData.user?.email) {
      return new Response(JSON.stringify({ error: "Unauthenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    if (isStripeMockMode()) {
      return new Response(
        JSON.stringify({
          invoices: [],
          subscription: null,
          billing_configured: true,
          customer_found: false,
          portal_eligible: false,
          billing_reason: "stripe_mock",
          billing_mode: "mock",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (!stripeKey) {
      return new Response(
        JSON.stringify({
          invoices: [],
          subscription: null,
          billing_configured: false,
          customer_found: false,
          portal_eligible: false,
          billing_reason: "stripe_disabled",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const { customer, subscription } = await resolveCustomer(
      stripe,
      userData.user.id,
    );

    if (!customer) {
      return new Response(
        JSON.stringify({
          invoices: [],
          subscription: null,
          billing_configured: true,
          customer_found: false,
          portal_eligible: false,
          billing_reason: "no_customer",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    let invoiceErrorReason: string | null = null;
    let invoices: Array<Record<string, unknown>> = [];

    try {
      const invoiceList = await stripe.invoices.list({
        customer: customer.id,
        limit: 12,
      });
      invoices = invoiceList.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amount_paid: inv.amount_paid / 100,
        currency: inv.currency.toUpperCase(),
        created: new Date(inv.created * 1000).toISOString(),
        period_start: inv.period_start
          ? new Date(inv.period_start * 1000).toISOString()
          : null,
        period_end: inv.period_end
          ? new Date(inv.period_end * 1000).toISOString()
          : null,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf,
        description: inv.lines.data[0]?.description ?? null,
      }));
    } catch (invoiceError: unknown) {
      invoiceErrorReason = invoiceError instanceof Error
        ? invoiceError.message
        : String(invoiceError);
      log.warn("invoice list failed", {
        customerId: customer.id,
        message: invoiceErrorReason,
      });
    }

    const price = subscription?.items.data[0]?.price;
    const product = price?.product as Stripe.Product | null | undefined;
    const normalizedSubscription = subscription
      ? {
        id: subscription.id,
        status: subscription.status,
        current_period_end: new Date(subscription.current_period_end * 1000)
          .toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        plan_name: product?.name ?? "Pro",
        amount: price?.unit_amount ? price.unit_amount / 100 : null,
        currency: price?.currency?.toUpperCase() ?? "EUR",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recurring is missing from the Stripe.Price type for this API version
        interval: (price as any)?.recurring?.interval ?? "month",
      }
      : null;

    return new Response(
      JSON.stringify({
        invoices,
        subscription: normalizedSubscription,
        billing_configured: true,
        customer_found: true,
        portal_eligible: true,
        billing_reason: invoiceErrorReason ? "invoice_unavailable" : "ok",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
