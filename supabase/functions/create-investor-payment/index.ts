import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import {
  buildIdempotencyKey,
  buildPaymentModeInvoiceCreationParams,
  CHECKOUT_TAX_COLLECTION_PARAMS,
  createStripeClient,
  getStripeRuntimeMode,
  STRIPE_DEFAULT_TAX_BEHAVIOR,
  STRIPE_SAAS_BUSINESS_TAX_CODE,
  stripeMetadata,
} from "../_shared/stripeClient.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import { resolveCheckoutOrigin } from "../create-checkout/origins.ts";
import { sanitizeRedirectPath } from "../create-checkout/redirects.ts";
import { getOrCreateOwnedStripeCustomer } from "../create-checkout/stripeCustomers.ts";

const log = createLogger("create-investor-payment");
const limiter = makeRateLimiter({
  bucket: "create-investor-payment",
  maxRequests: 10,
  windowMs: 60_000,
  failClosed: true,
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAN_TO_TIER: Record<string, "private" | "institutional"> = {
  investor_private: "private",
  investor_institutional: "institutional",
};
const INVESTOR_PAYMENT_CURRENCY = "eur";
const MAX_INVESTOR_PAYMENT_AMOUNT_CENTS = 10_000_000;
const INVESTOR_ACCESS_PERIOD_DAYS = 365;
const INVESTOR_BILLING_CYCLE = "annual";
const INVESTOR_PAYMENT_CONTRACT_VERSION = "investor-payment-custom-annual-v1";

type Body = {
  request_id?: unknown;
  requestId?: unknown;
  user_id?: unknown;
  userId?: unknown;
  plan_key?: unknown;
  planKey?: unknown;
  amount?: unknown;
  amount_cents?: unknown;
  amountCents?: unknown;
  currency?: unknown;
  success_url?: unknown;
  cancel_url?: unknown;
};

const amountInputSchema = z.union([z.number(), z.string()]);

const createInvestorPaymentBodySchema = z.object({
  request_id: z.string().trim().optional(),
  requestId: z.string().trim().optional(),
  user_id: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  plan_key: z.string().trim().optional(),
  planKey: z.string().trim().optional(),
  amount: amountInputSchema.optional(),
  amount_cents: amountInputSchema.optional(),
  amountCents: amountInputSchema.optional(),
  currency: z.string().trim().optional(),
  success_url: z.string().trim().optional(),
  cancel_url: z.string().trim().optional(),
}).strict()
  .refine((body) => Boolean(body.request_id ?? body.requestId), {
    message: "request_id is required",
  })
  .refine((body) => Boolean(body.user_id ?? body.userId), {
    message: "user_id is required",
  })
  .refine((body) => Boolean(body.plan_key ?? body.planKey), {
    message: "plan_key is required",
  })
  .refine(
    (body) =>
      body.amount !== undefined || body.amount_cents !== undefined ||
      body.amountCents !== undefined,
    {
      message: "amount is required",
    },
  );

type ProfileRow = {
  role?: string | null;
  is_platform_admin?: boolean | null;
};

type InvitationRequestRow = {
  status?: string | null;
  email?: string | null;
};

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
    throw new AuthError(`${field} is invalid`, 400);
  }
  return value.trim();
}

function requirePlanKey(value: unknown): keyof typeof PLAN_TO_TIER {
  if (typeof value !== "string" || !(value in PLAN_TO_TIER)) {
    throw new AuthError(
      "plan_key must be investor_private or investor_institutional",
      400,
    );
  }
  return value as keyof typeof PLAN_TO_TIER;
}

function parseAmountCents(body: Body): number {
  const rawMinor = body.amount_cents ?? body.amountCents;
  if (rawMinor !== undefined && rawMinor !== null) {
    const parsed = Number(rawMinor);
    if (
      Number.isInteger(parsed) && parsed > 0 &&
      parsed <= MAX_INVESTOR_PAYMENT_AMOUNT_CENTS
    ) {
      return parsed;
    }
    throw new AuthError("amount_cents is invalid", 400);
  }

  const parsedMajor = Number(body.amount);
  if (
    Number.isFinite(parsedMajor) && parsedMajor > 0 &&
    parsedMajor <= MAX_INVESTOR_PAYMENT_AMOUNT_CENTS / 100
  ) {
    return Math.round(parsedMajor * 100);
  }
  throw new AuthError("amount is required", 400);
}

function normalizeInvestorPaymentCurrency(
  value: unknown,
): typeof INVESTOR_PAYMENT_CURRENCY {
  const currency = typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : INVESTOR_PAYMENT_CURRENCY;
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new AuthError("currency is invalid", 400);
  }
  if (currency !== INVESTOR_PAYMENT_CURRENCY) {
    throw new AuthError("Investor payment currency must be EUR", 400);
  }
  return INVESTOR_PAYMENT_CURRENCY;
}

function investorPaymentContract(body: Body): {
  amountCents: number;
  currency: typeof INVESTOR_PAYMENT_CURRENCY;
} {
  return {
    amountCents: parseAmountCents(body),
    currency: normalizeInvestorPaymentCurrency(body.currency),
  };
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const caller = await verifyBearerToken(req, supabase);
    const { data: callerProfile, error: callerProfileError } = await supabase
      .from("profiles")
      .select("role, is_platform_admin")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (callerProfileError) throw callerProfileError;
    const callerRole = callerProfile as ProfileRow | null;
    if (callerRole?.role !== "admin" && !callerRole?.is_platform_admin) {
      throw new AuthError("Platform admin only", 403);
    }

    const body = await parseJsonBody(
      req,
      createInvestorPaymentBodySchema,
    ) as Body;
    const requestId = requireUuid(
      body.request_id ?? body.requestId,
      "request_id",
    );
    const userId = requireUuid(body.user_id ?? body.userId, "user_id");
    const planKey = requirePlanKey(body.plan_key ?? body.planKey);
    const tier = PLAN_TO_TIER[planKey];
    const { amountCents, currency } = investorPaymentContract(body);

    const { data: requestRow, error: requestError } = await supabase
      .from("invitation_requests")
      .select("id, user_id, status, email")
      .eq("id", requestId)
      .eq("user_id", userId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (
      !requestRow ||
      (requestRow as InvitationRequestRow).status !== "approved"
    ) {
      throw new AuthError("Invitation request must be approved first", 409);
    }
    const email = (requestRow as InvitationRequestRow).email;
    if (!email) {
      throw new AuthError("Approved invitation request has no email", 409);
    }

    const { data: pendingSubscription, error: pendingSubscriptionError } =
      await supabase
        .from("investor_subscriptions")
        .select("id, status, stripe_session_id")
        .eq("user_id", userId)
        .eq("tier", tier)
        .eq("status", "pending_payment")
        .maybeSingle();
    if (pendingSubscriptionError) throw pendingSubscriptionError;
    if (!pendingSubscription) {
      throw new AuthError(
        "No pending investor payment subscription found",
        409,
      );
    }
    if (
      (pendingSubscription as { stripe_session_id?: string | null })
        .stripe_session_id
    ) {
      throw new AuthError(
        "An investor payment link already exists for this pending subscription",
        409,
      );
    }

    const stripe = createStripeClient();
    const customerId = await getOrCreateOwnedStripeCustomer(
      stripe,
      { id: userId, email },
      (step, details) => log.info(step, details as Record<string, unknown>),
    );

    const origin = resolveCheckoutOrigin(req.headers.get("origin"));
    const success = `${origin}${
      sanitizeRedirectPath(body.success_url) ??
        "/investor-dashboard?checkout=success"
    }`;
    const cancel = `${origin}${
      sanitizeRedirectPath(body.cancel_url) ??
        "/admin?tab=investors&checkout=cancelled"
    }`;
    const metadata = stripeMetadata({
      checkoutType: "investor_payment",
      userId,
      planKey,
      extra: {
        request_id: requestId,
        tier,
        amount_cents: amountCents,
        amount_major: amountCents / 100,
        currency: INVESTOR_PAYMENT_CURRENCY,
        billing_cycle: INVESTOR_BILLING_CYCLE,
        access_period_days: String(INVESTOR_ACCESS_PERIOD_DAYS),
        contract_version: INVESTOR_PAYMENT_CONTRACT_VERSION,
      },
    });

    const session = await stripe.checkout.sessions.create(
      {
        ...CHECKOUT_TAX_COLLECTION_PARAMS,
        customer: customerId,
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency,
              tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR,
              unit_amount: amountCents,
              product_data: {
                name: tier === "institutional"
                  ? "MaiProp Institutional Custom Annual Investor Access"
                  : "MaiProp Private Custom Annual Investor Access",
                tax_code: STRIPE_SAAS_BUSINESS_TAX_CODE,
                metadata,
              },
            },
            quantity: 1,
          },
        ],
        success_url: success,
        cancel_url: cancel,
        metadata,
        ...buildPaymentModeInvoiceCreationParams(metadata),
      },
      {
        idempotencyKey: await buildIdempotencyKey("investor-payment", [
          INVESTOR_PAYMENT_CONTRACT_VERSION,
          requestId,
          userId,
          planKey,
          amountCents,
          INVESTOR_ACCESS_PERIOD_DAYS,
          success,
          cancel,
          "stripe-tax-v2-company-vat",
        ]),
      },
    );

    const { data: updatedPending, error: updateError } = await supabase
      .from("investor_subscriptions")
      .update({
        stripe_customer_id: customerId,
        stripe_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (pendingSubscription as { id: string }).id)
      .eq("status", "pending_payment")
      .is("stripe_session_id", null)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updatedPending) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
      throw new AuthError(
        "Pending investor subscription changed before payment link could be stored",
        409,
      );
    }

    return new Response(
      JSON.stringify({
        url: session.url,
        session_id: session.id,
        checkout_type: "investor_payment",
        mode: getStripeRuntimeMode(),
        customer_id: customerId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const status = err instanceof AuthError
      ? err.status
      : err instanceof SchemaValidationError
      ? 400
      : 500;
    const message = err instanceof Error
      ? err.message
      : "Investor payment checkout failed";
    log.warn("create investor payment failed", { status, message });
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
