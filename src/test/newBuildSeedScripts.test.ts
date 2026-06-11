import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const extractSection = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
};

describe("new-build seed script contract", () => {
  it("seeds dedicated mock new-build ads as listing_type new_build without legacy pre-sale flags", () => {
    const source = readRepoFile("scripts/seed-mock-new-builds.ts");
    const newBuildSection = extractSection(source, "const NEW_BUILDS = [", "const NEW_BUILD_RENTALS = [");

    expect(newBuildSection).toContain('listing_type: "new_build"');
    expect(newBuildSection).not.toContain('listing_type: "sale"');
    expect(newBuildSection).not.toContain("is_pre_sale: true");
  });

  it("keeps the broad mock new-build section canonical and open houses unflagged", () => {
    const source = readRepoFile("scripts/seed-mock-listings.ts");
    const newBuildSection = extractSection(source, "const newBuildListings = [", "const { error: nbErr }");
    const openHouseSection = extractSection(source, "const openHouseListings = [", "const { error: ohErr }");

    expect(newBuildSection).toContain('listing_type: "new_build"');
    expect(newBuildSection).not.toContain('listing_type: "sale"');
    expect(newBuildSection).not.toContain("is_pre_sale: true");
    expect(openHouseSection).not.toContain("is_pre_sale: true");
  });

  it("uses listing_type new_build, not is_pre_sale, to pick new-build image pools", () => {
    const source = readRepoFile("scripts/seed-listing-images.ts");

    expect(source).toContain('const isCanonicalNewBuild = listingType === "new_build";');
    expect(source).toContain("isCanonicalNewBuild &&");
  });
});
