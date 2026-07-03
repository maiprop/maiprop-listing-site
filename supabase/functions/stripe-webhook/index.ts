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

import Stripe from "npm:stripe@22.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  hasProvisionedSubscriptionAccess,
  shouldRevokeSubscriptionAccess,
} from "../_shared/subscriptionStatus.ts";
import {
  beginStripeWebhookEvent,
  finishStripeWebhookEvent,
  stripeRuntimeModeFromLivemode,
  upsertBillingCustomer,
  upsertBillingSubscription,
} from "../_shared/billingState.ts";
import {
  createStripeClient,
  ensureSubscriptionCompanyInvoiceSettings,
} from "../_shared/stripeClient.ts";
import { pricingConfigMatchesStripeItem } from "../_shared/entitlements.ts";
import { SELF_SERVE_ADDON_CREDITS } from "../create-checkout/constants.ts";
import { shouldSkipProfileEntitlementSync } from "./addonGuard.ts";

const log = createLogger("stripe-webhook");

type PricingConfigRow = {
  key?: string | null;
  audience?: string | null;
  module?: string | null;
  metadata?: {
    stripe_price_id?: string | null;
    stripe_price_id_monthly?: string | null;
    stripe_monthly_price_id?: string | null;
    stripe_price_id_annual?: string | null;
    stripe_annual_price_id?: string | null;
    stripe_price_id_yearly?: string | null;
    stripe_yearly_price_id?: string | null;
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return errorResponse("Missing stripe-signature header", 400, corsHeaders);
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey) {
    return errorResponse("STRIPE_SECRET_KEY not set", 500, corsHeaders);
  }
  if (!webhookSecret) {
    return errorResponse("STRIPE_WEBHOOK_SECRET not set", 500, corsHeaders);
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse("Supabase env not set", 500, corsHeaders);
  }

  const body = await req.text();
  const stripe = createStripeClient(stripeKey);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );
  } catch (err: unknown) {
    log.error("signature verification failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return errorResponse("Webhook signature invalid", 400, corsHeaders);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  }) as unknown as SupabaseAdminClient;

  log.info("event received", { event_type: event.type });

  try {
    const eventStart = await beginStripeWebhookEvent(supabase, event);
    if (eventStart === "in_progress") {
      log.info("webhook event already processing", {
        event_id: event.id,
        event_type: event.type,
      });
      return new Response(
        JSON.stringify({ received: false, retry: true, in_progress: true }),
        {
          status: 503,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": "30",
          },
        },
      );
    }
    if (eventStart === "duplicate") {
      log.info("webhook event already handled", {
        event_id: event.id,
        event_type: event.type,
      });
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.paused":
      case "customer.subscription.pending_update_applied":
      case "customer.subscription.pending_update_expired":
      case "customer.subscription.resumed": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(supabase, stripe, sub);
        await syncSubscriptionTrialStatus(supabase, sub);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await clearSubscription(supabase, stripe, sub);
        await syncSubscriptionTrialStatus(supabase, sub);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await syncInvoiceSubscription(
          supabase,
          stripe,
          invoice,
          "invoice.payment_failed",
        );
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
        if (await fulfillAddonCheckoutSession(supabase, session)) {
          log.info("checkout.session.completed fulfilled add-on", {
            session_id: session.id,
            addon_key: session.metadata?.addon_key ?? null,
          });
          break;
        }
        if (await activateInvestorPaymentSession(supabase, session)) {
          log.info("checkout.session.completed activated investor payment", {
            session_id: session.id,
            plan_key: session.metadata?.plan_key ?? null,
          });
          break;
        }
        if (session.subscription && session.customer) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string,
          );
          await syncSubscription(supabase, stripe, sub);
          await syncSubscriptionTrialClaim(supabase, session, sub);
          log.info("checkout.session.completed synced subscription", {
            session_id: session.id,
            customer_id: session.customer,
          });
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (await expireAbandonedTrialCheckoutSession(supabase, session)) {
          log.info("checkout.session.expired released trial reservation", {
            session_id: session.id,
          });
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await syncAddonRefund(supabase, stripe, charge);
        break;
      }

      case "refund.created":
      case "refund.updated": {
        const refund = event.data.object as Stripe.Refund;
        await syncAddonRefund(supabase, stripe, refund);
        break;
      }

      case "credit_note.created": {
        const creditNote = event.data.object as Stripe.CreditNote;
        await syncAddonCreditNoteRefund(supabase, creditNote);
        break;
      }

      case "invoice.payment_succeeded": {
        // Fires on every successful recurring charge. Re-sync to handle plan upgrades
        // where the subscription object may already be updated before this fires.
        const invoice = event.data.object as Stripe.Invoice;
        await syncInvoiceSubscription(
          supabase,
          stripe,
          invoice,
          "invoice.payment_succeeded",
        );
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
    await finishStripeWebhookEvent(supabase, event.id, "processed");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("handler error", { event_type: event.type, err: msg });
    try {
      await finishStripeWebhookEvent(supabase, event.id, "failed", msg);
    } catch (finishErr: unknown) {
      log.error("failed to mark webhook event failed", {
        event_id: event.id,
        err: finishErr instanceof Error ? finishErr.message : String(finishErr),
      });
    }
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
 *  Only metadata.user_id is trusted for entitlement writes. */
// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function resolveProfileFilter(
  customer: Stripe.Customer,
): { column: string; value: string } | null {
  const userId = customer.metadata?.user_id;
  if (userId) return { column: "user_id", value: userId };
  return null;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function normalizeAudience(raw: string | null | undefined): string | null {
  if (
    raw === "buyer" || raw === "seller" || raw === "participant" ||
    raw === "pro"
  ) return "participant";
  if (
    raw === "agent" || raw === "developer" || raw === "professional" ||
    raw === "investor" || raw === "institutional"
  ) {
    return raw;
  }
  return null;
}

function investorTierFromPlanKey(
  planKey: string | null | undefined,
): string | null {
  if (planKey === "investor_private") return "private";
  if (planKey === "investor_institutional") return "institutional";
  return null;
}

function isPaidCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid";
}

export function investorPaymentAccessPeriodDays(
  metadata: Stripe.Metadata | null | undefined,
): number {
  const parsed = Number(metadata?.access_period_days ?? 365);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3660) return 365;
  return parsed;
}

export function investorPaymentExpiresAt(
  activatedAt: Date,
  metadata: Stripe.Metadata | null | undefined,
): Date {
  const expiresAt = new Date(activatedAt.getTime());
  expiresAt.setUTCDate(
    expiresAt.getUTCDate() + investorPaymentAccessPeriodDays(metadata),
  );
  return expiresAt;
}

function normalizePositiveQuantity(raw: string | null | undefined): number {
  const parsed = Number(raw ?? 1);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw new Error("addon checkout session has invalid quantity metadata");
  }
  return parsed;
}

function normalizeAddonCheckoutMode(
  mode: Stripe.Checkout.Session.Mode | null,
): "payment" | "subscription" {
  if (mode === "payment" || mode === "subscription") return mode;
  throw new Error("addon checkout session has unsupported checkout mode");
}

export function addonPurchaseStatusForSubscription(
  sub: Pick<Stripe.Subscription, "status">,
): "active" | "cancelled" {
  return hasProvisionedSubscriptionAccess(sub.status) ? "active" : "cancelled";
}

async function syncAddonSubscriptionLifecycle(
  supabase: SupabaseAdminClient,
  sub: Stripe.Subscription,
): Promise<boolean> {
  if (!shouldSkipProfileEntitlementSync(sub)) return false;

  const status = addonPurchaseStatusForSubscription(sub);
  const { error } = await supabase
    .from("addon_purchases")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", sub.id);

  if (error) throw error;
  log.info("synced add-on subscription lifecycle", {
    sub_id: sub.id,
    addon_key: sub.metadata?.addon_key ?? null,
    stripe_status: sub.status,
    addon_status: status,
  });
  return true;
}

export function addonCreditsGranted(
  addonKey: string,
  quantity: number,
): number {
  const units = SELF_SERVE_ADDON_CREDITS[addonKey];
  if (!units) {
    throw new Error(`unsupported self-serve add-on key: ${addonKey}`);
  }
  return units * quantity;
}

type AddonRefundInput = {
  refundId: string;
  chargeId: string | null;
  paymentIntentId: string | null;
  totalAmount: number | null;
  refundedAmount: number | null;
  livemode: boolean;
  metadata: Stripe.Metadata | Record<string, string>;
  status?: string | null;
};

export function addonRefundCreditsForAmount(
  creditsGranted: number,
  totalAmount: number | null | undefined,
  refundedAmount: number | null | undefined,
): number {
  if (creditsGranted <= 0) return 0;
  if (!totalAmount || totalAmount <= 0 || !refundedAmount || refundedAmount <= 0) {
    return 0;
  }
  return Math.min(
    creditsGranted,
    Math.ceil((creditsGranted * refundedAmount) / totalAmount),
  );
}

function addonRefundStatus(
  creditsRefunded: number,
  creditsGranted: number,
  stripeStatus?: string | null,
): "none" | "partial_refund" | "refunded" | "failed" {
  if (stripeStatus === "failed") return "failed";
  if (creditsRefunded <= 0) return "none";
  if (creditsRefunded >= creditsGranted) return "refunded";
  return "partial_refund";
}

function objectId(
  value:
    | string
    | { id?: string | null }
    | null
    | undefined,
): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

async function retrieveRefundCharge(
  stripe: Stripe,
  refund: Stripe.Refund,
): Promise<Stripe.Charge | null> {
  const embedded = typeof refund.charge === "object" && refund.charge
    ? refund.charge as Stripe.Charge
    : null;
  if (embedded?.id && embedded.amount != null) return embedded;
  const chargeId = objectId(refund.charge as string | Stripe.Charge | null);
  return chargeId ? await stripe.charges.retrieve(chargeId) : null;
}

async function retrievePaymentIntentMetadata(
  stripe: Stripe,
  paymentIntentId: string | null,
): Promise<Stripe.Metadata> {
  if (!paymentIntentId) return {};
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent.metadata ?? {};
}

async function addonRefundInputFromCharge(
  stripe: Stripe,
  charge: Stripe.Charge,
): Promise<AddonRefundInput> {
  const paymentIntentId = objectId(
    charge.payment_intent as string | Stripe.PaymentIntent | null,
  );
  const paymentIntentMetadata = await retrievePaymentIntentMetadata(
    stripe,
    paymentIntentId,
  );
  return {
    refundId: typeof charge.refunds?.data?.at(-1)?.id === "string"
      ? charge.refunds.data.at(-1)!.id
      : `charge_refunded:${charge.id}:${charge.amount_refunded ?? 0}`,
    chargeId: charge.id,
    paymentIntentId,
    totalAmount: Number(charge.amount ?? 0),
    refundedAmount: Number(charge.amount_refunded ?? 0),
    livemode: Boolean(charge.livemode),
    metadata: { ...paymentIntentMetadata, ...(charge.metadata ?? {}) },
    status: charge.amount_refunded && charge.amount_refunded > 0
      ? "succeeded"
      : null,
  };
}

async function addonRefundInputFromRefund(
  stripe: Stripe,
  refund: Stripe.Refund,
): Promise<AddonRefundInput> {
  const charge = await retrieveRefundCharge(stripe, refund);
  const paymentIntentId = objectId(
    (refund as Stripe.Refund & {
      payment_intent?: string | Stripe.PaymentIntent | null;
    }).payment_intent ??
      (charge?.payment_intent as string | Stripe.PaymentIntent | null),
  );
  const paymentIntentMetadata = await retrievePaymentIntentMetadata(
    stripe,
    paymentIntentId,
  );
  return {
    refundId: refund.id,
    chargeId: objectId(refund.charge as string | Stripe.Charge | null) ??
      charge?.id ?? null,
    paymentIntentId,
    totalAmount: charge?.amount ? Number(charge.amount) : null,
    refundedAmount: charge?.amount_refunded
      ? Number(charge.amount_refunded)
      : Number(refund.amount ?? 0),
    livemode: Boolean((refund as Stripe.Refund & { livemode?: boolean }).livemode),
    metadata: { ...paymentIntentMetadata, ...(refund.metadata ?? {}) },
    status: refund.status ?? null,
  };
}

async function findAddonPurchaseForRefund(
  supabase: SupabaseAdminClient,
  input: AddonRefundInput,
): Promise<Record<string, unknown> | null> {
  const select = [
    "id",
    "user_id",
    "addon_key",
    "checkout_mode",
    "status",
    "credits_granted",
    "credits_consumed",
    "credits_refunded",
    "stripe_payment_intent_id",
    "metadata",
  ].join(",");

  if (input.paymentIntentId) {
    const { data, error } = await supabase
      .from("addon_purchases")
      .select(select)
      .eq("stripe_payment_intent_id", input.paymentIntentId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const sessionId = input.metadata?.stripe_session_id ??
    input.metadata?.checkout_session_id;
  if (sessionId) {
    const { data, error } = await supabase
      .from("addon_purchases")
      .select(select)
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const userId = input.metadata?.user_id;
  const addonKey = input.metadata?.addon_key;
  if (!userId || !addonKey) return null;

  const { data, error } = await supabase
    .from("addon_purchases")
    .select(select)
    .eq("user_id", userId)
    .eq("addon_key", addonKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function applyAddonRefund(
  supabase: SupabaseAdminClient,
  input: AddonRefundInput,
): Promise<boolean> {
  if (input.metadata?.checkout_type !== "addon" && !input.paymentIntentId) {
    return false;
  }

  const purchase = await findAddonPurchaseForRefund(supabase, input);
  if (!purchase?.id) {
    log.warn("refund did not match an add-on purchase", {
      refund_id: input.refundId,
      charge_id: input.chargeId,
      payment_intent_id: input.paymentIntentId,
      addon_key: input.metadata?.addon_key ?? null,
    });
    return false;
  }

  const creditsGranted = Number(purchase.credits_granted ?? 0);
  const creditsRefunded = input.status === "failed"
    ? Number(purchase.credits_refunded ?? 0)
    : addonRefundCreditsForAmount(
      creditsGranted,
      input.totalAmount,
      input.refundedAmount,
    );
  const refundStatus = addonRefundStatus(
    creditsRefunded,
    creditsGranted,
    input.status,
  );
  const patch: Record<string, unknown> = {
    credits_refunded: creditsRefunded,
    refund_status: refundStatus,
    last_refund_id: input.refundId,
    refunded_at: new Date().toISOString(),
    runtime_mode: stripeRuntimeModeFromLivemode(input.livemode),
    livemode: Boolean(input.livemode),
    updated_at: new Date().toISOString(),
  };
  if (input.paymentIntentId && !purchase.stripe_payment_intent_id) {
    patch.stripe_payment_intent_id = input.paymentIntentId;
  }
  if (refundStatus === "refunded") {
    patch.status = "refunded";
  }

  const { error } = await supabase
    .from("addon_purchases")
    .update(patch)
    .eq("id", purchase.id);
  if (error) throw error;
  log.info("synced add-on refund", {
    refund_id: input.refundId,
    purchase_id: purchase.id,
    credits_refunded: creditsRefunded,
    refund_status: refundStatus,
  });
  return true;
}

// skipcq: JS-0067 - Top-level helper is used by the webhook switch.
async function syncAddonRefund(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  object: Stripe.Charge | Stripe.Refund,
): Promise<boolean> {
  const input = object.object === "charge"
    ? await addonRefundInputFromCharge(stripe, object as Stripe.Charge)
    : await addonRefundInputFromRefund(stripe, object as Stripe.Refund);
  return await applyAddonRefund(supabase, input);
}

async function syncAddonCreditNoteRefund(
  supabase: SupabaseAdminClient,
  creditNote: Stripe.CreditNote,
): Promise<boolean> {
  const metadata = creditNote.metadata ?? {};
  if (metadata.checkout_type !== "addon") return false;
  const amount = Math.abs(
    Number(
      (creditNote as Stripe.CreditNote & { amount?: number | null }).amount ??
        creditNote.total ?? 0,
    ),
  );
  return await applyAddonRefund(supabase, {
    refundId: creditNote.id,
    chargeId: null,
    paymentIntentId: metadata.payment_intent_id ?? null,
    totalAmount: Number(metadata.amount_total ?? metadata.total_amount ?? amount),
    refundedAmount: amount,
    livemode: Boolean(creditNote.livemode),
    metadata,
    status: "succeeded",
  });
}

async function addonCheckoutProfileExists(
  supabase: SupabaseAdminClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.user_id);
}

// skipcq: JS-0067 - Top-level helper is used by the webhook switch.
async function fulfillAddonCheckoutSession(
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  const metadata = session.metadata ?? {};
  if (metadata.checkout_type !== "addon") return false;
  if (!isPaidCheckoutSession(session)) return true;

  const userId = metadata.user_id;
  const addonKey = metadata.addon_key;
  const module = metadata.module;
  const audience = metadata.audience;
  const unit = metadata.unit;
  if (!userId || !addonKey || !module || !audience || !unit) {
    throw new Error("addon checkout session missing required metadata");
  }
  if (!(await addonCheckoutProfileExists(supabase, userId))) {
    log.warn("orphaned add-on checkout session", {
      session_id: session.id,
      user_id: userId,
      addon_key: addonKey,
    });
    return true;
  }
  const checkoutMode = normalizeAddonCheckoutMode(session.mode);
  const quantity = normalizePositiveQuantity(metadata.quantity);
  const stripePaymentIntentId = objectId(
    session.payment_intent as string | Stripe.PaymentIntent | null,
  );

  const { error } = await supabase
    .from("addon_purchases")
    .upsert({
      user_id: userId,
      addon_key: addonKey,
      module,
      audience,
      unit,
      quantity,
      checkout_mode: checkoutMode,
      status: checkoutMode === "subscription" ? "active" : "paid",
      stripe_session_id: session.id,
      stripe_subscription_id: typeof session.subscription === "string"
        ? session.subscription
        : null,
      stripe_customer_id: typeof session.customer === "string"
        ? session.customer
        : null,
      stripe_payment_intent_id: stripePaymentIntentId,
      credits_granted: addonCreditsGranted(addonKey, quantity),
      runtime_mode: stripeRuntimeModeFromLivemode(Boolean(session.livemode)),
      livemode: Boolean(session.livemode),
      metadata: {
        ...metadata,
        ...(stripePaymentIntentId
          ? { payment_intent_id: stripePaymentIntentId }
          : {}),
      },
    }, { onConflict: "stripe_session_id" });

  if (error) throw error;
  return true;
}

// skipcq: JS-0067 - Top-level helper is used by the webhook switch.
async function activateInvestorPaymentSession(
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  const metadata = session.metadata ?? {};
  if (metadata.checkout_type !== "investor_payment") return false;
  if (!isPaidCheckoutSession(session)) return true;

  const userId = metadata.user_id;
  const tier = investorTierFromPlanKey(metadata.plan_key);
  if (!userId || !tier) {
    throw new Error(
      "investor payment session missing user_id or supported plan_key",
    );
  }
  const activatedAt = new Date();
  const activatedAtIso = activatedAt.toISOString();

  const { data, error } = await supabase
    .from("investor_subscriptions")
    .update({
      status: "active",
      started_at: activatedAtIso,
      expires_at: investorPaymentExpiresAt(activatedAt, metadata).toISOString(),
      updated_at: activatedAtIso,
      activated_at: activatedAtIso,
      stripe_customer_id: typeof session.customer === "string"
        ? session.customer
        : null,
      stripe_session_id: session.id,
      runtime_mode: stripeRuntimeModeFromLivemode(Boolean(session.livemode)),
      livemode: Boolean(session.livemode),
    })
    .eq("user_id", userId)
    .eq("tier", tier)
    .eq("stripe_session_id", session.id)
    .eq("status", "pending_payment")
    .select("id, status, stripe_session_id")
    .maybeSingle();

  if (error) throw error;
  if (data) return true;

  const { data: existing, error: existingError } = await supabase
    .from("investor_subscriptions")
    .select("id, status, stripe_session_id")
    .eq("user_id", userId)
    .eq("tier", tier)
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return true;

  throw new Error(
    "investor payment session has no matching pending subscription",
  );
}

type SubscriptionTrialClaimStatus =
  | "checkout_created"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

function isSubscriptionTrialMetadata(
  metadata: Stripe.Metadata | null | undefined,
): boolean {
  return metadata?.checkout_type === "subscription_trial";
}

export function mapSubscriptionTrialStatus(
  status: string | null | undefined,
): SubscriptionTrialClaimStatus {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due") return "past_due";
  if (status === "canceled") return "canceled";
  if (shouldRevokeSubscriptionAccess(status)) return "expired";
  if (hasProvisionedSubscriptionAccess(status)) return "active";
  return "checkout_created";
}

async function updateSubscriptionTrialClaim(
  supabase: SupabaseAdminClient,
  userId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  let query = supabase
    .from("subscription_trial_claims")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (payload.stripe_checkout_session_id) {
    query = query.eq(
      "stripe_checkout_session_id",
      payload.stripe_checkout_session_id,
    );
  } else if (payload.stripe_subscription_id) {
    query = query.eq("stripe_subscription_id", payload.stripe_subscription_id);
  } else {
    query = query.in("status", [
      "checkout_started",
      "checkout_created",
      "trialing",
      "active",
      "past_due",
    ]);
  }
  const { error } = await query;
  if (error) throw error;
}

// skipcq: JS-0067 - Top-level helper is used by the webhook switch.
async function syncSubscriptionTrialClaim(
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
  sub: Stripe.Subscription | null,
): Promise<void> {
  const sessionMetadata = session.metadata ?? {};
  const subscriptionMetadata = sub?.metadata ?? {};
  if (
    !isSubscriptionTrialMetadata(sessionMetadata) &&
    !isSubscriptionTrialMetadata(subscriptionMetadata)
  ) {
    return;
  }

  const userId = subscriptionMetadata.user_id ?? sessionMetadata.user_id;
  if (!userId) {
    throw new Error("subscription trial checkout missing user_id metadata");
  }

  await updateSubscriptionTrialClaim(supabase, userId, {
    status: sub ? mapSubscriptionTrialStatus(sub.status) : "checkout_created",
    stripe_checkout_session_id: session.id,
    stripe_subscription_id: sub?.id ??
      (typeof session.subscription === "string" ? session.subscription : null),
    stripe_customer_id: typeof session.customer === "string"
      ? session.customer
      : null,
    runtime_mode: stripeRuntimeModeFromLivemode(Boolean(session.livemode)),
    livemode: Boolean(session.livemode),
    metadata: {
      ...sessionMetadata,
      ...subscriptionMetadata,
    },
  });
}

// skipcq: JS-0067 - Top-level helper is used by the webhook switch.
async function expireAbandonedTrialCheckoutSession(
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  const metadata = session.metadata ?? {};
  if (!isSubscriptionTrialMetadata(metadata)) return false;
  const { error } = await supabase
    .from("subscription_trial_claims")
    .update({
      status: "expired",
      runtime_mode: stripeRuntimeModeFromLivemode(Boolean(session.livemode)),
      livemode: Boolean(session.livemode),
      updated_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        checkout_expired_at: new Date().toISOString(),
      },
    })
    .eq("stripe_checkout_session_id", session.id)
    .in("status", ["checkout_started", "checkout_created"]);
  if (error) throw error;
  return true;
}

// skipcq: JS-0067 - Top-level helper is used by subscription lifecycle events.
async function syncSubscriptionTrialStatus(
  supabase: SupabaseAdminClient,
  sub: Stripe.Subscription,
): Promise<void> {
  const metadata = sub.metadata ?? {};
  if (!isSubscriptionTrialMetadata(metadata)) return;

  const userId = metadata.user_id;
  if (!userId) {
    throw new Error("subscription trial subscription missing user_id metadata");
  }

  await updateSubscriptionTrialClaim(supabase, userId, {
    status: mapSubscriptionTrialStatus(sub.status),
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : null,
    runtime_mode: stripeRuntimeModeFromLivemode(Boolean(sub.livemode)),
    livemode: Boolean(sub.livemode),
    metadata,
  });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function firstSubscriptionItem(sub: Stripe.Subscription) {
  return sub.items.data[0] ?? null;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacySubscription = (invoice as unknown as {
    subscription?: string | Stripe.Subscription | null;
  }).subscription;
  if (typeof legacySubscription === "string") return legacySubscription;
  if (legacySubscription && typeof legacySubscription === "object") {
    return legacySubscription.id;
  }

  const parentSubscription = (invoice as unknown as {
    parent?: {
      subscription_details?: { subscription?: string | null } | null;
    } | null;
  })
    .parent?.subscription_details?.subscription;
  return parentSubscription ?? null;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function getScheduleSubscriptionId(
  schedule: Stripe.SubscriptionSchedule,
): string | null {
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
  const product = item?.price?.product;
  const productId = typeof product === "string" ? product : product?.id ?? null;
  if (!productId) return null;

  const metadataPlan =
    (sub.metadata?.plan_key ?? sub.metadata?.plan ?? "") as string;
  const { data } = await supabase
    .from("pricing_configs")
    .select("key, audience, module, metadata")
    .eq("is_active", true);

  const rows = (data ?? []) as PricingConfigRow[];
  const row = rows.find((candidate) => {
    if (
      ![
        "user_subscription",
        "agent_subscription",
        "developer_subscription",
        "professional_subscription",
      ]
        .includes(candidate.module ?? "")
    ) {
      return false;
    }
    const matchesProductOrPrice = pricingConfigMatchesStripeItem(candidate, {
      productId,
      priceId,
    });
    if (metadataPlan) {
      return candidate.key === metadataPlan && matchesProductOrPrice;
    }
    return matchesProductOrPrice;
  });
  const audience = normalizeAudience(
    row?.audience ?? sub.metadata?.audience ?? null,
  );
  if (!row?.key || !audience) return null;

  return {
    planKey: row.key,
    audience,
    role: normalizeAudience(sub.metadata?.role as string | undefined) ??
      audience,
    productId,
  };
}

export async function findProvisionedReplacementSubscription(
  stripe: Stripe,
  customerId: string,
  deletedSubscriptionId: string,
): Promise<Stripe.Subscription | null> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  return subscriptions.data.find((candidate) =>
    candidate.id !== deletedSubscriptionId &&
    !shouldSkipProfileEntitlementSync(candidate) &&
    hasProvisionedSubscriptionAccess(candidate.status)
  ) ?? null;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function syncSubscription(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  sub: Stripe.Subscription,
) {
  try {
    sub = await ensureSubscriptionCompanyInvoiceSettings(stripe, sub);
  } catch (err: unknown) {
    log.error("failed to stamp subscription invoice settings", {
      sub_id: sub.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  if (await syncAddonSubscriptionLifecycle(supabase, sub)) {
    return;
  }

  const customerId = sub.customer as string;
  const customer = await stripe.customers.retrieve(
    customerId,
  ) as Stripe.Customer;
  const filter = resolveProfileFilter(customer);
  if (!filter) {
    log.warn("customer has no user_id metadata or email", {
      customer_id: customerId,
    });
    return;
  }

  const hasAccess = hasProvisionedSubscriptionAccess(sub.status);
  const shouldRevoke = shouldRevokeSubscriptionAccess(sub.status);
  const userId = customer.metadata?.user_id as string | undefined;
  if (userId) {
    await upsertBillingCustomer(supabase, {
      userId,
      stripeCustomerId: customerId,
      email: customer.email ?? null,
      livemode: sub.livemode,
      metadata: customer.metadata ?? {},
    });
    await upsertBillingSubscription(supabase, {
      userId,
      stripeCustomerId: customerId,
      subscription: sub,
    });
  }
  const hasManualAccess = shouldRevoke && userId
    ? await hasManualProAccess(supabase, userId)
    : false;
  const entitlement = hasAccess
    ? await resolveSubscriptionEntitlement(supabase, sub)
    : null;
  const productId = entitlement?.productId ?? null;

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_product_id: productId })
    .eq(filter.column, filter.value);

  if (error) {
    log.error("failed to update profile", {
      filter,
      err: String(error.message ?? error),
    });
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
  await syncProfessionalTier(
    supabase,
    sub,
    hasAccess || hasManualAccess,
    entitlement,
  );

  if (shouldRevoke && userId && !hasManualAccess) {
    await applySubscriptionLapseControls(supabase, userId, sub.status);
  } else if (shouldRevoke && hasManualAccess) {
    log.info(
      "terminal Stripe status received but manual/admin entitlement remains active",
      {
        user_id: userId,
        status: sub.status,
      },
    );
  }
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function clearSubscription(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  sub: Stripe.Subscription,
) {
  if (await syncAddonSubscriptionLifecycle(supabase, sub)) {
    return;
  }

  const customerId = sub.customer as string;
  const customer = await stripe.customers.retrieve(
    customerId,
  ) as Stripe.Customer;
  const filter = resolveProfileFilter(customer);
  if (!filter) {
    log.warn("customer has no user_id metadata or email", {
      customer_id: customerId,
    });
    return;
  }

  const userId = customer.metadata?.user_id as string | undefined;

  if (!userId) return;

  await upsertBillingCustomer(supabase, {
    userId,
    stripeCustomerId: customerId,
    email: customer.email ?? null,
    livemode: sub.livemode,
    metadata: customer.metadata ?? {},
  });
  await upsertBillingSubscription(supabase, {
    userId,
    stripeCustomerId: customerId,
    subscription: sub,
  });

  const replacement = await findProvisionedReplacementSubscription(
    stripe,
    customerId,
    sub.id,
  );
  if (replacement) {
    log.info(
      "deleted subscription has active replacement; syncing replacement",
      {
        user_id: userId,
        deleted_sub_id: sub.id,
        replacement_sub_id: replacement.id,
        replacement_status: replacement.status,
      },
    );
    await syncSubscription(supabase, stripe, replacement);
    await syncSubscriptionTrialStatus(supabase, replacement);
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_product_id: null })
    .eq(filter.column, filter.value);

  if (error) {
    log.error("failed to clear subscription", {
      filter,
      err: String(error.message ?? error),
    });
  } else {
    log.info("cleared subscription", { filter });
  }

  if (await hasManualProAccess(supabase, userId)) {
    await syncProfessionalTier(supabase, sub, true, null);
    log.info(
      "deleted Stripe subscription cleared product but kept manual/admin Pro access",
      {
        user_id: userId,
        sub_id: sub.id,
      },
    );
    return;
  }

  // Demote any professional row owned by this customer back to 'free'.
  {
    const { error: profErr } = await supabase
      .from("professionals")
      .update({ subscription_tier: "free" })
      .eq("user_id", userId);
    if (profErr) {
      log.error("failed to clear professional tier", {
        user_id: userId,
        err: String(profErr.message ?? profErr),
      });
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
  const planKey = entitlement?.planKey ??
    (sub.metadata?.plan_key ?? sub.metadata?.plan ?? "") as string;
  if (
    entitlement?.audience !== "professional" &&
    !planKey.startsWith("professional_")
  ) return;

  const userId = (sub.metadata?.user_id ?? "") as string;
  if (!userId) {
    log.warn("professional plan subscription missing user_id metadata", {
      sub_id: sub.id,
    });
    return;
  }

  const tier = isActive ? "pro" : "free";
  const { error } = await supabase
    .from("professionals")
    .update({ subscription_tier: tier })
    .eq("user_id", userId);

  if (error) {
    log.error("failed to update professional tier", {
      user_id: userId,
      tier,
      err: String(error.message ?? error),
    });
  } else {
    log.info("updated professional tier", {
      user_id: userId,
      tier,
      plan_key: planKey,
    });
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
  await syncSubscriptionTrialStatus(supabase, sub);
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
  const { data, error } = await supabase.rpc(
    "apply_subscription_lapse_controls",
    {
      p_user_id: userId,
    },
  );

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
function errorResponse(
  message: string,
  status: number,
  corsHeaders: Record<string, string>,
) {
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
  if (
    (invoice as unknown as Record<string, unknown>).billing_reason ===
      "subscription_create"
  ) return;

  const customer = await stripe.customers.retrieve(
    invoice.customer as string,
  ) as Stripe.Customer;
  const userId = customer.metadata?.user_id ?? null;
  if (!userId) {
    log.info(
      "invoice.created: cannot resolve user_id, skipping data input discount",
      { invoice_id: invoice.id },
    );
    return;
  }

  const { data, error } = await supabase.rpc(
    "apply_verified_data_input_discount",
    {
      p_user_id: userId,
      p_invoice_id: invoice.id,
    },
  );
  if (error) {
    log.error("apply_verified_data_input_discount rpc failed", {
      user_id: userId,
      invoice_id: invoice.id,
      err: String(error.message ?? error),
    });
    return;
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    applied_count?: number;
    applied_pct?: number | string;
  } | null;
  const appliedCount = Number(row?.applied_count ?? 0);
  const appliedPct = Number(row?.applied_pct ?? 0);
  if (!appliedCount || appliedPct <= 0) {
    log.info("no verified data inputs to apply", {
      user_id: userId,
      invoice_id: invoice.id,
    });
    return;
  }

  // Compute discount on the current pre-tax subtotal of the invoice. We round
  // toward the nearest cent. Stripe expects integer minor units.
  const subtotalMinor = invoice.subtotal ?? 0;
  if (subtotalMinor <= 0) {
    log.warn("invoice subtotal non-positive — skipping discount", {
      invoice_id: invoice.id,
      subtotal: subtotalMinor,
    });
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
      description:
        `Data Input reward — ${appliedCount} verified closing(s) × 0.5% (${appliedPct}% off)`,
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
    const { error: rollbackErr } = await (supabase as any).from(
      "agent_data_inputs",
    )
      .update({
        discount_applied: false,
        discount_applied_at: null,
        discount_invoice_id: null,
        applied_to_invoice_at: null,
        stripe_credit_id: null,
        stripe_credit_amount_cents: null,
        stripe_credit_currency: null,
      })
      .eq("user_id", userId)
      .eq("discount_invoice_id", invoice.id);
    if (rollbackErr) {
      log.error(
        "CRITICAL: rollback of discount rows failed — credits permanently lost",
        {
          user_id: userId,
          invoice_id: invoice.id,
          err: String(rollbackErr.message ?? rollbackErr),
        },
      );
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
