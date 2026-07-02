const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Maiprop-Local-Public-Api": "fixture",
};

const baseListing = {
  id: "00000000-0000-4000-8000-000000000101",
  owner_id: "00000000-0000-4000-8000-000000000001",
  title: "Local Fixture Apartment",
  address: "1 Local Test Street, Athens",
  city: "Athens",
  price: 275000,
  price_per_sqm: 5500,
  bedrooms: 2,
  bathrooms: 1,
  sqm: 50,
  floor: "2",
  total_floors: "5",
  year_built: 2024,
  energy_class: "A",
  cover_image_url: null,
  property_type: "apartment",
  listing_type: "sale",
  status: "active",
  tags: [],
  ai_score: 72,
  views_count: 1,
  is_featured: true,
  priority_placement: 10,
  is_off_market: false,
  latitude: 37.9838,
  longitude: 23.7275,
  listing_images: [],
  profiles: {
    user_id: "00000000-0000-4000-8000-000000000001",
    display_name: "MaiProp Fixture",
    avatar_url: null,
    role: "agent",
  },
};

const newBuildListing = {
  ...baseListing,
  id: "00000000-0000-4000-8000-000000000201",
  title: "Local Fixture New Building",
  listing_type: "new_build",
  is_pre_sale: true,
  construction_status: "under_construction",
  project: {
    delivery_date: "2027-06-01",
    project_units: [
      { id: "unit-1", availability_status: "available", internal_sqm: 50 },
      { id: "unit-2", availability_status: "reserved", internal_sqm: 62 },
    ],
  },
};

const openHouseListing = {
  ...baseListing,
  id: "00000000-0000-4000-8000-000000000301",
  title: "Local Fixture Open House",
  listing_type: "open_house",
  open_house_transaction_type: "sale",
  open_house_date: "2027-01-15T10:00:00.000Z",
};

const auctionListing = {
  ...baseListing,
  id: "00000000-0000-4000-8000-000000000401",
  title: "Local Fixture Auction",
  listing_type: "auction",
  auction_date: "2027-02-20",
  auction_starting_bid: 220000,
  auction_court: "Athens",
};

const priceIndex = [
  { city: "Athens", avg_price_per_sqm: 2180, listing_count: 1, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
  { city: "Thessaloniki", avg_price_per_sqm: 1640, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
];

const popularLocations = [
  { name: "Athens", listings: 1, trend: null, trendUp: null, trendIsLive: false },
  { name: "Thessaloniki", listings: 0, trend: null, trendUp: null, trendIsLive: false },
];

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

function pageSizeFrom(url) {
  const raw = url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? "24";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(200, parsed)) : 24;
}

function listingFor(url) {
  const listingType = url.searchParams.get("listing_type");
  if (listingType === "new_build" || url.searchParams.get("is_pre_sale") === "true") return newBuildListing;
  if (listingType === "open_house") return openHouseListing;
  if (listingType === "auction") return auctionListing;
  return baseListing;
}

function homepageResponse(url) {
  const section = url.searchParams.get("section");
  if (section === "featured") return json([baseListing, newBuildListing]);
  if (section === "open-houses") return json([openHouseListing]);
  if (section === "auctions") return json({ data: [auctionListing] });
  if (section === "type-counts") return json({ apartment: 1, land: 0 });
  if (section === "auction-count") return json(1);
  if (section === "price-index") return json(priceIndex);
  if (section === "popular-locations") return json(popularLocations);
  return json({ error: "Unsupported homepage section" }, { status: 400 });
}

export function createLocalPublicApiResponse(url, method = "GET") {
  const normalizedMethod = method.toUpperCase();
  if (!["GET", "HEAD"].includes(normalizedMethod)) {
    return json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: "GET, HEAD" } },
    );
  }

  const pathname = url.pathname.replace(/\/$/, "");
  let response;
  if (pathname === "/api/public/homepage") {
    response = homepageResponse(url);
  } else if (pathname === "/api/public/listings") {
    const pageSize = pageSizeFrom(url);
    const row = listingFor(url);
    response = json({ data: [row].slice(0, pageSize), hasMore: false, page: 1, pageSize });
  } else if (pathname === "/api/public/listing") {
    const id = url.searchParams.get("id");
    const osTag = url.searchParams.get("osTag");
    if (!id && !osTag) response = json({ error: "Missing listing identifier" }, { status: 400 });
    else if (id === baseListing.id) response = json({ data: baseListing });
    else if (id === newBuildListing.id) response = json({ data: newBuildListing });
    else if (id === openHouseListing.id) response = json({ data: openHouseListing });
    else if (id === auctionListing.id || osTag) response = json({ data: auctionListing });
    else response = json({ data: null });
  } else if (pathname === "/api/public/auctions") {
    response = json({ data: [auctionListing] });
  } else if (pathname === "/api/public/open-houses") {
    response = json([openHouseListing]);
  } else if (pathname === "/api/public/similar-listings") {
    response = json({ data: [] });
  } else {
    response = json({ error: "Local public API fixture not found" }, { status: 404 });
  }

  if (normalizedMethod === "HEAD") {
    return new Response(null, { status: response.status, headers: response.headers });
  }
  return response;
}
