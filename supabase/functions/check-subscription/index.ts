import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { resolveSubscriptionEntitlement } from "../_shared/entitlements.ts";
import { hasProvisionedSubscriptionAccess } from "../_shared/subscriptionStatus.ts";

const log = createLogger("check-subscription");
const checkSubLimiter = makeRateLimiter({
  bucket: "check-subscription",
  maxRequests: 30,
  windowMs: 60_000,
});

export type FallbackSubscriptionState = {
  subscribed: boolean;
  product_id: string | null;
  subscription_end: string | null;
  source?: string;
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function isStripeSubscribed(status: string | null | undefined) {
  return hasProvisionedSubscriptionAccess(status);
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function isValidInvestorSubscription(
  investor: { status?: string | null; expires_at?: string | null } | null,
  now = new Date(),
) {
  if (investor?.status !== "active" && investor?.status !== "trial") {
    return false;
  }
  if (!investor.expires_at) return true;

  const expiresAt = new Date(investor.expires_at);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt > now;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export async function getDatabaseFallback( // skipcq: JS-R1005 - Fallback subscription resolution intentionally checks product IDs, direct subscription state, and investor grants.
  supabaseClient: unknown,
  userId: string,
  { allowProfileEntitlement = false }: { allowProfileEntitlement?: boolean } =
    {},
): Promise<FallbackSubscriptionState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (supabaseClient as { from: any }).from as any;
  const [{ data: profile }, { data: investorSubs }] = await Promise.all([
    from("profiles")
      .select("subscription_product_id")
      .eq("user_id", userId)
      .maybeSingle(),
    from("investor_subscriptions")
      .select("status, expires_at")
      .eq("user_id", userId)
      .in("status", ["active", "trial"]),
  ]);

  const productId =
    (profile as { subscription_product_id?: string | null } | null)
      ?.subscription_product_id ?? null;
  const entitlement = allowProfileEntitlement && productId
    ? await resolveSubscriptionEntitlement(supabaseClient, userId, {
      productId,
    })
    : null;
  const investors =
    (Array.isArray(investorSubs)
      ? investorSubs
      : investorSubs
      ? [investorSubs]
      : []) as Array<
        {
          status?: string;
          expires_at?: string | null;
        } | null
      >;
  const investor = investors.find((row) => isValidInvestorSubscription(row)) ??
    null;
  const hasInvestorSubscription = Boolean(investor);

  return {
    subscribed: Boolean(entitlement) || hasInvestorSubscription,
    product_id: entitlement?.productId ?? null,
    subscription_end: hasInvestorSubscription
      ? investor?.expires_at ?? null
      : null,
    source: "database",
  };
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export async function resolveSubscriptionResponse(
  supabaseClient: unknown,
  userId: string,
  {
    customerFound,
    entitlement,
    subscriptionEnd,
  }: {
    customerFound: boolean;
    entitlement: Awaited<ReturnType<typeof resolveSubscriptionEntitlement>>;
    subscriptionEnd: string | null;
  },
): Promise<FallbackSubscriptionState> {
  if (entitlement) {
    return {
      subscribed: true,
      product_id: entitlement.productId,
      subscription_end: subscriptionEnd,
      source: customerFound ? "stripe" : "database",
    };
  }

  const fallback = await getDatabaseFallback(supabaseClient, userId, {
    allowProfileEntitlement: false,
  });
  if (fallback.subscribed) return fallback;

  return {
    subscribed: false,
    product_id: null,
    subscription_end: subscriptionEnd,
    source: customerFound ? "stripe" : "database",
  };
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function getSubscriptionItemIds(subscription: Stripe.Subscription | null): {
  productId: string | null;
  priceId: string | null;
} {
  const price = subscription?.items.data[0]?.price;
  const product = price?.product;
  return {
    productId: typeof product === "string" ? product : product?.id ?? null,
    priceId: price?.id ?? null,
  };
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function listOwnedCustomers(stripe: Stripe, userId: string) {
  const search = await stripe.customers.search({
    query: `metadata['user_id']:'${userId}'`,
    limit: 10,
  });
  return search.data.filter((customer) =>
    customer.metadata?.user_id === userId
  );
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
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

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
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

      const stripeItem = getSubscriptionItemIds(subscription);
      const entitlement = subscription
        ? await resolveSubscriptionEntitlement(
          supabaseClient,
          user.id,
          stripeItem,
        )
        : null;
      const currentPeriodEnd =
        (subscription as unknown as { current_period_end?: number } | null)
          ?.current_period_end;
      const subscriptionEnd = currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000).toISOString()
        : null;
      const subscriptionState = await resolveSubscriptionResponse(
        supabaseClient,
        user.id,
        {
          customerFound: Boolean(customer),
          entitlement,
          subscriptionEnd,
        },
      );

      const { error: updateError } = await supabaseClient
        .from("profiles")
        .update({
          subscription_product_id: subscriptionState.product_id ?? null,
        })
        .eq("user_id", user.id);

      if (updateError) {
        log.warn("profile subscription update failed", {
          message: updateError.message,
          userId: user.id,
        });
      }

      return new Response(
        JSON.stringify(subscriptionState),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (stripeError: unknown) {
      const fallback = await getDatabaseFallback(supabaseClient, user.id, {
        allowProfileEntitlement: false,
      });
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
