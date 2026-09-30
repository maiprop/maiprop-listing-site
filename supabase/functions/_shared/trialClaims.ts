// deno-lint-ignore-file no-import-prefix -- Repository frozen dependency policy.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import type Stripe from "npm:stripe@22.3.0";

export type TrialStore = Pick<SupabaseClient, "from">;
export type TrialClaim = {
  id: string;
  user_id: string;
  runtime_mode: string;
  livemode: boolean;
  stripe_customer_id: string;
  stripe_checkout_session_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  plan_key: string;
  pricing_audience: string;
  trial_days: number;
  metadata: Record<string, unknown>;
};
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const objectRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
export const stripeId = (value: unknown): string | null =>
  typeof value === "string"
    ? value
    : typeof objectRecord(value)?.id === "string"
    ? objectRecord(value)!.id as string
    : null;
export const trialConsumed = (row: TrialClaim): boolean =>
  Boolean(row.stripe_subscription_id) ||
  ["trialing", "active", "past_due", "canceled", "expired"].includes(
    row.status,
  );
export const trialPending = (row: TrialClaim): boolean =>
  !trialConsumed(row) &&
  ["checkout_started", "checkout_created"].includes(row.status);

export async function readTrialClaim(
  db: TrialStore,
  userId: string,
  runtime: string,
): Promise<TrialClaim | null> {
  const { data, error } = await db.from("subscription_trial_claims").select("*")
    .eq("user_id", userId).eq("runtime_mode", runtime).neq(
      "status",
      "checkout_abandoned",
    ).maybeSingle();
  if (error) throw error;
  return data as TrialClaim | null;
}
export async function readTrialById(
  db: TrialStore,
  id: string,
): Promise<TrialClaim | null> {
  const { data, error } = await db.from("subscription_trial_claims").select("*")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return data as TrialClaim | null;
}

// Every mutation is conditioned on the complete observed admission identity/state.
// .select() is essential: a successful HTTP response with zero rows is a CAS loss.
export async function mutateTrialClaim(
  db: TrialStore,
  row: TrialClaim,
  patch: Record<string, unknown> | null,
): Promise<TrialClaim | null> {
  const operation = objectRecord(row.metadata?.checkout_operation_v1);
  if (operation && !isUuid(operation.revision)) {
    throw new Error("trial operation revision invalid");
  }
  const payload = patch
    ? { ...patch, updated_at: new Date().toISOString() }
    : null;
  if (payload) {
    const metadata = {
      ...row.metadata,
      ...(objectRecord(patch?.metadata) ?? {}),
    };
    if (operation) {
      metadata.checkout_operation_v1 = {
        ...operation,
        ...(objectRecord(metadata.checkout_operation_v1) ?? {}),
        revision: crypto.randomUUID(),
      };
    }
    Object.assign(payload, { metadata });
  }
  let query = payload
    ? db.from("subscription_trial_claims").update(payload)
    : db.from("subscription_trial_claims").delete();
  query = query.eq("id", row.id).eq("user_id", row.user_id).eq(
    "runtime_mode",
    row.runtime_mode,
  )
    .eq("livemode", row.livemode).eq(
      "stripe_customer_id",
      row.stripe_customer_id,
    ).eq("status", row.status);
  query = row.stripe_checkout_session_id === null
    ? query.is("stripe_checkout_session_id", null)
    : query.eq("stripe_checkout_session_id", row.stripe_checkout_session_id);
  query = row.stripe_subscription_id === null
    ? query.is("stripe_subscription_id", null)
    : query.eq("stripe_subscription_id", row.stripe_subscription_id);
  if (operation) {
    query = query.eq(
      "metadata->checkout_operation_v1->>revision",
      operation.revision,
    )
      .eq(
        "metadata->checkout_operation_v1->>dispatch_count",
        operation.dispatch_count,
      );
  }
  const { data, error } = await query.select("*");
  if (error) throw error;
  return data?.[0] as TrialClaim ?? null;
}

type TrialObject = {
  id: string;
  metadata?: Stripe.Metadata | null;
  customer?: unknown;
  livemode: boolean;
  client_reference_id?: string | null;
};
export function validateTrialObject(
  row: TrialClaim,
  object: TrialObject,
  kind: "session" | "subscription",
  pairedLegacySession = false,
): void {
  const metadata = object.metadata ?? {};
  const bound = kind === "session"
    ? row.stripe_checkout_session_id
    : row.stripe_subscription_id;
  const claimId = metadata.trial_claim_id;
  if (
    !object.id || !row.stripe_customer_id ||
    (kind === "session" && object.client_reference_id != null &&
      object.client_reference_id !== row.user_id) ||
    metadata.checkout_type !== "subscription_trial" ||
    metadata.user_id !== row.user_id ||
    stripeId(object.customer) !== row.stripe_customer_id ||
    object.livemode !== row.livemode ||
    (object.livemode ? "live" : "test") !== row.runtime_mode ||
    (claimId
      ? !isUuid(claimId) || claimId !== row.id
      : bound !== object.id && !(pairedLegacySession && bound === null)) ||
    (bound !== null && bound !== object.id) ||
    (metadata.plan_key !== undefined && metadata.plan_key !== row.plan_key) ||
    (metadata.audience !== undefined &&
      metadata.audience !== row.pricing_audience)
  ) {
    throw new Error("trial claim provider identity mismatch");
  }
}

export async function reconcileTrialClaim(
  db: TrialStore,
  object: TrialObject,
  kind: "session" | "subscription",
  status: string,
  sub: Stripe.Subscription | null = null,
  sessionSubscription: unknown = null,
): Promise<boolean> {
  if (object.metadata?.checkout_type !== "subscription_trial") return false;
  const claimId = object.metadata.trial_claim_id;
  if (claimId && !isUuid(claimId)) {
    throw new Error("invalid trial claim identity");
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const column = kind === "session"
      ? "stripe_checkout_session_id"
      : "stripe_subscription_id";
    const { data, error } = await db.from("subscription_trial_claims").select(
      "*",
    )
      .eq(claimId ? "id" : column, claimId || object.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("trial claim reconciliation target missing");
    const row = data as TrialClaim;
    validateTrialObject(row, object, kind);
    if (sub) {
      validateTrialObject(
        row,
        sub,
        "subscription",
        !claimId && !sub.metadata?.trial_claim_id,
      );
      if (
        object.metadata?.trial_claim_id !== sub.metadata?.trial_claim_id ||
        object.metadata?.user_id !== sub.metadata?.user_id ||
        stripeId(sessionSubscription) !== sub.id
      ) {
        throw new Error("trial session/subscription identity mismatch");
      }
    }
    const subscriptionId = kind === "subscription"
      ? object.id
      : sub?.id ?? stripeId(sessionSubscription);
    if (
      row.stripe_subscription_id && subscriptionId &&
      row.stripe_subscription_id !== subscriptionId
    ) throw new Error("trial subscription conflict");
    if (status === "checkout_abandoned") {
      if (subscriptionId || trialConsumed(row)) {
        throw new Error("consumed trial cannot be abandoned");
      }
      if (row.status === "checkout_abandoned") return true;
      if (!trialPending(row)) throw new Error("trial expiry state unresolved");
    } else if (row.status === "checkout_abandoned") {
      throw new Error("abandoned trial contradicts provider completion");
    }
    const nextStatus = trialConsumed(row) && status === "checkout_created"
      ? row.status
      : status;
    const sessionId = kind === "session"
      ? object.id
      : row.stripe_checkout_session_id;
    const nextSub = subscriptionId ?? row.stripe_subscription_id;
    if (
      row.status === nextStatus &&
      row.stripe_checkout_session_id === sessionId &&
      row.stripe_subscription_id === nextSub
    ) return true;
    const metadata = { ...object.metadata, ...(sub?.metadata ?? {}) };
    // Provider metadata can never overwrite a locally persisted operation.
    delete metadata.checkout_operation_v1;
    if (
      await mutateTrialClaim(db, row, {
        status: nextStatus,
        stripe_checkout_session_id: sessionId,
        stripe_subscription_id: nextSub,
        metadata: {
          ...metadata,
          ...(status === "checkout_abandoned"
            ? { checkout_expired_at: new Date().toISOString() }
            : {}),
        },
      })
    ) return true;
  }
  throw new Error("trial claim reconciliation contention");
}
