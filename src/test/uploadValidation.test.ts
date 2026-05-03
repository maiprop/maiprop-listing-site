import { describe, it, expect } from "vitest";
import {
  IMAGE_MIME_TYPES,
  IMAGE_AND_VIDEO_MIME_TYPES,
  PDF_MIME_TYPES,
  MESSAGE_ATTACHMENT_MIME_TYPES,
  assertAllowedUpload,
} from "@/lib/uploadValidation";

/** Build a fake File that satisfies the parts of the File interface we use. */
function fakeFile({ name = "x.bin", type = "application/octet-stream", size = 1024 } = {}): File {
  return { name, type, size } as unknown as File;
}

describe("uploadValidation", () => {
  describe("allowlists", () => {
    it("IMAGE_MIME_TYPES covers the canonical image types and excludes everything else", () => {
      expect(IMAGE_MIME_TYPES.has("image/jpeg")).toBe(true);
      expect(IMAGE_MIME_TYPES.has("image/png")).toBe(true);
      expect(IMAGE_MIME_TYPES.has("image/webp")).toBe(true);
      expect(IMAGE_MIME_TYPES.has("image/heic")).toBe(true);
      expect(IMAGE_MIME_TYPES.has("image/heif")).toBe(true);
      expect(IMAGE_MIME_TYPES.has("image/avif")).toBe(true);
      // intentionally excluded
      expect(IMAGE_MIME_TYPES.has("image/svg+xml")).toBe(false);
      expect(IMAGE_MIME_TYPES.has("application/pdf")).toBe(false);
      expect(IMAGE_MIME_TYPES.has("text/html")).toBe(false);
    });

    it("IMAGE_AND_VIDEO_MIME_TYPES is a strict superset of IMAGE_MIME_TYPES", () => {
      for (const t of IMAGE_MIME_TYPES) expect(IMAGE_AND_VIDEO_MIME_TYPES.has(t)).toBe(true);
      expect(IMAGE_AND_VIDEO_MIME_TYPES.has("video/mp4")).toBe(true);
      expect(IMAGE_AND_VIDEO_MIME_TYPES.has("video/webm")).toBe(true);
    });

    it("PDF_MIME_TYPES is exactly application/pdf", () => {
      expect(PDF_MIME_TYPES.size).toBe(1);
      expect(PDF_MIME_TYPES.has("application/pdf")).toBe(true);
    });

    it("MESSAGE_ATTACHMENT_MIME_TYPES allows images + PDF + Word", () => {
      expect(MESSAGE_ATTACHMENT_MIME_TYPES.has("image/jpeg")).toBe(true);
      expect(MESSAGE_ATTACHMENT_MIME_TYPES.has("application/pdf")).toBe(true);
      expect(MESSAGE_ATTACHMENT_MIME_TYPES.has("application/msword")).toBe(true);
      expect(MESSAGE_ATTACHMENT_MIME_TYPES.has(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      )).toBe(true);
      expect(MESSAGE_ATTACHMENT_MIME_TYPES.has("video/mp4")).toBe(false);
      expect(MESSAGE_ATTACHMENT_MIME_TYPES.has("text/html")).toBe(false);
    });
  });

  describe("assertAllowedUpload", () => {
    it("passes silently for an allowed type within size limits", () => {
      expect(() =>
        assertAllowedUpload(fakeFile({ type: "image/png", size: 500_000 }), IMAGE_MIME_TYPES),
      ).not.toThrow();
    });

    it("rejects unsupported MIME type with a helpful message", () => {
      expect(() =>
        assertAllowedUpload(
          fakeFile({ name: "evil.html", type: "text/html", size: 100 }),
          IMAGE_MIME_TYPES,
          { label: "image" },
        ),
      ).toThrow(/Unsupported image type "text\/html"/);
    });

    it("rejects empty MIME type ('unknown' fallback in message)", () => {
      expect(() =>
        assertAllowedUpload(
          fakeFile({ name: "x", type: "", size: 100 }),
          IMAGE_MIME_TYPES,
        ),
      ).toThrow(/Unsupported file type "unknown"/);
    });

    it("rejects oversized files even when the type is allowed", () => {
      expect(() =>
        assertAllowedUpload(
          fakeFile({ name: "huge.png", type: "image/png", size: 11 * 1024 * 1024 }),
          IMAGE_MIME_TYPES,
        ),
      ).toThrow(/exceeds the 10 MB limit/);
    });

    it("respects a custom maxBytes (sub-MB rendered in KB, not 0 MB)", () => {
      expect(() =>
        assertAllowedUpload(
          fakeFile({ name: "small.png", type: "image/png", size: 600_000 }),
          IMAGE_MIME_TYPES,
          { maxBytes: 500_000 },
        ),
      ).toThrow(/exceeds the 488 KB limit/);
    });

    it("formats MB-scale limits with MB units", () => {
      expect(() =>
        assertAllowedUpload(
          fakeFile({ name: "huge.png", type: "image/png", size: 6 * 1024 * 1024 }),
          IMAGE_MIME_TYPES,
          { maxBytes: 5 * 1024 * 1024 },
        ),
      ).toThrow(/exceeds the 5 MB limit/);
    });

    it("excludes SVG (XSS vector via embedded script) from images", () => {
      expect(() =>
        assertAllowedUpload(
          fakeFile({ name: "evil.svg", type: "image/svg+xml", size: 100 }),
          IMAGE_MIME_TYPES,
        ),
      ).toThrow(/Unsupported file type "image\/svg\+xml"/);
    });
  });
});
