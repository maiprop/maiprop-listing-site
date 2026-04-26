import { describe, it, expect } from "vitest";
import { isAiUsageLimitError, getAiErrorMessage, AI_USAGE_LIMIT_MESSAGE } from "@/lib/aiErrorUtils";

describe("isAiUsageLimitError", () => {
  it("returns true when error message contains '402'", () => {
    expect(isAiUsageLimitError(new Error("HTTP 402"))).toBe(true);
  });

  it("returns true when error message contains 'usage limit'", () => {
    expect(isAiUsageLimitError(new Error("usage limit exceeded"))).toBe(true);
  });

  it("returns true when error message contains 'credits'", () => {
    expect(isAiUsageLimitError(new Error("Not enough credits"))).toBe(true);
  });

  it("returns true when error message contains 'ai gateway error: 402'", () => {
    expect(isAiUsageLimitError(new Error("AI gateway error: 402"))).toBe(true);
  });

  it("returns true when data.error contains a limit keyword", () => {
    expect(isAiUsageLimitError(null, { error: "usage limit reached" })).toBe(true);
  });

  it("returns false for a generic error", () => {
    expect(isAiUsageLimitError(new Error("Network timeout"))).toBe(false);
  });

  it("returns false for null error with no data", () => {
    expect(isAiUsageLimitError(null)).toBe(false);
  });

  it("returns false for empty error", () => {
    expect(isAiUsageLimitError(new Error(""))).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAiUsageLimitError(new Error("USAGE LIMIT"))).toBe(true);
    expect(isAiUsageLimitError(new Error("Credits"))).toBe(true);
  });
});

describe("getAiErrorMessage", () => {
  it("returns AI_USAGE_LIMIT_MESSAGE for limit errors", () => {
    expect(getAiErrorMessage(new Error("402"))).toBe(AI_USAGE_LIMIT_MESSAGE);
  });

  it("returns the error's own message for non-limit errors", () => {
    expect(getAiErrorMessage(new Error("Model unavailable"))).toBe("Model unavailable");
  });

  it("returns data.error when err has no message and data has error", () => {
    expect(getAiErrorMessage(null, { error: "Something broke" })).toBe("Something broke");
  });

  it("returns fallback when err is null and data has no error", () => {
    expect(getAiErrorMessage(null, null)).toBe("AI analysis failed. Please try again.");
  });

  it("uses custom fallback when provided", () => {
    expect(getAiErrorMessage(null, null, "Custom error")).toBe("Custom error");
  });

  it("returns limit message when data.error triggers limit check", () => {
    expect(getAiErrorMessage(null, { error: "credits exhausted" })).toBe(AI_USAGE_LIMIT_MESSAGE);
  });
});
