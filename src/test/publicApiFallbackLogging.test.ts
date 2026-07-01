import { describe, expect, it } from "vitest";
import { PublicApiError, shouldLogPublicApiFallback } from "@/lib/publicApi";

describe("public API fallback logging", () => {
  it("does not warn for dev-only transient fetch aborts", () => {
    expect(shouldLogPublicApiFallback(new TypeError("Failed to fetch"))).toBe(false);
    expect(shouldLogPublicApiFallback(new DOMException("Aborted", "AbortError"))).toBe(false);
  });

  it("still warns for structured public API contract failures", () => {
    expect(
      shouldLogPublicApiFallback(
        new PublicApiError("/api/public/listings", "Public API returned a non-JSON response", 200),
      ),
    ).toBe(true);
  });
});
