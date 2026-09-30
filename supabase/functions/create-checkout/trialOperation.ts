// deno-lint-ignore-file no-import-prefix -- Repository frozen dependency policy.
import Stripe from "npm:stripe@22.3.0";
import {
  buildIdempotencyKey,
  CHECKOUT_TAX_COLLECTION_PARAMS,
  STRIPE_API_VERSION,
  STRIPE_CHECKOUT_INTEGRATION_IDENTIFIER,
} from "../_shared/stripeClient.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  isUuid,
  mutateTrialClaim,
  objectRecord,
  readTrialById,
  readTrialClaim,
  stripeId,
  type TrialClaim,
  trialConsumed,
  trialPending,
  type TrialStore,
  validateTrialObject,
} from "../_shared/trialClaims.ts";
import { buildTrialMetadata, PRO_TRIAL_DAYS } from "./trials.ts";
import type { CheckoutPlan } from "./types.ts";

const log = createLogger("trial-checkout");
const HORIZON_MS = 23 * 60 * 60 * 1000;
type Operation = {
  version: 1;
  key: string;
  params: Stripe.Checkout.SessionCreateParams;
  api_version: string;
  created_at: string;
  replay_before: string;
  dispatch_count: number;
  revision: string;
};
type Selection = {
  plan: string;
  cycle: string;
  success: string;
  cancel: string;
  audience: string;
};
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const fields = (
  value: unknown,
  allowed: string[],
): value is Record<string, unknown> =>
  Boolean(
    objectRecord(value) &&
      Object.keys(value as object).every((k) => allowed.includes(k)),
  );
const strings = (v: unknown): v is Record<string, string> =>
  Boolean(
    objectRecord(v) &&
      Object.values(v as object).every((x) => typeof x === "string"),
  );
const httpsUrl = (v: unknown): v is string => {
  try {
    return text(v) && new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

// Redirect origins were already authorized by resolveCheckoutOrigin, including
// explicitly configured HTTP development origins. Validate syntax, not today's config.
const redirectUrl = (value: unknown): boolean => {
  try {
    return text(value) && ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

// Version 1 has a deliberately closed primitive schema. Unsupported future shapes
// remain unresolved; never rebuild a stored operation from current catalog values.
export function readTrialOperation(row: TrialClaim): Operation | null {
  const op = objectRecord(row.metadata?.checkout_operation_v1);
  if (
    !op || op.version !== 1 || !text(op.key) || !isUuid(op.revision) ||
    op.api_version !== STRIPE_API_VERSION ||
    !Number.isSafeInteger(op.dispatch_count) || Number(op.dispatch_count) < 0 ||
    !text(op.created_at) || !text(op.replay_before)
  ) return null;
  const created = Date.parse(op.created_at),
    before = Date.parse(op.replay_before);
  if (
    !Number.isFinite(created) || before - created !== HORIZON_MS ||
    created > Date.now() ||
    new Date(created).toISOString() !== op.created_at ||
    new Date(before).toISOString() !== op.replay_before
  ) return null;
  const p = op.params;
  if (
    !fields(p, [
      "automatic_tax",
      "billing_address_collection",
      "customer_update",
      "tax_id_collection",
      "customer",
      "client_reference_id",
      "line_items",
      "mode",
      "integration_identifier",
      "success_url",
      "cancel_url",
      "payment_method_collection",
      "metadata",
      "subscription_data",
    ])
  ) return null;
  const sub = p.subscription_data;
  if (
    !fields(sub, ["trial_period_days", "trial_settings", "metadata"]) ||
    !strings(p.metadata) || !strings(sub.metadata)
  ) return null;
  for (const m of [p.metadata, sub.metadata]) {
    if (
      m.trial_claim_id !== row.id || m.user_id !== row.user_id ||
      m.checkout_type !== "subscription_trial" ||
      m.plan_key !== row.plan_key || m.audience !== row.pricing_audience ||
      m.trial_days !== String(row.trial_days) ||
      !text(m.plan) || !["monthly", "annual"].includes(m.billing_cycle) ||
      !text(m.role)
    ) return null;
  }
  const sessionMetadata = p.metadata, subscriptionMetadata = sub.metadata;
  if (
    ["plan", "billing_cycle", "role"].some((k) =>
      sessionMetadata[k] !== subscriptionMetadata[k]
    )
  ) return null;
  const line = Array.isArray(p.line_items) && p.line_items.length === 1
    ? p.line_items[0]
    : null;
  const settings = sub.trial_settings;
  if (
    !fields(line, ["price", "quantity"]) || !text(line.price) ||
    line.quantity !== 1 ||
    p.customer !== row.stripe_customer_id ||
    p.client_reference_id !== row.user_id || p.mode !== "subscription" ||
    p.payment_method_collection !== "always" ||
    !text(p.integration_identifier) || !redirectUrl(p.success_url) ||
    !redirectUrl(p.cancel_url) ||
    sub.trial_period_days !== PRO_TRIAL_DAYS ||
    row.trial_days !== PRO_TRIAL_DAYS ||
    !fields(settings, ["end_behavior"]) ||
    !fields(settings.end_behavior, ["missing_payment_method"]) ||
    settings.end_behavior.missing_payment_method !== "cancel" ||
    !fields(p.automatic_tax, ["enabled"]) ||
    typeof p.automatic_tax.enabled !== "boolean" ||
    !["auto", "required"].includes(String(p.billing_address_collection)) ||
    !fields(p.customer_update, ["address", "name"]) ||
    p.customer_update.address !== "auto" || p.customer_update.name !== "auto" ||
    !fields(p.tax_id_collection, ["enabled", "required"]) ||
    typeof p.tax_id_collection.enabled !== "boolean" ||
    p.tax_id_collection.required !== "if_supported"
  ) return null;
  return op as Operation;
}

export async function dispatchTrialCreate(
  stripe: Stripe,
  op: Operation,
): Promise<{
  session?: Stripe.Checkout.Session;
  error?: unknown;
  attempts: number;
  reliable: boolean;
}> {
  let attempts = 0, reliable = true;
  const listener = (event: unknown) => {
    const e = objectRecord(event);
    if (
      !e || !text(e.method) || !text(e.path) || !text(e.api_version) ||
      !Number.isFinite(e.request_start_time)
    ) {
      reliable = false;
      return;
    }
    if (e.method !== "POST" || e.path !== "/v1/checkout/sessions") return;
    if (!text(e.idempotency_key)) {
      reliable = false;
      return;
    }
    if (e.idempotency_key === op.key) {
      if (e.api_version !== op.api_version) reliable = false;
      attempts++;
    }
  };
  stripe.on("request", listener);
  try {
    return {
      session: await stripe.checkout.sessions.create(op.params, {
        idempotencyKey: op.key,
        apiVersion: op.api_version,
        maxNetworkRetries: 0,
        timeout: 15000,
      }),
      attempts,
      reliable,
    };
  } catch (error) {
    return { error, attempts, reliable };
  } finally {
    stripe.off("request", listener);
  }
}
function definitive(error: unknown): boolean {
  return error instanceof Stripe.errors.StripeError &&
    [400, 401, 402, 403, 404, 422].includes(error.statusCode ?? 0) &&
    [
      "StripeInvalidRequestError",
      "StripeAuthenticationError",
      "StripePermissionError",
      "StripeCardError",
    ].includes(error.type) &&
    !/idempotenc|conflict|lock_timeout/i.test(
      `${error.type} ${error.code ?? ""} ${error.rawType ?? ""}`,
    );
}
const matches = (
  params: Stripe.Checkout.SessionCreateParams,
  selection: Selection,
): boolean =>
  params.metadata?.plan === selection.plan &&
  params.metadata?.billing_cycle === selection.cycle &&
  params.success_url === selection.success &&
  params.cancel_url === selection.cancel;

export async function runTrialCheckout(input: {
  db: TrialStore;
  stripe: Stripe;
  userId: string;
  runtime: string;
  selection: Selection;
  headers: Record<string, string>;
  prepare: () => Promise<{ plan: CheckoutPlan; customerId: string } | Response>;
}): Promise<Response> {
  const { db, stripe, userId, runtime, selection } = input;
  const reply = (code: string, error: string, status = 409) =>
    new Response(JSON.stringify({ code, error }), {
      status,
      headers: { ...input.headers, "Content-Type": "application/json" },
    });
  const pending = () =>
    reply(
      "trial_checkout_pending",
      "Your trial checkout is still pending. Please try again shortly.",
    );
  let diagnostic: { claimId?: string; key?: string } = {};
  const unresolved = () => {
    log.warn("trial checkout needs support", diagnostic);
    return reply(
      "trial_checkout_unresolved",
      "We could not confirm your earlier trial checkout. Please contact support before starting another trial.",
    );
  };
  const used = () =>
    reply(
      "trial_already_used",
      "A free Pro trial has already been used on this account.",
    );
  const success = (session: Stripe.Checkout.Session) =>
    new Response(
      JSON.stringify({
        url: session.url,
        session_id: session.id,
        checkout_type: "subscription_trial",
        mode: runtime,
      }),
      { headers: { ...input.headers, "Content-Type": "application/json" } },
    );
  const current = async (id: string) => {
    const row = await readTrialById(db, id);
    return row && trialConsumed(row) ? used() : pending();
  };
  let restarts = 0;
  for (let contention = 0; contention < 4; contention++) {
    let row = await readTrialClaim(db, userId, runtime);
    let fresh = false;
    if (!row) {
      const prepared = await input.prepare();
      if (prepared instanceof Response) return prepared;
      const { plan, customerId } = prepared;
      const id = crypto.randomUUID();
      const metadata = {
        ...buildTrialMetadata(),
        trial_claim_id: id,
        user_id: userId,
        plan: selection.plan,
        plan_key: plan.planKey,
        audience: plan.audience,
        role: plan.role,
        billing_cycle: plan.billingCycle,
      };
      const params: Stripe.Checkout.SessionCreateParams = {
        ...CHECKOUT_TAX_COLLECTION_PARAMS,
        customer: customerId,
        client_reference_id: userId,
        line_items: [{ price: plan.priceId, quantity: 1 }],
        mode: "subscription",
        integration_identifier: STRIPE_CHECKOUT_INTEGRATION_IDENTIFIER,
        success_url: selection.success,
        cancel_url: selection.cancel,
        payment_method_collection: "always",
        metadata,
        subscription_data: {
          trial_period_days: PRO_TRIAL_DAYS,
          trial_settings: {
            end_behavior: { missing_payment_method: "cancel" },
          },
          metadata: {
            ...metadata,
            ...(plan.productId ? { product_id: plan.productId } : {}),
          },
        },
      };
      const created = Date.now();
      const operation: Operation = {
        version: 1,
        key: await buildIdempotencyKey("trial-checkout-v1", [id]),
        params: JSON.parse(JSON.stringify(params)),
        api_version: STRIPE_API_VERSION,
        created_at: new Date(created).toISOString(),
        replay_before: new Date(created + HORIZON_MS).toISOString(),
        dispatch_count: 0,
        revision: crypto.randomUUID(),
      };
      const insert: TrialClaim = {
        id,
        user_id: userId,
        plan_key: plan.planKey,
        pricing_audience: plan.audience,
        stripe_customer_id: customerId,
        status: "checkout_started",
        trial_days: PRO_TRIAL_DAYS,
        runtime_mode: runtime,
        livemode: runtime === "live",
        stripe_checkout_session_id: null,
        stripe_subscription_id: null,
        metadata: { ...buildTrialMetadata(), checkout_operation_v1: operation },
      };
      const { data, error } = await db.from("subscription_trial_claims").insert(
        insert,
      ).select("*").single();
      if (error) {
        if (error.code === "23505") continue;
        throw error;
      }
      if (!data?.id) throw new Error("Trial claim reservation failed");
      row = data as TrialClaim;
      fresh = true;
    }
    diagnostic = {
      claimId: row.id,
      key: typeof objectRecord(row.metadata?.checkout_operation_v1)?.key ===
          "string"
        ? objectRecord(row.metadata.checkout_operation_v1)!.key as string
        : undefined,
    };
    if (trialConsumed(row)) return used();
    if (!trialPending(row)) return unresolved();
    if (
      row.plan_key !== selection.plan ||
      row.pricing_audience !== selection.audience
    ) return pending();
    const op = readTrialOperation(row);
    if (op && !matches(op.params, selection)) return pending();
    if (!fresh) {
      const { data, error } = await db.from("billing_customers").select(
        "stripe_customer_id,livemode",
      ).eq("user_id", userId).eq("runtime_mode", runtime).maybeSingle();
      if (error) return pending();
      if (
        data?.stripe_customer_id !== row.stripe_customer_id ||
        data?.livemode !== row.livemode
      ) return unresolved();
      try {
        const customer = await stripe.customers.retrieve(
          row.stripe_customer_id,
        );
        if (
          customer.deleted || customer.metadata.user_id !== userId ||
          customer.livemode !== row.livemode
        ) return unresolved();
      } catch {
        return pending();
      }
    }
    let session: Stripe.Checkout.Session;
    if (row.stripe_checkout_session_id) {
      try {
        session = await stripe.checkout.sessions.retrieve(
          row.stripe_checkout_session_id,
        );
      } catch {
        return pending();
      }
    } else {
      if (!op || Date.now() >= Date.parse(op.replay_before)) {
        return unresolved();
      }
      const dispatched = await mutateTrialClaim(db, row, {
        metadata: {
          checkout_operation_v1: {
            ...op,
            dispatch_count: op.dispatch_count + 1,
          },
        },
      });
      if (!dispatched) continue;
      row = dispatched;
      const attempted = readTrialOperation(row);
      if (!attempted || Date.now() >= Date.parse(attempted.replay_before)) {
        return unresolved();
      }
      const result = await dispatchTrialCreate(stripe, attempted);
      if (!result.session) {
        log.warn("trial checkout dispatch unresolved", {
          claimId: row.id,
          key: attempted.key,
          attempts: result.attempts,
          requestId: result.error instanceof Stripe.errors.StripeError
            ? result.error.requestId
            : null,
        });
        if (
          attempted.dispatch_count === 1 && result.reliable &&
          result.attempts === 1 && definitive(result.error)
        ) {
          try {
            if (await mutateTrialClaim(db, row, null)) {
              return reply(
                "trial_checkout_rejected",
                "Trial checkout was rejected. Please try again.",
                400,
              );
            }
          } catch {
            return pending();
          }
          return await current(row.id);
        }
        return await current(row.id);
      }
      session = result.session;
      if (
        attempted.dispatch_count > 1 || result.attempts > 1 || !result.reliable
      ) {
        try {
          session = await stripe.checkout.sessions.retrieve(session.id);
        } catch {
          return pending();
        }
      }
    }
    try {
      validateTrialObject(row, session, "session");
    } catch {
      return unresolved();
    }
    if (
      !op &&
      (session.metadata?.billing_cycle !== selection.cycle ||
        session.success_url !== selection.success ||
        session.cancel_url !== selection.cancel)
    ) return pending();
    const subscriptionId = stripeId(session.subscription);
    if (subscriptionId || session.status === "complete") return used();
    if (session.status === "expired") {
      const latest = await readTrialById(db, row.id);
      if (!latest || !trialPending(latest)) {
        return latest && trialConsumed(latest) ? used() : pending();
      }
      try {
        validateTrialObject(latest, session, "session");
      } catch {
        return unresolved();
      }
      if (
        !await mutateTrialClaim(db, latest, {
          status: "checkout_abandoned",
          stripe_checkout_session_id: session.id,
        })
      ) continue;
      if (restarts++ === 0) continue;
      return pending();
    }
    if (session.status !== "open" || !httpsUrl(session.url)) return pending();
    for (let binding = 0; binding < 3; binding++) {
      const latest = await readTrialById(db, row.id);
      if (!latest || latest.status === "checkout_abandoned") return pending();
      try {
        validateTrialObject(latest, session, "session");
      } catch {
        return unresolved();
      }
      if (trialConsumed(latest)) return used();
      if (!trialPending(latest)) return unresolved();
      if (latest.stripe_checkout_session_id === session.id) {
        return success(session);
      }
      try {
        if (
          await mutateTrialClaim(db, latest, {
            status: "checkout_created",
            stripe_checkout_session_id: session.id,
          })
        ) return success(session);
      } catch {
        return pending();
      }
    }
    return pending();
  }
  return pending();
}
