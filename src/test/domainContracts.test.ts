import { describe, expect, it } from "vitest";
import {
  LISTING_KINDS,
  normalizeOpenHouseTransactionType,
  type EntitlementResult,
  type ListingKind,
  type OwnerSummary,
  type ProjectSummary,
  type PropertyCardViewModel,
  type TransactionType,
} from "@/lib/domainContracts";
import { buildPropertyCardViewModel } from "@/lib/propertyCardViewModel";

const makeDbListing = (listingType: ListingKind, overrides: Record<string, unknown> = {}) => ({
  id: `listing-${listingType}`,
  title: `${listingType} listing`,
  address: "1 Test Street",
  city: "Athens",
  price: 250000,
  price_per_sqm: 2500,
  sqm: 100,
  bedrooms: 2,
  bathrooms: 1,
  property_type: "apartment",
  listing_type: listingType,
  cover_image_url: "https://example.test/cover.jpg",
  listing_images: [{ url: "https://example.test/secondary.jpg" }],
  profiles: { display_name: "Owner One", verified: true, avatar_url: null },
  ...overrides,
});

describe("domain contracts", () => {
  it("keeps canonical listing and transaction contracts centralized", () => {
    const listingKinds: ListingKind[] = [...LISTING_KINDS];
    const sale: TransactionType = "sale";
    const rent: TransactionType = "rent";
    const owner: OwnerSummary = { name: "Owner One", verified: true };
    const project: ProjectSummary = {
      unitSizeMin: 39,
      unitSizeMax: 56,
      unitCount: 4,
      availableUnitCount: 3,
      deliveryYear: 2026,
    };
    const entitlement: EntitlementResult = {
      allowed: true,
      audience: "developer",
      planKey: "developer_pro",
    };

    expect(listingKinds).toEqual(["sale", "rent", "auction", "firesale", "open_house", "new_build"]);
    expect(normalizeOpenHouseTransactionType(null)).toBe(sale);
    expect(normalizeOpenHouseTransactionType("rent")).toBe(rent);
    expect(normalizeOpenHouseTransactionType("lease")).toBe(sale);
    expect(owner.verified).toBe(true);
    expect(project.availableUnitCount).toBe(3);
    expect(entitlement.allowed).toBe(true);
  });

  it("builds the canonical PropertyCardViewModel for every listing kind", () => {
    const cards: PropertyCardViewModel[] = LISTING_KINDS.map((kind) =>
      buildPropertyCardViewModel(
        makeDbListing(kind, kind === "open_house" ? { open_house_transaction_type: "rent" } : {}),
        { includeRaw: true },
      ),
    );

    expect(cards.map((card) => card.listingType)).toEqual([...LISTING_KINDS]);
    expect(cards.find((card) => card.listingType === "open_house")?.openHouseTransactionType).toBe("rent");
    expect(cards.find((card) => card.listingType === "new_build")?.isPreSale).toBe(true);
    for (const card of cards) {
      expect(card.images).toEqual(["https://example.test/cover.jpg", "https://example.test/secondary.jpg"]);
      expect(card.agent).toMatchObject({ name: "Owner One", verified: true });
      expect(card._raw).toBeDefined();
    }
  });
});
