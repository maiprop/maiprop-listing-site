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
  } catch (err: any) {
    console.error("[stripe-webhook] Signature verification failed:", err.message);
    return errorResponse(`Webhook signature invalid: ${err.message}`, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
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

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error(`[stripe-webhook] Handler error for ${event.type}:`, err.message);
    // Return 200 to prevent Stripe from retrying permanently-broken events
    return new Response(JSON.stringify({ received: true, warning: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function syncSubscription(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  sub: Stripe.Subscription,
) {
  const customerId = sub.customer as string;
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  if (!customer.email) {
    console.warn("[stripe-webhook] Customer has no email:", customerId);
    return;
  }

  const isActive = sub.status === "active" || sub.status === "trialing";
  const productId = isActive ? (sub.items.data[0]?.price.product as string) : null;
  const subscriptionEnd = isActive
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_product_id: productId })
    .eq("email", customer.email);

  if (error) {
    console.error("[stripe-webhook] Failed to update profile for", customer.email, error);
  } else {
    console.log(`[stripe-webhook] Updated profile for ${customer.email}:`, {
      productId,
      subscriptionEnd,
      status: sub.status,
    });
  }
}

async function clearSubscription(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  customerId: string,
) {
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  if (!customer.email) {
    console.warn("[stripe-webhook] Customer has no email:", customerId);
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_product_id: null })
    .eq("email", customer.email);

  if (error) {
    console.error("[stripe-webhook] Failed to clear subscription for", customer.email, error);
  } else {
    console.log(`[stripe-webhook] Cleared subscription for ${customer.email}`);
  }
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
