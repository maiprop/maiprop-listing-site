import { describe, expect, it } from "vitest";
import {
  buildProjectValuationMetrics,
  formatLayoutRange,
  formatPriceRange,
  formatVatSummary,
  isProjectImageMedia,
  sortProjectUnits,
  sortProjectMedia,
  type NewBuildProjectMedia,
  type NewBuildProjectUnit,
} from "@/lib/newBuildProjectDetail";

const unit = (overrides: Partial<NewBuildProjectUnit>): NewBuildProjectUnit => ({
  id: overrides.id ?? "unit",
  listing_id: overrides.listing_id ?? "listing-1",
  unit_id: overrides.unit_id ?? null,
  unit_number: overrides.unit_number ?? null,
  floor: overrides.floor ?? null,
  availability_status: overrides.availability_status ?? "available",
  internal_sqm: overrides.internal_sqm ?? null,
  balcony_sqm: overrides.balcony_sqm ?? null,
  storage_sqm: overrides.storage_sqm ?? null,
  parking_sqm: overrides.parking_sqm ?? null,
  bedrooms: overrides.bedrooms ?? null,
  bathrooms: overrides.bathrooms ?? null,
  kitchen_type: overrides.kitchen_type ?? null,
  living_rooms: overrides.living_rooms ?? null,
  price: overrides.price ?? null,
  price_per_sqm: overrides.price_per_sqm ?? null,
  vat_included: overrides.vat_included ?? null,
  parking_price: overrides.parking_price ?? null,
  storage_price: overrides.storage_price ?? null,
  sea_view: overrides.sea_view ?? null,
  city_view: overrides.city_view ?? null,
  mountain_view: overrides.mountain_view ?? null,
  energy_class: overrides.energy_class ?? null,
  heating_system: overrides.heating_system ?? null,
  cooling_system: overrides.cooling_system ?? null,
});

const media = (overrides: Partial<NewBuildProjectMedia>): NewBuildProjectMedia => ({
  id: overrides.id ?? "media",
  url: overrides.url ?? "https://example.com/project.jpg",
  media_type: overrides.media_type ?? "image",
  title: overrides.title ?? null,
  sort_order: overrides.sort_order ?? null,
});

describe("new build project detail helpers", () => {
  it("sorts project units by the numeric unit identifier users recognize", () => {
    const sorted = sortProjectUnits([
      unit({ id: "u10", unit_number: "10", unit_id: "10", floor: 1 }),
      unit({ id: "u2", unit_number: "2", unit_id: "2", floor: 4 }),
      unit({ id: "u1", unit_number: "1", unit_id: "1", floor: 2 }),
      unit({ id: "uA", unit_number: "A", unit_id: "A", floor: 0 }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["u1", "u2", "u10", "uA"]);
  });

  it("builds valuation metrics from all priced project units before falling back to listing values", () => {
    const metrics = buildProjectValuationMetrics(
      [
        unit({ id: "u1", internal_sqm: 50, price: 350000, price_per_sqm: 7000 }),
        unit({ id: "u2", internal_sqm: 100, price: 750000, price_per_sqm: 7500 }),
      ],
      {
        price: 275000,
        sqm: 39,
        price_per_sqm: 7051,
      },
    );

    expect(metrics).toEqual({
      price: 550000,
      sqm: 75,
      pricePerSqm: 7333,
    });
  });

  it("falls back to listing valuation metrics when project units have no usable price and size data", () => {
    const metrics = buildProjectValuationMetrics(
      [
        unit({ id: "u1", internal_sqm: null, price: null, price_per_sqm: null }),
        unit({ id: "u2", internal_sqm: 0, price: 0, price_per_sqm: 0 }),
      ],
      {
        price: 275000,
        sqm: 39,
        price_per_sqm: 7051,
      },
    );

    expect(metrics).toEqual({
      price: 275000,
      sqm: 39,
      pricePerSqm: 7051,
    });
  });

  it("computes fallback listing valuation price per sqm before using stale stored values", () => {
    const metrics = buildProjectValuationMetrics([], {
      price: 315000,
      sqm: 102,
      price_per_sqm: 3000,
    });

    expect(metrics).toEqual({
      price: 315000,
      sqm: 102,
      pricePerSqm: 3088,
    });
  });

  it("formats project price, layout, and VAT summaries from the unit schedule", () => {
    const units = [
      unit({ id: "u1", price: 275000, bedrooms: 1, bathrooms: 1, vat_included: false }),
      unit({ id: "u2", price: 410000, bedrooms: 2, bathrooms: 2, vat_included: true }),
    ];

    expect(formatPriceRange(units.map((item) => Number(item.price)))).toBe("€275.000 - €410.000");
    expect(formatLayoutRange([1, 2], [1, 2])).toBe("1-2 bed · 1-2 bath");
    expect(formatVatSummary(units)).toBe("VAT varies by unit");
    expect(formatVatSummary([unit({ id: "u3", vat_included: true })])).toBe("VAT included");
    expect(formatVatSummary([unit({ id: "u4", vat_included: false })])).toBe("VAT not included");
  });

  it("orders project media deterministically and separates visual media from documents", () => {
    const sorted = sortProjectMedia([
      media({ id: "doc", url: "https://example.com/floorplan.pdf", media_type: "pdf", sort_order: 1 }),
      media({ id: "render-2", url: "https://example.com/render-2.jpg", media_type: "image", sort_order: 2 }),
      media({ id: "render-1", url: "https://example.com/render-1.jpg", media_type: "image", sort_order: 1 }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["render-1", "render-2", "doc"]);
    expect(sorted.map(isProjectImageMedia)).toEqual([true, true, false]);
  });
});
