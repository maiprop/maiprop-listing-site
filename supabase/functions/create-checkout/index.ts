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
type PricingConfigRow = { metadata?: { stripe_price_id?: string } | null };

export function normalizePlanKey(raw: unknown): string | null {
  const plan = typeof raw === "string" && raw.trim() ? raw.trim() : "pro";
  return PLAN_KEY_RE.test(plan) ? plan : null;
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

/** Plan keys: env STRIPE_PRICE_<UPPERCASE_KEY> or active DB pricing_configs.metadata.stripe_price_id. */
async function getPriceForPlan(
  supabase: unknown,
  planKey: string,
): Promise<string | null> {
  const envKey = `STRIPE_PRICE_${planKey.toUpperCase().replace(/-/g, "_")}`;
  const envPrice = Deno.env.get(envKey);
  if (envPrice) return envPrice;

  // The runtime Supabase client returned by `createClient(url, key)` carries
  // generics that don't match the value of `ReturnType<typeof createClient>`,
  // so we accept it as `unknown` here and bridge through `(... .from as any)`
  // — the same narrow cast pattern this repo uses for unregistered tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase as { from: any }).from as any)(
    "pricing_configs",
  )
    .select("metadata")
    .eq("key", planKey)
    .eq("is_active", true)
    .maybeSingle();
  const stripePriceId = (data as PricingConfigRow | null)?.metadata
    ?.stripe_price_id;
  if (stripePriceId) return stripePriceId;

  return planKey === "pro"
    ? Deno.env.get("STRIPE_PRICE_DEFAULT") ?? null
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
  });
  logStep("Created Stripe customer with user_id metadata", {
    customerId: created.id,
  });
  return created.id;
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
    // Caller-provided redirect URLs are accepted only when they are same-origin
    // relative paths starting with "/" — guards against open-redirect abuse while
    // honouring the success_url/cancel_url contract from Onboarding/Pricing.
    const successPath = sanitizeRedirectPath(body.success_url);
    const cancelPath = sanitizeRedirectPath(body.cancel_url);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const priceId = await getPriceForPlan(supabaseClient, plan);
    if (!priceId) {
      log.warn("checkout price not configured", { plan });
      return new Response(JSON.stringify({ error: "Plan is unavailable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }
    logStep("Resolved price", { plan, priceId });

    const customerId = await getOrCreateOwnedStripeCustomer(stripe, user);
    const origin = resolveCheckoutOrigin(req.headers.get("origin"));
    const success = `${origin}${successPath ?? "/pricing?checkout=success"}`;
    const cancel = `${origin}${cancelPath ?? "/pricing?checkout=cancelled"}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: success,
      cancel_url: cancel,
      metadata: { user_id: user.id, plan },
      // Propagate plan to the subscription object itself so the webhook can
      // identify professional_* plans and update professionals.subscription_tier.
      // Stripe does NOT auto-copy session.metadata onto the resulting subscription,
      // so we set subscription_data.metadata explicitly.
      subscription_data: { metadata: { user_id: user.id, plan } },
    });

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
