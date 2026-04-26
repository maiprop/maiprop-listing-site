import { describe, it, expect } from "vitest";
import { getPlanLimitErrorMessage, isPlanLimitError } from "@/lib/planLimitErrors";

describe("getPlanLimitErrorMessage", () => {
  it("returns message for saved_search_limit_reached", () => {
    expect(getPlanLimitErrorMessage(new Error("saved_search_limit_reached"))).toBeTruthy();
  });

  it("returns message for listing_limit_reached", () => {
    expect(getPlanLimitErrorMessage(new Error("listing_limit_reached"))).toBeTruthy();
  });

  it("returns message for listing_not_allowed", () => {
    expect(getPlanLimitErrorMessage(new Error("listing_not_allowed"))).toBeTruthy();
  });

  it("returns message for auction_alert_limit_reached", () => {
    expect(getPlanLimitErrorMessage(new Error("auction_alert_limit_reached"))).toBeTruthy();
  });

  it("returns message for viewing_limit_reached", () => {
    expect(getPlanLimitErrorMessage(new Error("viewing_limit_reached"))).toBeTruthy();
  });

  it("returns message for search_alert_limit_reached", () => {
    expect(getPlanLimitErrorMessage(new Error("search_alert_limit_reached"))).toBeTruthy();
  });

  it("returns null for unrelated error", () => {
    expect(getPlanLimitErrorMessage(new Error("Network error"))).toBeNull();
  });

  it("returns null for null input", () => {
    expect(getPlanLimitErrorMessage(null)).toBeNull();
  });

  it("works with plain string errors", () => {
    expect(getPlanLimitErrorMessage("listing_limit_reached")).toBeTruthy();
  });

  it("is case-insensitive (lowercase error string)", () => {
    expect(getPlanLimitErrorMessage(new Error("LISTING_LIMIT_REACHED"))).toBeTruthy();
  });
});

describe("isPlanLimitError", () => {
  it("returns true for a limit error", () => {
    expect(isPlanLimitError(new Error("listing_limit_reached"))).toBe(true);
  });

  it("returns false for a generic error", () => {
    expect(isPlanLimitError(new Error("Something went wrong"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPlanLimitError(null)).toBe(false);
  });
});
