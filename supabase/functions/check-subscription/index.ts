import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("check-subscription");
const checkSubLimiter = makeRateLimiter({
  bucket: "check-subscription",
  maxRequests: 30,
  windowMs: 60_000,
});

type FallbackSubscriptionState = {
  subscribed: boolean;
  product_id: string | null;
  subscription_end: string | null;
  source?: string;
};

function isStripeSubscribed(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

async function getDatabaseFallback( // skipcq: JS-R1005 - Fallback subscription resolution intentionally checks product IDs, direct subscription state, and investor grants.
  supabaseClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<FallbackSubscriptionState> {
  const [{ data: profile }, { data: investorSub }] = await Promise.all([
    supabaseClient
      .from("profiles")
      .select("subscription_product_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseClient
      .from("investor_subscriptions")
      .select("status, expires_at")
      .eq("user_id", userId)
      .in("status", ["active", "trial"])
      .limit(1)
      .maybeSingle(),
  ]);

  const productId =
    (profile as { subscription_product_id?: string | null } | null)
      ?.subscription_product_id ?? null;
  const { data: validProduct } = productId
    ? await supabaseClient
      .from("pro_product_ids")
      .select("product_id")
      .eq("product_id", productId)
      .maybeSingle()
    : { data: null };
  const investor = investorSub as {
    status?: string;
    expires_at?: string | null;
  } | null;

  return {
    subscribed: Boolean(validProduct) || investor?.status === "active" ||
      investor?.status === "trial",
    product_id: validProduct ? productId : null,
    subscription_end: investor?.expires_at ?? null,
    source: "database",
  };
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

async function getSubscribedStripeRecord(stripe: Stripe, customerId: string) {
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });
  return subs.data.find((subscription) =>
    isStripeSubscribed(subscription.status)
  ) ?? null;
}

async function resolveCustomerAndSubscription(stripe: Stripe, userId: string) {
  const candidates = await listOwnedCustomers(stripe, userId);
  let chosenCustomer: Stripe.Customer | null = null;
  let chosenSubscription: Stripe.Subscription | null = null;

  for (const customer of candidates) {
    const subscription = await getSubscribedStripeRecord(stripe, customer.id);
    if (subscription) {
      chosenCustomer = customer;
      chosenSubscription = subscription;
      break;
    }
  }

  if (!chosenCustomer && candidates[0]) {
    chosenCustomer = candidates[0];
  }

  return { customer: chosenCustomer, subscription: chosenSubscription };
}

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, Stripe lookup, DB fallback, and normalized subscription response.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await checkSubLimiter.isLimited(ip)) {
    return tooManyRequestsResponse(corsHeaders);
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const user = await verifyBearerToken(req, supabaseClient);
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeKey) {
      const fallback = await getDatabaseFallback(supabaseClient, user.id);
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    try {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const { customer, subscription } = await resolveCustomerAndSubscription(
        stripe,
        user.id,
      );

      const productId = subscription?.items.data[0]?.price.product as
        | string
        | undefined;
      const subscriptionEnd = subscription
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;

      const { error: updateError } = await supabaseClient
        .from("profiles")
        .update({ subscription_product_id: productId ?? null })
        .eq("user_id", user.id);

      if (updateError) {
        log.warn("profile subscription update failed", {
          message: updateError.message,
          userId: user.id,
        });
      }

      return new Response(
        JSON.stringify({
          subscribed: Boolean(subscription),
          product_id: productId ?? null,
          subscription_end: subscriptionEnd,
          source: customer ? "stripe" : "database",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (stripeError: unknown) {
      const fallback = await getDatabaseFallback(supabaseClient, user.id);
      log.warn("stripe lookup failed; using database fallback", {
        userId: user.id,
        message: stripeError instanceof Error
          ? stripeError.message
          : String(stripeError),
      });
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
  } catch (error: unknown) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
