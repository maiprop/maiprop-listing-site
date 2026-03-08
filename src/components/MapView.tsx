import { useState, useCallback, useRef } from "react";
import Map, {
  Source,
  Layer,
  Popup,
  NavigationControl,
  Marker,
  MapRef,
} from "react-map-gl";
import type { LayerProps } from "react-map-gl";
import { MapPin, Bed, Bath, Ruler } from "lucide-react";
import { Link } from "react-router-dom";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Colours ───────────────────────────────────────────────────────────────────

const TYPE_HEX: Record<string, string> = {
  sale: "#00d4c8",
  rent: "#9b6bfc",
  auction: "#f5c518",
  firesale: "#e84040",
};

function typeColour(listingType?: string) {
  return TYPE_HEX[listingType || "sale"];
}

function priceLabel(price: number) {
  if (price >= 1_000_000) return `€${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1000) return `€${Math.round(price / 1000)}k`;
  return `€${price}`;
}

// ── GeoJSON builder ───────────────────────────────────────────────────────────

function buildGeoJSON(listings: MapListing[]) {
  return {
    type: "FeatureCollection" as const,
    features: listings.map(l => ({
      type: "Feature" as const,
      properties: {
        id: l.id,
        price: l.price,
        listingType: l.listingType || "sale",
        colour: typeColour(l.listingType),
        label: priceLabel(l.price),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [Number(l.longitude), Number(l.latitude)],
      },
    })),
  };
}

// ── Cluster layers ────────────────────────────────────────────────────────────

const clusterCircleLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  source: "listings",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#00d4c8",
      5,  "#9b6bfc",
      15, "#e84040",
    ],
    "circle-radius": ["step", ["get", "point_count"], 22, 5, 28, 15, 36],
    "circle-opacity": 0.88,
    "circle-stroke-width": 2,
    "circle-stroke-color": "rgba(255,255,255,0.45)",
  },
};

const clusterCountLayer: LayerProps = {
  id: "cluster-count",
  type: "symbol",
  source: "listings",
  filter: ["has", "point_count"],
  layout: {
    "text-field": "{point_count_abbreviated}",
    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 13,
  },
  paint: { "text-color": "#0a0f1a" },
};

// Invisible hit-test layer for unclustered points
const unclusteredLayer: LayerProps = {
  id: "unclustered-point",
  type: "circle",
  source: "listings",
  filter: ["!", ["has", "point_count"]],
  paint: { "circle-radius": 0, "circle-opacity": 0 },
};

// ── Popup card ────────────────────────────────────────────────────────────────

function PropertyPopup({
  listing,
  onClose,
}: {
  listing: MapListing;
  onClose: () => void;
}) {
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
          className="mt-2.5 w-full block text-center px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{
            background: typeColour(listing.listingType),
            color: "#0a0f1a",
          }}
        >
          View Property →
        </Link>
      </div>
    </div>
  );
}

// ── Price-tag pin button ──────────────────────────────────────────────────────

function PricePin({
  listing,
  isActive,
  onClick,
}: {
  listing: MapListing;
  isActive: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const colour = typeColour(listing.listingType);
  return (
    <button
      onClick={onClick}
      style={{
        background: isActive ? colour : `${colour}cc`,
        border: isActive ? "2px solid white" : "1px solid rgba(255,255,255,0.35)",
        transform: isActive ? "scale(1.18)" : "scale(1)",
        boxShadow: isActive
          ? `0 4px 20px ${colour}99`
          : "0 2px 8px rgba(0,0,0,0.45)",
        transition: "all 0.15s ease",
        color: "#0a0f1a",
      }}
      className="rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap"
    >
      {priceLabel(listing.price)}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function MapView({ listings }: { listings: MapListing[] }) {
  const mapRef = useRef<MapRef>(null);
  const [popupInfo, setPopupInfo] = useState<{
    listing: MapListing;
    lng: number;
    lat: number;
  } | null>(null);

  const mapped = listings.filter(
    l =>
      l.latitude != null &&
      l.longitude != null &&
      Number(l.latitude) !== 0 &&
      Number(l.longitude) !== 0
  );

  const geoJSON = buildGeoJSON(mapped);

  const initialView =
    mapped.length > 0
      ? { longitude: 23.7275, latitude: 38.5, zoom: 6 }
      : { longitude: 23.7275, latitude: 37.9838, zoom: 6 };

  // Click: expand clusters or open popup
  const onClick = useCallback(
    (event: any) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      const features = map.queryRenderedFeatures(event.point, {
        layers: ["clusters"],
      });

      if (features.length) {
        const clusterId = features[0].properties?.cluster_id;
        const source = map.getSource("listings") as any;
        source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          const coords = (features[0].geometry as any).coordinates as [number, number];
          map.easeTo({ center: coords, zoom: zoom + 0.5, duration: 450 });
        });
        return;
      }

      // Click on blank map area → close popup
      const pinHit = map.queryRenderedFeatures(event.point, {
        layers: ["unclustered-point"],
      });
      if (!pinHit.length) setPopupInfo(null);
    },
    []
  );

  return (
    <div
      className="rounded-2xl overflow-hidden border border-border shadow-card relative"
      style={{ height: "calc(100vh - 14rem)" }}
    >
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialView}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        interactiveLayerIds={["clusters"]}
        onClick={onClick}
      >
        <NavigationControl position="bottom-right" />

        {/* Clustered GeoJSON source */}
        <Source
          id="listings"
          type="geojson"
          data={geoJSON}
          cluster={true}
          clusterMaxZoom={13}
          clusterRadius={55}
        >
          <Layer {...clusterCircleLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredLayer} />
        </Source>

        {/* HTML price-tag markers (only visible when unclustered) */}
        {mapped.map(listing => (
          <Marker
            key={listing.id}
            longitude={Number(listing.longitude)}
            latitude={Number(listing.latitude)}
            anchor="bottom"
            onClick={(e: any) => {
              e.originalEvent?.stopPropagation();
              setPopupInfo(
                popupInfo?.listing.id === listing.id
                  ? null
                  : {
                      listing,
                      lng: Number(listing.longitude),
                      lat: Number(listing.latitude),
                    }
              );
            }}
          >
            <PricePin
              listing={listing}
              isActive={popupInfo?.listing.id === listing.id}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setPopupInfo(
                  popupInfo?.listing.id === listing.id
                    ? null
                    : {
                        listing,
                        lng: Number(listing.longitude),
                        lat: Number(listing.latitude),
                      }
                );
              }}
            />
          </Marker>
        ))}

        {/* Popup */}
        {popupInfo && (
          <Popup
            longitude={popupInfo.lng}
            latitude={popupInfo.lat}
            anchor="top"
            offset={14}
            closeOnClick={false}
            onClose={() => setPopupInfo(null)}
            className="mapbox-popup-custom"
          >
            <PropertyPopup
              listing={popupInfo.listing}
              onClose={() => setPopupInfo(null)}
            />
          </Popup>
        )}
      </Map>

      {/* Legend */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
        {Object.entries(TYPE_HEX).map(([type, colour]) => (
          <div
            key={type}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-md"
            style={{
              background: `${colour}18`,
              border: `1px solid ${colour}44`,
              color: colour,
            }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: colour }}
            />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </div>
        ))}
      </div>

      {/* Cluster hint */}
      <div className="absolute bottom-12 left-3 pointer-events-none">
        <p className="text-xs text-muted-foreground bg-card/80 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-border">
          Zoom in to expand clusters
        </p>
      </div>

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
