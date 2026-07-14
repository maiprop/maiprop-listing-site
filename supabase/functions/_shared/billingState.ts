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
      current_period_start?: number | null;
      current_period_end?: number | null;
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

export type BillingSubscriptionCanonical = {
  planKey: string;
  audience: string;
  productId: string;
  priceId: string | null;
  billingCycle: "monthly" | "annual" | null;
};

export type BillingSubscriptionObservation = {
  source: "webhook_canonical" | "reconciliation" | "legacy";
  observedAt: string;
  stripeEventId?: string | null;
  stripeEventCreatedAt?: string | null;
};

export type BillingSubscriptionInput = {
  userId: string;
  stripeCustomerId: string;
  subscription: StripeSubscriptionLike;
  canonical?: BillingSubscriptionCanonical | null;
  observation?: BillingSubscriptionObservation | null;
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

export type StripeWebhookEventBeginResult =
  | { state: "started"; claimToken: string }
  | { state: "duplicate" }
  | { state: "in_progress" };

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
  state_source?: BillingSubscriptionObservation["source"];
  state_observed_at?: string;
  stripe_event_id?: string | null;
  stripe_event_created_at?: string | null;
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

const firstSubscriptionItem = (subscription: StripeSubscriptionLike) =>
  subscription.items?.data?.[0] ?? null;

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
  const item = firstSubscriptionItem(subscription);
  const price = firstSubscriptionPrice(subscription);
  const livemode = Boolean(subscription.livemode);
  const metadata = subscription.metadata ?? {};
  const canonical = input.canonical;
  const observation = input.observation;
  return {
    user_id: input.userId,
    stripe_customer_id: input.stripeCustomerId,
    stripe_subscription_id: subscription.id,
    stripe_product_id: canonical?.productId ??
      productIdFromPrice(price?.product),
    stripe_price_id: canonical?.priceId ?? price?.id ?? null,
    plan_key: canonical?.planKey ?? metadata.plan_key ?? metadata.plan ?? null,
    audience: canonical?.audience ?? metadata.audience ?? null,
    status: subscription.status ?? "unknown",
    billing_cycle: canonical?.billingCycle ??
      normalizedBillingCycle(metadata.billing_cycle),
    current_period_start: isoFromUnixSeconds(
      subscription.current_period_start ?? item?.current_period_start,
    ),
    current_period_end: isoFromUnixSeconds(
      subscription.current_period_end ?? item?.current_period_end,
    ),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    trial_start: isoFromUnixSeconds(subscription.trial_start),
    trial_end: isoFromUnixSeconds(subscription.trial_end),
    runtime_mode: stripeRuntimeModeFromLivemode(livemode),
    livemode,
    metadata,
    ...(observation
      ? {
        state_source: observation.source,
        state_observed_at: observation.observedAt,
        ...(observation.stripeEventId
          ? { stripe_event_id: observation.stripeEventId }
          : {}),
        ...(observation.stripeEventCreatedAt
          ? { stripe_event_created_at: observation.stripeEventCreatedAt }
          : {}),
      }
      : {}),
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
      onConflict: "user_id,runtime_mode",
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
): Promise<StripeWebhookEventBeginResult> {
  const livemode = Boolean(event.livemode);
  const processingStartedAt = new Date().toISOString();
  const claimToken = crypto.randomUUID();
  const { error } = await supabase.from("stripe_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
    api_version: event.api_version ?? null,
    runtime_mode: stripeRuntimeModeFromLivemode(livemode),
    livemode,
    status: "processing",
    metadata: {
      processing_started_at: processingStartedAt,
      processing_claim_token: claimToken,
    },
  });
  if (!error) return { state: "started", claimToken };
  if (isDuplicateWebhookInsertError(error)) {
    const { data, error: lookupError } = await supabase
      .from("stripe_webhook_events")
      .select<StripeWebhookEventLeaseRow>("status, updated_at, metadata")
      .eq("event_id", event.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    const row = data ?? null;
    if (row?.status === "processing" && !isStaleProcessingWebhookEvent(row)) {
      return { state: "in_progress" };
    }
    const rowStatus = row?.status ?? null;
    if (rowStatus === "failed" || isStaleProcessingWebhookEvent(row)) {
      if (!rowStatus) return { state: "duplicate" };
      const claimBase = supabase
        .from("stripe_webhook_events")
        .update({
          status: "processing",
          error: null,
          processed_at: null,
          metadata: {
            processing_started_at: processingStartedAt,
            processing_claim_token: claimToken,
          },
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
      return claim.data?.event_id
        ? { state: "started", claimToken }
        : { state: "duplicate" };
    }
    return { state: "duplicate" };
  }
  throw error;
}

export async function finishStripeWebhookEvent(
  supabase: SupabaseAdminClient,
  eventId: string,
  claimToken: string,
  status: "processed" | "failed" | "skipped",
  errorMessage: string | null = null,
): Promise<boolean> {
  const normalizedClaimToken = claimToken.trim();
  if (!normalizedClaimToken) {
    throw new Error(
      "Stripe webhook claim token is required to finish an event.",
    );
  }
  const { data, error } = await supabase
    .from("stripe_webhook_events")
    .update({
      status,
      error: errorMessage,
      processed_at: new Date().toISOString(),
    })
    .eq("event_id", eventId)
    .eq("status", "processing")
    .eq("metadata->>processing_claim_token", normalizedClaimToken)
    .select<StripeWebhookEventClaimRow>("event_id")
    .maybeSingle();
  if (error) throw error;
  return data?.event_id === eventId;
}
