import { buildIdempotencyKey } from "../_shared/stripeClient.ts";

const STRIPE_RESUME_TIMEOUT_MS = 10_000;

type SubscriptionState = {
  cancel_at_period_end: boolean;
};

type ResumeSubscriptionClient = {
  subscriptions: {
    update: (
      subscriptionId: string,
      params: { cancel_at_period_end: false },
      options: {
        idempotencyKey: string;
        timeout: number;
        maxNetworkRetries: number;
      },
    ) => Promise<SubscriptionState>;
    retrieve: (
      subscriptionId: string,
      options?: { timeout: number; maxNetworkRetries: number },
    ) => Promise<SubscriptionState>;
  };
};

export async function resumeSubscriptionSafely(
  stripe: ResumeSubscriptionClient,
  subscriptionId: string,
  operationId: string,
): Promise<{ subscription: SubscriptionState; reconciled: boolean }> {
  const idempotencyKey = await buildIdempotencyKey("resume-subscription", [
    subscriptionId,
    operationId,
  ]);
  let updateError: unknown = null;
  let updateConfirmed = false;

  try {
    const subscription = await stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: false },
      {
        idempotencyKey,
        timeout: STRIPE_RESUME_TIMEOUT_MS,
        maxNetworkRetries: 0,
      },
    );
    if (subscription.cancel_at_period_end === false) {
      updateConfirmed = true;
    } else {
      updateError = new Error(
        "Stripe returned a subscription still pending cancellation",
      );
    }
  } catch (error: unknown) {
    updateError = error;
  }

  let canonical: SubscriptionState | null = null;
  let retrieveError: unknown = null;
  try {
    canonical = await stripe.subscriptions.retrieve(subscriptionId, {
      timeout: STRIPE_RESUME_TIMEOUT_MS,
      maxNetworkRetries: 0,
    });
  } catch (error: unknown) {
    retrieveError = error;
  }

  if (canonical?.cancel_at_period_end === false) {
    return { subscription: canonical, reconciled: !updateConfirmed };
  }
  if (canonical?.cancel_at_period_end === true) {
    throw updateError ??
      new Error("Stripe subscription is still pending cancellation");
  }

  throw updateError ?? retrieveError ??
    new Error("Unable to verify canonical Stripe subscription state");
}
