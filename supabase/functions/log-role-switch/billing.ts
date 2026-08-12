import { shouldSkipProfileEntitlementSync } from "../stripe-webhook/addonGuard.ts";

export class BillingResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingResolutionError";
  }
}

type StripeCustomerRef = { id: string; deleted?: boolean | void };

type StripeRequestOptions = {
  timeout: number;
  maxNetworkRetries: 0;
  idempotencyKey?: string;
};

type StripeCustomerClient = {
  customers: {
    search: (
      args: { query: string; limit: number },
      options?: StripeRequestOptions,
    ) => PromiseLike<{ data: StripeCustomerRef[] }>;
    retrieve: (
      id: string,
      params?: Record<string, never>,
      options?: StripeRequestOptions,
    ) => PromiseLike<StripeCustomerRef>;
  };
};

type RoleSwitchSubscription = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  metadata?: Record<string, string> | null;
};

export type RoleSwitchStripeClient = StripeCustomerClient & {
  subscriptions: {
    list: (args: {
      customer: string;
      status: "all";
      limit: number;
      starting_after?: string;
    }, options?: StripeRequestOptions) => PromiseLike<{
      data: RoleSwitchSubscription[];
      has_more: boolean;
    }>;
    update: (
      id: string,
      args: { cancel_at_period_end: true },
      options: StripeRequestOptions & { idempotencyKey: string },
    ) => PromiseLike<unknown>;
  };
};

export const DEFAULT_STRIPE_RECONCILIATION_REQUEST_TIMEOUT_MS = 3_000;

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Role-switch billing deadline exceeded", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

async function runSignalAwareOperation<T>(
  signal: AbortSignal | undefined,
  operation: () => PromiseLike<T>,
): Promise<T> {
  throwIfAborted(signal);
  const result = await operation();
  throwIfAborted(signal);
  return result;
}

function stripeRequestOptions(timeout: number): StripeRequestOptions {
  if (!Number.isFinite(timeout) || timeout < 1) {
    throw new Error("Invalid Stripe reconciliation request timeout");
  }
  return { timeout, maxNetworkRetries: 0 };
}

export type RoleSwitchBillingOutcome =
  | "not_required"
  | "succeeded"
  | "already_pending"
  | "unknown";

export type RoleSwitchBillingResult = {
  billingOutcome: RoleSwitchBillingOutcome;
  billingError: string | null;
  errorDetail: string | null;
  hadActiveSub: boolean | null;
  subscriptionCount: number | null;
  cancelledCount: number | null;
  newlyCancelledCount: number;
  alreadyPendingCount: number;
};

export async function resolveOwnedStripeCustomer(options: {
  stripe: StripeCustomerClient;
  user: { id: string; email: string };
  lookupDurableCustomerId: (signal?: AbortSignal) => Promise<string | null>;
  onMetadataSearchError?: (error: unknown) => void;
  signal?: AbortSignal;
  providerRequestTimeoutMs?: number;
}): Promise<{ id: string } | null> {
  const requestOptions = stripeRequestOptions(
    options.providerRequestTimeoutMs ??
      DEFAULT_STRIPE_RECONCILIATION_REQUEST_TIMEOUT_MS,
  );
  let metadataSearchFailed = false;
  try {
    const search = await runSignalAwareOperation(
      options.signal,
      () =>
        options.stripe.customers.search({
          query: `metadata['user_id']:'${options.user.id}'`,
          limit: 1,
        }, requestOptions),
    );
    if (search.data[0]) return { id: search.data[0].id };
  } catch (error: unknown) {
    throwIfAborted(options.signal);
    metadataSearchFailed = true;
    options.onMetadataSearchError?.(error);
  }

  const durableCustomerId = await runSignalAwareOperation(
    options.signal,
    () => options.lookupDurableCustomerId(options.signal),
  );
  if (durableCustomerId) {
    const customer = await runSignalAwareOperation(
      options.signal,
      () =>
        options.stripe.customers.retrieve(
          durableCustomerId,
          {},
          requestOptions,
        ),
    );
    if (customer.deleted) {
      throw new BillingResolutionError("Durable Stripe customer was deleted");
    }
    return { id: customer.id };
  }

  if (metadataSearchFailed) {
    throw new BillingResolutionError(
      "Unable to verify Stripe customer ownership",
    );
  }
  return null;
}

export function stripeRuntimeFromKey(
  stripeKey: string,
): { runtimeMode: "test" | "live"; livemode: boolean } {
  if (stripeKey.startsWith("sk_live_")) {
    return { runtimeMode: "live", livemode: true };
  }
  if (stripeKey.startsWith("sk_test_")) {
    return { runtimeMode: "test", livemode: false };
  }
  throw new BillingResolutionError("Stripe runtime could not be verified");
}

const listCoreBillableSubscriptions = async (
  stripe: RoleSwitchStripeClient,
  customerId: string,
  signal: AbortSignal | undefined,
  requestOptions: StripeRequestOptions,
): Promise<RoleSwitchSubscription[]> => {
  const billableStatuses = new Set(["active", "trialing", "past_due"]);
  const subscriptions: RoleSwitchSubscription[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < 10; page += 1) {
    const result = await runSignalAwareOperation(
      signal,
      () =>
        stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        }, requestOptions),
    );
    subscriptions.push(
      ...result.data.filter((subscription) =>
        billableStatuses.has(subscription.status) &&
        !shouldSkipProfileEntitlementSync(subscription)
      ),
    );
    if (!result.has_more) return subscriptions;
    startingAfter = result.data.at(-1)?.id;
    if (!startingAfter) break;
  }

  throw new Error("Stripe subscription pagination exceeded the safety limit");
};

export const unknownRoleSwitchBillingResult = (
  error: unknown,
  partial: Partial<
    Pick<
      RoleSwitchBillingResult,
      | "hadActiveSub"
      | "subscriptionCount"
      | "cancelledCount"
      | "newlyCancelledCount"
      | "alreadyPendingCount"
    >
  > = {},
): RoleSwitchBillingResult => ({
  billingOutcome: "unknown",
  billingError: error instanceof BillingResolutionError
    ? "customer_resolution_failed"
    : "stripe_operation_failed",
  errorDetail: error instanceof Error ? error.message : String(error),
  hadActiveSub: partial.hadActiveSub ?? null,
  subscriptionCount: partial.subscriptionCount ?? null,
  cancelledCount: partial.cancelledCount ?? null,
  newlyCancelledCount: partial.newlyCancelledCount ?? 0,
  alreadyPendingCount: partial.alreadyPendingCount ?? 0,
});

export async function reconcileRoleSwitchBilling(options: {
  stripe: RoleSwitchStripeClient;
  user: { id: string; email: string };
  auditId: string;
  lookupDurableCustomerId: (signal?: AbortSignal) => Promise<string | null>;
  onMetadataSearchError?: (error: unknown) => void;
  signal?: AbortSignal;
  providerRequestTimeoutMs?: number;
}): Promise<RoleSwitchBillingResult> {
  const requestOptions = stripeRequestOptions(
    options.providerRequestTimeoutMs ??
      DEFAULT_STRIPE_RECONCILIATION_REQUEST_TIMEOUT_MS,
  );
  let hadActiveSub: boolean | null = null;
  let subscriptionCount: number | null = null;
  let cancelledCount: number | null = null;
  let newlyCancelledCount = 0;
  let alreadyPendingCount = 0;

  try {
    const customer = await resolveOwnedStripeCustomer({
      stripe: options.stripe,
      user: options.user,
      lookupDurableCustomerId: options.lookupDurableCustomerId,
      onMetadataSearchError: options.onMetadataSearchError,
      signal: options.signal,
      providerRequestTimeoutMs: requestOptions.timeout,
    });
    if (!customer) {
      return {
        billingOutcome: "not_required",
        billingError: null,
        errorDetail: null,
        hadActiveSub: false,
        subscriptionCount: 0,
        cancelledCount: 0,
        newlyCancelledCount: 0,
        alreadyPendingCount: 0,
      };
    }

    const subscriptions = await listCoreBillableSubscriptions(
      options.stripe,
      customer.id,
      options.signal,
      requestOptions,
    );
    subscriptionCount = subscriptions.length;
    hadActiveSub = subscriptionCount > 0;
    cancelledCount = 0;

    for (const subscription of subscriptions) {
      if (subscription.cancel_at_period_end) {
        alreadyPendingCount += 1;
        cancelledCount += 1;
        continue;
      }
      await runSignalAwareOperation(
        options.signal,
        () =>
          options.stripe.subscriptions.update(
            subscription.id,
            { cancel_at_period_end: true },
            {
              ...requestOptions,
              idempotencyKey:
                `role-switch:${options.auditId}:${subscription.id}`,
            },
          ),
      );
      newlyCancelledCount += 1;
      cancelledCount += 1;
    }

    return {
      billingOutcome: subscriptionCount === 0
        ? "not_required"
        : alreadyPendingCount === subscriptionCount
        ? "already_pending"
        : "succeeded",
      billingError: null,
      errorDetail: null,
      hadActiveSub,
      subscriptionCount,
      cancelledCount,
      newlyCancelledCount,
      alreadyPendingCount,
    };
  } catch (error: unknown) {
    throwIfAborted(options.signal);
    return unknownRoleSwitchBillingResult(error, {
      hadActiveSub,
      subscriptionCount,
      cancelledCount,
      newlyCancelledCount,
      alreadyPendingCount,
    });
  }
}
