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
 *   invoice.created                  → apply Agent Data Input discount to draft
 *   invoice.payment_failed           → keep grace access, resync status
 */

import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  hasProvisionedSubscriptionAccess,
  shouldRevokeSubscriptionAccess,
} from "../_shared/subscriptionStatus.ts";
import { shouldSkipProfileEntitlementSync } from "./addonGuard.ts";

const log = createLogger("stripe-webhook");

type PricingConfigRow = {
  key?: string | null;
  audience?: string | null;
  module?: string | null;
  metadata?: {
    stripe_price_id?: string | null;
    stripe_product_id?: string | null;
  } | null;
};

type SubscriptionEntitlement = {
  planKey: string;
  audience: string;
  role: string;
  productId: string;
} | null;

// The generated Supabase database type is not available inside Edge Functions.
// Keep the admin client intentionally dynamic while retaining Stripe-side types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = any;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, "stripe-signature");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return errorResponse("Missing stripe-signature header", 400, corsHeaders);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey) return errorResponse("STRIPE_SECRET_KEY not set", 500, corsHeaders);
  if (!webhookSecret) return errorResponse("STRIPE_WEBHOOK_SECRET not set", 500, corsHeaders);
  if (!supabaseUrl || !serviceRoleKey) return errorResponse("Supabase env not set", 500, corsHeaders);

  const body = await req.text();
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: unknown) {
    log.error("signature verification failed", { err: err instanceof Error ? err.message : String(err) });
    return errorResponse("Webhook signature invalid", 400, corsHeaders);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  }) as unknown as SupabaseAdminClient;

  log.info("event received", { event_type: event.type });

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.paused":
      case "customer.subscription.pending_update_applied":
      case "customer.subscription.pending_update_expired":
      case "customer.subscription.resumed": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(supabase, stripe, sub);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await clearSubscription(supabase, stripe, sub);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await syncInvoiceSubscription(supabase, stripe, invoice, "invoice.payment_failed");
        break;
      }

      case "invoice.created": {
        // Apply the Agent "Data Input" discount to the draft invoice if the
        // user has accumulated verified entries that have not yet been credited.
        // Idempotent — apply_verified_data_input_discount() flips
        // discount_applied=true atomically, so a retry returns 0 entries.
        const invoice = event.data.object as Stripe.Invoice;
        try {
          await applyAgentDataInputDiscount(supabase, stripe, invoice);
        } catch (err: unknown) {
          // Discount application is best-effort — log but don't block the
          // invoice. Stripe will still bill the regular amount and the
          // unapplied entries remain available for the next invoice cycle.
          log.error("agent data input discount failed", {
            invoice_id: invoice.id,
            err: err instanceof Error ? err.message : String(err),
          });
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
        await syncInvoiceSubscription(supabase, stripe, invoice, "invoice.payment_succeeded");
        break;
      }

      case "subscription_schedule.aborted":
      case "subscription_schedule.canceled":
      case "subscription_schedule.completed":
      case "subscription_schedule.released":
      case "subscription_schedule.updated": {
        const schedule = event.data.object as Stripe.SubscriptionSchedule;
        const subscriptionId = getScheduleSubscriptionId(schedule);
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
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
// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function resolveProfileFilter(customer: Stripe.Customer): { column: string; value: string } | null {
  const userId = customer.metadata?.user_id;
  if (userId) return { column: "user_id", value: userId };
  if (customer.email) return { column: "email", value: customer.email };
  return null;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function normalizeAudience(raw: string | null | undefined): string | null {
  if (raw === "buyer" || raw === "seller" || raw === "participant" || raw === "pro") return "participant";
  if (raw === "agent" || raw === "developer" || raw === "professional" || raw === "investor" || raw === "institutional") {
    return raw;
  }
  return null;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function firstSubscriptionItem(sub: Stripe.Subscription) {
  return sub.items.data[0] ?? null;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacySubscription = (invoice as unknown as { subscription?: string | Stripe.Subscription | null }).subscription;
  if (typeof legacySubscription === "string") return legacySubscription;
  if (legacySubscription && typeof legacySubscription === "object") return legacySubscription.id;

  const parentSubscription =
    (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | null } | null } | null })
      .parent?.subscription_details?.subscription;
  return parentSubscription ?? null;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function getScheduleSubscriptionId(schedule: Stripe.SubscriptionSchedule): string | null {
  const subscription = schedule.subscription;
  if (typeof subscription === "string") return subscription;
  if (subscription && typeof subscription === "object") return subscription.id;
  return null;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function resolveSubscriptionEntitlement(
  supabase: SupabaseAdminClient,
  sub: Stripe.Subscription,
): Promise<SubscriptionEntitlement> {
  if (shouldSkipProfileEntitlementSync(sub)) return null;
  const item = firstSubscriptionItem(sub);
  const priceId = item?.price?.id ?? null;
  const productId = typeof item?.price?.product === "string" ? item.price.product : null;
  if (!productId) return null;

  const metadataPlan = (sub.metadata?.plan_key ?? sub.metadata?.plan ?? "") as string;
  const { data } = await supabase
    .from("pricing_configs")
    .select("key, audience, module, metadata")
    .eq("is_active", true);

  const rows = (data ?? []) as PricingConfigRow[];
  const row = rows.find((candidate) => {
    if (
      !["user_subscription", "agent_subscription", "developer_subscription", "professional_subscription"]
        .includes(candidate.module ?? "")
    ) {
      return false;
    }
    const meta = candidate.metadata ?? {};
    const matchesProductOrPrice = meta.stripe_product_id === productId || meta.stripe_price_id === priceId;
    if (metadataPlan) {
      return candidate.key === metadataPlan && matchesProductOrPrice;
    }
    return matchesProductOrPrice;
  });
  const audience = normalizeAudience(row?.audience ?? sub.metadata?.audience ?? null);
  if (!row?.key || !audience) return null;

  return {
    planKey: row.key,
    audience,
    role: normalizeAudience(sub.metadata?.role as string | undefined) ?? audience,
    productId,
  };
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function syncSubscription(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  sub: Stripe.Subscription,
) {
  if (shouldSkipProfileEntitlementSync(sub)) {
    log.info("skipping profile entitlement sync for add-on subscription", {
      sub_id: sub.id,
      addon_key: sub.metadata?.addon_key ?? null,
    });
    return;
  }

  const customerId = sub.customer as string;
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  const filter = resolveProfileFilter(customer);
  if (!filter) {
    log.warn("customer has no user_id metadata or email", { customer_id: customerId });
    return;
  }

  const hasAccess = hasProvisionedSubscriptionAccess(sub.status);
  const shouldRevoke = shouldRevokeSubscriptionAccess(sub.status);
  const userId = customer.metadata?.user_id as string | undefined
    ?? await resolveUserIdByEmail(supabase, customer.email ?? null);
  const hasManualAccess = shouldRevoke && userId
    ? await hasManualProAccess(supabase, userId)
    : false;
  const entitlement = hasAccess ? await resolveSubscriptionEntitlement(supabase, sub) : null;
  const productId = entitlement?.productId ?? null;

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_product_id: productId })
    .eq(filter.column, filter.value);

  if (error) {
    log.error("failed to update profile", { filter, err: String(error.message ?? error) });
  } else {
    log.info("updated profile subscription", {
      filter,
      product_id: productId,
      status: sub.status,
      plan_key: entitlement?.planKey,
      audience: entitlement?.audience,
    });
  }

  // Promote the matching professionals row to 'pro' when the subscription is
  // a professional plan. The plan key is propagated via subscription_data.metadata
  // by create-checkout. The BEFORE UPDATE trigger
  // public.professionals_guard_subscription_tier permits service-role writes
  // because auth.uid() is NULL on edge-function calls without a user JWT.
  await syncProfessionalTier(supabase, sub, hasAccess || hasManualAccess, entitlement);

  if (shouldRevoke && userId && !hasManualAccess) {
    await applySubscriptionLapseControls(supabase, userId, sub.status);
  } else if (shouldRevoke && hasManualAccess) {
    log.info("terminal Stripe status received but manual/admin entitlement remains active", {
      user_id: userId,
      status: sub.status,
    });
  }
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function clearSubscription(
  supabase: SupabaseAdminClient,
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

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_product_id: null })
    .eq(filter.column, filter.value);

  if (error) {
    log.error("failed to clear subscription", { filter, err: String(error.message ?? error) });
  } else {
    log.info("cleared subscription", { filter });
  }

  const userId = customer.metadata?.user_id as string | undefined
    ?? await resolveUserIdByEmail(supabase, customer.email ?? null);

  if (!userId) return;

  if (await hasManualProAccess(supabase, userId)) {
    await syncProfessionalTier(supabase, sub, true, null);
    log.info("deleted Stripe subscription cleared product but kept manual/admin Pro access", {
      user_id: userId,
      sub_id: sub.id,
    });
    return;
  }

  // Demote any professional row owned by this customer back to 'free'.
  {
    const { error: profErr } = await supabase
      .from("professionals")
      .update({ subscription_tier: "free" })
      .eq("user_id", userId);
    if (profErr) {
      log.error("failed to clear professional tier", { user_id: userId, err: String(profErr.message ?? profErr) });
    }
  }

  await applySubscriptionLapseControls(supabase, userId, "deleted");
}

/** Update professionals.subscription_tier when the subscription is a professional plan. */
// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function syncProfessionalTier(
  supabase: SupabaseAdminClient,
  sub: Stripe.Subscription,
  isActive: boolean,
  entitlement: SubscriptionEntitlement,
) {
  const planKey = entitlement?.planKey ?? (sub.metadata?.plan_key ?? sub.metadata?.plan ?? "") as string;
  if (entitlement?.audience !== "professional" && !planKey.startsWith("professional_")) return;

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

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function syncInvoiceSubscription(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  invoice: Stripe.Invoice,
  eventType: string,
) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    log.info("invoice has no subscription to sync", {
      event_type: eventType,
      invoice_id: invoice.id,
      customer_id: invoice.customer ?? null,
    });
    return;
  }

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscription(supabase, stripe, sub);
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function hasManualProAccess(
  supabase: SupabaseAdminClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, is_platform_admin, force_pro_access")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    log.error("failed to check manual/admin Pro access", {
      user_id: userId,
      err: String(error.message ?? error),
    });
    return false;
  }

  const profile = data as {
    role?: string | null;
    is_platform_admin?: boolean | null;
    force_pro_access?: boolean | null;
  } | null;
  return Boolean(
    profile?.force_pro_access ||
      profile?.is_platform_admin ||
      profile?.role === "admin",
  );
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function applySubscriptionLapseControls(
  supabase: SupabaseAdminClient,
  userId: string,
  status: string,
) {
  const { data, error } = await supabase.rpc("apply_subscription_lapse_controls", {
    p_user_id: userId,
  });

  if (error) {
    log.error("subscription lapse controls failed", {
      user_id: userId,
      status,
      err: String(error.message ?? error),
    });
    return;
  }

  log.info("subscription lapse controls applied", {
    user_id: userId,
    status,
    result: data ?? null,
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function resolveUserIdByEmail(
  supabase: SupabaseAdminClient,
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

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function errorResponse(message: string, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Agent "Data Input" discount.
 *
 * On invoice.created (Stripe creates a draft renewal invoice ~1h before
 * billing), check whether the customer's user has accumulated verified
 * data-input entries that have not yet been credited. If so, mark them
 * applied via the SECURITY DEFINER RPC and post a one-off negative
 * invoice_item to the draft invoice equal to subtotal × pct.
 *
 * Caps:
 *   - Each verified entry yields 0.5% off (server-side constant).
 *   - The DB RPC selects at most MAX_PER_MONTH (=20) entries per call,
 *     i.e. at most 10% off any single invoice.
 *
 * Skipped when:
 *   - Invoice is not a draft (already finalised — too late).
 *   - billing_reason is "subscription_create" (initial signup, no prior
 *     verified inputs are possible yet).
 *   - Customer has no user_id metadata.
 */
// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function applyAgentDataInputDiscount(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<void> {
  if (invoice.status && invoice.status !== "draft") return;
  if (!invoice.id || !invoice.customer) return;
  // Skip initial signup invoices — no prior verified inputs are possible yet.
  if ((invoice as unknown as Record<string, unknown>).billing_reason === "subscription_create") return;

  const customer = await stripe.customers.retrieve(invoice.customer as string) as Stripe.Customer;
  const userId = customer.metadata?.user_id ?? await resolveUserIdByEmail(supabase, customer.email ?? null);
  if (!userId) {
    log.info("invoice.created: cannot resolve user_id, skipping data input discount", { invoice_id: invoice.id });
    return;
  }

  const { data, error } = await supabase.rpc("apply_verified_data_input_discount", {
    p_user_id: userId,
    p_invoice_id: invoice.id,
  });
  if (error) {
    log.error("apply_verified_data_input_discount rpc failed", { user_id: userId, invoice_id: invoice.id, err: String(error.message ?? error) });
    return;
  }

  const row = (Array.isArray(data) ? data[0] : data) as { applied_count?: number; applied_pct?: number | string } | null;
  const appliedCount = Number(row?.applied_count ?? 0);
  const appliedPct = Number(row?.applied_pct ?? 0);
  if (!appliedCount || appliedPct <= 0) {
    log.info("no verified data inputs to apply", { user_id: userId, invoice_id: invoice.id });
    return;
  }

  // Compute discount on the current pre-tax subtotal of the invoice. We round
  // toward the nearest cent. Stripe expects integer minor units.
  const subtotalMinor = invoice.subtotal ?? 0;
  if (subtotalMinor <= 0) {
    log.warn("invoice subtotal non-positive — skipping discount", { invoice_id: invoice.id, subtotal: subtotalMinor });
    return;
  }
  const discountMinor = Math.round((subtotalMinor * appliedPct) / 100);
  if (discountMinor <= 0) return;

  try {
    await stripe.invoiceItems.create({
      customer: invoice.customer as string,
      invoice: invoice.id,
      amount: -discountMinor, // negative = credit
      currency: invoice.currency,
      description: `Data Input reward — ${appliedCount} verified closing(s) × 0.5% (${appliedPct}% off)`,
      metadata: {
        type: "agent_data_input_discount",
        user_id: userId,
        applied_count: String(appliedCount),
        applied_pct: String(appliedPct),
      },
    });
  } catch (stripeErr: unknown) {
    // Stripe call failed — roll back the DB rows so they remain eligible
    // for the next invoice cycle instead of being permanently lost.
    log.error("stripe invoiceItem create failed, rolling back DB", {
      user_id: userId,
      invoice_id: invoice.id,
      err: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rollbackErr } = await (supabase.from as any)("agent_data_inputs")
      .update({ discount_applied: false, discount_applied_at: null, discount_invoice_id: null })
      .eq("user_id", userId)
      .eq("discount_invoice_id", invoice.id);
    if (rollbackErr) {
      log.error("CRITICAL: rollback of discount rows failed — credits permanently lost", {
        user_id: userId,
        invoice_id: invoice.id,
        err: String(rollbackErr.message ?? rollbackErr),
      });
    }
    return;
  }

  log.info("applied agent data input discount", {
    user_id: userId,
    invoice_id: invoice.id,
    applied_count: appliedCount,
    applied_pct: appliedPct,
    discount_minor: discountMinor,
  });
}
