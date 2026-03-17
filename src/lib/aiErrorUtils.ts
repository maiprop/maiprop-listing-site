/**
 * AI edge function error handling — friendly messages for usage limits (402) and gateway errors.
 */

export const AI_USAGE_LIMIT_MESSAGE =
  "AI features are temporarily unavailable due to usage limits. Please try again later or contact support.";

export function isAiUsageLimitError(err: unknown, data?: { error?: string } | null): boolean {
  const msg = String(
    (err as { message?: string })?.message ?? data?.error ?? ""
  ).toLowerCase();
  return (
    msg.includes("402") ||
    msg.includes("usage limit") ||
    msg.includes("credits") ||
    msg.includes("ai gateway error: 402")
  );
}

export function getAiErrorMessage(
  err: unknown,
  data?: { error?: string } | null,
  fallback = "AI analysis failed. Please try again."
): string {
  if (isAiUsageLimitError(err, data)) return AI_USAGE_LIMIT_MESSAGE;
  const msg = (err as { message?: string })?.message ?? data?.error;
  return msg && typeof msg === "string" ? msg : fallback;
}
