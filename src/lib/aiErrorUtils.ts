/**
 * AI edge function error handling: friendly messages for usage limits (402) and gateway errors.
 */

export const AI_USAGE_LIMIT_MESSAGE =
  "AI features are temporarily unavailable due to usage limits. Please try again later or contact support.";

export const AI_MONTHLY_LIMIT_MESSAGE =
  "You have reached this month's AI allowance for this feature. Free accounts reset on the 1st of next month; Pro plans include a higher monthly allowance.";

const rawErrorMessage = (err: unknown): string | null => {
  if (typeof err === "string") return err;
  return err instanceof Error ? err.message : null;
};

const errorMessage = (err: unknown, data?: { error?: string } | null): string =>
  String(rawErrorMessage(err) ?? data?.error ?? "").toLowerCase();

export const isAiMonthlyLimitError = (err: unknown, data?: { error?: string } | null): boolean => {
  const msg = errorMessage(err, data);
  return (
    msg.includes("monthly_limit_reached") ||
    msg.includes("monthly ai usage limit reached") ||
    msg.includes("monthly usage limit reached") ||
    msg.includes("resets on the 1st")
  );
};

export const isAiUsageLimitError = (err: unknown, data?: { error?: string } | null): boolean => {
  const msg = errorMessage(err, data);
  return (
    isAiMonthlyLimitError(err, data) ||
    msg.includes("402") ||
    msg.includes("usage limit") ||
    msg.includes("credits") ||
    msg.includes("ai gateway error: 402")
  );
};

const friendlyLimitMessage = (err: unknown, data?: { error?: string } | null): string | null => {
  if (isAiMonthlyLimitError(err, data)) return AI_MONTHLY_LIMIT_MESSAGE;
  return isAiUsageLimitError(err, data) ? AI_USAGE_LIMIT_MESSAGE : null;
};

const firstMessage = (messages: Array<string | null | undefined>, fallback: string): string =>
  messages.find((message): message is string => typeof message === "string" && message.length > 0) ?? fallback;

// skipcq: JS-R1005 - Message selection intentionally prefers quota-specific guidance before generic error text.
export const getAiErrorMessage = (
  err: unknown,
  data?: { error?: string } | null,
  fallback = "AI analysis failed. Please try again."
): string => firstMessage([friendlyLimitMessage(err, data), rawErrorMessage(err), data?.error], fallback);
