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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req) => {
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
    console.error("[stripe-webhook] Signature verification failed:", err instanceof Error ? err.message : err);
    return errorResponse("Webhook signature invalid", 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`[stripe-webhook] Event: ${event.type}`);

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
          console.log(`[stripe-webhook] checkout.session.completed synced subscription`, {
            sessionId: session.id,
            customerId: session.customer,
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
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[stripe-webhook] Handler error for ${event.type}:`, msg);
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
    console.warn("[stripe-webhook] Customer has no user_id metadata or email:", customerId);
    return;
  }

  const isActive = sub.status === "active" || sub.status === "trialing";
  const productId = isActive ? (sub.items.data[0]?.price.product as string) : null;

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_product_id: productId })
    .eq(filter.column, filter.value);

  if (error) {
    console.error("[stripe-webhook] Failed to update profile", { filter, error });
  } else {
    console.log("[stripe-webhook] Updated profile subscription", { filter, productId, status: sub.status });
  }
}

async function clearSubscription(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  customerId: string,
) {
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  const filter = resolveProfileFilter(customer);
  if (!filter) {
    console.warn("[stripe-webhook] Customer has no user_id metadata or email:", customerId);
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_product_id: null })
    .eq(filter.column, filter.value);

  if (error) {
    console.error("[stripe-webhook] Failed to clear subscription", { filter, error });
  } else {
    console.log("[stripe-webhook] Cleared subscription", { filter });
  }
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
