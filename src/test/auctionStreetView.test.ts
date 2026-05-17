import { describe, expect, it } from "vitest";
import {
  getAuctionImageList,
  getAuctionStreetViewImageUrl,
  getAuctionStreetViewLocation,
} from "@/lib/auctionStreetView";

describe("auction Street View image fallback", () => {
  it("keeps an existing cover image before using Street View", () => {
    expect(
      getAuctionStreetViewImageUrl({
        cover_image_url: " https://cdn.example/auction.jpg ",
        latitude: 37.98,
        longitude: 23.72,
      }),
    ).toBe("https://cdn.example/auction.jpg");
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

  it("returns an empty image list when neither image nor location exists", () => {
    expect(getAuctionImageList({})).toEqual([]);
  });
});
