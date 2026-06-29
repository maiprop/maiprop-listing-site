import type { StripeRuntimeMode } from "./stripeClient.ts";

type StripeSubscriptionLike = {
  id: string;
  status?: string | null;
  livemode?: boolean | null;
  cancel_at_period_end?: boolean | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  trial_start?: number | null;
  trial_end?: number | null;
  metadata?: Record<string, string | undefined> | null;
  items?: {
    data?: Array<{
      price?: {
        id?: string | null;
        product?: string | { id?: string | null } | null;
      } | null;
    }>;
  } | null;
};

type BillingCustomerInput = {
  userId: string;
  stripeCustomerId: string;
  email?: string | null;
  livemode?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

type BillingSubscriptionInput = {
  userId: string;
  stripeCustomerId: string;
  subscription: StripeSubscriptionLike;
};

type SupabaseQueryResult<T = unknown> = {
  data?: T | null;
  error?: unknown;
};

type SupabaseFilterBuilder<T = unknown> =
  & PromiseLike<SupabaseQueryResult<T>>
  & {
    select<U = T>(columns: string): SupabaseFilterBuilder<U>;
    eq(column: string, value: unknown): SupabaseFilterBuilder<T>;
    lt(column: string, value: unknown): SupabaseFilterBuilder<T>;
    maybeSingle(): PromiseLike<SupabaseQueryResult<T>>;
  };

type StripeWebhookEventLeaseRow = {
  status?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type StripeWebhookEventClaimRow = {
  event_id?: string | null;
};

export type BillingCustomerRow = {
  user_id: string;
  stripe_customer_id: string;
  email: string | null;
  runtime_mode: StripeRuntimeMode;
  livemode: boolean;
  metadata: Record<string, unknown>;
};

export type BillingSubscriptionRow = {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  plan_key: string | null;
  audience: string | null;
  status: string;
  billing_cycle: "monthly" | "annual" | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_start: string | null;
  trial_end: string | null;
  runtime_mode: StripeRuntimeMode;
  livemode: boolean;
  metadata: Record<string, unknown>;
};

type SupabaseAdminClient = {
  from(table: string): {
    upsert(
      payload: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<{ error: unknown }>;
    insert(payload: Record<string, unknown>): Promise<{ error: unknown }>;
    select<T = unknown>(columns: string): SupabaseFilterBuilder<T>;
    update(payload: Record<string, unknown>): SupabaseFilterBuilder;
  };
};

const WEBHOOK_PROCESSING_LEASE_MS = 10 * 60 * 1000;

export function stripeRuntimeModeFromLivemode(
  livemode?: boolean | null,
): StripeRuntimeMode {
  return livemode ? "live" : "test";
}

const isoFromUnixSeconds = (value?: number | null): string | null => {
  if (!value) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const firstSubscriptionPrice = (subscription: StripeSubscriptionLike) =>
  subscription.items?.data?.[0]?.price ?? null;

const productIdFromPrice = (
  product: string | { id?: string | null } | null | undefined,
): string | null => {
  if (typeof product === "string") return product;
  return product?.id ?? null;
};

const normalizedBillingCycle = (
  value: string | null | undefined,
): "monthly" | "annual" | null => {
  if (value === "monthly" || value === "annual") return value;
  return null;
};

export function buildBillingCustomerRow(
  input: BillingCustomerInput,
): BillingCustomerRow {
  const livemode = Boolean(input.livemode);
  return {
    user_id: input.userId,
    stripe_customer_id: input.stripeCustomerId,
    email: input.email ?? null,
    runtime_mode: stripeRuntimeModeFromLivemode(livemode),
    livemode,
    metadata: input.metadata ?? {},
  };
}

export function buildBillingSubscriptionRow(
  input: BillingSubscriptionInput,
): BillingSubscriptionRow {
  const subscription = input.subscription;
  const price = firstSubscriptionPrice(subscription);
  const livemode = Boolean(subscription.livemode);
  const metadata = subscription.metadata ?? {};
  return {
    user_id: input.userId,
    stripe_customer_id: input.stripeCustomerId,
    stripe_subscription_id: subscription.id,
    stripe_product_id: productIdFromPrice(price?.product),
    stripe_price_id: price?.id ?? null,
    plan_key: metadata.plan_key ?? metadata.plan ?? null,
    audience: metadata.audience ?? null,
    status: subscription.status ?? "unknown",
    billing_cycle: normalizedBillingCycle(metadata.billing_cycle),
    current_period_start: isoFromUnixSeconds(subscription.current_period_start),
    current_period_end: isoFromUnixSeconds(subscription.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    trial_start: isoFromUnixSeconds(subscription.trial_start),
    trial_end: isoFromUnixSeconds(subscription.trial_end),
    runtime_mode: stripeRuntimeModeFromLivemode(livemode),
    livemode,
    metadata,
  };
}

export function isDuplicateWebhookInsertError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" &&
      (error as { code?: string }).code === "23505",
  );
}

export function isStaleProcessingWebhookEvent(
  row: {
    status?: string | null;
    updated_at?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null,
  now = new Date(),
): boolean {
  if (row?.status !== "processing") return false;
  const startedAt = typeof row.metadata?.processing_started_at === "string"
    ? row.metadata.processing_started_at
    : row.updated_at;
  if (!startedAt) return false;
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return false;
  return now.getTime() - started.getTime() > WEBHOOK_PROCESSING_LEASE_MS;
}

export async function upsertBillingCustomer(
  supabase: SupabaseAdminClient,
  input: BillingCustomerInput,
): Promise<void> {
  const { error } = await supabase
    .from("billing_customers")
    .upsert(buildBillingCustomerRow(input), {
      onConflict: "stripe_customer_id",
    });
  if (error) throw error;
}

export async function upsertBillingSubscription(
  supabase: SupabaseAdminClient,
  input: BillingSubscriptionInput,
): Promise<void> {
  const { error } = await supabase
    .from("billing_subscriptions")
    .upsert(buildBillingSubscriptionRow(input), {
      onConflict: "stripe_subscription_id",
    });
  if (error) throw error;
}

export async function beginStripeWebhookEvent(
  supabase: SupabaseAdminClient,
  event: {
    id: string;
    type: string;
    api_version?: string | null;
    livemode?: boolean | null;
  },
): Promise<"started" | "duplicate" | "in_progress"> {
  const livemode = Boolean(event.livemode);
  const processingStartedAt = new Date().toISOString();
  const { error } = await supabase.from("stripe_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
    api_version: event.api_version ?? null,
    runtime_mode: stripeRuntimeModeFromLivemode(livemode),
    livemode,
    status: "processing",
    metadata: { processing_started_at: processingStartedAt },
  });
  if (!error) return "started";
  if (isDuplicateWebhookInsertError(error)) {
    const { data, error: lookupError } = await supabase
      .from("stripe_webhook_events")
      .select<StripeWebhookEventLeaseRow>("status, updated_at, metadata")
      .eq("event_id", event.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    const row = data ?? null;
    if (row?.status === "processing" && !isStaleProcessingWebhookEvent(row)) {
      return "in_progress";
    }
    const rowStatus = row?.status ?? null;
    if (rowStatus === "failed" || isStaleProcessingWebhookEvent(row)) {
      if (!rowStatus) return "duplicate";
      const claimBase = supabase
        .from("stripe_webhook_events")
        .update({
          status: "processing",
          error: null,
          processed_at: null,
          metadata: { processing_started_at: processingStartedAt },
        })
        .eq("event_id", event.id)
        .eq("status", rowStatus);
      const claimQuery = rowStatus === "processing"
        ? claimBase.lt(
          "updated_at",
          new Date(Date.now() - WEBHOOK_PROCESSING_LEASE_MS).toISOString(),
        )
        : claimBase;
      const claim = await claimQuery
        .select<StripeWebhookEventClaimRow>("event_id")
        .maybeSingle();
      if (claim.error) throw claim.error;
      return claim.data?.event_id ? "started" : "duplicate";
    }
    return "duplicate";
  }
  throw error;
}

export async function finishStripeWebhookEvent(
  supabase: SupabaseAdminClient,
  eventId: string,
  status: "processed" | "failed" | "skipped",
  errorMessage: string | null = null,
): Promise<void> {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      status,
      error: errorMessage,
      processed_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
  if (error) throw error;
}
