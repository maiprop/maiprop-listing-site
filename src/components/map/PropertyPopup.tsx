import { Link } from "react-router-dom";
import { MapPin, Square, Layers, Calendar, Building2 } from "lucide-react";
import { getStreetViewProxyUrl } from "@/lib/config";
import { getOwnershipStatus, getOwnershipPct } from "@/lib/auctionUtils";
import { formatPrice } from "@/lib/format";
import { MAIPROP_LOGO_FALLBACK_URL, isMaiPropLogoFallback, switchImageToLogoFallback } from "@/lib/imageFallbacks";
import type { MapListing } from "./mapConfig";
import { typeColour } from "./mapConfig";

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "Apartment", house: "House", villa: "Villa", land: "Land",
  commercial: "Commercial", office: "Office",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPropertyTypeLabel(raw: any): string {
  let base = raw?.property_type || "";
  const tags: string[] = raw?.tags ?? [];
  if (!base && tags.length) {
    if (tags.some((t) => t.startsWith("land_type:"))) base = "land";
    else if (tags.some((t) => t.startsWith("commercial_type:"))) base = "commercial";
  }
  if (!base) return "";
  if (base === "land" && tags.length) {
    const landTag = tags.find((t) => t.startsWith("land_type:"));
    if (landTag) {
      const subtype = landTag.replace("land_type:", "");
      const map: Record<string, string> = { plot_with_building: "Plot w/ Building", land_with_building: "Land w/ Building", land: "Land", plot: "Plot" };
      if (map[subtype]) return map[subtype];
    }
  }
  if (base === "commercial" && tags.length) {
    const commTag = tags.find((t) => t.startsWith("commercial_type:"));
    if (commTag) {
      const subtype = commTag.replace("commercial_type:", "");
      const map: Record<string, string> = { store: "Store", warehouse: "Warehouse", industrial: "Industrial", storeroom: "Storeroom", parking: "Parking", hotel: "Hotel" };
      if (map[subtype]) return map[subtype];
    }
  }
  return PROPERTY_TYPE_LABELS[base] ?? base.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") ?? base;
}

const OWNERSHIP_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  full:     { label: "Πλήρης",           bg: "rgba(16,185,129,0.15)",  color: "#10b981" },
  partial:  { label: "Μερική",           bg: "rgba(245,158,11,0.15)",  color: "#f59e0b" },
  common:   { label: "Εξ αδιαιρέτου",   bg: "rgba(14,165,233,0.15)",  color: "#0ea5e9" },
  none:     { label: "Χωρίς κυριότητα", bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
};

function getAuctionImage(listing: MapListing): string {
  const raw = listing._raw ?? listing;
  if (listing.images?.[0]) return listing.images[0];
  if (raw.cover_image_url) return raw.cover_image_url;
  if (listing.latitude != null && listing.longitude != null) {
    const proxyUrl = getStreetViewProxyUrl({ lat: listing.latitude, lng: listing.longitude }, "400x200");
    if (proxyUrl) return proxyUrl;
  }
  return MAIPROP_LOGO_FALLBACK_URL;
}

export function PropertyPopup({ listing, onClose: _onClose }: { listing: MapListing; onClose: () => void }) {
  const raw = listing._raw ?? listing;
  const image = getAuctionImage(listing);
  const isAuction = listing.listingType === "auction";

  const auctionDate = raw.auction_date ? new Date(raw.auction_date) : null;
  const daysLeft = auctionDate
    ? Math.ceil((auctionDate.getTime() - Date.now()) / 86_400_000)
    : null;

  const tags: string[] = raw.tags ?? [];
  const ownershipStatus = getOwnershipStatus(tags);
  const ownershipPct = getOwnershipPct(tags);
  const ownershipBadge = ownershipStatus ? OWNERSHIP_BADGE[ownershipStatus] : null;

  const floor = raw.floor != null ? Number(raw.floor) : null;
  const floorLabel = floor === null ? null
    : floor === -1 ? "Basement"
    : floor === 0 ? "Ground"
    : `${floor}${["st", "nd", "rd"][floor - 1] || "th"} fl.`;

  const detailLink = isAuction
    ? `/auction/${listing.id}`
    : listing.listingType === "open_house"
    ? `/open-house/${listing.id}`
    : `/property/${listing.id}`;

  const pills: { icon: React.ReactNode; text: string }[] = [];
  if (listing.sqm && listing.sqm > 1)
    pills.push({ icon: <Square style={{ width: 10, height: 10 }} />, text: `${listing.sqm} m²` });
  if (floorLabel)
    pills.push({ icon: <Layers style={{ width: 10, height: 10 }} />, text: floorLabel });
  if (raw.year_built)
    pills.push({ icon: <Calendar style={{ width: 10, height: 10 }} />, text: String(raw.year_built) });

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-elevated" style={{ width: 220 }}>
      {/* Image */}
      <div className="relative w-full h-28 overflow-hidden">
        <img
          src={image}
          alt={listing.title}
          loading="lazy"
          className={`w-full h-full ${isMaiPropLogoFallback(image) ? "object-contain p-6 bg-background" : "object-cover"}`}
          onError={e => switchImageToLogoFallback(e.currentTarget)}
        />
        {daysLeft !== null && (
          <div
            className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: daysLeft <= 3 ? "rgba(239,68,68,0.9)" : "rgba(245,197,24,0.9)", color: "#0a0f1a" }}
          >
            {daysLeft === 0 ? "Today!" : daysLeft === 1 ? "Tomorrow" : `${daysLeft}d left`}
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        <p className="font-semibold text-[11px] leading-tight line-clamp-2 text-foreground">
          {listing.title}
        </p>

        {getPropertyTypeLabel(raw) && (
          <span
            className="inline-flex w-fit px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
            style={{ background: "rgba(245,197,24,0.15)", color: "#e5a800", border: "1px solid rgba(245,197,24,0.4)" }}
          >
            {getPropertyTypeLabel(raw)}
          </span>
        )}

        <p style={{ color: typeColour(listing.listingType) }} className="font-bold text-sm">
          €{Number(isAuction && raw.auction_starting_bid ? raw.auction_starting_bid : listing.price).toLocaleString()}
          {isAuction && !!raw.auction_starting_bid && !!raw.price && (
            <span className="text-[10px] font-normal text-muted-foreground ml-1">
              (val. {formatPrice(Number(raw.price))})
            </span>
          )}
        </p>

        {pills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pills.map((p, i) => (
              <span
                key={i}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-muted-foreground"
                style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))" }}
              >
                {p.icon}
                {p.text}
              </span>
            ))}
          </div>
        )}

        {ownershipBadge && (
          <div className="flex items-center gap-1 w-fit">
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
              style={{ background: ownershipBadge.bg, color: ownershipBadge.color, border: `1px solid ${ownershipBadge.color}44` }}
            >
              <Building2 style={{ width: 10, height: 10 }} />
              {ownershipBadge.label}
              {ownershipPct != null && ownershipStatus !== "full" && ` ${ownershipPct}%`}
            </span>
          </div>
        )}

        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin style={{ width: 10, height: 10 }} />
          {listing.city}
        </p>

        <Link
          to={detailLink}
          className="block text-center px-3 py-1.5 rounded-lg text-[11px] font-bold mt-1 transition-opacity hover:opacity-90"
          style={{ background: typeColour(listing.listingType), color: "#0a0f1a" }}
        >
          {isAuction ? "View Auction →" : "View Property →"}
        </Link>
      </div>
    </div>
  );
}
