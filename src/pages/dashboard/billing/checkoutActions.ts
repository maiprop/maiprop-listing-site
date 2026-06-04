import { supabase } from "@/integrations/supabase/client";

export const ADDON_CHECKOUT_SUCCESS_URL = "/dashboard/billing?checkout=success";
export const ADDON_CHECKOUT_CANCEL_URL = "/dashboard/billing?checkout=cancelled";

export const createAddonCheckoutUrl = async (addonKey: string): Promise<string> => {
  const { data: checkout, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      addon_key: addonKey,
      success_url: ADDON_CHECKOUT_SUCCESS_URL,
      cancel_url: ADDON_CHECKOUT_CANCEL_URL,
    },
  });

  if (error || !checkout?.url) {
    throw new Error(checkout?.error ?? error?.message ?? "Could not start add-on checkout");
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
