import { supabase } from "@/integrations/supabase/client";

export const ADDON_CHECKOUT_SUCCESS_URL = "/dashboard/billing?checkout=success";
export const ADDON_CHECKOUT_CANCEL_URL = "/dashboard/billing?checkout=cancelled";
export const SUBSCRIPTION_CHECKOUT_SUCCESS_URL =
  "/dashboard/billing?checkout=success";
export const SUBSCRIPTION_CHECKOUT_CANCEL_URL =
  "/dashboard/billing?checkout=cancelled";

export type SubscriptionBillingCycle = "monthly" | "annual";

export type SubscriptionCheckoutTarget = {
  billingCycle?: SubscriptionBillingCycle;
  successUrl?: string | null;
  cancelUrl?: string | null;
};

export type AddonCheckoutTarget = {
  quantity?: number | null;
  targetType?: string | null;
  targetId?: string | null;
  successUrl?: string | null;
  cancelUrl?: string | null;
};

export const createAddonCheckoutUrl = async (
  addonKey: string,
  target: AddonCheckoutTarget = {},
): Promise<string> => {
  const { data: checkout, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      addon_key: addonKey,
      ...(target.quantity != null ? { quantity: target.quantity } : {}),
      ...(target.targetType ? { target_type: target.targetType } : {}),
      ...(target.targetId ? { target_id: target.targetId } : {}),
      success_url: target.successUrl ?? ADDON_CHECKOUT_SUCCESS_URL,
      cancel_url: target.cancelUrl ?? ADDON_CHECKOUT_CANCEL_URL,
    },
  });

  if (error || !checkout?.url) {
    throw new Error(checkout?.error ?? error?.message ?? "Could not start add-on checkout");
  }

  return checkout.url;
};

export const createSubscriptionCheckoutUrl = async (
  planKey: string,
  target: SubscriptionCheckoutTarget = {},
): Promise<string> => {
  const { data: checkout, error } = await supabase.functions.invoke(
    "create-checkout",
    {
      body: {
        plan: planKey,
        billing_cycle: target.billingCycle ?? "monthly",
        success_url: target.successUrl ?? SUBSCRIPTION_CHECKOUT_SUCCESS_URL,
        cancel_url: target.cancelUrl ?? SUBSCRIPTION_CHECKOUT_CANCEL_URL,
      },
    },
  );

  if (error || !checkout?.url) {
    throw new Error(
      checkout?.error ?? error?.message ?? "Could not start subscription checkout",
    );
  }

  return checkout.url;
};

export const formatBillingAmount = (amount: number, currency: string) => {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};
