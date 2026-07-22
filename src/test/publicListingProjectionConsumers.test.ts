import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicListingConsumers = [
  "functions/api/public/listings.ts",
  "functions/api/public/homepage.ts",
  "functions/api/public/listing.ts",
  "functions/api/public/auctions.ts",
  "functions/api/public/open-houses.ts",
  "functions/api/public/similar-listings.ts",
  "functions/_seo.ts",
] as const;

const browserFallbackConsumers = [
  "src/hooks/useAuctionListings.ts",
  "src/hooks/useSimilarListings.ts",
  "src/lib/publicListingFallbacks.ts",
  "src/lib/newBuildListingFallback.ts",
] as const;

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("public listing projection consumers", () => {
  it.each(publicListingConsumers)("routes %s through the allowlisted catalogue", (path) => {
    const contents = source(path);

    expect(contents).not.toContain('"/rest/v1/listings"');
    expect(contents).toContain("PUBLIC_LISTING_CATALOGUE_PATH");
  });

  it("does not reintroduce nested PostgREST joins in catalogue APIs", () => {
    const contents = publicListingConsumers
      .filter((path) => path !== "functions/_seo.ts")
      .map(source)
      .join("\n");

    expect(contents).not.toMatch(/listing_images\s*\(/);
    expect(contents).not.toMatch(/projects!listings_project_id_fkey/);
    expect(contents).not.toMatch(/project_units!project_units_project_id_fkey/);
    expect(contents).not.toMatch(/project_media!project_media_project_id_fkey/);
  });

  it.each(browserFallbackConsumers)("routes browser fallback %s through the allowlisted catalogue", (path) => {
    const contents = source(path);

    expect(contents).toContain('.rpc("get_public_listing_catalogue")');
    expect(contents).not.toContain('.from("listings")');
    expect(contents).not.toMatch(/listing_images\s*\(/);
    expect(contents).not.toMatch(/projects!listings_project_id_fkey/);
  });

  it("uses scoped catalogues for public and owner listing reads", () => {
    const contents = source("src/hooks/useListings.ts");

    expect(contents).toContain('.rpc("get_public_listing_catalogue")');
    expect(contents).toContain("PUBLIC_LISTING_CARD_SELECT");
    expect(contents).toContain("PUBLIC_LISTING_DETAIL_SELECT");
    expect(contents).toContain('.rpc("get_listing_management_catalogue")');
    expect(contents).not.toContain('.from("listings")');
  });
});
