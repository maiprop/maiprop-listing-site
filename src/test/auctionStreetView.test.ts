import { describe, expect, it } from "vitest";
import {
  AUCTION_FALLBACK_LOGO_URL,
  getAuctionImageList,
  getAuctionStreetViewImageUrl,
  getAuctionStreetViewLocation,
} from "@/lib/auctionStreetView";

describe("auction Street View image fallback", () => {
  it("prefers Street View before an existing cover image", () => {
    const url = getAuctionStreetViewImageUrl({
      cover_image_url: " https://cdn.example/auction.jpg ",
      latitude: 37.98,
      longitude: 23.72,
    });

    expect(url).toContain("/functions/v1/streetview-proxy");
    expect(url).toContain("lat=37.98");
  });

  it("builds a proxied Street View URL from coordinates", () => {
    const url = getAuctionStreetViewImageUrl({ latitude: "37.98", longitude: "23.72" }, "480x256");

    expect(url).toContain("/functions/v1/streetview-proxy");
    expect(url).toContain("size=480x256");
    expect(url).toContain("lat=37.98");
    expect(url).toContain("lng=23.72");
  });

  it("falls back to location when coordinates are out of range", () => {
    const url = getAuctionStreetViewImageUrl({
      latitude: "999",
      longitude: "23.72",
      address: "1 Ermou",
      city: "Athens",
      region: "Attica",
    }, "480x256");

    expect(url).toContain("/functions/v1/streetview-proxy");
    expect(url).toContain("size=480x256");
    expect(url).toContain("location=");
    expect(url).not.toContain("lat=");
    expect(url).not.toContain("lng=");
  });

  it("falls back to address/city/region when coordinates are unavailable", () => {
    const location = getAuctionStreetViewLocation({
      address: "1 Ermou",
      city: "Athens",
      region: "Attica",
    });
    const url = getAuctionStreetViewImageUrl({
      address: "1 Ermou",
      city: "Athens",
      region: "Attica",
    });

    expect(location).toBe("1 Ermou, Athens, Attica, Greece");
    expect(url).toContain("location=1+Ermou%2C+Athens%2C+Attica%2C+Greece");
  });

  it("uses the maiProp logo when neither image nor location exists", () => {
    expect(getAuctionStreetViewImageUrl({})).toBe(AUCTION_FALLBACK_LOGO_URL);
    expect(getAuctionImageList({})).toEqual([AUCTION_FALLBACK_LOGO_URL]);
  });

  it("falls back to an existing cover image when no Street View location exists", () => {
    expect(
      getAuctionStreetViewImageUrl({
        cover_image_url: " https://cdn.example/auction.jpg ",
      }),
    ).toBe("https://cdn.example/auction.jpg");
  });

  it("keeps the cover image as a secondary fallback when Street View is available", () => {
    const images = getAuctionImageList({
      cover_image_url: "https://cdn.example/auction.jpg",
      latitude: 37.98,
      longitude: 23.72,
    });

    expect(images[0]).toContain("/functions/v1/streetview-proxy");
    expect(images[1]).toBe("https://cdn.example/auction.jpg");
  });

  it("keeps listing images behind Street View and cover fallbacks", () => {
    const images = getAuctionImageList({
      cover_image_url: "https://cdn.example/cover.jpg",
      latitude: 37.98,
      longitude: 23.72,
      listing_images: [
        { url: "https://cdn.example/second.jpg", sort_order: 2 },
        { url: "https://cdn.example/first.jpg", sort_order: 1 },
      ],
    });

    expect(images[0]).toContain("/functions/v1/streetview-proxy");
    expect(images.slice(1)).toEqual([
      "https://cdn.example/cover.jpg",
      "https://cdn.example/first.jpg",
      "https://cdn.example/second.jpg",
    ]);
  });
});
