import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAN_TO_TIER: Record<string, "private" | "institutional"> = {
  investor_private: "private",
  investor_institutional: "institutional",
};

type StripeRuntimeMode = "test" | "live";

function getStripeRuntimeMode(stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? ""): StripeRuntimeMode {
  return stripeKey.startsWith("sk_live_") ? "live" : "test";
}

function createStripeClient(stripeKey?: string): Stripe {
  const key = stripeKey ?? Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2025-08-27.basil" });
}

function metadataValue(
  value: string | number | boolean | null | undefined,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function stripeMetadata(input: {
  checkoutType: string;
  userId?: string | null;
  planKey?: string | null;
  extra?: Record<string, string | number | boolean | null | undefined>;
}): Record<string, string> {
  const raw: Record<string, string | undefined> = {
    checkout_type: metadataValue(input.checkoutType),
    user_id: metadataValue(input.userId),
    plan_key: metadataValue(input.planKey),
  };

  for (const [key, value] of Object.entries(input.extra ?? {})) {
    raw[key] = metadataValue(value);
  }

  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] =>
      Boolean(entry[1])
    ),
  );
}

async function shortSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function buildIdempotencyKey(
  scope: string,
  parts: Array<string | number | boolean | null | undefined>,
): Promise<string> {
  const normalized = parts
    .map((part) => metadataValue(part) ?? "none")
    .join("|");
  return `maiprop-${scope}-${await shortSha256(normalized)}`;
}

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
  .refine((body) =>
    body.amount !== undefined || body.amount_cents !== undefined ||
    body.amountCents !== undefined, {
    message: "amount is required",
  });

type ProfileRow = {
  role?: string | null;
  is_platform_admin?: boolean | null;
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
    throw new AuthError("plan_key must be investor_private or investor_institutional", 400);
  }
  return value as keyof typeof PLAN_TO_TIER;
}

function parseAmountCents(body: Body): number {
  const rawMinor = body.amount_cents ?? body.amountCents;
  if (rawMinor !== undefined && rawMinor !== null) {
    const parsed = Number(rawMinor);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 10_000_000) {
      return parsed;
    }
    throw new AuthError("amount_cents is invalid", 400);
  }

  const parsedMajor = Number(body.amount);
  if (Number.isFinite(parsedMajor) && parsedMajor > 0 && parsedMajor <= 100_000) {
    return Math.round(parsedMajor * 100);
  }
  throw new AuthError("amount is required", 400);
}

function normalizeCurrency(value: unknown): string {
  const currency = typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : "eur";
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new AuthError("currency is invalid", 400);
  }
  return currency;
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

    const body = await parseJsonBody(req, createInvestorPaymentBodySchema) as Body;
    const requestId = requireUuid(body.request_id ?? body.requestId, "request_id");
    const userId = requireUuid(body.user_id ?? body.userId, "user_id");
    const planKey = requirePlanKey(body.plan_key ?? body.planKey);
    const tier = PLAN_TO_TIER[planKey];
    const amountCents = parseAmountCents(body);
    const currency = normalizeCurrency(body.currency);

    const { data: requestRow, error: requestError } = await supabase
      .from("invitation_requests")
      .select("id, user_id, status")
      .eq("id", requestId)
      .eq("user_id", userId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!requestRow || (requestRow as { status?: string | null }).status !== "approved") {
      throw new AuthError("Invitation request must be approved first", 409);
    }

    const { data: targetProfile, error: targetProfileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();
    if (targetProfileError) throw targetProfileError;
    const email = (targetProfile as ProfileRow | null)?.email;
    if (!email) throw new AuthError("Approved user profile has no email", 409);

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
        currency,
      },
    });

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: amountCents,
              product_data: {
                name: tier === "institutional"
                  ? "MaiProp Institutional Investor Access"
                  : "MaiProp Private Investor Access",
                metadata,
              },
            },
            quantity: 1,
          },
        ],
        success_url: success,
        cancel_url: cancel,
        metadata,
      },
      {
        idempotencyKey: await buildIdempotencyKey("investor-payment", [
          requestId,
          userId,
          planKey,
          amountCents,
          success,
          cancel,
        ]),
      },
    );

    const { error: updateError } = await supabase
      .from("investor_subscriptions")
      .update({
        stripe_customer_id: customerId,
        stripe_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("tier", tier)
      .eq("status", "pending_payment");
    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      url: session.url,
      session_id: session.id,
      checkout_type: "investor_payment",
      mode: getStripeRuntimeMode(),
      customer_id: customerId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status : err instanceof SchemaValidationError ? 400 : 500;
    const message = err instanceof Error ? err.message : "Investor payment checkout failed";
    log.warn("create investor payment failed", { status, message });
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
