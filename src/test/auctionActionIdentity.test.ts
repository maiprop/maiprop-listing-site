import { describe, expect, it } from "vitest";
import { resolveAuctionMutationListingId } from "@/lib/auctionActionIdentity";

describe("resolveAuctionMutationListingId", () => {
  it("uses the canonical listing UUID while leaving the OS route identity independent", () => {
    expect(resolveAuctionMutationListingId({
      id: "local-completion-001",
      listing_id: "D1000000-0000-4000-8000-000000000001",
    })).toBe("d1000000-0000-4000-8000-000000000001");
  });

  it("accepts an established legacy row whose route id is already a UUID", () => {
    expect(resolveAuctionMutationListingId({
      id: "A1000000-0000-4000-8000-000000000001",
    })).toBe("a1000000-0000-4000-8000-000000000001");
  });

  it("denies a mutation when neither projected identity is a UUID", () => {
    expect(resolveAuctionMutationListingId({
      id: "os-route-123",
      listing_id: "not-a-listing-uuid",
    })).toBeNull();
  });
});
