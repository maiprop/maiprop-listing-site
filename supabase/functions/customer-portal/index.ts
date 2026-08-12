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
  isStripeMockMode,
  withMockBillingParams,
} from "../_shared/stripeMode.ts";
import {
  createVerifiedStripeClient,
  getStripeRuntimeMode,
} from "../_shared/stripeClient.ts";
import {
  buildPortalSessionParams,
  parsePortalActionRequest,
  portalActionRequestSchema,
  PortalActionValidationError,
  type CustomerPortalAction,
} from "./portalActions.ts";
import { resumeSubscriptionSafely } from "./resumeSubscription.ts";
import { resolveCheckoutOrigin } from "../create-checkout/origins.ts";
import {
  parseJsonBody,
  SchemaValidationError,
} from "../_shared/schema.ts";

const log = createLogger("customer-portal");

const portalLimiter = makeRateLimiter({
  bucket: "customer-portal",
  maxRequests: 10,
  windowMs: 60_000,
});

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

/**
 * Resolve the Stripe customer for the authenticated user. Prefer immutable
 * ownership signals: Stripe metadata.user_id first, then durable billing state.
 * Never claim a Stripe customer by email alone.
 */
async function resolveCustomer(
  stripe: Stripe,
  supabase: { from: (table: string) => unknown },
  user: { id: string; email: string },
): Promise<string | null> {
  try {
    const search = await stripe.customers.search({
      query: `metadata['user_id']:'${user.id}'`,
      limit: 1,
    });
    if (search.data[0]) return search.data[0].id;
  } catch (_err) {
    // customers.search requires the search API; fall through to durable state.
  }

  try {
    type BillingCustomerLookup = {
      eq: (column: string, value: string | boolean) => BillingCustomerLookup;
      order: (
        column: string,
        opts: { ascending: boolean },
      ) => {
        limit: (count: number) => PromiseLike<{
          data?: Array<{ stripe_customer_id?: string | null }> | null;
          error?: { message?: string } | null;
        }>;
      };
    };
    const { data, error } = await (supabase.from("billing_customers") as {
      select: (columns: string) => BillingCustomerLookup;
    }).select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("runtime_mode", getStripeRuntimeMode())
      .eq("livemode", getStripeRuntimeMode() === "live")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message ?? "billing customer lookup failed");
    const customerId = data?.[0]?.stripe_customer_id ?? null;
    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (!("deleted" in customer && customer.deleted)) return customer.id;
    }
  } catch (err) {
    log.warn("durable billing customer lookup failed", {
      user_id: user.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

const BILLABLE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
]);

async function resolveOwnedSubscriptionId(
  stripe: Stripe,
  customerId: string,
  action: CustomerPortalAction,
  requestedSubscriptionId: string | null,
): Promise<string | null> {
  if (
    action !== "subscription_cancel" &&
    action !== "subscription_update" &&
    action !== "resume_subscription"
  ) {
    return null;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const owned = requestedSubscriptionId
    ? subscriptions.data.find((subscription) =>
      subscription.id === requestedSubscriptionId
    )
    : subscriptions.data.find((subscription) =>
      BILLABLE_SUBSCRIPTION_STATUSES.has(subscription.status)
    );

  if (!owned) {
    throw new AuthError("Subscription not found for this customer", 403);
  }
  if (action !== "resume_subscription" && !BILLABLE_SUBSCRIPTION_STATUSES.has(owned.status)) {
    throw new Error("Subscription is not eligible for this portal action");
  }
  return owned.id;
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const portalAction = req.body
      ? await parseJsonBody(req, portalActionRequestSchema)
      : parsePortalActionRequest({});

    const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "anonymous";
    if (await portalLimiter.isLimited(_ip)) {
      return tooManyRequestsResponse(corsHeaders);
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    logStep("Function started");
    const user = await verifyBearerToken(req, supabaseClient);
    logStep("User authenticated", { userId: user.id, email: user.email });

    const origin = resolveCheckoutOrigin(req.headers.get("origin"));
    const returnUrl = `${origin}/dashboard/billing`;
    if (isStripeMockMode()) {
      if (portalAction.action === "resume_subscription") {
        return new Response(
          JSON.stringify({
            resumed: true,
            mock: true,
            billing_reason: "stripe_mock",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }
      return new Response(
        JSON.stringify({
          url: `${origin}${
            withMockBillingParams("/dashboard/billing", {
              portal: "mock",
              action: portalAction.action,
            })
          }`,
          mock: true,
          billing_reason: "stripe_mock",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = await createVerifiedStripeClient(stripeKey);
    const customerId = await resolveCustomer(stripe, supabaseClient, user);
    if (!customerId) {
      return new Response(
        JSON.stringify({ error: "No Stripe customer found" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        },
      );
    }
    logStep("Customer found", { customerId });

    const subscriptionId = await resolveOwnedSubscriptionId(
      stripe,
      customerId,
      portalAction.action,
      portalAction.subscriptionId,
    );
    if (portalAction.action === "resume_subscription") {
      const resumeResult = await resumeSubscriptionSafely(
        {
          subscriptions: {
            update: (id, params, options) =>
              stripe.subscriptions.update(id, params, options),
            retrieve: (id, options) =>
              stripe.subscriptions.retrieve(id, undefined, options),
          },
        },
        subscriptionId as string,
        portalAction.operationId as string,
      );
      logStep("Subscription resumed", {
        subscriptionId,
        reconciled: resumeResult.reconciled,
      });
      return new Response(
        JSON.stringify({
          resumed: true,
          subscription_id: subscriptionId,
          reconciled: resumeResult.reconciled,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create(
      buildPortalSessionParams(
        customerId,
        returnUrl,
        portalAction.action,
        subscriptionId,
        Deno.env.get("STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID") ?? null,
      ) as Stripe.BillingPortal.SessionCreateParams,
    );

    logStep("Portal session created", { sessionId: portalSession.id });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    if (error instanceof SchemaValidationError) {
      return new Response(JSON.stringify({
        error: error.message,
        code: error.code,
        issues: error.issues,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const status = error instanceof AuthError
      ? error.status
      : error instanceof PortalActionValidationError
      ? error.status
      : 500;
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message, status });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
