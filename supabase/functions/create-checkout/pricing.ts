import { getProfilePricingAudience } from "../_shared/entitlements.ts";
import {
  BILLING_CYCLE_ALIASES,
  INVITE_ONLY_PLAN_KEYS,
  PLAN_ENTITLEMENT,
  PLAN_KEY_RE,
  PLAN_PRICE_ENV_ALIASES,
  PUBLIC_CHECKOUT_PLAN_KEYS,
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

const fromTable = <T>(
  supabase: unknown,
  table: string,
): SupabaseMaybeSingleQuery<T> => {
  return (supabase as SupabaseFromClient).from(
    table,
  ) as SupabaseMaybeSingleQuery<T>;
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
    .select("role, participant_type")
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

const getFirstConfiguredEnvPrice = (
  planKey: string,
  billingCycle: BillingCycle,
): string | null => {
  for (const key of getStripePriceEnvKeys(planKey, billingCycle)) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  return null;
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
    .select("key, audience, module, unit, label, metadata")
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
  return isSupportedCheckoutAddonModule(row?.module) ? row : null;
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

const getDefaultStripePrice = (
  planKey: string,
  billingCycle: BillingCycle,
): string | null => {
  return planKey === "pro" && billingCycle === "monthly"
    ? Deno.env.get("STRIPE_PRICE_DEFAULT") ?? null
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

const buildFallbackCheckoutPlan = (
  planKey: string,
  billingCycle: BillingCycle,
): CheckoutPlan | null => {
  const envPrice = getFirstConfiguredEnvPrice(planKey, billingCycle);
  return buildCheckoutPlan(
    envPrice ?? getDefaultStripePrice(planKey, billingCycle),
    planKey,
    billingCycle,
  );
};

/** Plan keys: active DB pricing_configs.metadata.stripe_price_id, then env STRIPE_PRICE_<UPPERCASE_KEY>. */
export const getCheckoutPlan = async (
  supabase: unknown,
  planKey: string,
  billingCycle: BillingCycle,
): Promise<CheckoutPlan | null> => {
  const entitlement = getPlanEntitlement(planKey);
  if (!entitlement) return null;

  const row = await queryActivePricingConfig(supabase, planKey);
  return buildDbCheckoutPlan(row, planKey, billingCycle, entitlement) ??
    buildFallbackCheckoutPlan(planKey, billingCycle);
};

const getAddonStripePriceId = (
  row: PricingConfigRow | null,
): string | undefined => {
  return row?.metadata?.stripe_price_id ??
    row?.metadata?.stripe_price_id_monthly ??
    row?.metadata?.stripe_monthly_price_id;
};

export const getCheckoutAddon = async (
  supabase: unknown,
  addonKey: string,
): Promise<CheckoutAddon | null> => {
  const row = await queryActiveAddonConfig(supabase, addonKey);
  const priceId = getAddonStripePriceId(row);
  const audience = getProfilePricingAudience({
    role: row?.audience ?? null,
    participant_type: null,
  });
  return priceId && row?.key && row.module && row.unit && audience
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
    }
    : null;
};

export const isCheckoutAddonAudienceAllowed = (
  addonAudience: string,
  addonModule: string,
  profile: CheckoutProfileRow | null,
): boolean => {
  if (!isSupportedCheckoutAddonModule(addonModule)) return false;
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
