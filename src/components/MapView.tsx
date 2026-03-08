import { useState, useRef, useCallback } from "react";
import Map, { Marker, Popup, NavigationControl } from "react-map-gl";
import { MapPin, Bed, Bath, Ruler } from "lucide-react";
import { Link } from "react-router-dom";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = "pk.eyJ1IjoibWFpcHJvcCIsImEiOiJkZW1vIn0.placeholder";

type MapListing = {
  id: string;
  title: string;
  price: number;
  sqm: number;
  bedrooms?: number;
  bathrooms?: number;
  latitude?: number | null;
  longitude?: number | null;
  images?: string[];
  listingType?: string;
  city: string;
  _raw?: any;
};

const TYPE_COLOURS: Record<string, string> = {
  sale: "hsl(183 100% 42%)",
  rent: "hsl(265 80% 60%)",
  auction: "hsl(42 95% 55%)",
  firesale: "hsl(0 72% 55%)",
};

function PricePin({
  listing,
  isActive,
  onClick,
}: {
  listing: MapListing;
  isActive: boolean;
  onClick: () => void;
}) {
  const colour = TYPE_COLOURS[listing.listingType || "sale"];
  return (
    <button
      onClick={onClick}
      style={{
        background: isActive ? colour : `${colour}cc`,
        border: isActive ? `2px solid white` : "1px solid rgba(255,255,255,0.4)",
        transform: isActive ? "scale(1.15)" : "scale(1)",
        boxShadow: isActive ? `0 4px 24px ${colour}88` : "0 2px 8px rgba(0,0,0,0.4)",
      }}
      className="rounded-full px-2.5 py-1 text-xs font-bold text-background transition-all hover:scale-110 whitespace-nowrap"
    >
      €{listing.price >= 1_000_000
        ? `${(listing.price / 1_000_000).toFixed(1)}M`
        : listing.price >= 1000
        ? `${(listing.price / 1000).toFixed(0)}k`
        : listing.price}
    </button>
  );
}

function PropertyPopup({ listing, onClose }: { listing: MapListing; onClose: () => void }) {
  const raw = listing._raw ?? listing;
  const image =
    listing.images?.[0] ||
    raw.cover_image_url ||
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=60";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-elevated w-56">
      <img src={image} alt={listing.title} className="w-full h-28 object-cover" />
      <div className="p-3">
        <p className="font-display font-semibold text-xs leading-tight line-clamp-2 text-foreground">
          {listing.title}
        </p>
        <p className="text-primary font-bold text-sm mt-1">
          €{Number(listing.price).toLocaleString()}
        </p>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          {listing.bedrooms != null && (
            <span className="flex items-center gap-0.5">
              <Bed className="w-3 h-3" /> {listing.bedrooms}
            </span>
          )}
          {listing.bathrooms != null && (
            <span className="flex items-center gap-0.5">
              <Bath className="w-3 h-3" /> {listing.bathrooms}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <Ruler className="w-3 h-3" /> {listing.sqm}m²
          </span>
        </div>
        <Link
          to={`/property/${listing.id}`}
          className="mt-2.5 w-full block text-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{ background: "hsl(183 100% 42%)", color: "hsl(220 25% 6%)" }}
        >
          View Property →
        </Link>
      </div>
    </div>
  );
}

export function MapView({ listings }: { listings: MapListing[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Filter to listings with coordinates
  const mapped = listings.filter(
    l => l.latitude != null && l.longitude != null && Number(l.latitude) !== 0 && Number(l.longitude) !== 0
  );

  // Centre on first pin or fallback to Athens
  const initialView = mapped.length > 0
    ? { longitude: Number(mapped[0].longitude), latitude: Number(mapped[0].latitude), zoom: 10 }
    : { longitude: 23.7275, latitude: 37.9838, zoom: 8 };

  const activePin = mapped.find(l => l.id === activeId);

  return (
    <div className="rounded-2xl overflow-hidden border border-border shadow-card" style={{ height: "calc(100vh - 14rem)" }}>
      <Map
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
        initialViewState={initialView}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        onClick={() => setActiveId(null)}
      >
        <NavigationControl position="bottom-right" />

        {mapped.map(listing => (
          <Marker
            key={listing.id}
            longitude={Number(listing.longitude)}
            latitude={Number(listing.latitude)}
            anchor="bottom"
          >
            <PricePin
              listing={listing}
              isActive={listing.id === activeId}
              onClick={() => setActiveId(listing.id)}
            />
          </Marker>
        ))}

        {activePin && activePin.latitude != null && activePin.longitude != null && (
          <Popup
            longitude={Number(activePin.longitude)}
            latitude={Number(activePin.latitude)}
            anchor="top"
            offset={12}
            closeOnClick={false}
            onClose={() => setActiveId(null)}
            className="mapbox-popup-custom"
          >
            <PropertyPopup listing={activePin} onClose={() => setActiveId(null)} />
          </Popup>
        )}
      </Map>

      {mapped.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="glass-card rounded-xl px-6 py-4 text-center">
            <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No listings with location data</p>
          </div>
        </div>
      )}
    </div>
  );
}
