export type SubscriptionMetadataLike = {
  metadata?: Record<string, string | null | undefined> | null;
};

export function isAddonSubscription(sub: SubscriptionMetadataLike): boolean {
  return sub.metadata?.checkout_type === "addon";
}

export function shouldSkipProfileEntitlementSync(sub: SubscriptionMetadataLike): boolean {
  return isAddonSubscription(sub);
}
