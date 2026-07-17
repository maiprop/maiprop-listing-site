import Stripe from "npm:stripe@22.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { AuthError } from "../_shared/auth.ts";
import { verifiedGatewayUserFromJwt } from "../_shared/gatewayJwt.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  getProfilePricingAudience,
  normalizeEntitlementAudience,
  resolveSubscriptionEntitlement,
} from "../_shared/entitlements.ts";
import { hasProvisionedSubscriptionAccess } from "../_shared/subscriptionStatus.ts";
import {
  createStripeClient,
  getStripeRuntimeMode,
} from "../_shared/stripeClient.ts";
import {
  upsertBillingCustomer,
  upsertBillingSubscription,
} from "../_shared/billingState.ts";
import {
  type AddonCheckoutFulfillmentResult,
  reconcileAddonCheckoutSession,
} from "../_shared/addonFulfillment.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";

const log = createLogger("check-subscription");
const checkSubLimiter = makeRateLimiter({
  bucket: "check-subscription",
  maxRequests: 30,
  windowMs: 60_000,
  databaseTimeoutMs: 500,
});

const subscriptionCheckRequestSchema = z.object({
  checkout_session_id: z.string().trim().min(1).max(255).optional(),
});

export type SubscriptionCheckRequest = z.infer<
  typeof subscriptionCheckRequestSchema
>;

type SubscriptionDatabaseClient = {
  from: ReturnType<typeof createClient>["from"];
  rpc?: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

// Normal entitlement refreshes intentionally send no body. Explicit checkout
// reconciliation sends one strictly validated session identifier.
export async function parseSubscriptionCheckRequest(
  req: Request,
): Promise<SubscriptionCheckRequest> {
  const rawBody = await req.text();
  const normalizedBody = rawBody.trim().length > 0 ? rawBody : "{}";
  const normalizedRequest = new Request(req.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: normalizedBody,
  });
  return parseJsonBody(normalizedRequest, subscriptionCheckRequestSchema);
}

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

export type SubscriptionSyncStatus = "synced" | "pending" | "timeout";

export type SubscriptionCheckState = FallbackSubscriptionState & {
  sync_status: SubscriptionSyncStatus;
};

type SubscriptionCheckOptions = {
  stripeKey?: string | null;
  createStripe?: (stripeKey: string) => StripeCheckoutRetriever;
  reconciliationTimeoutMs?: number;
  handlerTimeoutMs?: number;
  fulfillAddonCheckout?: (
    supabase: unknown,
    session: Stripe.Checkout.Session,
  ) => Promise<AddonCheckoutFulfillmentResult>;
};

type StripeCheckoutRetriever = {
  checkout: {
    sessions: {
      retrieve(
        id: string,
        params: { expand: string[] },
        options: { timeout: number; maxNetworkRetries: number },
      ): Promise<Stripe.Checkout.Session>;
    };
  };
};

const CHECKOUT_RECONCILIATION_TIMEOUT_MS = 3_000;
const SUBSCRIPTION_CHECK_DEADLINE_MS = 5_000;
const CHECKOUT_SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9_]+$/;

class CheckoutReconciliationTimeoutError extends Error {}
export class SubscriptionCheckDeadlineError extends Error {}

function isStripeSubscribed(status: string | null | undefined): boolean {
  return hasProvisionedSubscriptionAccess(status);
}

async function withHardTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  createTimeoutError: () => Error = () =>
    new CheckoutReconciliationTimeoutError(),
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(createTimeoutError()),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
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

export function subscriptionHandlerErrorResponse(
  error: unknown,
  corsHeaders: Record<string, string>,
) {
  if (error instanceof SubscriptionCheckDeadlineError) {
    log.warn("subscription handler deadline exceeded", {
      timeout_ms: SUBSCRIPTION_CHECK_DEADLINE_MS,
    });
    return new Response(
      JSON.stringify({
        subscribed: false,
        product_id: null,
        subscription_end: null,
        source: "deadline",
        sync_status: "timeout",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  }

  log.error("unexpected subscription handler failure", {
    message: getErrorMessage(error),
  });
  return subscriptionUnavailableResponse(corsHeaders);
}

type DurableBillingSubscriptionRow = {
  stripe_subscription_id?: string | null;
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
};

function isValidDurableBillingSubscription(
  row: DurableBillingSubscriptionRow | null,
  now = new Date(),
) {
  if (!row || !isStripeSubscribed(row.status)) return false;
  const entitlementEnd = row.status === "trialing"
    ? row.trial_end ?? row.current_period_end
    : row.current_period_end;
  if (!entitlementEnd) return false;
  const periodEnd = new Date(entitlementEnd);
  return !Number.isNaN(periodEnd.getTime()) && periodEnd > now;
}

function isValidCheckoutSubscription(
  subscription: Stripe.Subscription | null,
  now = Date.now(),
) {
  if (!subscription || !isStripeSubscribed(subscription.status)) {
    return false;
  }
  if (subscription.status === "trialing") {
    return typeof subscription.trial_end === "number" &&
      Number.isFinite(subscription.trial_end) &&
      subscription.trial_end * 1_000 > now;
  }

  const currentPeriodEnd = (subscription as Stripe.Subscription & {
    current_period_end?: number | null;
  }).current_period_end ??
    subscription.items.data[0]?.current_period_end;
  return typeof currentPeriodEnd === "number" &&
    Number.isFinite(currentPeriodEnd) && currentPeriodEnd * 1_000 > now;
}

function durableBillingStateFromRows(
  rows: DurableBillingSubscriptionRow[],
  profileAudience: string | null,
  requiredStripeSubscriptionId?: string,
): FallbackSubscriptionState | null {
  const row = rows.find((candidate) => {
    if (
      requiredStripeSubscriptionId &&
      candidate.stripe_subscription_id !== requiredStripeSubscriptionId
    ) return false;
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
export async function getDatabaseFallback( // skipcq: JS-R1005 - Durable resolution checks billing state and investor grants in parallel.
  supabaseClient: unknown,
  userId: string,
  {
    requiredStripeSubscriptionId,
  }: {
    requiredStripeSubscriptionId?: string;
  } = {},
): Promise<FallbackSubscriptionState> {
  const client = supabaseClient as SubscriptionDatabaseClient;
  const runtimeMode = getStripeRuntimeMode();
  if (typeof client.rpc === "function") {
    const { data, error } = await client.rpc(
      "resolve_subscription_state_for_service",
      {
        p_user_id: userId,
        p_required_stripe_subscription_id:
          requiredStripeSubscriptionId ?? null,
      },
    );
    if (!error && data && typeof data === "object") {
      return data as FallbackSubscriptionState;
    }
    const unavailableRpc = error?.code === "PGRST202" ||
      error?.code === "42883";
    if (error && !unavailableRpc) {
      throw new Error(
        `subscription resolver failed: ${queryErrorMessage(error) ?? "unknown error"}`,
      );
    }
  }

  const [profileResult, investorResult, billingResult] = await Promise.all([
    client.from("profiles")
      .select("role, participant_type")
      .eq("user_id", userId)
      .maybeSingle(),
    client.from("investor_subscriptions")
      .select("status, expires_at")
      .eq("user_id", userId)
      .eq("runtime_mode", runtimeMode)
      .eq("livemode", runtimeMode === "live")
      .in("status", ["active", "trial"]),
    client.from("billing_subscriptions")
      .select(
        "stripe_subscription_id, status, stripe_product_id, current_period_end, trial_end, plan_key, audience, billing_cycle",
      )
      .eq("user_id", userId)
      .eq("runtime_mode", runtimeMode)
      .eq("livemode", runtimeMode === "live")
      .in("status", ["active", "trialing", "past_due"])
      .order("updated_at", { ascending: false }),
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
    requiredStripeSubscriptionId,
  );
  if (durableBillingState) return durableBillingState;

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
  const hasInvestorAudience = profileAudience === "investor" ||
    profileAudience === "institutional";
  const investor = hasInvestorAudience
    ? investors.find((row) => isValidInvestorSubscription(row)) ?? null
    : null;
  const hasInvestorSubscription = Boolean(investor);

  return {
    subscribed: hasInvestorSubscription,
    product_id: null,
    subscription_end: hasInvestorSubscription
      ? investor?.expires_at ?? null
      : null,
    source: hasInvestorSubscription ? "investor" : "database",
  };
}

// skipcq: JS-0067 - Exported orchestration helper keeps the DB-only path directly testable.
async function resolveSubscriptionCheckWithinDeadline(
  supabaseClient: unknown,
  userId: string,
  body: { checkout_session_id?: unknown },
  options: SubscriptionCheckOptions = {},
): Promise<{ httpStatus: number; state: SubscriptionCheckState }> {
  const cachedState = await getDatabaseFallback(supabaseClient, userId);
  const checkoutSessionId = typeof body.checkout_session_id === "string"
    ? body.checkout_session_id.trim()
    : "";
  if (!checkoutSessionId) {
    return {
      httpStatus: 200,
      state: { ...cachedState, sync_status: "synced" },
    };
  }

  const runtimeMode = getStripeRuntimeMode();
  const expectedSessionPrefix = runtimeMode === "live"
    ? "cs_live_"
    : "cs_test_";
  if (
    !CHECKOUT_SESSION_ID_RE.test(checkoutSessionId) ||
    !checkoutSessionId.startsWith(expectedSessionPrefix)
  ) {
    return {
      httpStatus: 202,
      state: { ...cachedState, sync_status: "pending" },
    };
  }

  const stripeKey = options.stripeKey ?? null;
  if (!stripeKey) {
    return {
      httpStatus: 202,
      state: { ...cachedState, sync_status: "pending" },
    };
  }

  const stripe = options.createStripe?.(stripeKey) ??
    createStripeClient(stripeKey);
  const reconciliationTimeoutMs = options.reconciliationTimeoutMs ??
    CHECKOUT_RECONCILIATION_TIMEOUT_MS;
  let session: Stripe.Checkout.Session;
  try {
    session = await withHardTimeout(
      stripe.checkout.sessions.retrieve(
        checkoutSessionId,
        { expand: ["subscription"] },
        { timeout: reconciliationTimeoutMs, maxNetworkRetries: 0 },
      ),
      reconciliationTimeoutMs,
    );
  } catch (error) {
    if (error instanceof CheckoutReconciliationTimeoutError) {
      log.warn("checkout reconciliation timed out", {
        timeout_ms: reconciliationTimeoutMs,
      });
      return {
        httpStatus: 200,
        state: { ...cachedState, sync_status: "timeout" },
      };
    }
    log.warn("checkout reconciliation pending", {
      err: getErrorMessage(error),
    });
    return {
      httpStatus: 202,
      state: { ...cachedState, sync_status: "pending" },
    };
  }
  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id ?? null;
  const expectedLivemode = runtimeMode === "live";
  const isExactAddonCandidate = session.id === checkoutSessionId &&
    session.mode === "payment" && session.status === "complete" &&
    session.payment_status === "paid" &&
    session.metadata?.checkout_type === "addon" &&
    session.metadata?.user_id === userId &&
    session.client_reference_id === userId &&
    session.metadata?.runtime_mode === runtimeMode &&
    session.livemode === expectedLivemode;

  if (session.mode === "payment") {
    if (!isExactAddonCandidate) {
      return {
        httpStatus: 202,
        state: { ...cachedState, sync_status: "pending" },
      };
    }
    const fulfillAddon = options.fulfillAddonCheckout ??
      reconcileAddonCheckoutSession;
    const fulfillment = await fulfillAddon(supabaseClient, session);
    return fulfillment === "fulfilled"
      ? {
        httpStatus: 200,
        state: { ...cachedState, sync_status: "synced" },
      }
      : {
        httpStatus: 202,
        state: { ...cachedState, sync_status: "pending" },
      };
  }

  const subscription = typeof session.subscription === "object" &&
      session.subscription && !("deleted" in session.subscription)
    ? session.subscription as Stripe.Subscription
    : null;
  const itemIds = getSubscriptionItemIds(subscription);
  const sessionAudience = normalizeEntitlementAudience(
    session.metadata?.audience,
  );
  const subscriptionAudience = normalizeEntitlementAudience(
    subscription?.metadata?.audience,
  );
  const isOwnedSession = session.metadata?.user_id === userId &&
    subscription?.metadata?.user_id === userId &&
    session.client_reference_id === userId;
  const checkoutType = session.metadata?.checkout_type;
  const isSubscriptionCheckout = (checkoutType === "subscription" ||
    checkoutType === "subscription_trial") &&
    subscription?.metadata?.checkout_type === checkoutType;
  const isMatchingAudience = Boolean(
    sessionAudience && subscriptionAudience === sessionAudience,
  );
  const isMatchingRuntime = session.livemode === expectedLivemode &&
    subscription?.livemode === expectedLivemode;
  const isReconciliationCandidate = session.id === checkoutSessionId &&
    session.mode === "subscription" && session.status === "complete" &&
    Boolean(customerId && subscription) &&
    isValidCheckoutSubscription(subscription) && isOwnedSession &&
    isSubscriptionCheckout && isMatchingAudience && isMatchingRuntime;
  const entitlement = subscription && isReconciliationCandidate
    ? await resolveSubscriptionEntitlement(
      supabaseClient,
      userId,
      itemIds,
      sessionAudience,
    )
    : null;

  if (
    !isReconciliationCandidate || !customerId || !subscription || !entitlement
  ) {
    return {
      httpStatus: 202,
      state: { ...cachedState, sync_status: "pending" },
    };
  }

  await upsertBillingCustomer(supabaseClient as never, {
    userId,
    stripeCustomerId: customerId,
    livemode: subscription.livemode,
    metadata: {
      user_id: userId,
      checkout_session_id: session.id,
    },
  });
  const billingCycle = subscription.metadata?.billing_cycle === "annual"
    ? "annual"
    : subscription.metadata?.billing_cycle === "monthly"
    ? "monthly"
    : null;
  await upsertBillingSubscription(supabaseClient as never, {
    userId,
    stripeCustomerId: customerId,
    subscription,
    canonical: {
      planKey: entitlement.planKey,
      audience: entitlement.audience,
      productId: entitlement.productId,
      priceId: itemIds.priceId,
      billingCycle,
    },
    observation: {
      source: "reconciliation",
      observedAt: new Date().toISOString(),
    },
  });

  const state = await getDatabaseFallback(supabaseClient, userId, {
    requiredStripeSubscriptionId: subscription.id,
  });
  if (state.source !== "billing_state") {
    return {
      httpStatus: 202,
      state: { ...cachedState, sync_status: "pending" },
    };
  }
  return {
    httpStatus: 200,
    state: { ...state, sync_status: "synced" },
  };
}

export async function resolveSubscriptionCheck(
  supabaseClient: unknown,
  userId: string,
  body: { checkout_session_id?: unknown },
  options: SubscriptionCheckOptions = {},
): Promise<{ httpStatus: number; state: SubscriptionCheckState }> {
  const handlerTimeoutMs = options.handlerTimeoutMs ??
    SUBSCRIPTION_CHECK_DEADLINE_MS;
  try {
    return await withHardTimeout(
      resolveSubscriptionCheckWithinDeadline(
        supabaseClient,
        userId,
        body,
        options,
      ),
      handlerTimeoutMs,
      () => new SubscriptionCheckDeadlineError(),
    );
  } catch (error) {
    if (!(error instanceof SubscriptionCheckDeadlineError)) throw error;
    log.warn("subscription check deadline exceeded", {
      timeout_ms: handlerTimeoutMs,
    });
    return {
      httpStatus: 200,
      state: {
        subscribed: false,
        product_id: null,
        subscription_end: null,
        source: "deadline",
        sync_status: "timeout",
      },
    };
  }
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

  const fallback = await getDatabaseFallback(supabaseClient, userId);
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

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, durable billing state, and explicit checkout reconciliation.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const operation = async (): Promise<Response> => {
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
      const user = verifiedGatewayUserFromJwt(req);
      const body = await parseSubscriptionCheckRequest(req);
      const result = await resolveSubscriptionCheck(
        supabaseClient,
        user.id,
        body,
        { stripeKey: Deno.env.get("STRIPE_SECRET_KEY") },
      );
      return new Response(JSON.stringify(result.state), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: result.httpStatus,
      });
    } catch (error: unknown) {
      if (error instanceof SchemaValidationError) {
        return new Response(
          JSON.stringify({
            error: error.message,
            code: error.code,
            issues: error.issues,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }
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
  };

  try {
    return await withHardTimeout(
      operation(),
      SUBSCRIPTION_CHECK_DEADLINE_MS,
      () => new SubscriptionCheckDeadlineError(),
    );
  } catch (error) {
    return subscriptionHandlerErrorResponse(error, corsHeaders);
  }
});
