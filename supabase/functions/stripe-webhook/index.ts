/**
 * Stripe webhook handler
 *
 * Handles subscription lifecycle events reactively so profiles stay in sync
 * without relying on client-side polling.
 *
 * Events handled:
 *   customer.subscription.created   â†’ mark pro
 *   customer.subscription.updated   â†’ update product / status
 *   customer.subscription.deleted   â†’ clear subscription
 *   invoice.created                  â†’ apply Agent Data Input discount to draft
 *   invoice.payment_failed           â†’ keep grace access, resync status
 */

import Stripe from "npm:stripe@22.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  reconcileTrialClaim,
  type TrialStore,
} from "../_shared/trialClaims.ts";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  hasProvisionedSubscriptionAccess,
  shouldRevokeSubscriptionAccess,
} from "../_shared/subscriptionStatus.ts";
import {
  beginStripeWebhookEvent,
  type BillingSubscriptionCanonical,
  type BillingSubscriptionObservation,
  finishStripeWebhookEvent,
  stripeRuntimeModeFromLivemode,
  type SupabaseAdminClient,
  upsertBillingCustomer,
  upsertBillingSubscription,
} from "../_shared/billingState.ts";
import {
  buildIdempotencyKey,
  createStripeClient,
  ensureSubscriptionCompanyInvoiceSettings,
  verifyStripeAccountIdentity,
} from "../_shared/stripeClient.ts";
import {
  getProfilePricingAudience,
  pricingConfigMatchesStripeItem,
  type ProfileAudienceRow,
} from "../_shared/entitlements.ts";
import { fulfillAddonCheckoutSession } from "../_shared/addonFulfillment.ts";
import { shouldSkipProfileEntitlementSync } from "./addonGuard.ts";
import {
  type AgentDataInputCreditReservationExpectation,
  assertAgentDataInputCreditReservationExpectation,
  assertAgentDataInputInvoiceCreditMatches,
  findAgentDataInputInvoiceCredit,
  type StripeInvoiceCreditItem,
} from "./agentDataInputInvoiceCredit.ts";

export {
  addonCreditsGranted,
  fulfillAddonCheckoutSession,
} from "../_shared/addonFulfillment.ts";

const log = createLogger("stripe-webhook");
const WEBHOOK_PROCESSING_DEADLINE_MS = 25_000;
let stripeClientCache: { key: string; client: Stripe } | null = null;

function webhookStripeClient(stripeKey: string): Stripe {
  if (stripeClientCache?.key === stripeKey) return stripeClientCache.client;
  const client = createStripeClient(stripeKey);
  stripeClientCache = { key: stripeKey, client };
  return client;
}

export async function withWebhookProcessingDeadline<T>(
  task: Promise<T>,
  timeoutMs = WEBHOOK_PROCESSING_DEADLINE_MS,
): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Stripe webhook processing timed out.")),
      Math.max(1, timeoutMs),
    );
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

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

type DurableSubscriptionEntitlementRow = {
  plan_key?: string | null;
  audience?: string | null;
  stripe_product_id?: string | null;
  livemode?: boolean | null;
};

type ProfileEntitlementContext = ProfileAudienceRow & {
  role_switch_in_progress_at?: string | null;
};

// Share a narrow database port with the billing-state helpers so webhook queries
// stay type-checked without coupling Edge Function tests to the generated schema.
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
  const stripe = webhookStripeClient(stripeKey);

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

  try {
    await verifyStripeAccountIdentity(stripe, {
      eventAccount: event.account ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Stripe account identity verification failed", {
      event_id: event.id,
      event_account: event.account ?? null,
      err: message,
    });
    return errorResponse("Stripe account identity mismatch", 500, corsHeaders);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  }) as unknown as SupabaseAdminClient;

  log.info("event received", { event_type: event.type });

  let claimToken: string | null = null;
  try {
    const eventStart = await beginStripeWebhookEvent(supabase, event);
    if (eventStart.state === "in_progress") {
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
    if (eventStart.state === "duplicate") {
      log.info("webhook event already handled", {
        event_id: event.id,
        event_type: event.type,
      });
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    claimToken = eventStart.claimToken;

    await withWebhookProcessingDeadline((async () => {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.paused":
        case "customer.subscription.pending_update_applied":
        case "customer.subscription.pending_update_expired":
        case "customer.subscription.resumed": {
          const eventSubscription = event.data.object as Stripe.Subscription;
          const sub = await retrieveCanonicalSubscriptionForEvent(
            stripe,
            eventSubscription,
          );
          const observation = subscriptionEventObservation(
            event.id,
            event.created,
          );
          await syncSubscription(supabase, stripe, sub, observation);
          await syncSubscriptionTrialStatus(supabase, sub);
          break;
        }

        case "customer.subscription.deleted": {
          const eventSubscription = event.data.object as Stripe.Subscription;
          const sub = await retrieveCanonicalSubscriptionForEvent(
            stripe,
            eventSubscription,
          );
          await clearSubscription(
            supabase,
            stripe,
            sub,
            subscriptionEventObservation(event.id, event.created),
          );
          await syncSubscriptionTrialStatus(supabase, sub);
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          await reconcileFinalizedAgentDataInputDiscount(
            supabase,
            stripe,
            invoice,
          );
          await syncInvoiceSubscription(
            supabase,
            stripe,
            invoice,
            "invoice.payment_failed",
            subscriptionEventObservation(event.id, event.created),
          );
          break;
        }

        case "invoice.created": {
          // Apply the Agent "Data Input" discount to the draft invoice if the
          // user has accumulated verified entries that have not yet been credited.
          // Idempotent â€” apply_verified_data_input_discount() flips
          // discount_applied=true atomically, so a retry returns 0 entries.
          const invoice = event.data.object as Stripe.Invoice;
          await applyAgentDataInputDiscount(supabase, stripe, invoice);
          break;
        }

        case "invoice.finalized": {
          const invoice = event.data.object as Stripe.Invoice;
          await reconcileFinalizedAgentDataInputDiscount(
            supabase,
            stripe,
            invoice,
          );
          break;
        }

        case "checkout.session.completed": {
          // Canonical confirmation event for initial subscription checkout.
          // customer.subscription.created fires around the same time, but this
          // event is the definitive signal that the user has paid. Handle
          // idempotently â€” syncSubscription is a no-op if already applied.
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
            await syncSubscription(
              supabase,
              stripe,
              sub,
              subscriptionEventObservation(event.id, event.created),
            );
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

        case "credit_note.created":
        case "credit_note.updated":
        case "credit_note.voided": {
          const creditNote = event.data.object as Stripe.CreditNote;
          await syncAddonCreditNoteRefunds(supabase, stripe, creditNote);
          break;
        }

        case "invoice.payment_succeeded": {
          // Fires on every successful recurring charge. Re-sync to handle plan upgrades
          // where the subscription object may already be updated before this fires.
          const invoice = event.data.object as Stripe.Invoice;
          await reconcileFinalizedAgentDataInputDiscount(
            supabase,
            stripe,
            invoice,
          );
          await syncInvoiceSubscription(
            supabase,
            stripe,
            invoice,
            "invoice.payment_succeeded",
            subscriptionEventObservation(event.id, event.created),
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
            await syncSubscription(
              supabase,
              stripe,
              sub,
              subscriptionEventObservation(event.id, event.created),
            );
          }
          break;
        }

        default:
          log.info("unhandled event type", { event_type: event.type });
      }
    })());
    const finished = await finishStripeWebhookEvent(
      supabase,
      event.id,
      claimToken,
      "processed",
    );
    if (!finished) {
      log.warn("webhook completion ignored after claim replacement", {
        event_id: event.id,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("handler error", { event_type: event.type, err: msg });
    try {
      if (claimToken) {
        await finishStripeWebhookEvent(
          supabase,
          event.id,
          claimToken,
          "failed",
          msg,
        );
      }
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

function subscriptionEventObservation(
  eventId: string,
  eventCreated: number,
): BillingSubscriptionObservation {
  return {
    source: "webhook_canonical",
    observedAt: new Date().toISOString(),
    stripeEventId: eventId,
    stripeEventCreatedAt: new Date(eventCreated * 1_000).toISOString(),
  };
}

export async function retrieveCanonicalSubscriptionForEvent(
  stripe: Pick<Stripe, "subscriptions">,
  eventSubscription: Pick<Stripe.Subscription, "id">,
): Promise<Stripe.Subscription> {
  return await stripe.subscriptions.retrieve(eventSubscription.id);
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

type AddonRefundInput = {
  refundId: string;
  chargeId: string | null;
  invoiceId: string | null;
  customerId: string | null;
  paymentIntentId: string | null;
  totalAmount: number | null;
  refundedAmount: number | null;
  currency: string | null;
  livemode: boolean;
  metadata: Stripe.Metadata | Record<string, string>;
  status?: string | null;
};

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

async function listChargeRefunds(
  stripe: Stripe,
  charge: Stripe.Charge,
): Promise<Stripe.Refund[]> {
  const embedded = charge.refunds?.data ?? [];
  if (!charge.refunds?.has_more) return embedded;
  return await stripe.refunds
    .list({ charge: charge.id, limit: 100 })
    .autoPagingToArray({ limit: 1_000 });
}

export async function addonRefundInputsFromCharge(
  stripe: Stripe,
  charge: Stripe.Charge,
): Promise<AddonRefundInput[]> {
  const paymentIntentId = objectId(
    charge.payment_intent as string | Stripe.PaymentIntent | null,
  );
  const paymentIntentMetadata = await retrievePaymentIntentMetadata(
    stripe,
    paymentIntentId,
  );
  const refunds = await listChargeRefunds(stripe, charge);
  return refunds.map((refund) => ({
    refundId: refund.id,
    chargeId: charge.id,
    invoiceId: null,
    customerId: objectId(charge.customer),
    paymentIntentId,
    totalAmount: Number(charge.amount ?? 0),
    refundedAmount: Number(refund.amount ?? 0),
    currency: charge.currency ?? null,
    livemode: Boolean(charge.livemode),
    metadata: {
      ...paymentIntentMetadata,
      ...(charge.metadata ?? {}),
      ...(refund.metadata ?? {}),
    },
    status: refund.status ?? null,
  }));
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
    invoiceId: null,
    customerId: objectId(charge?.customer),
    paymentIntentId,
    totalAmount: charge?.amount ? Number(charge.amount) : null,
    refundedAmount: Number(refund.amount ?? 0),
    currency: charge?.currency ?? null,
    livemode: Boolean(
      (refund as Stripe.Refund & { livemode?: boolean }).livemode,
    ),
    metadata: { ...paymentIntentMetadata, ...(refund.metadata ?? {}) },
    status: refund.status ?? null,
  };
}

export async function findAddonPurchaseForRefund(
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
    "stripe_customer_id",
    "stripe_charge_id",
    "stripe_invoice_id",
    "stripe_amount_total",
    "stripe_currency",
    "runtime_mode",
    "livemode",
    "metadata",
  ].join(",");

  const runtimeMode = stripeRuntimeModeFromLivemode(input.livemode);
  const strictQuery = (
    query: {
      eq: (column: string, value: unknown) => unknown;
    },
  ) => {
    let scoped = query.eq("runtime_mode", runtimeMode) as typeof query;
    scoped = scoped.eq("livemode", Boolean(input.livemode)) as typeof query;
    if (input.customerId) {
      scoped = scoped.eq(
        "stripe_customer_id",
        input.customerId,
      ) as typeof query;
    }
    return scoped as unknown as {
      maybeSingle: () => Promise<{
        data: Record<string, unknown> | null;
        error: unknown;
      }>;
    };
  };

  if (input.paymentIntentId) {
    const query = supabase
      .from("addon_purchases")
      .select(select)
      .eq("stripe_payment_intent_id", input.paymentIntentId);
    const { data, error } = await strictQuery(query).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (input.chargeId) {
    const query = supabase
      .from("addon_purchases")
      .select(select)
      .eq("stripe_charge_id", input.chargeId);
    const { data, error } = await strictQuery(query).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const sessionId = input.metadata?.stripe_session_id ??
    input.metadata?.checkout_session_id;
  if (sessionId) {
    const query = supabase
      .from("addon_purchases")
      .select(select)
      .eq("stripe_session_id", sessionId);
    const { data, error } = await strictQuery(query).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (input.invoiceId) {
    const query = supabase
      .from("addon_purchases")
      .select(select)
      .eq("stripe_invoice_id", input.invoiceId);
    const { data, error } = await strictQuery(query).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  return null;
}

export async function applyAddonRefund(
  supabase: SupabaseAdminClient,
  input: AddonRefundInput,
): Promise<boolean> {
  const sessionId = input.metadata?.stripe_session_id ??
    input.metadata?.checkout_session_id;
  if (
    !input.paymentIntentId && !input.chargeId && !sessionId && !input.invoiceId
  ) {
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
    if (input.metadata?.checkout_type === "addon") {
      throw new Error("add-on refund purchase is not available yet");
    }
    return false;
  }

  const totalAmount = Number(
    input.totalAmount ?? purchase.stripe_amount_total ?? 0,
  );
  const refundedAmount = Number(input.refundedAmount ?? 0);
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    throw new Error("add-on refund is missing the immutable Stripe total");
  }
  if (!Number.isInteger(refundedAmount) || refundedAmount <= 0) {
    throw new Error("add-on refund amount is invalid");
  }

  const runtimeMode = stripeRuntimeModeFromLivemode(input.livemode);
  const { data, error } = await supabase.rpc(
    "reconcile_addon_refund_event",
    {
      p_purchase_id: purchase.id,
      p_stripe_refund_id: input.refundId,
      p_refunded_amount: refundedAmount,
      p_total_amount: totalAmount,
      p_status: input.status ?? "pending",
      p_runtime_mode: runtimeMode,
      p_livemode: Boolean(input.livemode),
      p_metadata: {
        ...(input.metadata ?? {}),
        ...(input.chargeId ? { charge_id: input.chargeId } : {}),
        ...(input.invoiceId ? { invoice_id: input.invoiceId } : {}),
        ...(input.customerId ? { customer_id: input.customerId } : {}),
        ...(input.paymentIntentId
          ? { payment_intent_id: input.paymentIntentId }
          : {}),
        ...(input.currency ? { currency: input.currency.toLowerCase() } : {}),
      },
    },
  );
  if (error) throw error;
  log.info("synced add-on refund", {
    refund_id: input.refundId,
    purchase_id: purchase.id,
    reconciliation: data ?? null,
  });
  return true;
}

// skipcq: JS-0067 - Top-level helper is used by the webhook switch.
async function syncAddonRefund(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  object: Stripe.Charge | Stripe.Refund,
): Promise<boolean> {
  const inputs = object.object === "charge"
    ? await addonRefundInputsFromCharge(stripe, object as Stripe.Charge)
    : [await addonRefundInputFromRefund(stripe, object as Stripe.Refund)];
  let matched = false;
  for (const input of inputs) {
    matched = (await applyAddonRefund(supabase, input)) || matched;
  }
  return matched;
}

type CreditNoteRefundLink = {
  type?: string | null;
  refund?: string | Stripe.Refund | null;
  amount_refunded?: number | null;
};

type CreditNoteWithRefunds = Stripe.CreditNote & {
  status?: string | null;
  post_payment_amount?: number | null;
  refund?: string | Stripe.Refund | null;
  refunds?: CreditNoteRefundLink[] | null;
};

async function retrieveCreditNoteRefund(
  stripe: Stripe,
  value: string | Stripe.Refund,
): Promise<Stripe.Refund> {
  if (typeof value !== "string" && value.amount != null && value.status) {
    return value;
  }
  return await stripe.refunds.retrieve(objectId(value)!);
}

export async function addonRefundInputsFromCreditNote(
  stripe: Stripe,
  creditNote: Stripe.CreditNote,
): Promise<AddonRefundInput[]> {
  const rawCreditNote = creditNote as CreditNoteWithRefunds;

  // Stripe permits voiding only for open-invoice credit notes. Those reduce an
  // unpaid balance and must never revoke an entitlement granted by a paid
  // Checkout. Paid-invoice cash refunds are represented by immutable Refund
  // objects and retain their own lifecycle independently of the credit note.
  if (rawCreditNote.status === "void") return [];

  const invoiceId = objectId(creditNote.invoice);
  if (!invoiceId) return [];

  const invoice = await stripe.invoices.retrieve(invoiceId);
  if (Boolean(invoice.livemode) !== Boolean(creditNote.livemode)) {
    throw new Error("credit note and invoice runtime do not match");
  }

  const rawInvoice = invoice as Stripe.Invoice & {
    charge?: string | Stripe.Charge | null;
    payment_intent?: string | Stripe.PaymentIntent | null;
  };
  const metadata = {
    ...(creditNote.metadata ?? {}),
    ...(invoice.metadata ?? {}),
  };
  const amountPaid = Number(invoice.amount_paid ?? 0);
  const totalAmount = amountPaid > 0 ? amountPaid : Number(invoice.total ?? 0);

  const links: CreditNoteRefundLink[] = [...(rawCreditNote.refunds ?? [])];
  if (rawCreditNote.refund) {
    links.push({ type: "refund", refund: rawCreditNote.refund });
  }

  const inputs: AddonRefundInput[] = [];
  const seenRefundIds = new Set<string>();
  let linkedRefundAmount = 0;

  for (const link of links) {
    if (link.type && link.type !== "refund") continue;
    const refundId = objectId(link.refund);
    if (!refundId || seenRefundIds.has(refundId)) continue;

    const refund = await retrieveCreditNoteRefund(stripe, link.refund!);
    const input = await addonRefundInputFromRefund(stripe, refund);
    if (Boolean(input.livemode) !== Boolean(creditNote.livemode)) {
      throw new Error("credit note and refund runtime do not match");
    }

    seenRefundIds.add(refundId);
    linkedRefundAmount += Math.max(
      0,
      Number(link.amount_refunded ?? input.refundedAmount ?? 0),
    );
    inputs.push({
      ...input,
      invoiceId,
      totalAmount,
      metadata: {
        ...metadata,
        ...(input.metadata ?? {}),
        credit_note_id: creditNote.id,
      },
    });
  }

  // A paid-invoice credit note can also return value through customer balance
  // or an out-of-band payment. Record only the residual after linked Refunds;
  // this avoids counting the same economic refund under both cn_ and re_ IDs.
  const externalAmount = Math.max(
    0,
    Number(rawCreditNote.post_payment_amount ?? 0) - linkedRefundAmount,
  );
  if (externalAmount > 0) {
    inputs.push({
      refundId: `credit_note:${creditNote.id}:external`,
      chargeId: objectId(rawInvoice.charge),
      invoiceId,
      customerId: objectId(creditNote.customer) ?? objectId(invoice.customer),
      paymentIntentId: objectId(rawInvoice.payment_intent) ??
        metadata.payment_intent_id ?? null,
      totalAmount,
      refundedAmount: externalAmount,
      currency: creditNote.currency ?? invoice.currency ?? null,
      livemode: Boolean(creditNote.livemode),
      metadata: {
        ...metadata,
        source_type: "credit_note_external",
        credit_note_id: creditNote.id,
      },
      status: "succeeded",
    });
  }

  return inputs;
}

async function syncAddonCreditNoteRefunds(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  creditNote: Stripe.CreditNote,
): Promise<boolean> {
  const inputs = await addonRefundInputsFromCreditNote(stripe, creditNote);
  let matched = false;
  for (const input of inputs) {
    matched = (await applyAddonRefund(supabase, input)) || matched;
  }
  return matched;
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

async function syncSubscriptionTrialClaim(
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
  sub: Stripe.Subscription | null,
): Promise<void> {
  if (
    sub?.metadata.checkout_type === "subscription_trial" &&
    session.metadata?.checkout_type !== "subscription_trial"
  ) throw new Error("trial session metadata missing");
  await reconcileTrialClaim(
    supabase as unknown as TrialStore,
    session,
    "session",
    sub ? mapSubscriptionTrialStatus(sub.status) : "checkout_created",
    sub,
    session.subscription,
  );
}
async function expireAbandonedTrialCheckoutSession(
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  return await reconcileTrialClaim(
    supabase as unknown as TrialStore,
    session,
    "session",
    "checkout_abandoned",
    null,
    session.subscription,
  );
}
async function syncSubscriptionTrialStatus(
  supabase: SupabaseAdminClient,
  sub: Stripe.Subscription,
): Promise<void> {
  await reconcileTrialClaim(
    supabase as unknown as TrialStore,
    sub,
    "subscription",
    mapSubscriptionTrialStatus(sub.status),
  );
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
export async function resolveSubscriptionEntitlement(
  supabase: SupabaseAdminClient,
  sub: Stripe.Subscription,
): Promise<SubscriptionEntitlement> {
  if (shouldSkipProfileEntitlementSync(sub)) return null;
  const rows = await loadSubscriptionPricingConfigs(supabase, true);
  return resolveSubscriptionEntitlementFromRows(sub, rows);
}

async function loadSubscriptionPricingConfigs(
  supabase: SupabaseAdminClient,
  isActive = true,
): Promise<PricingConfigRow[]> {
  const { data, error } = await supabase
    .from("pricing_configs")
    .select("key, audience, module, metadata")
    .eq("is_active", isActive);
  if (error) throw error;
  return (data ?? []) as PricingConfigRow[];
}

async function loadDurableSubscriptionEntitlement(
  supabase: SupabaseAdminClient,
  sub: Stripe.Subscription,
): Promise<SubscriptionEntitlement> {
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("plan_key, audience, stripe_product_id, livemode")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (error) throw error;

  const row = data as DurableSubscriptionEntitlementRow | null;
  if (!row || Boolean(row.livemode) !== Boolean(sub.livemode)) return null;

  const planKey = row.plan_key?.trim() ?? "";
  const audience = normalizeAudience(row.audience);
  const productId = row.stripe_product_id?.trim() ?? "";
  if (!planKey || !audience || !productId) return null;

  const itemProduct = firstSubscriptionItem(sub)?.price?.product;
  const eventProductId = typeof itemProduct === "string"
    ? itemProduct
    : itemProduct?.id ?? null;
  if (eventProductId && eventProductId !== productId) {
    log.warn("durable subscription product does not match Stripe event", {
      sub_id: sub.id,
      durable_product_id: productId,
      event_product_id: eventProductId,
    });
    return null;
  }

  return {
    planKey,
    audience,
    role: audience,
    productId,
  };
}

/**
 * Terminal events must still identify entitlements after a plan is retired.
 * Activation stays restricted to active pricing rows; revocation may use an
 * inactive historical row or the exact previously verified subscription ledger.
 */
export async function resolveHistoricalSubscriptionEntitlement(
  supabase: SupabaseAdminClient,
  sub: Stripe.Subscription,
): Promise<SubscriptionEntitlement> {
  if (shouldSkipProfileEntitlementSync(sub)) return null;

  const activeRows = await loadSubscriptionPricingConfigs(supabase, true);
  const activeEntitlement = resolveSubscriptionEntitlementFromRows(
    sub,
    activeRows,
  );
  if (activeEntitlement) return activeEntitlement;

  const inactiveRows = await loadSubscriptionPricingConfigs(supabase, false);
  const inactiveEntitlement = resolveSubscriptionEntitlementFromRows(
    sub,
    inactiveRows,
  );
  if (inactiveEntitlement) return inactiveEntitlement;

  return loadDurableSubscriptionEntitlement(supabase, sub);
}

function resolveSubscriptionEntitlementFromRows(
  sub: Stripe.Subscription,
  rows: PricingConfigRow[],
): SubscriptionEntitlement {
  if (shouldSkipProfileEntitlementSync(sub)) return null;
  const item = firstSubscriptionItem(sub);
  const priceId = item?.price?.id ?? null;
  const product = item?.price?.product;
  const productId = typeof product === "string" ? product : product?.id ?? null;
  if (!productId) {
    if (hasProvisionedSubscriptionAccess(sub.status)) {
      throw new Error(
        `active Stripe subscription ${sub.id} has no product identity`,
      );
    }
    return null;
  }

  const metadataPlan =
    (sub.metadata?.plan_key ?? sub.metadata?.plan ?? "") as string;
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
  if (!row?.key || !audience) {
    if (hasProvisionedSubscriptionAccess(sub.status)) {
      throw new Error(
        `active Stripe subscription ${sub.id} has no canonical pricing entitlement`,
      );
    }
    return null;
  }

  return {
    planKey: row.key,
    audience,
    role: normalizeAudience(sub.metadata?.role as string | undefined) ??
      audience,
    productId,
  };
}

function subscriptionCurrentPeriodEndSeconds(
  sub: Stripe.Subscription,
): number | null {
  const rootPeriodEnd = (sub as unknown as {
    current_period_end?: number | null;
  }).current_period_end;
  return rootPeriodEnd ?? firstSubscriptionItem(sub)?.current_period_end ?? null;
}

function isCurrentProvisionedSubscription(
  sub: Stripe.Subscription,
  nowMs = Date.now(),
): boolean {
  if (!hasProvisionedSubscriptionAccess(sub.status)) return false;
  const nowSeconds = Math.floor(nowMs / 1_000);
  const accessEnd = sub.status === "trialing"
    ? sub.trial_end ?? subscriptionCurrentPeriodEndSeconds(sub)
    : subscriptionCurrentPeriodEndSeconds(sub);
  return typeof accessEnd === "number" && Number.isFinite(accessEnd) &&
    accessEnd > nowSeconds;
}

async function loadProfileEntitlementContext(
  supabase: SupabaseAdminClient,
  userId: string,
): Promise<{
  audience: string | null;
  roleSwitchInProgress: boolean;
}> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, participant_type, role_switch_in_progress_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const profile = data as ProfileEntitlementContext | null;
  return {
    audience: getProfilePricingAudience(profile),
    roleSwitchInProgress: Boolean(profile?.role_switch_in_progress_at),
  };
}

function entitlementMatchesProfile(
  entitlement: SubscriptionEntitlement,
  profile: { audience: string | null; roleSwitchInProgress: boolean },
): boolean {
  return !profile.roleSwitchInProgress &&
    Boolean(entitlement?.audience && profile.audience === entitlement.audience);
}

function canonicalBillingSubscription(
  sub: Stripe.Subscription,
  entitlement: SubscriptionEntitlement,
): BillingSubscriptionCanonical | null {
  if (!entitlement) return null;
  const item = firstSubscriptionItem(sub);
  const cycle = sub.metadata?.billing_cycle;
  return {
    planKey: entitlement.planKey,
    audience: entitlement.audience,
    productId: entitlement.productId,
    priceId: item?.price?.id ?? null,
    billingCycle: cycle === "annual"
      ? "annual"
      : cycle === "monthly"
      ? "monthly"
      : null,
  };
}

export async function findProvisionedReplacementSubscription(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  customerId: string,
  deletedSubscriptionId: string,
  requiredAudience: string,
  nowMs = Date.now(),
): Promise<Stripe.Subscription | null> {
  const [subscriptions, pricingRows] = await Promise.all([
    stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    }),
    loadSubscriptionPricingConfigs(supabase),
  ]);
  const candidates = [...subscriptions.data].sort((left, right) => {
    const createdDifference = (right.created ?? 0) - (left.created ?? 0);
    return createdDifference || right.id.localeCompare(left.id);
  });

  for (const candidate of candidates) {
    if (
      candidate.id === deletedSubscriptionId ||
      shouldSkipProfileEntitlementSync(candidate) ||
      !isCurrentProvisionedSubscription(candidate, nowMs)
    ) continue;
    try {
      const entitlement = resolveSubscriptionEntitlementFromRows(
        candidate,
        pricingRows,
      );
      if (entitlement?.audience === requiredAudience) return candidate;
    } catch (err: unknown) {
      log.warn("ignored malformed replacement subscription candidate", {
        sub_id: candidate.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function syncSubscription(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  sub: Stripe.Subscription,
  observation: BillingSubscriptionObservation = {
    source: "webhook_canonical",
    observedAt: new Date().toISOString(),
  },
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

  const userId = customer.metadata?.user_id as string | undefined;
  if (!userId) {
    log.warn("Stripe customer is missing trusted user_id metadata", {
      customer_id: customerId,
    });
    return;
  }

  const [entitlement, profileContext] = await Promise.all([
    resolveSubscriptionEntitlement(supabase, sub),
    loadProfileEntitlementContext(supabase, userId),
  ]);
  const hasAccess = isCurrentProvisionedSubscription(sub);
  const shouldRevoke = shouldRevokeSubscriptionAccess(sub.status);

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
    canonical: canonicalBillingSubscription(sub, entitlement),
    observation,
  });

  if (!entitlementMatchesProfile(entitlement, profileContext)) {
    log.info(
      "persisted subscription history without changing current profile audience",
      {
        user_id: userId,
        sub_id: sub.id,
        subscription_audience: entitlement?.audience ?? null,
        profile_audience: profileContext.audience,
        role_switch_in_progress: profileContext.roleSwitchInProgress,
      },
    );
    return;
  }

  const hasManualAccess = shouldRevoke
    ? await hasManualProAccess(supabase, userId)
    : false;
  const productId = hasAccess ? entitlement?.productId ?? null : null;

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_product_id: productId })
    .eq(filter.column, filter.value);

  if (error) {
    log.error("failed to update profile", {
      filter,
      err: String(error.message ?? error),
    });
    throw new Error(`Failed to persist subscription product for ${userId}: ${error.message ?? error}`);
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
    userId,
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
  observation: BillingSubscriptionObservation,
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

  const [entitlement, profileContext] = await Promise.all([
    resolveHistoricalSubscriptionEntitlement(supabase, sub),
    loadProfileEntitlementContext(supabase, userId),
  ]);

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
    canonical: canonicalBillingSubscription(sub, entitlement),
    observation,
  });

  if (!entitlementMatchesProfile(entitlement, profileContext)) {
    log.info(
      "deleted subscription does not own the current profile audience",
      {
        user_id: userId,
        deleted_sub_id: sub.id,
        subscription_audience: entitlement?.audience ?? null,
        profile_audience: profileContext.audience,
        role_switch_in_progress: profileContext.roleSwitchInProgress,
      },
    );
    return;
  }

  const replacement = await findProvisionedReplacementSubscription(
    supabase,
    stripe,
    customerId,
    sub.id,
    profileContext.audience as string,
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
    await syncSubscription(supabase, stripe, replacement, {
      ...observation,
      observedAt: new Date().toISOString(),
    });
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
    throw new Error(`Failed to clear subscription product for ${userId}: ${error.message ?? error}`);
  } else {
    log.info("cleared subscription", { filter });
  }

  if (await hasManualProAccess(supabase, userId)) {
    await syncProfessionalTier(supabase, userId, sub, true, null);
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
      throw new Error(`Failed to clear professional tier for ${userId}: ${profErr.message ?? profErr}`);
    }
  }

  await applySubscriptionLapseControls(supabase, userId, "deleted");
}

/** Update professionals.subscription_tier when the subscription is a professional plan. */
// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function syncProfessionalTier(
  supabase: SupabaseAdminClient,
  userId: string,
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
    throw new Error(`Failed to persist professional tier for ${userId}: ${error.message ?? error}`);
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
  observation: BillingSubscriptionObservation,
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
  await syncSubscription(supabase, stripe, sub, observation);
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
    throw new Error(`Failed to check manual Pro access for ${userId}: ${error.message ?? error}`);
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
    throw new Error(`Failed to apply subscription lapse controls for ${userId}: ${error.message ?? error}`);
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

function isDefinitiveStripeCreditFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const statusCode = Number(
    (error as { statusCode?: number }).statusCode ?? 0,
  );
  return statusCode >= 400 && statusCode < 500 &&
    ![408, 409, 429].includes(statusCode);
}

async function agentDataInputCreditIdempotencyKey(
  invoiceId: string,
  userId: string,
): Promise<string> {
  return await buildIdempotencyKey("agent-data-input-invoice-credit", [
    invoiceId,
    userId,
  ]);
}

async function persistAgentDataInputInvoiceCredit(
  supabase: SupabaseAdminClient,
  userId: string,
  invoiceId: string,
  expectedCount: number,
  credit: StripeInvoiceCreditItem,
): Promise<void> {
  const amountMinor = Math.abs(credit.amount);
  const { data: persistedRows, error: persistError } = await supabase.from(
    "agent_data_inputs",
  )
    .update({
      stripe_credit_id: credit.id,
      stripe_credit_amount_cents: amountMinor,
      stripe_credit_currency: credit.currency,
    })
    .eq("user_id", userId)
    .eq("discount_invoice_id", invoiceId)
    .select<{ id: string }[]>("id");
  if (
    persistError ||
    !Array.isArray(persistedRows) ||
    persistedRows.length !== expectedCount
  ) {
    log.error("Stripe credit succeeded but durable persistence failed", {
      user_id: userId,
      invoice_id: invoiceId,
      stripe_credit_id: credit.id,
      persisted_count: Array.isArray(persistedRows) ? persistedRows.length : 0,
      expected_count: expectedCount,
      err: persistError ? String(persistError.message ?? persistError) : null,
    });
    throw new Error("Stripe credit persistence failed after provider success");
  }
}

async function loadAgentDataInputCreditReservations(
  supabase: SupabaseAdminClient,
  userId: string,
  invoiceId: string,
): Promise<AgentDataInputCreditReservationExpectation[]> {
  const { data, error } = await supabase.from("agent_data_inputs")
    .select<AgentDataInputCreditReservationExpectation[]>(
      "id, stripe_credit_id, stripe_credit_expected_amount_cents, stripe_credit_operation_key",
    )
    .eq("user_id", userId)
    .eq("discount_invoice_id", invoiceId);
  if (error) {
    throw new Error(
      `Agent data-input reservation lookup failed: ${
        String(error.message ?? error)
      }`,
    );
  }
  return Array.isArray(data) ? data : [];
}

async function reconcileFinalizedAgentDataInputDiscount(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<void> {
  if (!invoice.id || !invoice.customer) return;
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer.id;
  const customer = await stripe.customers.retrieve(customerId);
  const userId = "metadata" in customer
    ? customer.metadata?.user_id ?? null
    : null;
  if (!userId) return;

  const reservations = await loadAgentDataInputCreditReservations(
    supabase,
    userId,
    invoice.id,
  );
  if (reservations.length === 0) return;

  const operationKey = await agentDataInputCreditIdempotencyKey(
    invoice.id,
    userId,
  );
  const expectedAmountMinor = reservations[0]
    ?.stripe_credit_expected_amount_cents;
  if (
    !Number.isInteger(expectedAmountMinor) || Number(expectedAmountMinor) <= 0
  ) {
    throw new Error(
      "Agent data-input credit reservation has no durable expected amount.",
    );
  }
  assertAgentDataInputCreditReservationExpectation(reservations, {
    expectedCount: reservations.length,
    amountMinor: Number(expectedAmountMinor),
    operationKey,
  });
  const credit = await findAgentDataInputInvoiceCredit(
    stripe as unknown as Parameters<
      typeof findAgentDataInputInvoiceCredit
    >[0],
    invoice.id,
    operationKey,
  );
  if (credit) {
    if (credit.amount >= 0) {
      throw new Error(
        "Stripe invoice credit reconciliation found a non-credit item.",
      );
    }
    assertAgentDataInputInvoiceCreditMatches(credit, {
      invoiceId: invoice.id,
      customerId,
      amountMinor: Number(expectedAmountMinor),
      currency: invoice.currency,
      operationKey,
      userId,
      appliedCount: reservations.length,
    });
    await persistAgentDataInputInvoiceCredit(
      supabase,
      userId,
      invoice.id,
      reservations.length,
      credit,
    );
    return;
  }

  if (reservations.some((reservation) => reservation.stripe_credit_id)) {
    throw new Error(
      "A persisted data-input invoice credit is missing from canonical Stripe state.",
    );
  }
  await releaseAgentDataInputCreditReservation(
    supabase,
    userId,
    invoice.id,
    reservations.length,
  );
  log.warn("Released unfulfilled finalized invoice credit reservation", {
    user_id: userId,
    invoice_id: invoice.id,
    reservation_count: reservations.length,
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
async function releaseAgentDataInputCreditReservation(
  supabase: SupabaseAdminClient,
  userId: string,
  invoiceId: string,
  expectedCount: number,
): Promise<void> {
  const { data, error } = await supabase.from("agent_data_inputs")
    .update({
      discount_applied: false,
      discount_applied_at: null,
      discount_invoice_id: null,
      applied_to_invoice_at: null,
      stripe_credit_id: null,
      stripe_credit_amount_cents: null,
      stripe_credit_currency: null,
      stripe_credit_expected_amount_cents: null,
      stripe_credit_operation_key: null,
    })
    .eq("user_id", userId)
    .eq("discount_invoice_id", invoiceId)
    .select<{ id: string }[]>("id");
  const releasedRows = Array.isArray(data) ? data : [];
  if (error || releasedRows.length !== expectedCount) {
    throw new Error(
      error?.message ??
        `Expected to release ${expectedCount} data-input reservations, released ${releasedRows.length}`,
    );
  }
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function applyAgentDataInputDiscount(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<void> {
  if (invoice.status && invoice.status !== "draft") return;
  if (!invoice.id || !invoice.customer) return;
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer.id;
  // Skip initial signup invoices — no prior verified inputs are possible yet.
  if (
    (invoice as unknown as Record<string, unknown>).billing_reason ===
      "subscription_create"
  ) return;
  const subtotalMinor = invoice.subtotal ?? 0;
  if (subtotalMinor <= 0) {
    log.warn("invoice subtotal non-positive; skipping discount", {
      invoice_id: invoice.id,
      subtotal: subtotalMinor,
    });
    return;
  }

  const customer = await stripe.customers.retrieve(
    customerId,
  ) as Stripe.Customer;
  const userId = customer.metadata?.user_id ?? null;
  if (!userId) {
    log.info(
      "invoice.created: cannot resolve user_id, skipping data input discount",
      { invoice_id: invoice.id },
    );
    return;
  }

  const idempotencyKey = await agentDataInputCreditIdempotencyKey(
    invoice.id,
    userId,
  );

  const { data, error } = await supabase.rpc(
    "apply_verified_data_input_discount",
    {
      p_user_id: userId,
      p_invoice_id: invoice.id,
      p_subtotal_minor: subtotalMinor,
      p_operation_key: idempotencyKey,
    },
  );
  if (error) {
    log.error("apply_verified_data_input_discount rpc failed", {
      user_id: userId,
      invoice_id: invoice.id,
      err: String(error.message ?? error),
    });
    throw new Error(
      `apply_verified_data_input_discount failed: ${
        String(error.message ?? error)
      }`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    applied_count?: number;
    applied_pct?: number | string;
    expected_amount_cents?: number;
    operation_key?: string;
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

  const discountMinor = Number(row?.expected_amount_cents ?? 0);
  if (
    !Number.isInteger(discountMinor) ||
    discountMinor <= 0 ||
    row?.operation_key !== idempotencyKey
  ) {
    throw new Error(
      "Agent data-input discount RPC returned an invalid durable expectation.",
    );
  }
  const reservations = await loadAgentDataInputCreditReservations(
    supabase,
    userId,
    invoice.id,
  );
  assertAgentDataInputCreditReservationExpectation(reservations, {
    expectedCount: appliedCount,
    amountMinor: discountMinor,
    operationKey: idempotencyKey,
  });
  let credit = await findAgentDataInputInvoiceCredit(
    stripe as unknown as Parameters<
      typeof findAgentDataInputInvoiceCredit
    >[0],
    invoice.id,
    idempotencyKey,
  );
  if (credit) {
    assertAgentDataInputInvoiceCreditMatches(credit, {
      invoiceId: invoice.id,
      customerId,
      amountMinor: discountMinor,
      currency: invoice.currency,
      operationKey: idempotencyKey,
      userId,
      appliedCount,
    });
  } else {
    try {
      credit = await stripe.invoiceItems.create({
        customer: customerId,
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
          operation_key: idempotencyKey,
          expected_amount_cents: String(discountMinor),
          invoice_id: invoice.id,
        },
      }, { idempotencyKey });
    } catch (stripeErr: unknown) {
      if (!isDefinitiveStripeCreditFailure(stripeErr)) {
        log.error("Ambiguous Stripe credit outcome remains reserved", {
          user_id: userId,
          invoice_id: invoice.id,
          idempotency_key: idempotencyKey,
          err: stripeErr instanceof Error
            ? stripeErr.message
            : String(stripeErr),
        });
        throw stripeErr;
      }

      // Stripe call failed — roll back the DB rows so they remain eligible
      // for the next invoice cycle instead of being permanently lost.
      log.error("Definitive Stripe credit failure; releasing reservation", {
        user_id: userId,
        invoice_id: invoice.id,
        err: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
      });
      try {
        await releaseAgentDataInputCreditReservation(
          supabase,
          userId,
          invoice.id,
          appliedCount,
        );
      } catch (rollbackErr: unknown) {
        log.error(
          "CRITICAL: release of discount reservations failed",
          {
            user_id: userId,
            invoice_id: invoice.id,
            err: rollbackErr instanceof Error
              ? rollbackErr.message
              : String(rollbackErr),
          },
        );
        throw rollbackErr;
      }
      return;
    }
  }

  await persistAgentDataInputInvoiceCredit(
    supabase,
    userId,
    invoice.id,
    appliedCount,
    credit,
  );

  log.info("applied agent data input discount", {
    user_id: userId,
    invoice_id: invoice.id,
    applied_count: appliedCount,
    applied_pct: appliedPct,
    discount_minor: discountMinor,
    stripe_credit_id: credit.id,
  });
}
