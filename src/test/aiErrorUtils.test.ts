import { describe, it, expect } from "vitest";
import {
  isAiMonthlyLimitError,
  isAiUsageLimitError,
  getAiErrorMessage,
  AI_MONTHLY_LIMIT_MESSAGE,
  AI_USAGE_LIMIT_MESSAGE,
} from "@/lib/aiErrorUtils";

describe("isAiUsageLimitError", () => {
  it("returns true when error message contains '402'", () => {
    expect(isAiUsageLimitError(new Error("HTTP 402"))).toBe(true);
    expect(isAiUsageLimitError(new Error("402 Payment Required"))).toBe(true);
  });

  it("returns true when error message contains 'usage limit'", () => {
    expect(isAiUsageLimitError(new Error("usage limit exceeded"))).toBe(true);
    expect(isAiUsageLimitError(new Error("Daily usage limit hit"))).toBe(true);
  });

  it("returns true when error message contains 'credits'", () => {
    expect(isAiUsageLimitError(new Error("Not enough credits"))).toBe(true);
    expect(isAiUsageLimitError(new Error("You have 0 credits left"))).toBe(true);
  });

  it("returns true when error message contains 'ai gateway error: 402'", () => {
    expect(isAiUsageLimitError(new Error("AI gateway error: 402"))).toBe(true);
    // Without 402 it falls through to other matches.
    expect(isAiUsageLimitError(new Error("AI gateway error: usage limit"))).toBe(true);
  });

  it("returns true when data.error contains a limit keyword", () => {
    expect(isAiUsageLimitError(null, { error: "usage limit reached" })).toBe(true);
    expect(isAiUsageLimitError(null, { error: "402 from gateway" })).toBe(true);
    expect(isAiUsageLimitError(null, { error: "credits exhausted" })).toBe(true);
  });

  it("recognizes monthly feature quota limits separately", () => {
    expect(isAiMonthlyLimitError(null, { error: "monthly_limit_reached" })).toBe(true);
    expect(isAiMonthlyLimitError(null, { error: "Monthly AI usage limit reached. Resets on the 1st of next month." })).toBe(true);
    expect(isAiUsageLimitError(null, { error: "monthly_limit_reached" })).toBe(true);
  });

  it("returns false for a generic error", () => {
    expect(isAiUsageLimitError(new Error("Network timeout"))).toBe(false);
    expect(isAiUsageLimitError(new Error("500 Internal Server Error"))).toBe(false);
    expect(isAiUsageLimitError(new Error("DNS lookup failed"))).toBe(false);
  });

  it("returns false for null error with no data", () => {
    expect(isAiUsageLimitError(null)).toBe(false);
    expect(isAiUsageLimitError(undefined as never)).toBe(false);
    expect(isAiUsageLimitError(null, null)).toBe(false);
  });

  it("returns false for empty error", () => {
    expect(isAiUsageLimitError(new Error(""))).toBe(false);
    expect(isAiUsageLimitError(null, { error: "" })).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAiUsageLimitError(new Error("USAGE LIMIT"))).toBe(true);
    expect(isAiUsageLimitError(new Error("Credits"))).toBe(true);
    expect(isAiUsageLimitError(new Error("CREDITS"))).toBe(true);
    expect(isAiUsageLimitError(new Error("UsAgE LiMiT"))).toBe(true);
  });
});

describe("getAiErrorMessage", () => {
  it("returns AI_USAGE_LIMIT_MESSAGE for limit errors", () => {
    expect(getAiErrorMessage(new Error("402"))).toBe(AI_USAGE_LIMIT_MESSAGE);
    expect(getAiErrorMessage(new Error("usage limit"))).toBe(AI_USAGE_LIMIT_MESSAGE);
    // Limit takes precedence over the error's own message.
    expect(getAiErrorMessage(new Error("402 short"))).not.toBe("402 short");
  });

  it("returns the error's own message for non-limit errors", () => {
    expect(getAiErrorMessage(new Error("Model unavailable"))).toBe("Model unavailable");
    expect(getAiErrorMessage(new Error("Network down"))).toBe("Network down");
  });

  it("returns data.error when err has no message and data has error", () => {
    expect(getAiErrorMessage(null, { error: "Something broke" })).toBe("Something broke");
    // When err has its own (truthy) message, that wins over data.error.
    expect(getAiErrorMessage(new Error("Err msg"), { error: "Backend down" })).toBe("Err msg");
  });

  it("returns fallback when err is null and data has no error", () => {
    expect(getAiErrorMessage(null, null)).toBe("AI analysis failed. Please try again.");
    expect(getAiErrorMessage(null, undefined as never)).toBe("AI analysis failed. Please try again.");
  });

  it("uses custom fallback when provided", () => {
    expect(getAiErrorMessage(null, null, "Custom error")).toBe("Custom error");
    expect(getAiErrorMessage(null, null, "")).toBe("");
  });

  it("returns limit message when data.error triggers limit check", () => {
    expect(getAiErrorMessage(null, { error: "credits exhausted" })).toBe(AI_USAGE_LIMIT_MESSAGE);
    expect(getAiErrorMessage(null, { error: "402 limit" })).toBe(AI_USAGE_LIMIT_MESSAGE);
    expect(getAiErrorMessage(null, { error: "usage limit reached" })).toBe(AI_USAGE_LIMIT_MESSAGE);
  });

  it("returns a specific monthly allowance message for app quota caps", () => {
    expect(getAiErrorMessage(null, { error: "monthly_limit_reached" })).toBe(AI_MONTHLY_LIMIT_MESSAGE);
    expect(getAiErrorMessage(null, { error: "Monthly AI usage limit reached. Resets on the 1st of next month." }))
      .toBe(AI_MONTHLY_LIMIT_MESSAGE);
  });
});
