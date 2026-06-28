// deno-lint-ignore no-import-prefix
import Stripe from "npm:stripe@18.5.0";
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
  isStripeMockMode,
  withMockBillingParams,
} from "../_shared/stripeMode.ts";
import { resolveCheckoutOrigin } from "./origins.ts";
import {
  getCheckoutAddon,
  getCheckoutPlan,
  getCheckoutProfile,
  getPlanEntitlement,
  getStripePriceEnvKey,
  getStripePriceEnvKeys,
  isCheckoutAddonAudienceAllowed,
  isCheckoutAudienceAllowed,
  isInviteOnlyCheckoutPlan,
  isSupportedCheckoutAddonModule,
  isSupportedCheckoutPlan,
  normalizeBillingCycle,
  normalizeExplicitCheckoutKey,
  normalizePlanKey,
} from "./pricing.ts";
import { sanitizeRedirectPath } from "./redirects.ts";
import {
  getOrCreateOwnedStripeCustomer,
  shortSha256,
} from "./stripeCustomers.ts";
import {
  PRO_TRIAL_DAYS,
  buildTrialMetadata,
  isTrialCheckoutAudienceAllowed,
  normalizeTrialCheckoutRequest,
} from "./trials.ts";
import type { BillingCycle, CheckoutPlan, CheckoutProfileRow } from "./types.ts";

export {
  getStripePriceEnvKey,
  getStripePriceEnvKeys,
  isCheckoutAddonAudienceAllowed,
  isCheckoutAudienceAllowed,
  isInviteOnlyCheckoutPlan,
  isSupportedCheckoutAddonModule,
  isSupportedCheckoutPlan,
  normalizeBillingCycle,
  normalizeExplicitCheckoutKey,
  normalizePlanKey,
  resolveCheckoutOrigin,
  sanitizeRedirectPath,
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

const jsonCheckoutError = (
  corsHeaders: Record<string, string>,
  status: number,
  error: string,
): Response =>
  new Response(JSON.stringify({ error }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

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

    const body = req.method === "POST" && req.body
      ? await req.json().catch(() => ({}))
      : {};
    const wantsTrial = normalizeTrialCheckoutRequest(
      body.trial ?? body.start_trial ?? body.startTrial,
    );
    const addonKey = normalizeExplicitCheckoutKey(
      body.addon_key ?? body.addonKey,
    );
    if (addonKey) {
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
        const url = `${origin}${
          withMockBillingParams(
            sanitizeRedirectPath(body.success_url) ??
              "/dashboard/billing?checkout=success",
            { checkout: "success", addon: addonKey },
          )
        }`;
        return new Response(
          JSON.stringify({
            url,
            mock: true,
            mode: "mock",
            addon_key: addonKey,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "");
      const customerId = await getOrCreateOwnedStripeCustomer(
        stripe,
        user,
        logStep,
      );
      const success = `${origin}${
        sanitizeRedirectPath(body.success_url) ??
          "/dashboard/billing?checkout=success"
      }`;
      const cancel = `${origin}${
        sanitizeRedirectPath(body.cancel_url) ??
          "/dashboard/billing?checkout=cancelled"
      }`;
      const redirectHash = await shortSha256(`${success}|${cancel}`);
      const session = await stripe.checkout.sessions.create(
        {
          customer: customerId,
          line_items: [{ price: checkoutAddon.priceId, quantity: 1 }],
          mode: checkoutAddon.checkoutMode,
          success_url: success,
          cancel_url: cancel,
          metadata: {
            user_id: user.id,
            checkout_type: "addon",
            addon_key: checkoutAddon.addonKey,
            audience: checkoutAddon.audience,
            module: checkoutAddon.module,
            unit: checkoutAddon.unit,
            ...(checkoutAddon.productId
              ? { product_id: checkoutAddon.productId }
              : {}),
          },
          ...(checkoutAddon.checkoutMode === "subscription"
            ? {
              subscription_data: {
                metadata: {
                  user_id: user.id,
                  checkout_type: "addon",
                  addon_key: checkoutAddon.addonKey,
                  audience: checkoutAddon.audience,
                  module: checkoutAddon.module,
                  unit: checkoutAddon.unit,
                  ...(checkoutAddon.productId
                    ? { product_id: checkoutAddon.productId }
                    : {}),
                },
              },
            }
            : {}),
        },
        {
          idempotencyKey:
            `maiprop-addon-${user.id}-${checkoutAddon.addonKey}-${redirectHash}`,
        },
      );
      logStep("Add-on checkout session created", {
        sessionId: session.id,
        addonKey: checkoutAddon.addonKey,
      });
      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
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
          mock: true,
          mode: "mock",
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

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "");

    const checkoutPlan = await getCheckoutPlan(
      supabaseClient,
      plan,
      billingCycle,
    );
    if (!checkoutPlan) {
      log.warn("checkout price not configured", { plan });
      return new Response(JSON.stringify({ error: "Plan is unavailable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }
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
    const success = `${origin}${successPath ?? "/pricing?checkout=success"}`;
    const cancel = `${origin}${cancelPath ?? "/pricing?checkout=cancelled"}`;
    const redirectHash = await shortSha256(`${success}|${cancel}`);
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
          customer: customerId,
          line_items: [{ price: checkoutPlan.priceId, quantity: 1 }],
          mode: "subscription",
          success_url: success,
          cancel_url: cancel,
          ...(wantsTrial
            ? { payment_method_collection: "always" as const }
            : {}),
          metadata: {
            user_id: user.id,
            plan,
            plan_key: checkoutPlan.planKey,
            audience: checkoutPlan.audience,
            role: checkoutPlan.role,
            billing_cycle: checkoutPlan.billingCycle,
            ...(wantsTrial
              ? { checkout_type: "subscription_trial", ...trialMetadata }
              : {}),
          },
          // Propagate plan to the subscription object itself so the webhook can
          // identify professional_* plans and update professionals.subscription_tier.
          // Stripe does NOT auto-copy session.metadata onto the resulting subscription,
          // so we set subscription_data.metadata explicitly.
          subscription_data: {
            ...(wantsTrial ? { trial_period_days: PRO_TRIAL_DAYS } : {}),
            metadata: {
              user_id: user.id,
              plan,
              plan_key: checkoutPlan.planKey,
              audience: checkoutPlan.audience,
              role: checkoutPlan.role,
              billing_cycle: checkoutPlan.billingCycle,
              ...(checkoutPlan.productId
                ? { product_id: checkoutPlan.productId }
                : {}),
              ...(wantsTrial
                ? { checkout_type: "subscription_trial", ...trialMetadata }
                : {}),
            },
          },
        },
        {
          idempotencyKey:
            `maiprop-checkout-${user.id}-${checkoutPlan.planKey}-${checkoutPlan.billingCycle}-${wantsTrial ? "trial" : "paid"}-${redirectHash}`,
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

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
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
