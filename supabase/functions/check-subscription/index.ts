import Stripe from "npm:stripe@22.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  getProfilePricingAudience,
  normalizeEntitlementAudience,
  resolveSubscriptionEntitlement,
} from "../_shared/entitlements.ts";
import { hasProvisionedSubscriptionAccess } from "../_shared/subscriptionStatus.ts";
import { createStripeClient, getStripeRuntimeMode } from "../_shared/stripeClient.ts";

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
  plan_key?: string | null;
  audience?: string | null;
  billing_cycle?: string | null;
  status?: string | null;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function queryErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : String(error);
}

function subscriptionUnavailableResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: "Subscription service unavailable" }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 503,
    },
  );
}

type DurableBillingSubscriptionRow = {
  status?: string | null;
  stripe_product_id?: string | null;
  current_period_end?: string | null;
  trial_end?: string | null;
  plan_key?: string | null;
  audience?: string | null;
  billing_cycle?: string | null;
};

type ProfileSubscriptionRow = {
  role?: string | null;
  participant_type?: string | null;
  subscription_product_id?: string | null;
};

function isValidDurableBillingSubscription(
  row: DurableBillingSubscriptionRow | null,
  now = new Date(),
) {
  if (!row || !hasProvisionedSubscriptionAccess(row.status)) return false;
  const entitlementEnd = row.status === "trialing"
    ? row.trial_end ?? row.current_period_end
    : row.current_period_end;
  if (!entitlementEnd) return row.status !== "trialing";
  const periodEnd = new Date(entitlementEnd);
  return !Number.isNaN(periodEnd.getTime()) && periodEnd > now;
}

function durableBillingStateFromRows(
  rows: DurableBillingSubscriptionRow[],
  profileAudience: string | null,
): FallbackSubscriptionState | null {
  const row = rows.find((candidate) => {
    if (!isValidDurableBillingSubscription(candidate)) return false;
    const rowAudience = normalizeEntitlementAudience(candidate.audience);
    return Boolean(profileAudience && rowAudience === profileAudience);
  });
  if (!row) return null;
  return {
    subscribed: true,
    product_id: row.stripe_product_id ?? null,
    subscription_end: row.status === "trialing"
      ? row.trial_end ?? row.current_period_end ?? null
      : row.current_period_end ?? null,
    source: "billing_state",
    plan_key: row.plan_key ?? null,
    audience: row.audience ?? null,
    billing_cycle: row.billing_cycle ?? null,
    status: row.status ?? null,
  };
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export async function getDatabaseFallback( // skipcq: JS-R1005 - Fallback subscription resolution intentionally checks product IDs, direct subscription state, and investor grants.
  supabaseClient: unknown,
  userId: string,
  { allowProfileEntitlement = false }: { allowProfileEntitlement?: boolean } =
    {},
): Promise<FallbackSubscriptionState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabaseClient as { from: any };
  const runtimeMode = getStripeRuntimeMode();
  const [profileResult, investorResult, billingResult] = await Promise.all([
    client.from("profiles")
      .select("role, participant_type, subscription_product_id")
      .eq("user_id", userId)
      .maybeSingle(),
    client.from("investor_subscriptions")
      .select("status, expires_at")
      .eq("user_id", userId)
      .eq("runtime_mode", runtimeMode)
      .in("status", ["active", "trial"]),
    client.from("billing_subscriptions")
      .select("status, stripe_product_id, current_period_end, trial_end, plan_key, audience, billing_cycle")
      .eq("user_id", userId)
      .eq("runtime_mode", runtimeMode)
      .eq("livemode", runtimeMode === "live")
      .in("status", ["active", "trialing", "past_due"])
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);
  const profileError = queryErrorMessage(profileResult.error);
  if (profileError) {
    throw new Error(`profile subscription lookup failed: ${profileError}`);
  }
  const investorError = queryErrorMessage(investorResult.error);
  if (investorError) {
    throw new Error(`investor subscription lookup failed: ${investorError}`);
  }
  const billingError = queryErrorMessage(billingResult.error);
  if (billingError) {
    throw new Error(`billing subscription lookup failed: ${billingError}`);
  }

  const billingRows =
    (Array.isArray(billingResult.data)
      ? billingResult.data
      : billingResult.data
      ? [billingResult.data]
      : []) as DurableBillingSubscriptionRow[];
  const profileRow = profileResult.data as ProfileSubscriptionRow | null;
  const profileAudience = getProfilePricingAudience(profileRow);
  const durableBillingState = durableBillingStateFromRows(
    billingRows,
    profileAudience,
  );
  if (durableBillingState) return durableBillingState;

  const productId = profileRow?.subscription_product_id ?? null;
  const entitlement = allowProfileEntitlement && productId
    ? await resolveSubscriptionEntitlement(supabaseClient, userId, {
      productId,
    })
    : null;
  const investors =
    (Array.isArray(investorResult.data)
      ? investorResult.data
      : investorResult.data
      ? [investorResult.data]
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

function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription | null) {
  const rootPeriodEnd = (subscription as unknown as {
    current_period_end?: number | null;
  } | null)?.current_period_end;
  const itemPeriodEnd = (subscription?.items.data[0] as
    | { current_period_end?: number | null }
    | undefined)?.current_period_end;
  return rootPeriodEnd ?? itemPeriodEnd ?? null;
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
async function resolveCustomerAndSubscription(
  stripe: Stripe,
  supabaseClient: unknown,
  userId: string,
) {
  const candidates = await listOwnedCustomers(stripe, userId);
  let chosenCustomer: Stripe.Customer | null = null;
  let chosenSubscription: Stripe.Subscription | null = null;
  let chosenEntitlement: Awaited<ReturnType<typeof resolveSubscriptionEntitlement>> =
    null;

  for (const customer of candidates) {
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 100,
    });
    if (!chosenCustomer) chosenCustomer = customer;

    for (const subscription of subs.data) {
      if (!isStripeSubscribed(subscription.status)) continue;
      const entitlement = await resolveSubscriptionEntitlement(
        supabaseClient,
        userId,
        getSubscriptionItemIds(subscription),
      );
      if (!entitlement) continue;
      chosenCustomer = customer;
      chosenSubscription = subscription;
      chosenEntitlement = entitlement;
      return {
        customer: chosenCustomer,
        subscription: chosenSubscription,
        entitlement: chosenEntitlement,
      };
    }
  }

  if (!chosenCustomer && candidates[0]) {
    chosenCustomer = candidates[0];
  }

  return {
    customer: chosenCustomer,
    subscription: chosenSubscription,
    entitlement: chosenEntitlement,
  };
}

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, Stripe lookup, DB fallback, and normalized subscription response.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  try {
    if (await checkSubLimiter.isLimited(ip)) {
      return tooManyRequestsResponse(corsHeaders);
    }
  } catch (rateLimitError: unknown) {
    log.warn("subscription rate limiter unavailable; allowing request", {
      message: getErrorMessage(rateLimitError),
    });
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
      try {
        const fallback = await getDatabaseFallback(supabaseClient, user.id);
        return new Response(JSON.stringify(fallback), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } catch (fallbackError: unknown) {
        log.error("database fallback failed without Stripe key", {
          userId: user.id,
          message: getErrorMessage(fallbackError),
        });
        return subscriptionUnavailableResponse(corsHeaders);
      }
    }

    try {
      const stripe = createStripeClient(stripeKey);
      const { customer, subscription, entitlement } =
        await resolveCustomerAndSubscription(
        stripe,
        supabaseClient,
        user.id,
      );

      const currentPeriodEnd = getSubscriptionCurrentPeriodEnd(subscription);
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
      log.warn("stripe lookup failed; using database fallback", {
        userId: user.id,
        message: getErrorMessage(stripeError),
      });
      try {
        const fallback = await getDatabaseFallback(supabaseClient, user.id, {
          allowProfileEntitlement: false,
        });
        return new Response(JSON.stringify(fallback), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } catch (fallbackError: unknown) {
        log.error("database fallback failed after Stripe error", {
          userId: user.id,
          message: getErrorMessage(fallbackError),
        });
        return subscriptionUnavailableResponse(corsHeaders);
      }
    }
  } catch (error: unknown) {
    if (!(error instanceof AuthError)) {
      log.error("unexpected subscription check failure", {
        message: getErrorMessage(error),
      });
      return subscriptionUnavailableResponse(corsHeaders);
    }
    const status = error.status;
    const message = getErrorMessage(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
