export type SubscriptionMetadataLike = {
  metadata?: Record<string, string | null | undefined> | null;
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function isAddonSubscription(sub: SubscriptionMetadataLike): boolean {
  return sub.metadata?.checkout_type === "addon";
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function shouldSkipProfileEntitlementSync(sub: SubscriptionMetadataLike): boolean {
  return isAddonSubscription(sub);
}
