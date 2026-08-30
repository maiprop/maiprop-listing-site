/* global Deno:readonly */
import { requireOsAuctionId } from "../_shared/osAuctionIdentity.ts";
import { TRAILING_SLASH_RE } from "./constants.ts";
import type { MappedAuction, OsAuction } from "./types.ts";

const CATEGORY_MAP = new Map<string, string>([
  ["RESIDENCE", "apartment"],
  ["APARTMENT", "apartment"],
  ["HOUSE", "house"],
  ["VILLA", "villa"],
  ["LAND", "land"],
  ["PLOT", "land"],
  ["PLOT_WITH_BUILDING", "land"],
  ["LAND_WITH_BUILDING", "land"],
  ["COMMERCIAL", "commercial"],
  ["OFFICE", "office"],
  ["STORE", "commercial"],
  ["WAREHOUSE", "commercial"],
  ["INDUSTRIAL", "commercial"],
  ["STOREROOM", "commercial"],
  ["PARKING", "commercial"],
  ["HOTEL", "commercial"],
  ["OTHER_BUSINESS_SPACE", "commercial"],
]);

const LAND_TYPE_TAG = new Map<string, string>([
  ["LAND", "land"],
  ["PLOT", "plot"],
  ["PLOT_WITH_BUILDING", "plot_with_building"],
  ["LAND_WITH_BUILDING", "land_with_building"],
]);

const COMMERCIAL_TYPE_TAG = new Map<string, string>([
  ["STORE", "store"],
  ["WAREHOUSE", "warehouse"],
  ["INDUSTRIAL", "industrial"],
  ["STOREROOM", "storeroom"],
  ["PARKING", "parking"],
  ["HOTEL", "hotel"],
  ["OFFICE", "office"],
  ["OTHER_BUSINESS_SPACE", "other_business_space"],
  ["COMMERCIAL", "other_business_space"],
]);

const CATEGORY_GR = new Map<string, string>([
  ["apartment", "Διαμέρισμα"],
  ["house", "Κατοικία"],
  ["villa", "Βίλα"],
  ["land", "Γη / Οικόπεδο"],
  ["commercial", "Επαγγελματικός Χώρος"],
  ["office", "Γραφείο"],
]);

const OWNERSHIP_STATUS_TAGS = new Map<string, string>([
  ["FULL", "ownership:full"],
  ["COMPLETE", "ownership:full"],
  ["FULL_OWNERSHIP", "ownership:full"],
  ["BARE", "ownership:bare"],
  ["BARE_OWNERSHIP", "ownership:bare"],
  ["COMMON", "ownership:common"],
  ["JOINT", "ownership:common"],
  ["SHARED", "ownership:common"],
  ["CO_OWNERSHIP", "ownership:common"],
  ["USUFRUCT", "ownership:usufruct"],
  ["PSILI_KYPHIOTITA", "ownership:usufruct"],
  ["VERTICAL", "ownership:vertical"],
  ["VERTICAL_OWNERSHIP", "ownership:vertical"],
  ["HORIZONTAL", "ownership:horizontal"],
  ["HORIZONTAL_OWNERSHIP", "ownership:horizontal"],
]);

function mapCategory(category?: string): string {
  if (!category) return "apartment";
  return CATEGORY_MAP.get(category.toUpperCase()) ?? "apartment";
}

function getSubtypeTag(category?: string): string | null {
  if (!category) return null;
  const categoryKey = category.toUpperCase();
  const landTag = LAND_TYPE_TAG.get(categoryKey);
  if (landTag) return `land_type:${landTag}`;
  const commercialTag = COMMERCIAL_TYPE_TAG.get(categoryKey);
  if (commercialTag) return `commercial_type:${commercialTag}`;
  return null;
}

function mapOwnershipStatusToTag(raw?: string | null): string | null {
  if (!raw) return null;
  const ownershipStatus = raw.toUpperCase().trim();
  return OWNERSHIP_STATUS_TAGS.get(ownershipStatus) ??
    `ownership:${ownershipStatus.toLowerCase()}`;
}

function buildTitle(a: OsAuction): string {
  const catKey = mapCategory(a.propertyCategory);
  const catGr = CATEGORY_GR.get(catKey) ?? "Ακίνητο";
  const city = a.propertyMunicipalityName ?? "Ελλάδα";
  const price = Number(a.firstPriceOffer ?? 0);
  const priceStr = price > 0 ? ` – €${price.toLocaleString("el-GR")}` : "";
  return `Πλειστηριασμός ${catGr} | ${city}${priceStr}`;
}

function getNullableText(value?: string | null): string | null {
  return value ?? null;
}

function getAuctionCity(auction: OsAuction): string {
  return auction.propertyMunicipalityName ?? "Ελλάδα";
}

function getAuctionUrl(auction: OsAuction): string | null {
  return auction.url ?? auction.auctionUrl ?? auction.listingUrl ??
    auction.eAuctionUrl ?? null;
}

function getNumberOrNull(value?: number | string): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getIntegerOrNull(value?: number | string): number | null {
  const parsed = getNumberOrNull(value);
  return parsed == null ? null : Math.round(parsed);
}

function getNumberOrDefault(
  value: number | string | undefined,
  fallback: number,
): number {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getStreetViewUrl(
  lat: number | null,
  lng: number | null,
): string | null {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(
    TRAILING_SLASH_RE,
    "",
  );
  return supabaseUrl && lat != null && lng != null
    ? `${supabaseUrl}/functions/v1/streetview-proxy?size=800x450&lat=${lat}&lng=${lng}`
    : null;
}

function getOwnershipPercentage(auction: OsAuction): number | undefined {
  return getNumberOrNull(auction.ownershipPercentage) ?? undefined;
}

function getOwnershipTag(
  auction: OsAuction,
  ownershipPct: number | undefined,
): string | null {
  const ownershipTag = mapOwnershipStatusToTag(auction.ownershipStatus);
  if (ownershipTag) return ownershipTag;
  if (ownershipPct == null) return null;
  return ownershipPct >= 100 ? "ownership:full" : "ownership:common";
}

function getAuctionStatusTag(auction: OsAuction): string {
  return `auction_status:${auction.auctionStatus ?? "scheduled"}`;
}

function getCurrentRoundTag(auction: OsAuction): string | null {
  return auction.currentRound != null ? `round:${auction.currentRound}` : null;
}

function getOwnershipPercentageTag(
  ownershipPct: number | undefined,
): string | null {
  return ownershipPct != null ? `ownership_pct:${ownershipPct}` : null;
}

function isPresentTag(tag: string | null): tag is string {
  return tag != null;
}

function compactTags(tags: (string | null)[]): string[] {
  return tags.filter(isPresentTag);
}

function buildAuctionTags(
  requiredTags: string[],
  optionalTags: (string | null)[],
): string[] {
  return requiredTags.concat(compactTags(optionalTags));
}

export function mapAuction(auction: OsAuction): MappedAuction {
  const osId = requireOsAuctionId(auction.auctionListingId);
  const tagKey = `os_auction:${osId}`;
  const catKey = mapCategory(auction.propertyCategory);
  const price = getNumberOrDefault(auction.firstPriceOffer, 0);
  const lat = getNumberOrNull(auction.propertyLatitude);
  const lng = getNumberOrNull(auction.propertyLongitude);
  const ownershipPct = getOwnershipPercentage(auction);
  const ownershipTag = getOwnershipTag(auction, ownershipPct);
  const subtypeTag = getSubtypeTag(auction.propertyCategory);
  const requiredTags = [
    tagKey,
    "source:maiprop-os",
    getAuctionStatusTag(auction),
  ];
  const optionalTags = [
    getCurrentRoundTag(auction),
    ownershipTag,
    getOwnershipPercentageTag(ownershipPct),
    subtypeTag,
  ];

  return {
    id: osId,
    title: buildTitle(auction),
    city: getAuctionCity(auction),
    address: getNullableText(auction.propertyAddress),
    price,
    auction_starting_bid: price,
    auction_date: getNullableText(auction.auctionDate),
    auction_court: null,
    property_type: catKey,
    cover_image_url: getStreetViewUrl(lat, lng),
    sqm: getNumberOrDefault(auction.propertySquareMeters, 1),
    bedrooms: null,
    bathrooms: null,
    floor: getIntegerOrNull(auction.propertyFloor),
    total_floors: getIntegerOrNull(auction.numberOfFloors),
    latitude: lat,
    longitude: lng,
    tags: buildAuctionTags(requiredTags, optionalTags),
    year_built: getNumberOrNull(auction.constructionYear),
    construction_status: null,
    website_url: getAuctionUrl(auction),
    region: getNullableText(auction.propertyPrefectureName),
    is_featured: false,
    priority_placement: 0,
  };
}
