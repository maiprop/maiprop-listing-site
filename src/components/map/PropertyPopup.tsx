import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MapPin, Square, Layers, Calendar, Building2 } from "lucide-react";
import { getStreetViewProxyUrl } from "@/lib/config";
import { getOwnershipStatus, getOwnershipPct } from "@/lib/auctionUtils";
import { formatPrice } from "@/lib/format";
import { MAIPROP_LOGO_FALLBACK_URL, isMaiPropLogoFallback, switchImageToLogoFallback } from "@/lib/imageFallbacks";
import type { MapListing } from "./mapConfig";
import { typeColour } from "./mapConfig";

type RawListing = Record<string, unknown> & {
  auction_date?: string | number | Date | null;
  auction_starting_bid?: string | number | null;
  cover_image_url?: string | null;
  floor?: string | number | null;
  price?: string | number | null;
  property_type?: string | null;
  tags?: unknown;
  year_built?: string | number | null;
};

type Pill = { icon: ReactNode; text: string };

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "Apartment",
  house: "House",
  villa: "Villa",
  land: "Land",
  commercial: "Commercial",
  office: "Office",
};

const LAND_TYPE_LABELS: Record<string, string> = {
  plot_with_building: "Plot w/ Building",
  land_with_building: "Land w/ Building",
  land: "Land",
  plot: "Plot",
};

const COMMERCIAL_TYPE_LABELS: Record<string, string> = {
  store: "Store",
  warehouse: "Warehouse",
  industrial: "Industrial",
  storeroom: "Storeroom",
  parking: "Parking",
  hotel: "Hotel",
};

const OWNERSHIP_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  full: { label: "\u03a0\u03bb\u03ae\u03c1\u03b7\u03c2", bg: "rgba(16,185,129,0.15)", color: "#10b981" },
  partial: { label: "\u039c\u03b5\u03c1\u03b9\u03ba\u03ae", bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  common: { label: "\u0395\u03be \u03b1\u03b4\u03b9\u03b1\u03b9\u03c1\u03ad\u03c4\u03bf\u03c5", bg: "rgba(14,165,233,0.15)", color: "#0ea5e9" },
  none: { label: "\u03a7\u03c9\u03c1\u03af\u03c2 \u03ba\u03c5\u03c1\u03b9\u03cc\u03c4\u03b7\u03c4\u03b1", bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
};

const getRawListing = (listing: MapListing): RawListing => (listing._raw ?? listing) as RawListing;

const getTags = (raw: RawListing): string[] =>
  Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [];

const titleCase = (value: string): string =>
  value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const getTaggedPropertyType = (tags: string[]): string => {
  if (tags.some((tag) => tag.startsWith("land_type:"))) return "land";
  if (tags.some((tag) => tag.startsWith("commercial_type:"))) return "commercial";
  return "";
};

const getBasePropertyType = (raw: RawListing, tags: string[]): string =>
  String(raw.property_type || getTaggedPropertyType(tags));

const getSubtypeLabel = (tags: string[], prefix: string, labels: Record<string, string>): string | null => {
  const tag = tags.find((item) => item.startsWith(prefix));
  const subtype = tag?.replace(prefix, "");
  return subtype ? labels[subtype] ?? null : null;
};

const getSpecialPropertyTypeLabel = (base: string, tags: string[]): string | null => {
  if (base === "land") return getSubtypeLabel(tags, "land_type:", LAND_TYPE_LABELS) ?? PROPERTY_TYPE_LABELS.land;
  if (base === "commercial") return getSubtypeLabel(tags, "commercial_type:", COMMERCIAL_TYPE_LABELS) ?? PROPERTY_TYPE_LABELS.commercial;
  return null;
};

const getPropertyTypeLabel = (raw: RawListing): string => {
  const tags = getTags(raw);
  const base = getBasePropertyType(raw, tags);
  if (!base) return "";
  return getSpecialPropertyTypeLabel(base, tags) ?? PROPERTY_TYPE_LABELS[base] ?? titleCase(base);
};

const getCoverImage = (raw: RawListing): string =>
  typeof raw.cover_image_url === "string" ? raw.cover_image_url : "";

const getStreetViewImage = (listing: MapListing): string => {
  if (listing.latitude == null || listing.longitude == null) return "";
  return getStreetViewProxyUrl({ lat: listing.latitude, lng: listing.longitude }, "400x200") ?? "";
};

const firstImageOrLogo = (images: string[]): string =>
  images.find((image) => image.length > 0) ?? MAIPROP_LOGO_FALLBACK_URL;

const getAuctionImage = (listing: MapListing, raw: RawListing): string =>
  firstImageOrLogo([listing.images?.[0] ?? "", getCoverImage(raw), getStreetViewImage(listing)]);

const getDaysLeft = (auctionDate: RawListing["auction_date"]): number | null => {
  if (!auctionDate) return null;
  return Math.ceil((new Date(auctionDate).getTime() - Date.now()) / 86_400_000);
};

const getCountdownText = (daysLeft: number): string => {
  if (daysLeft === 0) return "Today!";
  if (daysLeft === 1) return "Tomorrow";
  return `${daysLeft}d left`;
};

const normalizeFloor = (value: RawListing["floor"]): number | null => {
  if (value == null || value === "") return null;
  const floor = Number(value);
  return Number.isFinite(floor) ? floor : null;
};

const getFloorName = (floor: number): string | null => {
  if (floor === -1) return "Basement";
  if (floor === 0) return "Ground";
  return null;
};

const getFloorLabel = (value: RawListing["floor"]): string | null => {
  const floor = normalizeFloor(value);
  if (floor === null) return null;
  const name = getFloorName(floor);
  if (name) return name;
  return `${floor}${["st", "nd", "rd"][floor - 1] || "th"} fl.`;
};

const getDetailLink = (listing: MapListing): string => {
  if (listing.listingType === "auction") return `/auction/${listing.id}`;
  if (listing.listingType === "open_house") return `/open-house/${listing.id}`;
  return `/property/${listing.id}`;
};

const getPills = (listing: MapListing, raw: RawListing): Pill[] => {
  const floorLabel = getFloorLabel(raw.floor);
  const pills: Array<Pill | null> = [
    listing.sqm > 1 ? { icon: <Square style={{ width: 10, height: 10 }} />, text: `${listing.sqm} m\u00b2` } : null,
    floorLabel ? { icon: <Layers style={{ width: 10, height: 10 }} />, text: floorLabel } : null,
    raw.year_built ? { icon: <Calendar style={{ width: 10, height: 10 }} />, text: String(raw.year_built) } : null,
  ];
  return pills.filter((pill): pill is Pill => pill != null);
};

const hasDisplayValue = (value: unknown): boolean => value != null && value !== "";

const getPopupPrice = (listing: MapListing, raw: RawListing): number => {
  const auctionBid = raw.auction_starting_bid;
  return Number(hasDisplayValue(auctionBid) ? auctionBid : listing.price);
};

const AuctionCountdownBadge = ({ daysLeft }: { daysLeft: number | null }) => {
  if (daysLeft === null) return null;

  return (
    <div
      className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: daysLeft <= 3 ? "rgba(239,68,68,0.9)" : "rgba(245,197,24,0.9)", color: "#0a0f1a" }}
    >
      {getCountdownText(daysLeft)}
    </div>
  );
};

const PopupImage = ({ image, title, daysLeft }: { image: string; title: string; daysLeft: number | null }) => (
  <div className="relative w-full h-28 overflow-hidden">
    <img
      src={image}
      alt={title}
      loading="lazy"
      className={`w-full h-full ${isMaiPropLogoFallback(image) ? "object-contain p-6 bg-background" : "object-cover"}`}
      onError={(event) => switchImageToLogoFallback(event.currentTarget)}
    />
    <AuctionCountdownBadge daysLeft={daysLeft} />
  </div>
);

const PropertyTypeBadge = ({ label }: { label: string }) => {
  if (!label) return null;

  return (
    <span
      className="inline-flex w-fit px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
      style={{ background: "rgba(245,197,24,0.15)", color: "#e5a800", border: "1px solid rgba(245,197,24,0.4)" }}
    >
      {label}
    </span>
  );
};

const PriceLine = ({ listing, raw, isAuction }: { listing: MapListing; raw: RawListing; isAuction: boolean }) => (
  <p style={{ color: typeColour(listing.listingType) }} className="font-bold text-sm">
    &euro;{getPopupPrice(listing, raw).toLocaleString()}
    {isAuction && hasDisplayValue(raw.auction_starting_bid) && hasDisplayValue(raw.price) && (
      <span className="text-[10px] font-normal text-muted-foreground ml-1">
        (val. {formatPrice(Number(raw.price))})
      </span>
    )}
  </p>
);

const PillList = ({ pills }: { pills: Pill[] }) => {
  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {pills.map((pill) => (
        <span
          key={pill.text}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-muted-foreground"
          style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))" }}
        >
          {pill.icon}
          {pill.text}
        </span>
      ))}
    </div>
  );
};

const OwnershipBadge = ({ tags }: { tags: string[] }) => {
  const ownershipStatus = getOwnershipStatus(tags);
  const ownershipBadge = ownershipStatus ? OWNERSHIP_BADGE[ownershipStatus] : null;
  if (!ownershipStatus || !ownershipBadge) return null;

  return (
    <div className="flex items-center gap-1 w-fit">
      <span
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
        style={{ background: ownershipBadge.bg, color: ownershipBadge.color, border: `1px solid ${ownershipBadge.color}44` }}
      >
        <Building2 style={{ width: 10, height: 10 }} />
        {ownershipBadge.label}
        {getOwnershipPct(tags) != null && ownershipStatus !== "full" && ` ${getOwnershipPct(tags)}%`}
      </span>
    </div>
  );
};

const CityLine = ({ city }: { city: string }) => (
  <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
    <MapPin style={{ width: 10, height: 10 }} />
    {city}
  </p>
);

const DetailLink = ({ listing, isAuction }: { listing: MapListing; isAuction: boolean }) => (
  <Link
    to={getDetailLink(listing)}
    className="block text-center px-3 py-1.5 rounded-lg text-[11px] font-bold mt-1 transition-opacity hover:opacity-90"
    style={{ background: typeColour(listing.listingType), color: "#0a0f1a" }}
  >
    {isAuction ? "View Auction" : "View Property"} &rarr;
  </Link>
);

export const PropertyPopup = ({ listing, onClose: _onClose }: { listing: MapListing; onClose: () => void }) => {
  const raw = getRawListing(listing);
  const isAuction = listing.listingType === "auction";
  const image = getAuctionImage(listing, raw);
  const daysLeft = getDaysLeft(raw.auction_date);
  const tags = getTags(raw);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-elevated" style={{ width: 220 }}>
      <PopupImage image={image} title={listing.title} daysLeft={daysLeft} />

      <div className="p-3 space-y-2">
        <p className="font-semibold text-[11px] leading-tight line-clamp-2 text-foreground">
          {listing.title}
        </p>

        <PropertyTypeBadge label={getPropertyTypeLabel(raw)} />
        <PriceLine listing={listing} raw={raw} isAuction={isAuction} />
        <PillList pills={getPills(listing, raw)} />
        <OwnershipBadge tags={tags} />
        <CityLine city={listing.city} />
        <DetailLink listing={listing} isAuction={isAuction} />
      </div>
    </div>
  );
};
