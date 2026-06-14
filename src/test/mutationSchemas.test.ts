import { describe, expect, it } from "vitest";
import {
  aiSearchBodySchema,
  contactCreateSchema,
  favoriteToggleSchema,
  leadCreateSchema,
  listingWriteSchema,
  parseMutationInput,
  pricingConfigRowsSchema,
  propertyValuationBodySchema,
} from "@/lib/mutationSchemas";

describe("mutation schema parsing", () => {
  it("normalizes valid user-facing mutation input", () => {
    expect(parseMutationInput(favoriteToggleSchema, {
      listing_id: "listing-1",
      isFavorited: false,
      priceAlert: true,
      price: 120000,
    }, "favorite")).toMatchObject({
      listing_id: "listing-1",
      isFavorited: false,
      priceAlert: true,
      price: 120000,
    });

    expect(parseMutationInput(leadCreateSchema, {
      name: "  Ada Buyer ",
      email: "ADA@EXAMPLE.COM",
      source: "manual",
    }, "lead")).toMatchObject({
      name: "Ada Buyer",
      email: "ada@example.com",
      source: "manual",
    });
  });

  it("rejects malformed CRM and contact payloads before Supabase", () => {
    expect(() => parseMutationInput(leadCreateSchema, {
      name: "",
      email: "not-an-email",
    }, "lead")).toThrow("Invalid lead name");

    expect(() => parseMutationInput(contactCreateSchema, {
      name: "Contact",
      email: "not-an-email",
    }, "contact")).toThrow("Invalid contact email");
  });

  it("enforces required listing, pricing, and AI request fields", () => {
    expect(() => parseMutationInput(listingWriteSchema, {
      title: "Bad",
      city: "Athens",
      price: -1,
      sqm: 80,
      property_type: "apartment",
      listing_type: "sale",
      owner_id: "user-1",
    }, "listing")).toThrow("Invalid listing price");

    expect(() => parseMutationInput(pricingConfigRowsSchema, [{
      id: "price-1",
      key: "pro",
      label: "Pro",
      audience: "participant",
      module: "user_subscription",
      unit: "monthly",
      currency: "EUR",
      amount: -10,
      is_active: true,
      sort_order: 1,
      metadata: {},
    }], "pricing")).toThrow("Invalid pricing amount");

    expect(() => parseMutationInput(aiSearchBodySchema, { query: "" }, "AI search"))
      .toThrow("Invalid AI search query");

    expect(() => parseMutationInput(propertyValuationBodySchema, {
      city: "Athens",
      price: 100000,
      sqm: 0,
    }, "valuation")).toThrow("Invalid valuation size");
  });
});
