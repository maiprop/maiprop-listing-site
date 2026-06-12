import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");

describe("Cloudflare Pages security headers", () => {
  it("allows Google Maps fallback embeds used when exact coordinates are missing", () => {
    const cspLine = headers
      .split(/\r?\n/)
      .find((line) => line.includes("Content-Security-Policy"));

    expect(cspLine).toContain("frame-src");
    expect(cspLine).toContain("https://maps.google.com");
    expect(cspLine).toContain("https://www.google.com");
  });
});
