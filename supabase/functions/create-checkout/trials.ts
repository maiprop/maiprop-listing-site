export const PRO_TRIAL_DAYS = 7;

const TRIAL_CHECKOUT_AUDIENCES = new Set([
  "participant",
  "agent",
  "developer",
  "professional",
]);

export const normalizeTrialCheckoutRequest = (raw: unknown): boolean => {
  return raw === true || raw === "true" || raw === "1";
};

export const isTrialCheckoutAudienceAllowed = (
  audience: string | null | undefined,
): boolean => {
  return Boolean(audience && TRIAL_CHECKOUT_AUDIENCES.has(audience));
};

export const buildTrialMetadata = (): Record<string, string> => ({
  checkout_type: "subscription_trial",
  trial_days: String(PRO_TRIAL_DAYS),
});
