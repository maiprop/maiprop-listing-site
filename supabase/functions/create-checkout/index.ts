import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";

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

/** Accepts only same-origin absolute paths starting with "/" (and not "//" or "/\\").
 *  Returns null for anything else so callers fall back to a server-controlled default.
 *  Exported so unit tests can cover every branch without spinning up the handler. */
export function sanitizeRedirectPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  // Reject scheme-relative ("//evil") and back-slash escape ("/\\evil") forms,
  // both of which browsers may resolve to attacker-controlled origins.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return null;
  }
  // Reject anything that looks like an attempt to break out of the origin via
  // CRLF / control characters in headers Stripe will echo back.
  if (/[\r\n\t]/.test(raw)) return null;
  if (raw.length > 512) return null;
  return raw;
}

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

export function normalizePlanKey(raw: unknown): string | null {
  const plan = typeof raw === "string" && raw.trim() ? raw.trim() : "pro";
  return PLAN_KEY_RE.test(plan) ? plan : null;
}

export function normalizeBillingCycle(raw: unknown): BillingCycle | null {
  if (raw === undefined || raw === null || raw === "") return "monthly";
  if (raw === "monthly" || raw === "month") return "monthly";
  if (raw === "annual" || raw === "yearly" || raw === "year") return "annual";
  return null;
}

export function isInviteOnlyCheckoutPlan(planKey: string): boolean {
  return INVITE_ONLY_PLAN_KEYS.has(planKey);
}

export function isSupportedCheckoutPlan(planKey: string): boolean {
  return PUBLIC_CHECKOUT_PLAN_KEYS.has(planKey) ||
    INVITE_ONLY_PLAN_KEYS.has(planKey);
}

function getConfiguredAllowedOrigins(): string[] {
  const configured = Deno.env.get("CHECKOUT_ALLOWED_ORIGINS") ??
    Deno.env.get("ALLOWED_CHECKOUT_ORIGINS") ??
    "";
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function getSiteOrigin(): string {
  return normalizeOrigin(Deno.env.get("SITE_URL")) ?? DEFAULT_CHECKOUT_ORIGIN;
}

export function resolveCheckoutOrigin(rawOrigin: string | null): string {
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
}

function getPlanEntitlement(planKey: string) {
  return PLAN_ENTITLEMENT[planKey] ?? null;
}

function normalizeAudience(raw: string | null | undefined): string | null {
  if (raw === "buyer" || raw === "seller" || raw === "participant" || raw === "pro") {
    return "participant";
  }
  if (raw === "agent" || raw === "developer" || raw === "professional" || raw === "investor" || raw === "institutional") {
    return raw;
  }
  return null;
}

export function isCheckoutAudienceAllowed(
  planAudience: string,
  profile: CheckoutProfileRow | null,
): boolean {
  const profileAudience = normalizeAudience(profile?.participant_type) ??
    normalizeAudience(profile?.role);
  return profileAudience === planAudience;
}

async function getCheckoutProfile(
  supabase: unknown,
  userId: string,
): Promise<CheckoutProfileRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase as { from: any }).from as any)("profiles")
    .select("role, participant_type")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as CheckoutProfileRow | null) ?? null;
}

export function getStripePriceEnvKey(planKey: string, billingCycle: BillingCycle): string {
  const normalizedPlan = planKey.toUpperCase().replace(/-/g, "_");
  const suffix = billingCycle === "annual" ? "ANNUAL" : "MONTHLY";
  return `STRIPE_PRICE_${normalizedPlan}_${suffix}`;
}

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

export function getStripePriceEnvKeys(planKey: string, billingCycle: BillingCycle): string[] {
  return Array.from(new Set([
    ...(PLAN_PRICE_ENV_ALIASES[planKey]?.[billingCycle] ?? []),
    getStripePriceEnvKey(planKey, billingCycle),
    ...(billingCycle === "annual"
      ? [`STRIPE_PRICE_${planKey.toUpperCase().replace(/-/g, "_")}_YEARLY`]
      : [`STRIPE_PRICE_${planKey.toUpperCase().replace(/-/g, "_")}`]),
  ]));
}

function getFirstConfiguredEnvPrice(planKey: string, billingCycle: BillingCycle): string | null {
  for (const key of getStripePriceEnvKeys(planKey, billingCycle)) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  return null;
}

function getDbStripePriceId(row: PricingConfigRow | null, billingCycle: BillingCycle): string | undefined {
  const meta = row?.metadata ?? {};
  if (billingCycle === "annual") {
    return meta.stripe_price_id_annual ??
      meta.stripe_annual_price_id ??
      meta.stripe_price_id_yearly ??
      meta.stripe_yearly_price_id ??
      (row?.unit === "yearly" ? meta.stripe_price_id : undefined);
  }
  return meta.stripe_price_id_monthly ??
    meta.stripe_monthly_price_id ??
    (row?.unit !== "yearly" ? meta.stripe_price_id : undefined);
}

/** Plan keys: active DB pricing_configs.metadata.stripe_price_id, then env STRIPE_PRICE_<UPPERCASE_KEY>. */
async function getCheckoutPlan(
  supabase: unknown,
  planKey: string,
  billingCycle: BillingCycle,
): Promise<CheckoutPlan | null> {
  const entitlement = getPlanEntitlement(planKey);
  if (!entitlement) return null;
  // The runtime Supabase client returned by `createClient(url, key)` carries
  // generics that don't match the value of `ReturnType<typeof createClient>`,
  // so we accept it as `unknown` here and bridge through `(... .from as any)`
  // — the same narrow cast pattern this repo uses for unregistered tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase as { from: any }).from as any)(
    "pricing_configs",
  )
    .select("key, audience, unit, metadata")
    .eq("key", planKey)
    .eq("is_active", true)
    .maybeSingle();
  const row = data as PricingConfigRow | null;
  const stripePriceId = getDbStripePriceId(row, billingCycle);
  const rowAudience = normalizeAudience(row?.audience ?? null);
  if (stripePriceId && rowAudience === entitlement.audience) {
    return {
      priceId: stripePriceId,
      planKey,
      audience: entitlement.audience,
      role: entitlement.role,
      billingCycle,
      productId: row?.metadata?.stripe_product_id,
    };
  }

  const envPrice = getFirstConfiguredEnvPrice(planKey, billingCycle);
  if (envPrice) {
    return { priceId: envPrice, planKey, audience: entitlement.audience, role: entitlement.role, billingCycle };
  }

  const defaultPrice = planKey === "pro" && billingCycle === "monthly" ? Deno.env.get("STRIPE_PRICE_DEFAULT") : null;
  return defaultPrice
    ? { priceId: defaultPrice, planKey, audience: entitlement.audience, role: entitlement.role, billingCycle }
    : null;
}

async function findOwnedStripeCustomer(
  stripe: Stripe,
  userId: string,
): Promise<Stripe.Customer | null> {
  const search = await stripe.customers.search({
    query: `metadata['user_id']:'${userId}'`,
    limit: 1,
  });
  return search.data[0] ?? null;
}

async function getOrCreateOwnedStripeCustomer(
  stripe: Stripe,
  user: { id: string; email: string },
): Promise<string> {
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
}

async function shortSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
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
    const billingCycle = normalizeBillingCycle(body.billing_cycle ?? body.billingCycle);
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

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const checkoutPlan = await getCheckoutPlan(supabaseClient, plan, billingCycle);
    if (!checkoutPlan) {
      log.warn("checkout price not configured", { plan });
      return new Response(JSON.stringify({ error: "Plan is unavailable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const profile = await getCheckoutProfile(supabaseClient, user.id);
    if (!isCheckoutAudienceAllowed(checkoutPlan.audience, profile)) {
      log.warn("blocked cross-role checkout attempt", {
        userId: user.id,
        plan,
        audience: checkoutPlan.audience,
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
    logStep("Resolved price", {
      plan,
      priceId: checkoutPlan.priceId,
      audience: checkoutPlan.audience,
      billingCycle: checkoutPlan.billingCycle,
    });

    const customerId = await getOrCreateOwnedStripeCustomer(stripe, user);
    const origin = resolveCheckoutOrigin(req.headers.get("origin"));
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
            ...(checkoutPlan.productId ? { product_id: checkoutPlan.productId } : {}),
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
});
