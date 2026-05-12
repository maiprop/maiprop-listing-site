import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { verifyBearerToken, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";

const log = createLogger("create-checkout");
const limiter = makeRateLimiter({ bucket: "create-checkout", maxRequests: 10, windowMs: 60_000 });

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
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  // Reject anything that looks like an attempt to break out of the origin via
  // CRLF / control characters in headers Stripe will echo back.
  if (/[\r\n\t]/.test(raw)) return null;
  if (raw.length > 512) return null;
  return raw;
}

/** Shape of a single `pricing_configs` row we care about. The full table is
 *  not in the generated types since this is an unregistered Supabase table. */
type PricingConfigRow = { metadata?: { stripe_price_id?: string } | null };

/** Plan keys: env STRIPE_PRICE_<UPPERCASE_KEY>, or DB pricing_configs.metadata.stripe_price_id, or STRIPE_PRICE_DEFAULT. No hardcoded fallback in production. */
async function getPriceForPlan(supabase: unknown, planKey: string): Promise<string> {
  const envKey = `STRIPE_PRICE_${planKey.toUpperCase().replace(/-/g, "_")}`;
  const envPrice = Deno.env.get(envKey);
  if (envPrice) return envPrice;

  // The runtime Supabase client returned by `createClient(url, key)` carries
  // generics that don't match the value of `ReturnType<typeof createClient>`,
  // so we accept it as `unknown` here and bridge through `(... .from as any)`
  // — the same narrow cast pattern this repo uses for unregistered tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase as { from: any }).from as any)("pricing_configs")
    .select("metadata")
    .eq("key", planKey)
    .maybeSingle();
  const stripePriceId = (data as PricingConfigRow | null)?.metadata?.stripe_price_id;
  if (stripePriceId) return stripePriceId;

  const defaultPrice = Deno.env.get("STRIPE_PRICE_DEFAULT");
  if (!defaultPrice) throw new Error("STRIPE_PRICE_DEFAULT or pricing_configs.metadata.stripe_price_id required");
  return defaultPrice;
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    log.error("SUPABASE_SERVICE_ROLE_KEY not set, checkout cannot proceed safely");
    return new Response(JSON.stringify({ error: "Checkout service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  try {
    const user = await verifyBearerToken(req, supabaseClient);
    logStep("User authenticated", { userId: user.id, email: user.email });

    const body = req.method === "POST" && req.body ? await req.json().catch(() => ({})) : {};
    const plan = (body.plan ?? "pro") as string;
    // Caller-provided redirect URLs are accepted only when they are same-origin
    // relative paths starting with "/" — guards against open-redirect abuse while
    // honouring the success_url/cancel_url contract from Onboarding/Pricing.
    const successPath = sanitizeRedirectPath(body.success_url);
    const cancelPath = sanitizeRedirectPath(body.cancel_url);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

    const priceId = await getPriceForPlan(supabaseClient, plan);
    logStep("Resolved price", { plan, priceId });

    // Always resolve or create a Stripe customer with user_id in metadata
    // so the webhook can correlate by user_id instead of email.
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing Stripe customer found", { customerId });
      // Backfill user_id in metadata for customers created before this change
      if (!customers.data[0].metadata?.user_id) {
        await stripe.customers.update(customerId, { metadata: { user_id: user.id } });
        logStep("Backfilled user_id on customer metadata", { customerId });
      }
    } else {
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = newCustomer.id;
      logStep("Created Stripe customer with user_id metadata", { customerId });
    }

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://portal.maiprop.co/";
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
