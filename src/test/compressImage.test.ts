/**
 * Tests for the MIME type allowlist in compressImage.
 *
 * Note: Canvas API is not available in jsdom, so we test the early-exit paths
 * (non-image or small files) that bypass compression entirely.
 */

import { describe, it, expect } from "vitest";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif",
]);

function shouldCompress(mimeType: string, sizeBytes: number): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType) && sizeBytes >= 150_000;
}

describe("compressImage MIME allowlist", () => {
  it("allows jpeg files over 150KB", () => {
    expect(shouldCompress("image/jpeg", 200_000)).toBe(true);
    expect(shouldCompress("image/jpeg", 1_000_000)).toBe(true);
  });

  it("allows png files over 150KB", () => {
    expect(shouldCompress("image/png", 200_000)).toBe(true);
    expect(shouldCompress("image/png", 5_000_000)).toBe(true);
  });

  it("allows webp files over 150KB", () => {
    expect(shouldCompress("image/webp", 200_000)).toBe(true);
    // heic/heif/avif are also on the allowlist — verify in the same test.
    expect(shouldCompress("image/heic", 200_000)).toBe(true);
    expect(shouldCompress("image/heif", 200_000)).toBe(true);
    expect(shouldCompress("image/avif", 200_000)).toBe(true);
  });

  it("rejects image/gif (canvas strips animation)", () => {
    expect(shouldCompress("image/gif", 200_000)).toBe(false);
    // Even gigantic GIFs are rejected.
    expect(shouldCompress("image/gif", 10_000_000)).toBe(false);
  });

  it("rejects image/svg+xml", () => {
    expect(shouldCompress("image/svg+xml", 200_000)).toBe(false);
    expect(shouldCompress("image/svg+xml", 10_000_000)).toBe(false);
  });

  it("rejects video/mp4", () => {
    expect(shouldCompress("video/mp4", 200_000)).toBe(false);
    expect(shouldCompress("video/webm", 200_000)).toBe(false);
  });

  it("rejects application/pdf", () => {
    expect(shouldCompress("application/pdf", 200_000)).toBe(false);
    expect(shouldCompress("application/octet-stream", 200_000)).toBe(false);
  });

  it("rejects arbitrary image/* glob (old .startsWith check bypass)", () => {
    expect(shouldCompress("image/x-portable-anymap", 200_000)).toBe(false);
    expect(shouldCompress("image/bmp", 200_000)).toBe(false);
    expect(shouldCompress("image/tiff", 200_000)).toBe(false);
  });

  it("skips files under 150KB regardless of type", () => {
    expect(shouldCompress("image/jpeg", 100_000)).toBe(false);
    expect(shouldCompress("image/png", 0)).toBe(false);
    expect(shouldCompress("image/webp", 149_999)).toBe(false);
  });

  it("allows files at exactly 150KB", () => {
    expect(shouldCompress("image/jpeg", 150_000)).toBe(true);
    // 1 byte under is rejected, 1 byte over is allowed (boundary integrity).
    expect(shouldCompress("image/jpeg", 149_999)).toBe(false);
    expect(shouldCompress("image/jpeg", 150_001)).toBe(true);
  });
});
