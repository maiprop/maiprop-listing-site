type PricingMetadata = {
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  stripe_price_id_monthly?: string | null;
  stripe_monthly_price_id?: string | null;
  stripe_price_id_annual?: string | null;
  stripe_annual_price_id?: string | null;
  stripe_price_id_yearly?: string | null;
  stripe_yearly_price_id?: string | null;
};

type PricingConfigRow = {
  key?: string | null;
  audience?: string | null;
  metadata?: PricingMetadata | null;
};

export type ProfileAudienceRow = {
  role?: string | null;
  participant_type?: string | null;
};

export type SubscriptionEntitlement = {
  planKey: string;
  audience: string;
  productId: string;
} | null;

const AUDIENCE_ALIASES: Record<string, string> = {
  agent: "agent",
  buyer: "participant",
  developer: "developer",
  institutional: "institutional",
  investor: "investor",
  participant: "participant",
  pro: "participant",
  professional: "professional",
  seller: "participant",
  user: "participant",
};

export const normalizeEntitlementAudience = (
  raw: string | null | undefined,
): string | null => raw ? AUDIENCE_ALIASES[raw] ?? null : null;

export const getProfilePricingAudience = (
  profile: ProfileAudienceRow | null,
): string | null =>
  normalizeEntitlementAudience(profile?.participant_type) ??
  normalizeEntitlementAudience(profile?.role);

const metadataPriceIds = (metadata: PricingMetadata | null | undefined) => [
  metadata?.stripe_price_id,
  metadata?.stripe_price_id_monthly,
  metadata?.stripe_monthly_price_id,
  metadata?.stripe_price_id_annual,
  metadata?.stripe_annual_price_id,
  metadata?.stripe_price_id_yearly,
  metadata?.stripe_yearly_price_id,
];

export const pricingConfigMatchesStripeItem = (
  row: PricingConfigRow,
  item: { productId: string | null; priceId?: string | null },
): boolean => {
  const metadata = row.metadata ?? {};
  const productMatches = Boolean(
    item.productId && metadata.stripe_product_id === item.productId,
  );
  const priceMatches = Boolean(
    item.priceId && metadataPriceIds(metadata).includes(item.priceId),
  );
  return productMatches || priceMatches;
};

export const isAudienceAllowed = (
  actualAudience: string | null,
  requiredAudience?: string | string[] | null,
): boolean => {
  if (!actualAudience) return false;
  if (!requiredAudience) return true;
  const required = Array.isArray(requiredAudience)
    ? requiredAudience
    : [requiredAudience];
  return required
    .map((audience) => normalizeEntitlementAudience(audience))
    .includes(actualAudience);
};

export async function resolveSubscriptionEntitlement(
  supabase: unknown,
  userId: string,
  item: { productId: string | null; priceId?: string | null },
  requiredAudience?: string | string[] | null,
): Promise<SubscriptionEntitlement> {
  if (!item.productId) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (supabase as { from: any }).from as any;
  const [{ data: profile }, { data: rows }] = await Promise.all([
    from("profiles")
      .select("role, participant_type")
      .eq("user_id", userId)
      .maybeSingle(),
    from("pricing_configs")
      .select("key, audience, metadata")
      .eq("is_active", true),
  ]);

  const profileAudience = getProfilePricingAudience(
    profile as ProfileAudienceRow | null,
  );
  if (!isAudienceAllowed(profileAudience, requiredAudience)) return null;

  const match = ((rows ?? []) as PricingConfigRow[]).find((row) => {
    const rowAudience = normalizeEntitlementAudience(row.audience);
    return row.key &&
      rowAudience === profileAudience &&
      pricingConfigMatchesStripeItem(row, item);
  });

  if (!match?.key || !profileAudience) return null;
  return {
    planKey: match.key,
    audience: profileAudience,
    productId: item.productId,
  };
}
