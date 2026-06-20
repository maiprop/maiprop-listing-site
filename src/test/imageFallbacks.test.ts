import { describe, expect, it } from "vitest";
import {
  MAIPROP_LOGO_FALLBACK_URL,
  switchImageToNextFallbackIfEmpty,
} from "@/lib/imageFallbacks";

const imageWithNaturalSize = (src: string, naturalWidth: number, naturalHeight: number) => {
  const img = document.createElement("img");
  img.src = src;
  img.dataset.imageFallbackIndex = "0";
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: naturalWidth });
  Object.defineProperty(img, "naturalHeight", { configurable: true, value: naturalHeight });
  return img;
};

describe("image fallback helpers", () => {
  it("falls through when an image loads with zero natural size", () => {
    const img = imageWithNaturalSize("https://street.example/empty.jpg", 0, 0);

    const didSwitch = switchImageToNextFallbackIfEmpty(img, [
      "https://street.example/empty.jpg",
      "https://cdn.example/cover.jpg",
    ]);

    expect(didSwitch).toBe(true);
    expect(img.src).toBe("https://cdn.example/cover.jpg");
    expect(img.style.objectFit).toBe("cover");
  });

  it("leaves valid images and the terminal logo fallback alone", () => {
    const valid = imageWithNaturalSize("https://cdn.example/cover.jpg", 640, 360);
    expect(switchImageToNextFallbackIfEmpty(valid, ["https://cdn.example/cover.jpg"])).toBe(false);
    expect(valid.src).toBe("https://cdn.example/cover.jpg");

    const logo = imageWithNaturalSize(MAIPROP_LOGO_FALLBACK_URL, 0, 0);
    expect(switchImageToNextFallbackIfEmpty(logo, [MAIPROP_LOGO_FALLBACK_URL])).toBe(false);
    expect(logo.src).toContain(MAIPROP_LOGO_FALLBACK_URL);
  });
});
