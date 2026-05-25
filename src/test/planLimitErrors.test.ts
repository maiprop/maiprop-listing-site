import { describe, it, expect } from "vitest";
import { getPlanLimitErrorMessage, isPlanLimitError } from "@/lib/planLimitErrors";

describe("getPlanLimitErrorMessage", () => {
  it("returns message for saved_search_limit_reached", () => {
    const result = getPlanLimitErrorMessage(new Error("saved_search_limit_reached"));
    expect(result).not.toBeNull();
    expect(result).toMatch(/plan limit/i);
    expect(result).toMatch(/upgrade to pro/i);
  });

  it("returns message for listing_limit_reached", () => {
    const result = getPlanLimitErrorMessage(new Error("listing_limit_reached"));
    expect(result).not.toBeNull();
    expect(result).toMatch(/plan limit/i);
  });

  it("returns message for listing_not_allowed", () => {
    const result = getPlanLimitErrorMessage(new Error("listing_not_allowed"));
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  it("returns message for auction_alert_limit_reached", () => {
    const result = getPlanLimitErrorMessage(new Error("auction_alert_limit_reached"));
    expect(result).not.toBeNull();
    expect(result).toMatch(/upgrade/i);
  });

  it("returns message for viewing_limit_reached", () => {
    const result = getPlanLimitErrorMessage(new Error("viewing_limit_reached"));
    expect(result).not.toBeNull();
    expect(result?.length).toBeGreaterThan(0);
  });

  it("returns message for search_alert_limit_reached", () => {
    const result = getPlanLimitErrorMessage(new Error("search_alert_limit_reached"));
    expect(result).not.toBeNull();
    expect(result).toMatch(/plan/i);
  });

  it("returns message for contact and open-house RSVP limits", () => {
    expect(getPlanLimitErrorMessage(new Error("contact_limit_reached"))).toMatch(/plan limit/i);
    expect(getPlanLimitErrorMessage(new Error("open_house_rsvp_limit_reached"))).toMatch(/plan limit/i);
  });

  it("returns null for unrelated error", () => {
    const result = getPlanLimitErrorMessage(new Error("Network error"));
    expect(result).toBeNull();
    expect(isPlanLimitError(new Error("Network error"))).toBe(false);
  });

  it("returns null for null input", () => {
    expect(getPlanLimitErrorMessage(null)).toBeNull();
    expect(getPlanLimitErrorMessage(undefined)).toBeNull();
  });

  it("works with plain string errors", () => {
    const result = getPlanLimitErrorMessage("listing_limit_reached");
    expect(result).not.toBeNull();
    expect(result).toMatch(/plan limit/i);
  });

  it("is case-insensitive (lowercase error string)", () => {
    const upper = getPlanLimitErrorMessage(new Error("LISTING_LIMIT_REACHED"));
    const lower = getPlanLimitErrorMessage(new Error("listing_limit_reached"));
    expect(upper).not.toBeNull();
    expect(upper).toBe(lower);
  });
});

describe("isPlanLimitError", () => {
  it("returns true for a limit error", () => {
    expect(isPlanLimitError(new Error("listing_limit_reached"))).toBe(true);
    expect(isPlanLimitError(new Error("viewing_limit_reached"))).toBe(true);
    expect(isPlanLimitError("saved_search_limit_reached")).toBe(true);
    expect(isPlanLimitError("contact_limit_reached")).toBe(true);
    expect(isPlanLimitError("open_house_rsvp_limit_reached")).toBe(true);
  });

  it("returns false for a generic error", () => {
    expect(isPlanLimitError(new Error("Something went wrong"))).toBe(false);
    expect(isPlanLimitError(new Error("500 Internal Server Error"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPlanLimitError(null)).toBe(false);
    expect(isPlanLimitError(undefined)).toBe(false);
    expect(isPlanLimitError("")).toBe(false);
  });
});
