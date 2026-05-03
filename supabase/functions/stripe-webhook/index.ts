/**
 * Stripe webhook handler
 *
 * Handles subscription lifecycle events reactively so profiles stay in sync
 * without relying on client-side polling.
 *
 * Events handled:
 *   customer.subscription.created   → mark pro
 *   customer.subscription.updated   → update product / status
 *   customer.subscription.deleted   → clear subscription
 *   invoice.payment_failed           → clear subscription (grace period expired)
 */

import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const log = createLogger("stripe-webhook");

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, "stripe-signature");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey) return errorResponse("STRIPE_SECRET_KEY not set", 500);
  if (!webhookSecret) return errorResponse("STRIPE_WEBHOOK_SECRET not set", 500);
  if (!supabaseUrl || !serviceRoleKey) return errorResponse("Supabase env not set", 500);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return errorResponse("Missing stripe-signature header", 400);

  const body = await req.text();
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: unknown) {
    log.error("signature verification failed", { err: err instanceof Error ? err.message : String(err) });
    return errorResponse("Webhook signature invalid", 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  log.info("event received", { event_type: event.type });

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(supabase, stripe, sub);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await clearSubscription(supabase, stripe, sub.customer as string);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) {
          await clearSubscription(supabase, stripe, invoice.customer as string);
        }
        break;
      }

      case "checkout.session.completed": {
        // Canonical confirmation event for initial subscription checkout.
        // customer.subscription.created fires around the same time, but this
        // event is the definitive signal that the user has paid. Handle
        // idempotently — syncSubscription is a no-op if already applied.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription && session.customer) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await syncSubscription(supabase, stripe, sub);
          log.info("checkout.session.completed synced subscription", {
            session_id: session.id,
            customer_id: session.customer,
          });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        // Fires on every successful recurring charge. Re-sync to handle plan upgrades
        // where the subscription object may already be updated before this fires.
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription && invoice.customer) {
          const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await syncSubscription(supabase, stripe, sub);
        }
        break;
      }

      default:
        log.info("unhandled event type", { event_type: event.type });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("handler error", { event_type: event.type, err: msg });
    // Return 500 so Stripe retries transient failures (DB unavailable, network error, etc.)
    // Only return 200 for truly non-retryable outcomes (unknown event type falls through to the 200 below)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

/** Resolve which column/value to use when matching the Supabase profile.
 *  Prefers user_id from customer metadata (set at checkout).
 *  Falls back to email for legacy customers created before the metadata change. */
function resolveProfileFilter(customer: Stripe.Customer): { column: string; value: string } | null {
  const userId = customer.metadata?.user_id;
  if (userId) return { column: "user_id", value: userId };
  if (customer.email) return { column: "email", value: customer.email };
  return null;
}

async function syncSubscription(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  sub: Stripe.Subscription,
) {
  const customerId = sub.customer as string;
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  const filter = resolveProfileFilter(customer);
  if (!filter) {
    log.warn("customer has no user_id metadata or email", { customer_id: customerId });
    return;
  }

  const isActive = sub.status === "active" || sub.status === "trialing";
  const productId = isActive ? (sub.items.data[0]?.price.product as string) : null;

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_product_id: productId })
    .eq(filter.column, filter.value);

  if (error) {
    log.error("failed to update profile", { filter, err: String(error.message ?? error) });
  } else {
    log.info("updated profile subscription", { filter, product_id: productId, status: sub.status });
  }

  // Promote the matching professionals row to 'pro' when the subscription is
  // a professional plan. The plan key is propagated via subscription_data.metadata
  // by create-checkout. The BEFORE UPDATE trigger
  // public.professionals_guard_subscription_tier permits service-role writes
  // because auth.uid() is NULL on edge-function calls without a user JWT.
  await syncProfessionalTier(supabase, sub, isActive);
}

async function clearSubscription(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  customerId: string,
) {
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  const filter = resolveProfileFilter(customer);
  if (!filter) {
    log.warn("customer has no user_id metadata or email", { customer_id: customerId });
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_product_id: null })
    .eq(filter.column, filter.value);

  if (error) {
    log.error("failed to clear subscription", { filter, err: String(error.message ?? error) });
  } else {
    log.info("cleared subscription", { filter });
  }

  // Demote any professional row owned by this customer back to 'free'.
  const userId = customer.metadata?.user_id as string | undefined
    ?? await resolveUserIdByEmail(supabase, customer.email ?? null);
  if (userId) {
    const { error: profErr } = await supabase
      .from("professionals")
      .update({ subscription_tier: "free" })
      .eq("user_id", userId);
    if (profErr) {
      log.error("failed to clear professional tier", { user_id: userId, err: String(profErr.message ?? profErr) });
    }
  }
}

/** Update professionals.subscription_tier when the subscription is a professional plan. */
async function syncProfessionalTier(
  supabase: ReturnType<typeof createClient>,
  sub: Stripe.Subscription,
  isActive: boolean,
) {
  const planKey = (sub.metadata?.plan ?? "") as string;
  if (!planKey.startsWith("professional_")) return;

  const userId = (sub.metadata?.user_id ?? "") as string;
  if (!userId) {
    log.warn("professional plan subscription missing user_id metadata", { sub_id: sub.id });
    return;
  }

  const tier = isActive ? "pro" : "free";
  const { error } = await supabase
    .from("professionals")
    .update({ subscription_tier: tier })
    .eq("user_id", userId);

  if (error) {
    log.error("failed to update professional tier", { user_id: userId, tier, err: String(error.message ?? error) });
  } else {
    log.info("updated professional tier", { user_id: userId, tier, plan_key: planKey });
  }
}

async function resolveUserIdByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string | null,
): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
