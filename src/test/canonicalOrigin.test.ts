import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CANONICAL_ORIGIN = "https://portal.maiprop.co";
const LEGACY_ORIGIN = "https://maiprop.co";

const canonicalSourceFiles = [
  "functions/_seo.ts",
  "functions/auctions.ts",
  "functions/listings.ts",
  "functions/property/[id].ts",
  "src/pages/AuctionDetail.tsx",
  "src/pages/Auctions.tsx",
  "src/pages/Index.tsx",
  "src/pages/Listings.tsx",
  "src/pages/Professionals.tsx",
  "src/pages/PropertyDetail.tsx",
] as const;

function readRepoFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("canonical origin contract", () => {
  it("keeps SEO canonical and Open Graph URLs on the live portal host", () => {
    const offenders = canonicalSourceFiles.filter((path) => readRepoFile(path).includes(LEGACY_ORIGIN));

    expect(offenders).toEqual([]);
    expect(readRepoFile("src/lib/config.ts")).toContain(`"${CANONICAL_ORIGIN}"`);
  });
});
