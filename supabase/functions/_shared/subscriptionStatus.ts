/**
 * Stripe subscription statuses that should still provision product access.
 *
 * `past_due` is a payment-recovery state. Stripe can still retry collection,
 * and the subscription might return to `active` when the invoice is paid.
 */
const PROVISIONED_ACCESS_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Statuses where Stripe has exhausted the normal paid lifecycle or stopped
 * service. These are the states where we revoke MaiProp paid capabilities.
 */
const REVOKE_ACCESS_STATUSES = new Set([
  "canceled",
  "incomplete_expired",
  "paused",
  "unpaid",
]);

export function hasProvisionedSubscriptionAccess(
  status: string | null | undefined,
): boolean {
  return Boolean(status && PROVISIONED_ACCESS_STATUSES.has(status));
}

export function shouldRevokeSubscriptionAccess(
  status: string | null | undefined,
): boolean {
  return Boolean(status && REVOKE_ACCESS_STATUSES.has(status));
}
