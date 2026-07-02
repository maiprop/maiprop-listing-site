import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalPublicApiResponse } from "./local-public-api-fixtures.mjs";

async function jsonFor(path) {
  const response = createLocalPublicApiResponse(new URL(path, "http://localhost:8080"));
  expect(response).toBeInstanceOf(Response);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  return response.json();
}

describe("local public API fixtures", () => {
  it("does not disable local fixtures just because VITE_APP_URL is configured for canonical links", () => {
    const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

    expect(viteConfig).toContain("VITE_PUBLIC_API_ORIGIN");
    expect(viteConfig).not.toMatch(/process\.env\.VITE_APP_URL\s*\|\|/);
    expect(viteConfig).not.toMatch(/env\.VITE_APP_URL/);
  });

  it("serves production-shaped JSON for public listing routes in Vite dev and preview", async () => {
    const listings = await jsonFor("/api/public/listings?limit=1");
    expect(listings).toMatchObject({
      hasMore: false,
      page: 1,
      pageSize: 1,
    });
    expect(listings.data).toHaveLength(1);
    expect(listings.data[0]).toMatchObject({
      id: expect.any(String),
      listing_type: "sale",
      status: "active",
    });

    await expect(jsonFor(`/api/public/listing?id=${listings.data[0].id}`)).resolves.toMatchObject({
      data: {
        id: listings.data[0].id,
        title: listings.data[0].title,
        listing_type: "sale",
        status: "active",
      },
    });
    await expect(jsonFor("/api/public/listing?id=missing")).resolves.toEqual({ data: null });
  });

  it("serves all homepage, auction, open-house, and similar-listing public API paths as JSON", async () => {
    await expect(jsonFor("/api/public/homepage?section=featured")).resolves.toEqual(expect.any(Array));
    await expect(jsonFor("/api/public/homepage?section=open-houses")).resolves.toEqual(expect.any(Array));
    await expect(jsonFor("/api/public/homepage?section=type-counts")).resolves.toMatchObject({ apartment: expect.any(Number) });
    await expect(jsonFor("/api/public/homepage?section=auction-count")).resolves.toEqual(expect.any(Number));
    await expect(jsonFor("/api/public/homepage?section=price-index")).resolves.toEqual(expect.any(Array));
    await expect(jsonFor("/api/public/homepage?section=popular-locations")).resolves.toEqual(expect.any(Array));
    await expect(jsonFor("/api/public/auctions?limit=1")).resolves.toMatchObject({ data: expect.any(Array) });
    await expect(jsonFor("/api/public/open-houses?limit=1")).resolves.toEqual(expect.any(Array));
    await expect(jsonFor("/api/public/similar-listings?limit=1")).resolves.toMatchObject({ data: expect.any(Array) });
  });

  it("returns JSON errors instead of SPA HTML for unsupported local public API paths and methods", async () => {
    const notFound = createLocalPublicApiResponse(new URL("/api/public/unknown", "http://localhost:8080"));
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get("content-type")).toContain("application/json");
    await expect(notFound.json()).resolves.toEqual({ error: "Local public API fixture not found" });

    const method = createLocalPublicApiResponse(new URL("/api/public/listings", "http://localhost:8080"), "POST");
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("GET, HEAD");
    await expect(method.json()).resolves.toEqual({ error: "Method not allowed" });
  });
});
