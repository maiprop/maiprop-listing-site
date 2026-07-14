import Stripe from "npm:stripe@22.3.0";
import { SELF_SERVE_ADDON_CREDITS } from "../create-checkout/constants.ts";
import { getCurrentBillingRuntimeMode } from "../create-checkout/pricing.ts";
import { stripeRuntimeModeFromLivemode } from "./billingState.ts";
import { createLogger } from "./logger.ts";

const log = createLogger("addon-fulfillment");

// The generated database type is not available in Edge Functions.
// Keep this boundary dynamic and validate every value before granting credits.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = any;

export type AddonCheckoutFulfillmentResult =
  | "not_addon"
  | "rejected"
  | "fulfilled";

const objectId = (
  value: string | { id?: string | null } | null | undefined,
): string | null => {
  if (typeof value === "string") return value;
  return value?.id ?? null;
};

const normalizePositiveQuantity = (
  raw: string | null | undefined,
): number => {
  const parsed = Number(raw ?? 1);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw new Error("addon checkout session has invalid quantity metadata");
  }
  return parsed;
};

const normalizeAddonCheckoutMode = (
  mode: Stripe.Checkout.Session.Mode | null,
): "payment" | "subscription" => {
  if (mode === "payment" || mode === "subscription") return mode;
  throw new Error("addon checkout session has unsupported checkout mode");
};

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
  return data?.user_id === userId;
}

async function addonCheckoutCustomerIsOwnedByUser(
  supabase: SupabaseAdminClient,
  userId: string,
  stripeCustomerId: string,
  livemode: boolean,
): Promise<boolean> {
  const runtimeMode = stripeRuntimeModeFromLivemode(livemode);
  const { data, error } = await supabase
    .from("billing_customers")
    .select("user_id, stripe_customer_id")
    .eq("user_id", userId)
    .eq("stripe_customer_id", stripeCustomerId)
    .eq("runtime_mode", runtimeMode)
    .eq("livemode", livemode)
    .maybeSingle();
  if (error) throw error;
  return data?.user_id === userId &&
    data?.stripe_customer_id === stripeCustomerId;
}

export async function reconcileAddonCheckoutSession(
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
): Promise<AddonCheckoutFulfillmentResult> {
  const metadata = session.metadata ?? {};
  if (metadata.checkout_type !== "addon") return "not_addon";
  if (session.payment_status !== "paid") return "rejected";

  const userId = metadata.user_id;
  const addonKey = metadata.addon_key;
  const module = metadata.module;
  const audience = metadata.audience;
  const unit = metadata.unit;
  if (!userId || !addonKey || !module || !audience || !unit) {
    throw new Error("addon checkout session missing required metadata");
  }

  const livemode = Boolean(session.livemode);
  const runtimeMode = stripeRuntimeModeFromLivemode(livemode);
  const billingRuntimeMode = await getCurrentBillingRuntimeMode(supabase);
  if (
    metadata.runtime_mode !== runtimeMode ||
    billingRuntimeMode !== runtimeMode
  ) {
    log.warn("add-on checkout runtime does not match active billing mode", {
      session_id: session.id,
      metadata_runtime_mode: metadata.runtime_mode ?? null,
      billing_runtime_mode: billingRuntimeMode,
      event_runtime_mode: runtimeMode,
    });
    return "rejected";
  }

  if (!(await addonCheckoutProfileExists(supabase, userId))) {
    log.warn("orphaned add-on checkout session", {
      session_id: session.id,
      user_id: userId,
      addon_key: addonKey,
    });
    return "rejected";
  }

  const stripeCustomerId = objectId(session.customer);
  if (
    session.client_reference_id !== userId ||
    !stripeCustomerId ||
    !(await addonCheckoutCustomerIsOwnedByUser(
      supabase,
      userId,
      stripeCustomerId,
      livemode,
    ))
  ) {
    log.warn("add-on checkout identity does not match billing customer", {
      session_id: session.id,
      user_id: userId,
      client_reference_id: session.client_reference_id,
      stripe_customer_id: stripeCustomerId,
    });
    return "rejected";
  }

  const checkoutMode = normalizeAddonCheckoutMode(session.mode);
  const quantity = normalizePositiveQuantity(metadata.quantity);
  const stripePaymentIntentId = objectId(session.payment_intent);
  const { error } = await supabase.from("addon_purchases").upsert({
    user_id: userId,
    addon_key: addonKey,
    module,
    audience,
    unit,
    quantity,
    checkout_mode: checkoutMode,
    status: checkoutMode === "subscription" ? "active" : "paid",
    stripe_session_id: session.id,
    stripe_subscription_id: objectId(session.subscription),
    stripe_customer_id: stripeCustomerId,
    stripe_payment_intent_id: stripePaymentIntentId,
    credits_granted: addonCreditsGranted(addonKey, quantity),
    runtime_mode: runtimeMode,
    livemode,
    metadata: {
      ...metadata,
      ...(stripePaymentIntentId
        ? { payment_intent_id: stripePaymentIntentId }
        : {}),
    },
  }, {
    onConflict: "stripe_session_id",
    ignoreDuplicates: true,
  });
  if (error) throw error;
  return "fulfilled";
}

/** Webhook compatibility: any add-on session is handled, even when rejected. */
export async function fulfillAddonCheckoutSession(
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  return (await reconcileAddonCheckoutSession(supabase, session)) !==
    "not_addon";
}
