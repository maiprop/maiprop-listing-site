import { expect, test } from "@playwright/test";

const coverImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23f5efe6'/%3E%3Crect x='80' y='90' width='480' height='210' rx='24' fill='%236d3ee4'/%3E%3C/svg%3E";

const auction = {
  id: "auction-image-fallback-1",
  title: "Broken Street View Auction",
  city: "Athens",
  address: "1 Fallback Street",
  region: "Attica",
  price: 250000,
  auction_starting_bid: 180000,
  auction_date: "2099-06-01",
  auction_court: "Athens Court",
  property_type: "apartment",
  listing_type: "auction",
  cover_image_url: coverImage,
  listing_images: [{ url: coverImage, sort_order: 1 }],
  sqm: 72,
  bedrooms: 2,
  bathrooms: 1,
  floor: 1,
  total_floors: 4,
  latitude: 37.9838,
  longitude: 23.7275,
  tags: [],
  year_built: 1990,
  construction_status: null,
  website_url: null,
  is_featured: false,
  priority_placement: 0,
};

test("auction cards fall back from broken Street View to cover imagery", async ({ page }) => {
  await page.route(/\/api\/public\/auctions(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [auction] }),
    });
  });

  await page.route(/\/api\/public\/homepage(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route("**/functions/v1/streetview-proxy**", async (route) => {
    await route.fulfill({ status: 404, body: "missing street view image" });
  });
  await page.route("https://api.mapbox.com/**", async (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://events.mapbox.com/**", async (route) => route.fulfill({ status: 204, body: "" }));

  await page.goto("/auctions");
  await page.waitForLoadState("load");

  const card = page.getByTestId("auction-card").filter({ hasText: "Broken Street View Auction" }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByRole("img", { name: "Broken Street View Auction" })).toHaveAttribute("src", coverImage);
});
