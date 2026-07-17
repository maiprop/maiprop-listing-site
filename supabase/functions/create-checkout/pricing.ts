import { getProfilePricingAudience } from "../_shared/entitlements.ts";
import {
  BILLING_CYCLE_ALIASES,
  INVITE_ONLY_PLAN_KEYS,
  PLAN_ENTITLEMENT,
  PLAN_KEY_RE,
  PLAN_PRICE_ENV_ALIASES,
  PROMOTION_ADDON_CATALOG,
  PROMOTION_ADDON_KEYS,
  PROMOTION_ADDON_PURCHASER_ROLES,
  PUBLIC_CHECKOUT_PLAN_KEYS,
  SELF_SERVE_ADDON_CREDITS,
  SELF_SERVE_ADDON_KEYS,
  SELF_SERVE_ADDON_MODULES,
} from "./constants.ts";
import type {
  BillingCycle,
  CheckoutAddon,
  CheckoutPlan,
  CheckoutProfileRow,
  PlanEntitlement,
  PricingConfigRow,
} from "./types.ts";

type SupabaseMaybeSingleQuery<T> = {
  select(columns: string): SupabaseMaybeSingleQuery<T>;
  eq(column: string, value: unknown): SupabaseMaybeSingleQuery<T>;
  maybeSingle(): Promise<{ data: T | null }>;
};

type SupabaseFromClient = {
  from(table: string): SupabaseMaybeSingleQuery<unknown>;
};

type SupabaseRuntimeClient = {
  rpc(name: "current_billing_runtime_mode"): PromiseLike<{
    data: unknown;
    error?: { message?: string } | null;
  }>;
};

const fromTable = <T>(
  supabase: unknown,
  table: string,
): SupabaseMaybeSingleQuery<T> => {
  return (supabase as SupabaseFromClient).from(
    table,
  ) as SupabaseMaybeSingleQuery<T>;
};

export const getCurrentBillingRuntimeMode = async (
  supabase: unknown,
): Promise<"test" | "live"> => {
  const { data, error } = await (supabase as SupabaseRuntimeClient).rpc(
    "current_billing_runtime_mode",
  );
  if (error) {
    throw new Error(
      `billing runtime lookup failed: ${String(error.message ?? error)}`,
    );
  }
  if (data !== "test" && data !== "live") {
    throw new Error("billing runtime lookup returned an invalid mode");
  }
  return data;
};

export const normalizePlanKey = (raw: unknown): string | null => {
  const plan = typeof raw === "string" && raw.trim() ? raw.trim() : "pro";
  return PLAN_KEY_RE.test(plan) ? plan : null;
};

export const normalizeExplicitCheckoutKey = (raw: unknown): string | null => {
  const key = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  return key && PLAN_KEY_RE.test(key) ? key : null;
};

const toBillingCycleAlias = (raw: unknown): string | null => {
  if (raw === undefined || raw === null) return "";
  return typeof raw === "string" ? raw : null;
};

export const normalizeBillingCycle = (raw: unknown): BillingCycle | null => {
  const alias = toBillingCycleAlias(raw);
  return alias === null ? null : BILLING_CYCLE_ALIASES[alias] ?? null;
};

export const isInviteOnlyCheckoutPlan = (planKey: string): boolean => {
  return INVITE_ONLY_PLAN_KEYS.has(planKey);
};

export const isSupportedCheckoutPlan = (planKey: string): boolean => {
  return PUBLIC_CHECKOUT_PLAN_KEYS.has(planKey) ||
    INVITE_ONLY_PLAN_KEYS.has(planKey);
};

export const isSupportedCheckoutAddonModule = (
  module: string | null | undefined,
): boolean => {
  return Boolean(module && SELF_SERVE_ADDON_MODULES.has(module));
};

export const isSupportedCheckoutAddonKey = (
  addonKey: string | null | undefined,
): boolean => {
  return Boolean(addonKey && SELF_SERVE_ADDON_KEYS.has(addonKey));
};

export const getPlanEntitlement = (
  planKey: string,
): PlanEntitlement | null => {
  return PLAN_ENTITLEMENT[planKey] ?? null;
};

export const isCheckoutAudienceAllowed = (
  planAudience: string,
  profile: CheckoutProfileRow | null,
): boolean => {
  const profileAudience = getProfilePricingAudience(profile);
  return profileAudience === planAudience;
};

export const getCheckoutProfile = async (
  supabase: unknown,
  userId: string,
): Promise<CheckoutProfileRow | null> => {
  const { data } = await fromTable<CheckoutProfileRow>(supabase, "profiles")
    .select(
      "role, participant_type, subscription_product_id, force_pro_access, is_platform_admin",
    )
    .eq("user_id", userId)
    .maybeSingle();
  return (data as CheckoutProfileRow | null) ?? null;
};

export const getStripePriceEnvKey = (
  planKey: string,
  billingCycle: BillingCycle,
): string => {
  const normalizedPlan = planKey.toUpperCase().replace(/-/g, "_");
  const suffix = billingCycle === "annual" ? "ANNUAL" : "MONTHLY";
  return `STRIPE_PRICE_${normalizedPlan}_${suffix}`;
};

export const getStripePriceEnvKeys = (
  planKey: string,
  billingCycle: BillingCycle,
): string[] => {
  return Array.from(
    new Set([
      ...(PLAN_PRICE_ENV_ALIASES[planKey]?.[billingCycle] ?? []),
      getStripePriceEnvKey(planKey, billingCycle),
      ...(billingCycle === "annual"
        ? [`STRIPE_PRICE_${planKey.toUpperCase().replace(/-/g, "_")}_YEARLY`]
        : [`STRIPE_PRICE_${planKey.toUpperCase().replace(/-/g, "_")}`]),
    ]),
  );
};

const firstConfiguredValue = (
  values: Array<string | undefined>,
): string | undefined => {
  return values.find((value) => Boolean(value));
};

const getUnitScopedStripePriceId = (
  row: PricingConfigRow | null,
  unit: string,
): string | undefined => {
  return row?.unit === unit ? row.metadata?.stripe_price_id : undefined;
};

const getNonYearlyStripePriceId = (
  row: PricingConfigRow | null,
): string | undefined => {
  return row?.unit !== "yearly" ? row?.metadata?.stripe_price_id : undefined;
};

const getAnnualDbStripePriceId = (
  row: PricingConfigRow | null,
): string | undefined => {
  const meta = row?.metadata ?? {};
  return firstConfiguredValue([
    meta.stripe_price_id_annual,
    meta.stripe_annual_price_id,
    meta.stripe_price_id_yearly,
    meta.stripe_yearly_price_id,
    getUnitScopedStripePriceId(row, "yearly"),
  ]);
};

const getMonthlyDbStripePriceId = (
  row: PricingConfigRow | null,
): string | undefined => {
  const meta = row?.metadata ?? {};
  return firstConfiguredValue([
    meta.stripe_price_id_monthly,
    meta.stripe_monthly_price_id,
    getNonYearlyStripePriceId(row),
  ]);
};

const getDbStripePriceId = (
  row: PricingConfigRow | null,
  billingCycle: BillingCycle,
): string | undefined => {
  return billingCycle === "annual"
    ? getAnnualDbStripePriceId(row)
    : getMonthlyDbStripePriceId(row);
};

const queryActivePricingConfig = async (
  supabase: unknown,
  planKey: string,
): Promise<PricingConfigRow | null> => {
  // The runtime Supabase client returned by `createClient(url, key)` carries
  // generics that don't match the value of `ReturnType<typeof createClient>`,
  // so we accept it as `unknown` here and bridge through a small structural type.
  const { data } = await fromTable<PricingConfigRow>(
    supabase,
    "pricing_configs",
  )
    .select("key, audience, module, unit, label, amount, currency, metadata")
    .eq("key", planKey)
    .eq("is_active", true)
    .maybeSingle();
  return data as PricingConfigRow | null;
};

const queryActiveAddonConfig = async (
  supabase: unknown,
  addonKey: string,
): Promise<PricingConfigRow | null> => {
  const row = await queryActivePricingConfig(supabase, addonKey);
  return isSupportedCheckoutAddonKey(row?.key) &&
      isSupportedCheckoutAddonModule(row?.module)
    ? row
    : null;
};

const buildCheckoutPlan = (
  priceId: string | null | undefined,
  planKey: string,
  billingCycle: BillingCycle,
  productId?: string,
): CheckoutPlan | null => {
  const entitlement = getPlanEntitlement(planKey);
  return priceId && entitlement
    ? {
      priceId,
      planKey,
      audience: entitlement.audience,
      role: entitlement.role,
      billingCycle,
      productId,
    }
    : null;
};

const buildDbCheckoutPlan = ( // skipcq: JS-R1005 - Mirrors Stripe DB fallback precedence and audience checks in one small resolver.
  row: PricingConfigRow | null,
  planKey: string,
  billingCycle: BillingCycle,
  entitlement: PlanEntitlement,
): CheckoutPlan | null => {
  const stripePriceId = getDbStripePriceId(row, billingCycle);
  const rowAudience = getProfilePricingAudience({
    role: row?.audience ?? null,
    participant_type: null,
  });
  return stripePriceId && rowAudience === entitlement.audience
    ? buildCheckoutPlan(
      stripePriceId,
      planKey,
      billingCycle,
      row?.metadata?.stripe_product_id,
    )
    : null;
};

/** Plan prices are authorized only by active pricing_configs rows. */
export const getCheckoutPlan = async (
  supabase: unknown,
  planKey: string,
  billingCycle: BillingCycle,
): Promise<CheckoutPlan | null> => {
  const entitlement = getPlanEntitlement(planKey);
  if (!entitlement) return null;

  const row = await queryActivePricingConfig(supabase, planKey);
  return buildDbCheckoutPlan(row, planKey, billingCycle, entitlement);
};

const getAddonStripePriceId = (
  row: PricingConfigRow | null,
): string | undefined => {
  return row?.metadata?.stripe_price_id ??
    row?.metadata?.stripe_price_id_monthly ??
    row?.metadata?.stripe_monthly_price_id;
};

type PromotionAddonKey = keyof typeof PROMOTION_ADDON_CATALOG;

const getPromotionAddonDefinition = (
  addonKey: string | null | undefined,
) => {
  return addonKey && PROMOTION_ADDON_KEYS.has(addonKey)
    ? PROMOTION_ADDON_CATALOG[addonKey as PromotionAddonKey]
    : null;
};

const getAmountMinor = (amount: number | string | null | undefined) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;
  return Math.round(numericAmount * 100);
};

const getCurrency = (currency: string | null | undefined) => {
  const normalized = currency?.trim().toLowerCase() ?? "";
  return /^[a-z]{3}$/.test(normalized) ? normalized : null;
};

const promotionConfigMatchesCatalog = (
  row: PricingConfigRow,
): boolean => {
  const definition = getPromotionAddonDefinition(row.key);
  if (!definition) return true;
  return row.audience === "participant" &&
    row.module === definition.module &&
    row.unit === definition.unit &&
    getCurrency(row.currency) === definition.currency;
};

export const getCheckoutAddon = async (
  supabase: unknown,
  addonKey: string,
): Promise<CheckoutAddon | null> => {
  const row = await queryActiveAddonConfig(supabase, addonKey);
  const priceId = getAddonStripePriceId(row);
  const amountMinor = getAmountMinor(row?.amount);
  const currency = getCurrency(row?.currency);
  const creditsPerUnit = row?.key
    ? SELF_SERVE_ADDON_CREDITS[row.key]
    : undefined;
  const promotionDefinition = getPromotionAddonDefinition(row?.key);
  const audience = getProfilePricingAudience({
    role: row?.audience ?? null,
    participant_type: null,
  });
  return priceId && row?.key && row.module && row.unit && audience &&
      amountMinor && currency && creditsPerUnit &&
      promotionConfigMatchesCatalog(row)
    ? {
      priceId,
      addonKey: row.key,
      audience,
      module: row.module,
      unit: row.unit,
      checkoutMode: row.unit === "monthly" || row.unit === "yearly"
        ? "subscription"
        : "payment",
      label: row.label ?? undefined,
      productId: row.metadata?.stripe_product_id,
      amountMinor,
      currency,
      creditsPerUnit,
      ...(promotionDefinition
        ? { entitlementDays: promotionDefinition.entitlementDays }
        : {}),
    }
    : null;
};

export const isCheckoutAddonAudienceAllowed = (
  addonKey: string,
  addonAudience: string,
  addonModule: string,
  profile: CheckoutProfileRow | null,
): boolean => {
  if (
    !isSupportedCheckoutAddonKey(addonKey) ||
    !isSupportedCheckoutAddonModule(addonModule)
  ) return false;
  const promotionDefinition = getPromotionAddonDefinition(addonKey);
  if (promotionDefinition) {
    if (
      addonAudience !== "participant" ||
      addonModule !== promotionDefinition.module
    ) return false;
    if (profile?.is_platform_admin) return true;
    return Boolean(
      profile?.role && PROMOTION_ADDON_PURCHASER_ROLES.has(profile.role),
    );
  }
  if (addonModule !== "valuation_reports") return false;
  const profileAudience = getProfilePricingAudience(profile);
  if (!profileAudience) return false;
  if (profileAudience === addonAudience) return true;
  // Participant add-ons cover consumer/pay-as-you-go products such as AI
  // reports and listing boosts. They are exposed role-selectively in the UI,
  // but server-side allow-listing keeps agents/professionals/developers from
  // being blocked when they buy the same one-off report or boost.
  return addonAudience === "participant" &&
    isSupportedCheckoutAddonModule(addonModule);
};

type StripePriceLike = {
  id: string;
  active: boolean;
  livemode: boolean;
  currency: string;
  unit_amount: number | null;
  product: string | { id?: string | null } | null;
};

const stripeObjectId = (
  value: string | { id?: string | null } | null,
): string | null => typeof value === "string" ? value : value?.id ?? null;

export const assertStripePriceMatchesCheckoutAddon = (
  addon: CheckoutAddon | null,
  price: StripePriceLike,
  runtimeMode: "test" | "live",
): void => {
  if (!addon) throw new Error("Add-on checkout configuration is unavailable");
  if (price.id !== addon.priceId || !price.active) {
    throw new Error(
      "Stripe add-on price is inactive or does not match the server record",
    );
  }
  if (price.livemode !== (runtimeMode === "live")) {
    throw new Error(
      "Stripe add-on price does not match the configured runtime mode",
    );
  }
  if (
    price.currency.toLowerCase() !== addon.currency ||
    price.unit_amount !== addon.amountMinor
  ) {
    throw new Error(
      "Stripe add-on price amount does not match the server catalog",
    );
  }
  if (
    addon.productId && stripeObjectId(price.product) !== addon.productId
  ) {
    throw new Error("Stripe add-on product does not match the server record");
  }
};
