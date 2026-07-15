export type PricingConfigRow = {
  key?: string | null;
  audience?: string | null;
  module?: string | null;
  unit?: string | null;
  label?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  metadata?: {
    stripe_price_id?: string;
    stripe_price_id_monthly?: string;
    stripe_monthly_price_id?: string;
    stripe_price_id_annual?: string;
    stripe_annual_price_id?: string;
    stripe_price_id_yearly?: string;
    stripe_yearly_price_id?: string;
    stripe_product_id?: string;
  } | null;
};

export type BillingCycle = "monthly" | "annual";

export type PlanEntitlement = {
  audience: string;
  role: string;
};

export type CheckoutPlan = {
  priceId: string;
  planKey: string;
  audience: string;
  role: string;
  billingCycle: BillingCycle;
  productId?: string;
};

export type CheckoutAddon = {
  priceId: string;
  addonKey: string;
  audience: string;
  module: string;
  unit: string;
  checkoutMode: "payment" | "subscription";
  label?: string;
  productId?: string;
  amountMinor: number;
  currency: string;
  creditsPerUnit: number;
  entitlementDays?: number;
};

export type CheckoutProfileRow = {
  role?: string | null;
  participant_type?: string | null;
  subscription_product_id?: string | null;
  force_pro_access?: boolean | null;
  is_platform_admin?: boolean | null;
};
