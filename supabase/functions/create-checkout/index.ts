// deno-lint-ignore no-import-prefix
import Stripe from "npm:stripe@22.3.0";
// deno-lint-ignore no-import-prefix
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
  createVerifiedStripeClient,
  getStripeRuntimeMode,
} from "../_shared/stripeClient.ts";
import { upsertBillingCustomer } from "../_shared/billingState.ts";
import {
  isStripeMockMode,
  withMockBillingParams,
} from "../_shared/stripeMode.ts";
import { resolveCheckoutOrigin } from "./origins.ts";
import {
  assertStripePriceMatchesCheckoutAddon,
  getCheckoutAddon,
  getCheckoutPlan,
  getCheckoutProfile,
  getCurrentBillingRuntimeMode,
  getPlanEntitlement,
  getStripePriceEnvKey,
  getStripePriceEnvKeys,
  isCheckoutAddonAudienceAllowed,
  isCheckoutAudienceAllowed,
  isInviteOnlyCheckoutPlan,
  isSupportedCheckoutAddonKey,
  isSupportedCheckoutAddonModule,
  isSupportedCheckoutPlan,
  normalizeBillingCycle,
  normalizeExplicitCheckoutKey,
  normalizePlanKey,
  PricingCatalogUnavailableError,
} from "./pricing.ts";
import { sanitizeRedirectPath, withCheckoutSessionId } from "./redirects.ts";
import { getOrCreateOwnedStripeCustomer } from "./stripeCustomers.ts";
import {
  buildTrialMetadata,
  isTrialCheckoutAudienceAllowed,
  normalizeTrialCheckoutRequest,
  PRO_TRIAL_DAYS,
} from "./trials.ts";
import type {
  BillingCycle,
  CheckoutPlan,
  CheckoutProfileRow,
} from "./types.ts";

export {
  getStripePriceEnvKey,
  getStripePriceEnvKeys,
  isCheckoutAddonAudienceAllowed,
  isCheckoutAudienceAllowed,
  isInviteOnlyCheckoutPlan,
  isSupportedCheckoutAddonKey,
  isSupportedCheckoutAddonModule,
  isSupportedCheckoutPlan,
  normalizeBillingCycle,
  normalizeExplicitCheckoutKey,
  normalizePlanKey,
  resolveCheckoutOrigin,
  sanitizeRedirectPath,
  withCheckoutSessionId,
};

const log = createLogger("create-checkout");
const limiter = makeRateLimiter({
  bucket: "create-checkout",
  maxRequests: 10,
  windowMs: 60_000,
  failClosed: true,
});
// Redirect the legacy logStep helper through the structured logger so existing
// call sites don't need to change. The `step` becomes the message and
// `details` becomes the structured context.
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

const buildMockCheckoutUrl = (
  origin: string,
  successPath: string | null,
  plan: string,
  billingCycle: BillingCycle,
  extraParams: Record<string, string> = {},
): string => {
  return `${origin}${
    withMockBillingParams(successPath ?? "/pricing?checkout=success", {
      checkout: "success",
      plan,
      billing_cycle: billingCycle,
      ...extraParams,
    })
  }`;
};

type SupabaseAdminClient = {
  from(table: string): {
    insert(payload: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{ data: { id?: string } | null; error: unknown }>;
      };
    };
    update(payload: Record<string, unknown>): {
      eq(column: string, value: unknown): Promise<{ error: unknown }>;
    };
    delete(): {
      eq(column: string, value: unknown): Promise<{ error: unknown }>;
    };
  };
};

type BillingSubscriptionLookupRow = {
  audience?: string | null;
  status?: string | null;
  current_period_end?: string | null;
};

type BillingSubscriptionLookupResult = {
  data?: BillingSubscriptionLookupRow[] | BillingSubscriptionLookupRow | null;
  error?: { message?: string } | null;
};

type SupabaseBillingLookupClient = {
  from(table: "billing_subscriptions"): {
    select(columns: string): SupabaseBillingLookupQuery;
  };
};

type BillingCustomerUpsertClient = Parameters<typeof upsertBillingCustomer>[0];

type SupabaseBillingLookupQuery = {
  eq(column: string, value: string | boolean): SupabaseBillingLookupQuery;
  in(column: string, values: string[]): {
    order(
      column: string,
      options: { ascending: boolean },
    ): {
      limit(count: number): PromiseLike<BillingSubscriptionLookupResult>;
    };
  };
};

const isAlreadyClaimedError = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === "23505";
};

const hasExistingPaidAccess = (profile: CheckoutProfileRow | null): boolean => {
  return Boolean(
    profile?.subscription_product_id ||
      profile?.force_pro_access ||
      profile?.is_platform_admin ||
      profile?.role === "admin",
  );
};

const PROVISIONED_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"];

const hasCurrentPeriodRemaining = (value: string | null | undefined) => {
  if (!value) return true;
  const periodEnd = new Date(value);
  return !Number.isNaN(periodEnd.getTime()) && periodEnd > new Date();
};

const hasProvisionedSameAudienceSubscription = async (
  supabaseClient: SupabaseBillingLookupClient,
  userId: string,
  audience: string,
): Promise<boolean> => {
  const { data, error } = await supabaseClient
    .from("billing_subscriptions")
    .select("status, audience, current_period_end")
    .eq("user_id", userId)
    .eq("runtime_mode", getStripeRuntimeMode())
    .eq("livemode", getStripeRuntimeMode() === "live")
    .in("status", PROVISIONED_SUBSCRIPTION_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) {
    throw new Error(
      `billing subscription lookup failed: ${String(error.message ?? error)}`,
    );
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.some((row) => {
    const status = row?.status;
    return row?.audience === audience &&
      typeof status === "string" &&
      PROVISIONED_SUBSCRIPTION_STATUSES.includes(status) &&
      hasCurrentPeriodRemaining(row?.current_period_end);
  });
};

const jsonCheckoutError = (
  corsHeaders: Record<string, string>,
  status: number,
  error: string,
): Response =>
  new Response(JSON.stringify({ error }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const CHECKOUT_TARGET_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const CHECKOUT_TARGET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const MAX_ADDON_CHECKOUT_QUANTITY = 100;

type CheckoutTarget =
  | { targetType: string | null; targetId: string | null }
  | { error: string };

const normalizeCheckoutTarget = (
  rawType: unknown,
  rawId: unknown,
): CheckoutTarget => {
  const targetType = typeof rawType === "string" && rawType.trim()
    ? rawType.trim()
    : null;
  const targetId = typeof rawId === "string" && rawId.trim()
    ? rawId.trim()
    : null;

  if (!targetType && !targetId) return { targetType: null, targetId: null };
  if (!targetType || !targetId) {
    return { error: "target_type and target_id must be provided together" };
  }
  if (!CHECKOUT_TARGET_RE.test(targetType)) {
    return { error: "target_type is invalid" };
  }
  if (!CHECKOUT_TARGET_ID_RE.test(targetId)) {
    return { error: "target_id is invalid" };
  }
  return { targetType, targetId };
};

const normalizeCheckoutQuantity = (rawQuantity: unknown): number | null => {
  if (rawQuantity === null || rawQuantity === undefined || rawQuantity === "") {
    return 1;
  }
  const parsed = typeof rawQuantity === "number"
    ? rawQuantity
    : typeof rawQuantity === "string"
    ? Number(rawQuantity.trim())
    : Number.NaN;
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_ADDON_CHECKOUT_QUANTITY
  ) {
    return null;
  }
  return parsed;
};

const reserveSubscriptionTrialClaim = async (
  supabaseClient: SupabaseAdminClient,
  userId: string,
  checkoutPlan: CheckoutPlan,
  customerId: string,
  corsHeaders: Record<string, string>,
): Promise<{ claimId: string } | { response: Response }> => {
  const { data, error } = await supabaseClient
    .from("subscription_trial_claims")
    .insert({
      user_id: userId,
      plan_key: checkoutPlan.planKey,
      pricing_audience: checkoutPlan.audience,
      stripe_customer_id: customerId,
      status: "checkout_started",
      trial_days: PRO_TRIAL_DAYS,
      runtime_mode: getStripeRuntimeMode(),
      livemode: getStripeRuntimeMode() === "live",
      metadata: buildTrialMetadata(),
    })
    .select("id")
    .single();

  if (error) {
    if (isAlreadyClaimedError(error)) {
      return {
        response: jsonCheckoutError(
          corsHeaders,
          409,
          "A free Pro trial has already been used on this account.",
        ),
      };
    }
    throw error;
  }

  const claimId = data?.id;
  if (!claimId) throw new Error("Trial claim reservation failed");
  return { claimId };
};

const markSubscriptionTrialCheckoutCreated = async (
  supabaseClient: SupabaseAdminClient,
  claimId: string,
  session: Stripe.Checkout.Session,
): Promise<void> => {
  const { error } = await supabaseClient
    .from("subscription_trial_claims")
    .update({
      status: "checkout_created",
      stripe_checkout_session_id: session.id,
      stripe_subscription_id: typeof session.subscription === "string"
        ? session.subscription
        : null,
      runtime_mode: session.livemode ? "live" : "test",
      livemode: Boolean(session.livemode),
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimId);
  if (error) throw error;
};

const releaseSubscriptionTrialClaim = async (
  supabaseClient: SupabaseAdminClient,
  claimId: string | null,
): Promise<void> => {
  if (!claimId) return;
  const { error } = await supabaseClient
    .from("subscription_trial_claims")
    .delete()
    .eq("id", claimId);
  if (error) {
    log.warn("failed to release unused trial claim", {
      claimId,
      error: String((error as { message?: string }).message ?? error),
    });
  }
};

const handleRequest = async (req: Request): Promise<Response> => { // skipcq: JS-R1005 - Checkout coordinates auth, plan eligibility, Stripe customer/session creation, and consistent error responses.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    log.error(
      "SUPABASE_SERVICE_ROLE_KEY not set, checkout cannot proceed safely",
    );
    return new Response(
      JSON.stringify({ error: "Checkout service unavailable" }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey,
  );

  try {
    const user = await verifyBearerToken(req, supabaseClient);
    logStep("User authenticated", { userId: user.id, email: user.email });
    if (await limiter.isLimited(user.id)) {
      return tooManyRequestsResponse(corsHeaders);
    }

    const body = req.method === "POST" && req.body
      ? await req.json().catch(() => ({}))
      : {};
    const stripeRuntimeMode = getStripeRuntimeMode();
    const billingRuntimeMode = await getCurrentBillingRuntimeMode(
      supabaseClient,
    );
    if (billingRuntimeMode !== stripeRuntimeMode) {
      return jsonCheckoutError(
        corsHeaders,
        503,
        "Billing runtime configuration mismatch",
      );
    }
    const wantsTrial = normalizeTrialCheckoutRequest(
      body.trial ?? body.start_trial ?? body.startTrial,
    );
    const addonKey = normalizeExplicitCheckoutKey(
      body.addon_key ?? body.addonKey,
    );
    if (addonKey) {
      const checkoutTarget = normalizeCheckoutTarget(
        body.target_type ?? body.targetType,
        body.target_id ?? body.targetId,
      );
      if ("error" in checkoutTarget) {
        return new Response(JSON.stringify({ error: checkoutTarget.error }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
      const checkoutQuantity = normalizeCheckoutQuantity(
        body.quantity ?? body.qty,
      );
      if (!checkoutQuantity) {
        return new Response(JSON.stringify({ error: "quantity is invalid" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
      const profile = await getCheckoutProfile(supabaseClient, user.id);
      const origin = resolveCheckoutOrigin(req.headers.get("origin"));
      const checkoutAddon = await getCheckoutAddon(supabaseClient, addonKey);
      if (!checkoutAddon) {
        return new Response(
          JSON.stringify({ error: "Add-on is unavailable" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }
      if (
        !isCheckoutAddonAudienceAllowed(
          checkoutAddon.addonKey,
          checkoutAddon.audience,
          checkoutAddon.module,
          profile,
        )
      ) {
        log.warn("blocked cross-role add-on checkout attempt", {
          userId: user.id,
          addonKey,
          addonAudience: checkoutAddon.audience,
          profileRole: profile?.role ?? null,
          profileParticipantType: profile?.participant_type ?? null,
        });
        return new Response(
          JSON.stringify({
            error:
              "This add-on is not available for your current account type.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }
      if (isStripeMockMode()) {
        const mockParams = {
          checkout: "success",
          addon: addonKey,
          quantity: String(checkoutQuantity),
          ...(checkoutTarget.targetType
            ? { target_type: checkoutTarget.targetType }
            : {}),
          ...(checkoutTarget.targetId
            ? { target_id: checkoutTarget.targetId }
            : {}),
        };
        const url = `${origin}${
          withMockBillingParams(
            sanitizeRedirectPath(body.success_url) ??
              "/dashboard/billing?checkout=success",
            mockParams,
          )
        }`;
        return new Response(
          JSON.stringify({
            url,
            session_id: null,
            checkout_type: "addon",
            mock: true,
            billing_mode: "mock",
            mode: getStripeRuntimeMode(),
            addon_key: addonKey,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const stripe = await createVerifiedStripeClient();
      const stripePrice = await stripe.prices.retrieve(checkoutAddon.priceId);
      assertStripePriceMatchesCheckoutAddon(
        checkoutAddon,
        stripePrice,
        stripeRuntimeMode,
      );
      const customerId = await getOrCreateOwnedStripeCustomer(
        stripe,
        user,
        logStep,
      );
      await upsertBillingCustomer(
        supabaseClient as unknown as BillingCustomerUpsertClient,
        {
          userId: user.id,
          stripeCustomerId: customerId,
          email: user.email,
          livemode: getStripeRuntimeMode() === "live",
          metadata: { user_id: user.id },
        },
      );
      const success = `${origin}${
        withCheckoutSessionId(
          sanitizeRedirectPath(body.success_url) ??
            "/dashboard/billing?checkout=success",
        )
      }`;
      const cancel = `${origin}${
        sanitizeRedirectPath(body.cancel_url) ??
          "/dashboard/billing?checkout=cancelled"
      }`;
      const addonMetadata = {
        user_id: user.id,
        checkout_type: "addon",
        addon_key: checkoutAddon.addonKey,
        audience: checkoutAddon.audience,
        module: checkoutAddon.module,
        unit: checkoutAddon.unit,
        quantity: String(checkoutQuantity),
        runtime_mode: stripeRuntimeMode,
        ...(checkoutTarget.targetType
          ? { target_type: checkoutTarget.targetType }
          : {}),
        ...(checkoutTarget.targetId
          ? { target_id: checkoutTarget.targetId }
          : {}),
        ...(checkoutAddon.productId
          ? { product_id: checkoutAddon.productId }
          : {}),
      };
      const session = await stripe.checkout.sessions.create(
        {
          ...CHECKOUT_TAX_COLLECTION_PARAMS,
          customer: customerId,
          client_reference_id: user.id,
          line_items: [{
            price: checkoutAddon.priceId,
            quantity: checkoutQuantity,
          }],
          mode: checkoutAddon.checkoutMode,
          payment_method_types: ["card"],
          success_url: success,
          cancel_url: cancel,
          metadata: addonMetadata,
          ...(checkoutAddon.checkoutMode === "payment"
            ? buildPaymentModeInvoiceCreationParams(addonMetadata)
            : {}),
          ...(checkoutAddon.checkoutMode === "payment"
            ? {
              payment_intent_data: {
                metadata: addonMetadata,
              },
            }
            : {}),
          ...(checkoutAddon.checkoutMode === "subscription"
            ? {
              subscription_data: {
                metadata: addonMetadata,
              },
            }
            : {}),
        },
        {
          idempotencyKey: await buildIdempotencyKey("checkout-addon-v2", [
            user.id,
            checkoutAddon.addonKey,
            checkoutAddon.priceId,
            checkoutAddon.checkoutMode,
            checkoutQuantity,
            checkoutTarget.targetType,
            checkoutTarget.targetId,
            success,
            cancel,
            "card",
            "stripe-tax-v2-company-vat",
          ]),
        },
      );
      logStep("Add-on checkout session created", {
        sessionId: session.id,
        addonKey: checkoutAddon.addonKey,
        quantity: checkoutQuantity,
      });
      return new Response(
        JSON.stringify({
          url: session.url,
          session_id: session.id,
          checkout_type: "addon",
          mode: getStripeRuntimeMode(),
          quantity: checkoutQuantity,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const plan = normalizePlanKey(body.plan);
    if (!plan) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    if (!isSupportedCheckoutPlan(plan)) {
      return new Response(JSON.stringify({ error: "Unknown plan" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    if (isInviteOnlyCheckoutPlan(plan)) {
      log.warn("blocked invite-only plan checkout attempt", {
        userId: user.id,
        plan,
      });
      return new Response(
        JSON.stringify({
          error:
            "This plan is invitation-only. Apply for access before checkout.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        },
      );
    }
    const billingCycle = normalizeBillingCycle(
      body.billing_cycle ?? body.billingCycle,
    );
    if (!billingCycle) {
      return new Response(JSON.stringify({ error: "Invalid billing cycle" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    // Caller-provided redirect URLs are accepted only when they are same-origin
    // relative paths starting with "/" — guards against open-redirect abuse while
    // honouring the success_url/cancel_url contract from Onboarding/Pricing.
    const successPath = sanitizeRedirectPath(body.success_url);
    const cancelPath = sanitizeRedirectPath(body.cancel_url);

    const entitlement = getPlanEntitlement(plan);
    if (!entitlement) {
      return new Response(JSON.stringify({ error: "Unknown plan" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const profile = await getCheckoutProfile(supabaseClient, user.id);
    if (!isCheckoutAudienceAllowed(entitlement.audience, profile)) {
      log.warn("blocked cross-role checkout attempt", {
        userId: user.id,
        plan,
        audience: entitlement.audience,
        profileRole: profile?.role ?? null,
        profileParticipantType: profile?.participant_type ?? null,
      });
      return new Response(
        JSON.stringify({
          error:
            "This checkout plan is not available for your current account type.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        },
      );
    }
    if (wantsTrial && hasExistingPaidAccess(profile)) {
      return jsonCheckoutError(
        corsHeaders,
        409,
        "A free Pro trial is available only to free accounts.",
      );
    }
    if (
      await hasProvisionedSameAudienceSubscription(
        supabaseClient as unknown as SupabaseBillingLookupClient,
        user.id,
        entitlement.audience,
      )
    ) {
      return jsonCheckoutError(
        corsHeaders,
        409,
        "An active subscription already exists for this account type. Manage it from Billing.",
      );
    }

    const checkoutPlan = await getCheckoutPlan(
      supabaseClient,
      plan,
      billingCycle,
    );
    if (!checkoutPlan) {
      log.warn("checkout plan unavailable", {
        plan,
        audience: entitlement.audience,
        billingCycle,
      });
      return new Response(
        JSON.stringify({
          code: "plan_unavailable",
          error: "This plan is currently unavailable. Please try again later.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        },
      );
    }

    const origin = resolveCheckoutOrigin(req.headers.get("origin"));
    if (isStripeMockMode()) {
      if (wantsTrial) {
        log.warn("blocked mock trial checkout", {
          userId: user.id,
          plan,
          audience: entitlement.audience,
          billingCycle,
        });
        return new Response(
          JSON.stringify({
            error: "trial_mock_billing_disabled",
            message:
              "Trial checkout requires live Stripe billing. Mock billing cannot activate a Pro trial.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 503,
          },
        );
      }
      const url = buildMockCheckoutUrl(
        origin,
        successPath,
        plan,
        billingCycle,
        wantsTrial ? { trial: "true" } : {},
      );
      logStep("Mock checkout session returned", {
        userId: user.id,
        plan,
        audience: entitlement.audience,
        billingCycle,
        trial: wantsTrial,
      });
      return new Response(
        JSON.stringify({
          url,
          session_id: null,
          checkout_type: "subscription",
          mock: true,
          billing_mode: "mock",
          mode: getStripeRuntimeMode(),
          plan,
          billing_cycle: billingCycle,
          trial: wantsTrial,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const stripe = await createVerifiedStripeClient();

    if (
      wantsTrial &&
      !isTrialCheckoutAudienceAllowed(checkoutPlan.audience)
    ) {
      return jsonCheckoutError(
        corsHeaders,
        403,
        "A free Pro trial is not available for this plan.",
      );
    }

    logStep("Resolved price", {
      plan,
      priceId: checkoutPlan.priceId,
      audience: checkoutPlan.audience,
      billingCycle: checkoutPlan.billingCycle,
    });

    const customerId = await getOrCreateOwnedStripeCustomer(
      stripe,
      user,
      logStep,
    );
    await upsertBillingCustomer(
      supabaseClient as unknown as BillingCustomerUpsertClient,
      {
        userId: user.id,
        stripeCustomerId: customerId,
        email: user.email,
        livemode: getStripeRuntimeMode() === "live",
        metadata: { user_id: user.id },
      },
    );
    const success = `${origin}${
      withCheckoutSessionId(successPath ?? "/pricing?checkout=success")
    }`;
    const cancel = `${origin}${cancelPath ?? "/pricing?checkout=cancelled"}`;
    const trialMetadata = wantsTrial ? buildTrialMetadata() : {};
    let trialClaimId: string | null = null;

    if (wantsTrial) {
      const reservation = await reserveSubscriptionTrialClaim(
        supabaseClient as unknown as SupabaseAdminClient,
        user.id,
        checkoutPlan,
        customerId,
        corsHeaders,
      );
      if ("response" in reservation) return reservation.response;
      trialClaimId = reservation.claimId;
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          ...CHECKOUT_TAX_COLLECTION_PARAMS,
          customer: customerId,
          line_items: [{ price: checkoutPlan.priceId, quantity: 1 }],
          mode: "subscription",
          payment_method_types: ["card"],
          success_url: success,
          cancel_url: cancel,
          ...(wantsTrial
            ? { payment_method_collection: "always" as const }
            : {}),
          metadata: {
            user_id: user.id,
            checkout_type: wantsTrial ? "subscription_trial" : "subscription",
            plan,
            plan_key: checkoutPlan.planKey,
            audience: checkoutPlan.audience,
            role: checkoutPlan.role,
            billing_cycle: checkoutPlan.billingCycle,
            ...(wantsTrial ? trialMetadata : {}),
          },
          // Propagate plan to the subscription object itself so the webhook can
          // identify professional_* plans and update professionals.subscription_tier.
          // Stripe does NOT auto-copy session.metadata onto the resulting subscription,
          // so we set subscription_data.metadata explicitly.
          subscription_data: {
            ...(wantsTrial
              ? {
                trial_period_days: PRO_TRIAL_DAYS,
                trial_settings: {
                  end_behavior: {
                    missing_payment_method: "cancel" as const,
                  },
                },
              }
              : {}),
            metadata: {
              user_id: user.id,
              checkout_type: wantsTrial ? "subscription_trial" : "subscription",
              plan,
              plan_key: checkoutPlan.planKey,
              audience: checkoutPlan.audience,
              role: checkoutPlan.role,
              billing_cycle: checkoutPlan.billingCycle,
              ...(checkoutPlan.productId
                ? { product_id: checkoutPlan.productId }
                : {}),
              ...(wantsTrial ? trialMetadata : {}),
            },
          },
        },
        {
          idempotencyKey: await buildIdempotencyKey("checkout-v2", [
            user.id,
            checkoutPlan.planKey,
            checkoutPlan.billingCycle,
            checkoutPlan.priceId,
            checkoutPlan.productId,
            wantsTrial ? "trial" : "paid",
            wantsTrial ? PRO_TRIAL_DAYS : null,
            wantsTrial ? "missing-payment-method-cancel" : null,
            trialClaimId,
            success,
            cancel,
            "card",
            "stripe-tax-v1",
          ]),
        },
      );
    } catch (error) {
      await releaseSubscriptionTrialClaim(
        supabaseClient as unknown as SupabaseAdminClient,
        trialClaimId,
      );
      throw error;
    }

    if (trialClaimId) {
      await markSubscriptionTrialCheckoutCreated(
        supabaseClient as unknown as SupabaseAdminClient,
        trialClaimId,
        session,
      );
    }

    logStep("Checkout session created", {
      sessionId: session.id,
      plan,
      trial: wantsTrial,
    });

    return new Response(
      JSON.stringify({
        url: session.url,
        session_id: session.id,
        checkout_type: wantsTrial ? "subscription_trial" : "subscription",
        mode: getStripeRuntimeMode(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: unknown) {
    if (error instanceof PricingCatalogUnavailableError) {
      const cause = error.cause instanceof Error
        ? error.cause.message
        : String(error.cause ?? "unknown catalog error");
      log.error("pricing catalog query failed", { cause });
      return new Response(
        JSON.stringify({
          code: "pricing_catalog_unavailable",
          error: "Pricing is temporarily unavailable. Please try again later.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 503,
        },
      );
    }
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
};

Deno.serve(handleRequest);
