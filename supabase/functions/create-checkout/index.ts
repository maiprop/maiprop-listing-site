import Stripe from "npm:stripe@18.5.0";
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

const log = createLogger("create-checkout");
const limiter = makeRateLimiter({
  bucket: "create-checkout",
  maxRequests: 10,
  windowMs: 60_000,
  failClosed: true,
});
const INVITE_ONLY_PLAN_KEYS = new Set([
  "investor_private",
  "investor_institutional",
]);
const PUBLIC_CHECKOUT_PLAN_KEYS = new Set([
  "pro",
  "agent_basic",
  "developer_pro",
  "professional_basic",
]);
const PLAN_ENTITLEMENT: Record<string, { audience: string; role: string }> = {
  pro: { audience: "participant", role: "participant" },
  agent_basic: { audience: "agent", role: "agent" },
  developer_pro: { audience: "developer", role: "developer" },
  professional_basic: { audience: "professional", role: "professional" },
  investor_private: { audience: "investor", role: "investor" },
  investor_institutional: { audience: "institutional", role: "institutional" },
};
const PLAN_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const DEFAULT_CHECKOUT_ORIGIN = "https://portal.maiprop.co";
const CHECKOUT_ALLOWED_ORIGINS = [
  DEFAULT_CHECKOUT_ORIGIN,
  "https://maiprop.co",
  "https://www.maiprop.co",
  "https://app.maiprop.co",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:8083",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
];
const CF_PAGES_ORIGIN_RE =
  /^https:\/\/[\w-]+\.maiprop-listing-site\.pages\.dev$/;

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

const UNSAFE_REDIRECT_PREFIXES = ["//", "/\\"];

const hasUnsafeRedirectPrefix = (raw: string): boolean => {
  return UNSAFE_REDIRECT_PREFIXES.some((prefix) => raw.startsWith(prefix));
};

const REDIRECT_PATH_VALIDATORS = [
  (raw: string) => raw.length > 0,
  (raw: string) => raw.length <= 512,
  (raw: string) => raw.startsWith("/"),
  (raw: string) => !hasUnsafeRedirectPrefix(raw),
  (raw: string) => !/[\r\n\t]/.test(raw),
];

const isSafeRedirectPath = (raw: unknown): raw is string => { // skipcq: JS-R1005 - Redirect safety stays explicit because each validator covers a separate abuse case.
  return typeof raw !== "string"
    ? false
    : REDIRECT_PATH_VALIDATORS.every((validator) => validator(raw));
};

/** Accepts only same-origin absolute paths starting with "/" (and not "//" or "/\\").
 *  Returns null for anything else so callers fall back to a server-controlled default.
 *  Exported so unit tests can cover every branch without spinning up the handler. */
export const sanitizeRedirectPath = (raw: unknown): string | null => {
  return isSafeRedirectPath(raw) ? raw : null;
};

/** Shape of a single `pricing_configs` row we care about. The full table is
 *  not in the generated types since this is an unregistered Supabase table. */
type PricingConfigRow = {
  key?: string | null;
  audience?: string | null;
  unit?: string | null;
  metadata?: {
    stripe_price_id?: string;
    stripe_price_id_monthly?: string;
    stripe_monthly_price_id?: string;
    stripe_price_id_annual?: string;
    stripe_annual_price_id?: string;
    stripe_price_id_yearly?: string;
    stripe_yearly_price_id?: string;
    stripe_product_id?: string;
  } | null;
};
type BillingCycle = "monthly" | "annual";
type CheckoutPlan = {
  priceId: string;
  planKey: string;
  audience: string;
  role: string;
  billingCycle: BillingCycle;
  productId?: string;
};
type CheckoutProfileRow = {
  role?: string | null;
  participant_type?: string | null;
};

export const normalizePlanKey = (raw: unknown): string | null => {
  const plan = typeof raw === "string" && raw.trim() ? raw.trim() : "pro";
  return PLAN_KEY_RE.test(plan) ? plan : null;
};

const BILLING_CYCLE_ALIASES: Record<string, BillingCycle> = {
  "": "monthly",
  annual: "annual",
  month: "monthly",
  monthly: "monthly",
  year: "annual",
  yearly: "annual",
};

const toBillingCycleAlias = (raw: unknown): string | null => {
  if (raw === undefined || raw === null) return "";
  return typeof raw === "string" ? raw : null;
};

export const normalizeBillingCycle = (raw: unknown): BillingCycle | null => {
  const alias = toBillingCycleAlias(raw);
  return alias === null ? null : BILLING_CYCLE_ALIASES[alias] ?? null;
};

export const isInviteOnlyCheckoutPlan = (planKey: string): boolean => {
  return INVITE_ONLY_PLAN_KEYS.has(planKey);
};

export const isSupportedCheckoutPlan = (planKey: string): boolean => {
  return PUBLIC_CHECKOUT_PLAN_KEYS.has(planKey) ||
    INVITE_ONLY_PLAN_KEYS.has(planKey);
};

const getConfiguredAllowedOrigins = (): string[] => {
  const configured = Deno.env.get("CHECKOUT_ALLOWED_ORIGINS") ??
    Deno.env.get("ALLOWED_CHECKOUT_ORIGINS") ??
    "";
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const normalizeOrigin = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
};

const getSiteOrigin = (): string => {
  return normalizeOrigin(Deno.env.get("SITE_URL")) ?? DEFAULT_CHECKOUT_ORIGIN;
};

export const resolveCheckoutOrigin = (rawOrigin: string | null): string => {
  const siteOrigin = getSiteOrigin();
  const allowed = new Set([
    ...CHECKOUT_ALLOWED_ORIGINS,
    ...getConfiguredAllowedOrigins(),
    siteOrigin,
  ]);
  const origin = normalizeOrigin(rawOrigin);
  if (origin && (allowed.has(origin) || CF_PAGES_ORIGIN_RE.test(origin))) {
    return origin;
  }
  return siteOrigin;
};

const getPlanEntitlement = (planKey: string) => {
  return PLAN_ENTITLEMENT[planKey] ?? null;
};

const CHECKOUT_AUDIENCE_ALIASES: Record<string, string> = {
  agent: "agent",
  buyer: "participant",
  developer: "developer",
  institutional: "institutional",
  investor: "investor",
  participant: "participant",
  pro: "participant",
  professional: "professional",
  seller: "participant",
  user: "participant",
};

const normalizeAudience = (raw: string | null | undefined): string | null => {
  return raw ? CHECKOUT_AUDIENCE_ALIASES[raw] ?? null : null;
};

export const isCheckoutAudienceAllowed = (
  planAudience: string,
  profile: CheckoutProfileRow | null,
): boolean => {
  const profileAudience = normalizeAudience(profile?.participant_type) ??
    normalizeAudience(profile?.role);
  return profileAudience === planAudience;
};

const getCheckoutProfile = async (
  supabase: unknown,
  userId: string,
): Promise<CheckoutProfileRow | null> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase as { from: any }).from as any)("profiles")
    .select("role, participant_type")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as CheckoutProfileRow | null) ?? null;
};

const buildMockCheckoutUrl = (
  origin: string,
  successPath: string | null,
  plan: string,
  billingCycle: BillingCycle,
): string => {
  return `${origin}${
    withMockBillingParams(successPath ?? "/pricing?checkout=success", {
      checkout: "success",
      plan,
      billing_cycle: billingCycle,
    })
  }`;
};

export const getStripePriceEnvKey = (
  planKey: string,
  billingCycle: BillingCycle,
): string => {
  const normalizedPlan = planKey.toUpperCase().replace(/-/g, "_");
  const suffix = billingCycle === "annual" ? "ANNUAL" : "MONTHLY";
  return `STRIPE_PRICE_${normalizedPlan}_${suffix}`;
};

const PLAN_PRICE_ENV_ALIASES: Record<string, Record<BillingCycle, string[]>> = {
  pro: {
    monthly: ["STRIPE_PRICE_PARTICIPANT_MONTHLY", "STRIPE_PRICE_PRO_MONTHLY"],
    annual: ["STRIPE_PRICE_PARTICIPANT_ANNUAL", "STRIPE_PRICE_PRO_ANNUAL"],
  },
  agent_basic: {
    monthly: ["STRIPE_PRICE_AGENT_MONTHLY"],
    annual: ["STRIPE_PRICE_AGENT_ANNUAL"],
  },
  developer_pro: {
    monthly: ["STRIPE_PRICE_DEVELOPER_MONTHLY"],
    annual: ["STRIPE_PRICE_DEVELOPER_ANNUAL"],
  },
  professional_basic: {
    monthly: ["STRIPE_PRICE_PROFESSIONAL_MONTHLY"],
    annual: ["STRIPE_PRICE_PROFESSIONAL_ANNUAL"],
  },
};

export const getStripePriceEnvKeys = (
  planKey: string,
  billingCycle: BillingCycle,
): string[] => {
  return Array.from(
    new Set([
      ...(PLAN_PRICE_ENV_ALIASES[planKey]?.[billingCycle] ?? []),
      getStripePriceEnvKey(planKey, billingCycle),
      ...(billingCycle === "annual"
        ? [`STRIPE_PRICE_${planKey.toUpperCase().replace(/-/g, "_")}_YEARLY`]
        : [`STRIPE_PRICE_${planKey.toUpperCase().replace(/-/g, "_")}`]),
    ]),
  );
};

const getFirstConfiguredEnvPrice = (
  planKey: string,
  billingCycle: BillingCycle,
): string | null => {
  for (const key of getStripePriceEnvKeys(planKey, billingCycle)) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  return null;
};

const firstConfiguredValue = (
  values: Array<string | undefined>,
): string | undefined => {
  return values.find((value) => Boolean(value));
};

const getUnitScopedStripePriceId = (
  row: PricingConfigRow | null,
  unit: string,
): string | undefined => {
  return row?.unit === unit ? row.metadata?.stripe_price_id : undefined;
};

const getNonYearlyStripePriceId = (
  row: PricingConfigRow | null,
): string | undefined => {
  return row?.unit !== "yearly" ? row?.metadata?.stripe_price_id : undefined;
};

const getAnnualDbStripePriceId = (
  row: PricingConfigRow | null,
): string | undefined => {
  const meta = row?.metadata ?? {};
  return firstConfiguredValue([
    meta.stripe_price_id_annual,
    meta.stripe_annual_price_id,
    meta.stripe_price_id_yearly,
    meta.stripe_yearly_price_id,
    getUnitScopedStripePriceId(row, "yearly"),
  ]);
};

const getMonthlyDbStripePriceId = (
  row: PricingConfigRow | null,
): string | undefined => {
  const meta = row?.metadata ?? {};
  return firstConfiguredValue([
    meta.stripe_price_id_monthly,
    meta.stripe_monthly_price_id,
    getNonYearlyStripePriceId(row),
  ]);
};

const getDbStripePriceId = (
  row: PricingConfigRow | null,
  billingCycle: BillingCycle,
): string | undefined => {
  return billingCycle === "annual"
    ? getAnnualDbStripePriceId(row)
    : getMonthlyDbStripePriceId(row);
};

const queryActivePricingConfig = async (
  supabase: unknown,
  planKey: string,
): Promise<PricingConfigRow | null> => {
  // The runtime Supabase client returned by `createClient(url, key)` carries
  // generics that don't match the value of `ReturnType<typeof createClient>`,
  // so we accept it as `unknown` here and bridge through `(... .from as any)`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase as { from: any }).from as any)(
    "pricing_configs",
  )
    .select("key, audience, unit, metadata")
    .eq("key", planKey)
    .eq("is_active", true)
    .maybeSingle();
  return data as PricingConfigRow | null;
};

const buildCheckoutPlan = (
  priceId: string | null | undefined,
  planKey: string,
  billingCycle: BillingCycle,
  productId?: string,
): CheckoutPlan | null => {
  const entitlement = getPlanEntitlement(planKey);
  return priceId && entitlement
    ? {
      priceId,
      planKey,
      audience: entitlement.audience,
      role: entitlement.role,
      billingCycle,
      productId,
    }
    : null;
};

const getDefaultStripePrice = (
  planKey: string,
  billingCycle: BillingCycle,
): string | null => {
  return planKey === "pro" && billingCycle === "monthly"
    ? Deno.env.get("STRIPE_PRICE_DEFAULT") ?? null
    : null;
};

const buildDbCheckoutPlan = ( // skipcq: JS-R1005 - Mirrors Stripe DB fallback precedence and audience checks in one small resolver.
  row: PricingConfigRow | null,
  planKey: string,
  billingCycle: BillingCycle,
  entitlement: NonNullable<ReturnType<typeof getPlanEntitlement>>,
): CheckoutPlan | null => {
  const stripePriceId = getDbStripePriceId(row, billingCycle);
  const rowAudience = normalizeAudience(row?.audience ?? null);
  return stripePriceId && rowAudience === entitlement.audience
    ? buildCheckoutPlan(
      stripePriceId,
      planKey,
      billingCycle,
      row?.metadata?.stripe_product_id,
    )
    : null;
};

const buildFallbackCheckoutPlan = (
  planKey: string,
  billingCycle: BillingCycle,
): CheckoutPlan | null => {
  const envPrice = getFirstConfiguredEnvPrice(planKey, billingCycle);
  return buildCheckoutPlan(
    envPrice ?? getDefaultStripePrice(planKey, billingCycle),
    planKey,
    billingCycle,
  );
};

/** Plan keys: active DB pricing_configs.metadata.stripe_price_id, then env STRIPE_PRICE_<UPPERCASE_KEY>. */
const getCheckoutPlan = async (
  supabase: unknown,
  planKey: string,
  billingCycle: BillingCycle,
): Promise<CheckoutPlan | null> => {
  const entitlement = getPlanEntitlement(planKey);
  if (!entitlement) return null;

  const row = await queryActivePricingConfig(supabase, planKey);
  return buildDbCheckoutPlan(row, planKey, billingCycle, entitlement) ??
    buildFallbackCheckoutPlan(planKey, billingCycle);
};

const findOwnedStripeCustomer = async (
  stripe: Stripe,
  userId: string,
): Promise<Stripe.Customer | null> => {
  const search = await stripe.customers.search({
    query: `metadata['user_id']:'${userId}'`,
    limit: 1,
  });
  return search.data[0] ?? null;
};

const getOrCreateOwnedStripeCustomer = async (
  stripe: Stripe,
  user: { id: string; email: string },
): Promise<string> => {
  const existing = await findOwnedStripeCustomer(stripe, user.id);
  if (existing) {
    logStep("Existing Stripe customer found by user metadata", {
      customerId: existing.id,
    });
    return existing.id;
  }

  const created = await stripe.customers.create({
    email: user.email,
    metadata: { user_id: user.id },
  }, {
    idempotencyKey: `maiprop-customer-${user.id}`,
  });
  logStep("Created Stripe customer with user_id metadata", {
    customerId: created.id,
  });
  return created.id;
};

const shortSha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
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

    const origin = resolveCheckoutOrigin(req.headers.get("origin"));
    if (isStripeMockMode()) {
      const url = buildMockCheckoutUrl(origin, successPath, plan, billingCycle);
      logStep("Mock checkout session returned", {
        userId: user.id,
        plan,
        audience: entitlement.audience,
        billingCycle,
      });
      return new Response(
        JSON.stringify({
          url,
          mock: true,
          mode: "mock",
          plan,
          billing_cycle: billingCycle,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

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

    logStep("Resolved price", {
      plan,
      priceId: checkoutPlan.priceId,
      audience: checkoutPlan.audience,
      billingCycle: checkoutPlan.billingCycle,
    });

    const customerId = await getOrCreateOwnedStripeCustomer(stripe, user);
    const success = `${origin}${successPath ?? "/pricing?checkout=success"}`;
    const cancel = `${origin}${cancelPath ?? "/pricing?checkout=cancelled"}`;
    const redirectHash = await shortSha256(`${success}|${cancel}`);

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        line_items: [{ price: checkoutPlan.priceId, quantity: 1 }],
        mode: "subscription",
        success_url: success,
        cancel_url: cancel,
        metadata: {
          user_id: user.id,
          plan,
          plan_key: checkoutPlan.planKey,
          audience: checkoutPlan.audience,
          role: checkoutPlan.role,
          billing_cycle: checkoutPlan.billingCycle,
        },
        // Propagate plan to the subscription object itself so the webhook can
        // identify professional_* plans and update professionals.subscription_tier.
        // Stripe does NOT auto-copy session.metadata onto the resulting subscription,
        // so we set subscription_data.metadata explicitly.
        subscription_data: {
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
          },
        },
      },
      {
        idempotencyKey:
          `maiprop-checkout-${user.id}-${checkoutPlan.planKey}-${checkoutPlan.billingCycle}-${redirectHash}`,
      },
    );

    logStep("Checkout session created", { sessionId: session.id, plan });

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
