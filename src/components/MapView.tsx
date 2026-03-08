import { useState, useCallback, useRef } from "react";
import Map, {
  Source,
  Layer,
  Popup,
  NavigationControl,
  MapRef,
} from "react-map-gl";
import type { LayerProps } from "react-map-gl";
import type { GeoJSON } from "geojson";
import { MapPin, Bed, Bath, Ruler } from "lucide-react";
import { Link } from "react-router-dom";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/config";

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Colour helpers ────────────────────────────────────────────────────────────

const TYPE_HEX: Record<string, string> = {
  sale: "#00d4c8",
  rent: "#9b6bfc",
  auction: "#f5c518",
  firesale: "#e84040",
};

function typeColour(listingType?: string) {
  return TYPE_HEX[listingType || "sale"];
}

// ── GeoJSON builder ───────────────────────────────────────────────────────────

function buildGeoJSON(listings: MapListing[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: listings.map(l => ({
      type: "Feature",
      properties: {
        id: l.id,
        price: l.price,
        listingType: l.listingType || "sale",
        colour: typeColour(l.listingType),
        label:
          l.price >= 1_000_000
            ? `€${(l.price / 1_000_000).toFixed(1)}M`
            : l.price >= 1000
            ? `€${Math.round(l.price / 1000)}k`
            : `€${l.price}`,
      },
      geometry: {
        type: "Point",
        coordinates: [Number(l.longitude), Number(l.latitude)],
      },
    })),
  };
}

// ── Layer definitions ─────────────────────────────────────────────────────────

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
    "circle-radius": ["step", ["get", "point_count"], 20, 5, 26, 15, 34],
    "circle-opacity": 0.9,
    "circle-stroke-width": 2,
    "circle-stroke-color": "rgba(255,255,255,0.5)",
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
  paint: {
    "text-color": "#0a0f1a",
  },
};

// Individual pins are rendered via HTML markers for custom styling
// but we also keep an invisible symbol layer to track click targets
const unclusteredLayer: LayerProps = {
  id: "unclustered-point",
  type: "circle",
  source: "listings",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-radius": 0,
    "circle-opacity": 0,
  },
};

// ── Property Popup ────────────────────────────────────────────────────────────

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
          className="mt-2.5 w-full block text-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: typeColour(listing.listingType),
            color: "hsl(220 25% 6%)",
          }}
        >
          View Property →
        </Link>
      </div>
    </div>
  );
}

// ── Price-pin overlay (HTML) ──────────────────────────────────────────────────

function PricePins({
  listings,
  activeId,
  onSelect,
}: {
  listings: MapListing[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  // These are rendered via react-map-gl Marker but we need mapbox markers for
  // clustering — we use a separate Marker for each unclustered pin after click.
  // Instead, we render them via a custom layer + click handler (see parent).
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

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
      ? {
          longitude: Number(mapped[0].longitude),
          latitude: Number(mapped[0].latitude),
          zoom: 6,
        }
      : { longitude: 23.7275, latitude: 37.9838, zoom: 6 };

  // ── Click handler ────────────────────────────────────────────────────────────
  const onClick = useCallback(
    (event: any) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      const features = map.queryRenderedFeatures(event.point, {
        layers: ["clusters", "unclustered-point"],
      });

      if (!features.length) {
        setPopupInfo(null);
        return;
      }

      const feature = features[0];

      // Cluster → zoom in
      if (feature.layer.id === "clusters") {
        const clusterId = feature.properties?.cluster_id;
        const source = map.getSource("listings") as any;
        source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
          map.easeTo({ center: coords, zoom: zoom + 0.5, duration: 400 });
        });
        return;
      }

      // Individual pin → show popup
      if (feature.layer.id === "unclustered-point") {
        const id = feature.properties?.id;
        const listing = mapped.find(l => l.id === id);
        if (listing && listing.latitude != null && listing.longitude != null) {
          setPopupInfo({
            listing,
            lng: Number(listing.longitude),
            lat: Number(listing.latitude),
          });
        }
      }
    },
    [mapped]
  );

  // ── Custom HTML price pins rendered on top via a separate symbol approach ────
  // We render them as a symbol layer using a canvas-drawn image added to the map.
  // Simpler: keep using HTML Marker for unclustered pins (they only show when not
  // clustered anyway), driven by a second invisible source query.
  const { Marker } = require("react-map-gl");

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
        interactiveLayerIds={["clusters", "unclustered-point"]}
        onClick={onClick}
        cursor="auto"
      >
        <NavigationControl position="bottom-right" />

        {/* GeoJSON source with clustering enabled */}
        <Source
          id="listings"
          type="geojson"
          data={geoJSON}
          cluster={true}
          clusterMaxZoom={13}
          clusterRadius={50}
        >
          {/* Cluster circles */}
          <Layer {...clusterCircleLayer} />
          {/* Cluster counts */}
          <Layer {...clusterCountLayer} />
          {/* Invisible unclustered points for click hit testing */}
          <Layer {...unclusteredLayer} />
        </Source>

        {/* HTML price-tag markers for unclustered pins */}
        {mapped.map(listing => (
          <Marker
            key={listing.id}
            longitude={Number(listing.longitude)}
            latitude={Number(listing.latitude)}
            anchor="bottom"
            onClick={(e: any) => {
              e.originalEvent.stopPropagation();
              setPopupInfo({
                listing,
                lng: Number(listing.longitude),
                lat: Number(listing.latitude),
              });
            }}
          >
            <button
              style={{
                background:
                  popupInfo?.listing.id === listing.id
                    ? typeColour(listing.listingType)
                    : `${typeColour(listing.listingType)}cc`,
                border:
                  popupInfo?.listing.id === listing.id
                    ? "2px solid white"
                    : "1px solid rgba(255,255,255,0.35)",
                transform:
                  popupInfo?.listing.id === listing.id
                    ? "scale(1.18)"
                    : "scale(1)",
                boxShadow:
                  popupInfo?.listing.id === listing.id
                    ? `0 4px 20px ${typeColour(listing.listingType)}99`
                    : "0 2px 8px rgba(0,0,0,0.45)",
                transition: "all 0.15s ease",
              }}
              className="rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap"
              style2={{ color: "hsl(220 25% 6%)" }}
            >
              <span style={{ color: "hsl(220 25% 6%)" }}>
                {listing.price >= 1_000_000
                  ? `€${(listing.price / 1_000_000).toFixed(1)}M`
                  : listing.price >= 1000
                  ? `€${Math.round(listing.price / 1000)}k`
                  : `€${listing.price}`}
              </span>
            </button>
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
      <div className="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none">
        {Object.entries(TYPE_HEX).map(([type, colour]) => (
          <div
            key={type}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold backdrop-blur-sm"
            style={{ background: `${colour}22`, border: `1px solid ${colour}55`, color: colour }}
          >
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: colour }}
            />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </div>
        ))}
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
