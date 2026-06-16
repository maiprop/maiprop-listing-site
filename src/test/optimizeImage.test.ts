import { describe, it, expect } from "vitest";
import { optimizeImage } from "@/lib/optimizeImage";

const SUPABASE_URL = "https://abc.supabase.co/storage/v1/object/public/listings/photo.jpg";

describe("optimizeImage", () => {
  it("returns the original URL for non-Supabase storage URLs", () => {
    const url = "https://example.com/image.jpg";
    expect(optimizeImage(url)).toBe(url);
  });

  it("returns empty string as-is", () => {
    expect(optimizeImage("")).toBe("");
  });

  it("returns Supabase object URLs unchanged unless transformations are explicitly enabled", () => {
    expect(optimizeImage(SUPABASE_URL, { width: 400 })).toBe(SUPABASE_URL);
  });

  it("rewrites Supabase storage URL to render endpoint when explicitly enabled", () => {
    const result = optimizeImage(SUPABASE_URL, { width: 400, transformsEnabled: true });
    expect(result).toContain("/storage/v1/render/image/public/");
    expect(result).not.toContain("/storage/v1/object/public/");
  });

  it("includes width param when provided", () => {
    const result = optimizeImage(SUPABASE_URL, { width: 800, transformsEnabled: true });
    expect(result).toContain("width=800");
  });

  it("includes height param when provided", () => {
    const result = optimizeImage(SUPABASE_URL, { height: 600, transformsEnabled: true });
    expect(result).toContain("height=600");
  });

  it("uses default quality of 75 when not specified", () => {
    const result = optimizeImage(SUPABASE_URL, { width: 400, transformsEnabled: true });
    expect(result).toContain("quality=75");
  });

  it("uses custom quality when provided", () => {
    const result = optimizeImage(SUPABASE_URL, { quality: 90, transformsEnabled: true });
    expect(result).toContain("quality=90");
  });

  it("always includes resize=cover", () => {
    const result = optimizeImage(SUPABASE_URL, { transformsEnabled: true });
    expect(result).toContain("resize=cover");
  });

  it("always includes format=origin", () => {
    const result = optimizeImage(SUPABASE_URL, { transformsEnabled: true });
    expect(result).toContain("format=origin");
  });

  it("preserves the path after /public/", () => {
    const result = optimizeImage(SUPABASE_URL, { width: 400, transformsEnabled: true });
    expect(result).toContain("listings/photo.jpg");
  });

  it("does not add width/height params when neither is provided", () => {
    const result = optimizeImage(SUPABASE_URL, { transformsEnabled: true });
    expect(result).not.toContain("width=");
    expect(result).not.toContain("height=");
  });
});
