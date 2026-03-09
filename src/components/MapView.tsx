import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Map, {
  Source,
  Layer,
  Popup,
  NavigationControl,
  MapRef,
} from "react-map-gl";
import type { LayerProps } from "react-map-gl";
import {
  MapPin, Bed, Bath, Ruler, Maximize2, PenLine,
  X, Flame, CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MapListing = {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_HEX: Record<string, string> = {
  sale: "#00d4c8",
  rent: "#9b6bfc",
  auction: "#f5c518",
  firesale: "#e84040",
};

function typeColour(t?: string) { return TYPE_HEX[t || "sale"]; }

function priceLabel(p: number) {
  if (p >= 1_000_000) return `€${(p / 1_000_000).toFixed(1)}M`;
  if (p >= 1000) return `€${Math.round(p / 1000)}k`;
  return `€${p}`;
}

/** Ray-casting point-in-polygon (lng/lat coords) */
function pointInPolygon(point: [number, number], ring: [number, number][]) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

const EMPTY_GJ = { type: "FeatureCollection" as const, features: [] };

// ── GeoJSON builder ───────────────────────────────────────────────────────────

function buildGeoJSON(listings: MapListing[]) {
  return {
    type: "FeatureCollection" as const,
    features: listings.map(l => ({
      type: "Feature" as const,
      properties: {
        id: l.id,
        price: l.price,
        price_per_sqm: l._raw?.price_per_sqm
          ? Number(l._raw.price_per_sqm)
          : Math.round(l.price / Math.max(l.sqm, 1)),
        listingType: l.listingType || "sale",
        colour: typeColour(l.listingType),
        label: priceLabel(l.price),
        // Store full data for popup lookup by id
        title: l.title,
        sqm: l.sqm,
        bedrooms: l.bedrooms ?? null,
        bathrooms: l.bathrooms ?? null,
        images: JSON.stringify(l.images ?? []),
        city: l.city,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [Number(l.longitude), Number(l.latitude)],
      },
    })),
  };
}

// ── Layer defs ────────────────────────────────────────────────────────────────

const clusterCircle: LayerProps = {
  id: "clusters",
  type: "circle",
  source: "listings",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": ["step", ["get", "point_count"], "#00d4c8", 5, "#9b6bfc", 15, "#e84040"],
    "circle-radius": ["step", ["get", "point_count"], 22, 5, 28, 15, 36],
    "circle-opacity": 0.88,
    "circle-stroke-width": 2,
    "circle-stroke-color": "rgba(255,255,255,0.45)",
  },
};

const clusterCount: LayerProps = {
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

const unclusteredHit: LayerProps = {
  id: "unclustered-point",
  type: "circle",
  source: "listings",
  filter: ["!", ["has", "point_count"]],
  paint: { "circle-radius": 0, "circle-opacity": 0 },
};

const heatmapLayer: LayerProps = {
  id: "price-heatmap",
  type: "heatmap",
  source: "listings",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "heatmap-weight": [
      "interpolate", ["linear"], ["get", "price_per_sqm"],
      500, 0, 8000, 1,
    ],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 15, 3],
    "heatmap-color": [
      "interpolate", ["linear"], ["heatmap-density"],
      0, "rgba(0,0,0,0)",
      0.15, "rgba(0,128,255,0.6)",
      0.35, "rgba(0,220,150,0.75)",
      0.55, "rgba(255,220,0,0.85)",
      0.75, "rgba(255,100,0,0.9)",
      1.0, "rgba(255,30,30,1)",
    ],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 25, 12, 55],
    "heatmap-opacity": 0.72,
  },
};

// Draw layers
const drawLineLyr: LayerProps = {
  id: "draw-line",
  type: "line",
  source: "draw-line",
  paint: {
    "line-color": "#00d4c8",
    "line-width": 2,
    "line-dasharray": [3, 2],
  },
};

const drawFillLyr: LayerProps = {
  id: "draw-fill",
  type: "fill",
  source: "draw-poly",
  paint: { "fill-color": "#00d4c8", "fill-opacity": 0.12 },
};

const drawOutlineLyr: LayerProps = {
  id: "draw-outline",
  type: "line",
  source: "draw-poly",
  paint: { "line-color": "#00d4c8", "line-width": 2 },
};

const drawDotLyr: LayerProps = {
  id: "draw-dots",
  type: "circle",
  source: "draw-dots",
  paint: {
    "circle-radius": ["case", ["get", "isFirst"], 8, 5],
    "circle-color": ["case", ["get", "isFirst"], "#fff", "#00d4c8"],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#00d4c8",
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

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
        <p className="text-primary font-bold text-sm mt-1">€{Number(listing.price).toLocaleString()}</p>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          {listing.bedrooms != null && <span className="flex items-center gap-0.5"><Bed className="w-3 h-3" />{listing.bedrooms}</span>}
          {listing.bathrooms != null && <span className="flex items-center gap-0.5"><Bath className="w-3 h-3" />{listing.bathrooms}</span>}
          <span className="flex items-center gap-0.5"><Ruler className="w-3 h-3" />{listing.sqm}m²</span>
        </div>
        <Link
          to={`/property/${listing.id}`}
          className="mt-2.5 w-full block text-center px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: typeColour(listing.listingType), color: "#0a0f1a" }}
        >
          View Property →
        </Link>
      </div>
    </div>
  );
}

function PricePin({
  listing, isActive, onClick,
}: { listing: MapListing; isActive: boolean; onClick: (e: React.MouseEvent) => void }) {
  const c = typeColour(listing.listingType);
  return (
    <button
      onClick={onClick}
      style={{
        background: isActive ? c : `${c}cc`,
        border: isActive ? "2px solid white" : "1px solid rgba(255,255,255,0.35)",
        transform: isActive ? "scale(1.18)" : "scale(1)",
        boxShadow: isActive ? `0 4px 20px ${c}99` : "0 2px 8px rgba(0,0,0,0.45)",
        transition: "all 0.15s ease",
        color: "#0a0f1a",
      }}
      className="rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap"
    >
      {priceLabel(listing.price)}
    </button>
  );
}

// ── MapView ───────────────────────────────────────────────────────────────────

export interface MapViewProps {
  listings: MapListing[];
  onVisibleListingsChange?: (ids: Set<string>) => void;
  onPolygonFilter?: (ids: Set<string> | null) => void;
  height?: string;
}

export function MapView({ listings, onVisibleListingsChange, onPolygonFilter, height }: MapViewProps) {
  const mapRef = useRef<MapRef>(null);

  // Popup
  const [popupInfo, setPopupInfo] = useState<{ listing: MapListing; lng: number; lat: number } | null>(null);

  // Draw state
  const [drawMode, setDrawMode] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([]);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const [polygonClosed, setPolygonClosed] = useState(false);

  // Heatmap state
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Use a ref for stable access in callbacks
  const stateRef = useRef({ drawMode, polygonClosed, drawnPoints });
  useEffect(() => { stateRef.current = { drawMode, polygonClosed, drawnPoints }; });

  const mapped = useMemo(() => listings.filter(
    l => l.latitude != null && l.longitude != null &&
      Number(l.latitude) !== 0 && Number(l.longitude) !== 0
  ), [listings]);

  const geoJSON = useMemo(() => buildGeoJSON(mapped), [mapped]);

  // Draw GeoJSON (reactive)
  const drawLineGJ = useMemo(() => {
    if (drawnPoints.length === 0) return EMPTY_GJ;
    const coords: [number, number][] = [...drawnPoints];
    if (hoverPoint && !polygonClosed) coords.push(hoverPoint);
    if (polygonClosed && drawnPoints.length > 0) coords.push(drawnPoints[0]);
    return {
      type: "FeatureCollection" as const,
      features: [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: coords }, properties: {} }],
    };
  }, [drawnPoints, hoverPoint, polygonClosed]);

  const drawPolyGJ = useMemo(() => {
    if (!polygonClosed || drawnPoints.length < 3) return EMPTY_GJ;
    return {
      type: "FeatureCollection" as const,
      features: [{
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [[...drawnPoints, drawnPoints[0]]] },
        properties: {},
      }],
    };
  }, [drawnPoints, polygonClosed]);

  const drawDotsGJ = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: drawnPoints.map((p, i) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: p },
      properties: { isFirst: i === 0 },
    })),
  }), [drawnPoints]);

  // Polygon match count
  const polygonMatchCount = useMemo(() => {
    if (!polygonClosed || drawnPoints.length < 3) return 0;
    return mapped.filter(l =>
      l.longitude != null && l.latitude != null &&
      pointInPolygon([Number(l.longitude), Number(l.latitude)], drawnPoints)
    ).length;
  }, [polygonClosed, drawnPoints, mapped]);

  // ── Fit bounds ──────────────────────────────────────────────────────────────
  const fitBounds = useCallback(() => {
    if (!mapRef.current || mapped.length === 0) return;
    const lngs = mapped.map(l => Number(l.longitude));
    const lats = mapped.map(l => Number(l.latitude));
    mapRef.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, duration: 600 }
    );
  }, [mapped]);

  useEffect(() => { const t = setTimeout(fitBounds, 300); return () => clearTimeout(t); }, [fitBounds]);

  // ── Compute visible listings ─────────────────────────────────────────────
  const computeVisible = useCallback(() => {
    if (!onVisibleListingsChange) return;
    const bounds = mapRef.current?.getMap()?.getBounds();
    if (!bounds) return;
    const ids = new Set<string>();
    for (const l of mapped) {
      if (bounds.contains([Number(l.longitude), Number(l.latitude)])) ids.add(l.id);
    }
    onVisibleListingsChange(ids);
  }, [mapped, onVisibleListingsChange]);

  // ── Close polygon ────────────────────────────────────────────────────────
  const closePolygon = useCallback((points: [number, number][]) => {
    if (points.length < 3) return;
    setPolygonClosed(true);
    setDrawMode(false);
    setHoverPoint(null);
    if (!onPolygonFilter) return;
    const ids = new Set<string>();
    for (const l of mapped) {
      if (l.longitude != null && l.latitude != null &&
        pointInPolygon([Number(l.longitude), Number(l.latitude)], points))
        ids.add(l.id);
    }
    onPolygonFilter(ids);
  }, [mapped, onPolygonFilter]);

  // ── Clear polygon ────────────────────────────────────────────────────────
  const clearPolygon = useCallback(() => {
    setDrawnPoints([]);
    setPolygonClosed(false);
    setDrawMode(false);
    setHoverPoint(null);
    onPolygonFilter?.(null);
  }, [onPolygonFilter]);

  // ── Click handler ────────────────────────────────────────────────────────
  const onClick = useCallback((event: any) => {
    const { drawMode, polygonClosed, drawnPoints } = stateRef.current;

    if (drawMode && !polygonClosed) {
      const clickPoint: [number, number] = [event.lngLat.lng, event.lngLat.lat];

      // Click near first vertex → close polygon
      if (drawnPoints.length >= 3) {
        const map = mapRef.current?.getMap();
        if (map) {
          const firstScreen = map.project(drawnPoints[0]);
          const d = Math.hypot(firstScreen.x - event.point.x, firstScreen.y - event.point.y);
          if (d < 22) { closePolygon(drawnPoints); return; }
        }
      }
      setDrawnPoints(prev => [...prev, clickPoint]);
      return;
    }

    const map = mapRef.current?.getMap();
    if (!map) return;
    const clusters = map.queryRenderedFeatures(event.point, { layers: ["clusters"] });
    if (clusters.length) {
      const clusterId = clusters[0].properties?.cluster_id;
      (map.getSource("listings") as any).getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
        if (err) return;
        map.easeTo({ center: (clusters[0].geometry as any).coordinates, zoom: zoom + 0.5, duration: 450 });
      });
      return;
    }
    if (!map.queryRenderedFeatures(event.point, { layers: ["unclustered-point"] }).length)
      setPopupInfo(null);
  }, [closePolygon]);

  const onMouseMove = useCallback((e: any) => {
    const { drawMode, polygonClosed } = stateRef.current;
    if (drawMode && !polygonClosed)
      setHoverPoint([e.lngLat.lng, e.lngLat.lat]);
  }, []);

  const getCursor = useCallback(({ isDragging }: { isDragging: boolean; isHovering: boolean }) => {
    const { drawMode, polygonClosed } = stateRef.current;
    if (drawMode && !polygonClosed) return "crosshair";
    return isDragging ? "grabbing" : "grab";
  }, []);

  return (
    <div
      className="rounded-2xl overflow-hidden border border-border shadow-card relative"
      style={{ height: height ?? "calc(100vh - 14rem)" }}
    >
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: 23.7275, latitude: 38.5, zoom: 6 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        interactiveLayerIds={["clusters"]}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMoveEnd={computeVisible}
        onZoomEnd={computeVisible}
        onLoad={computeVisible}
        cursor={drawMode && !polygonClosed ? "crosshair" : undefined}
      >
        <NavigationControl position="bottom-right" />

        {/* ── Main listings source ── */}
        <Source id="listings" type="geojson" data={geoJSON} cluster clusterMaxZoom={13} clusterRadius={55}>
          {showHeatmap && <Layer {...heatmapLayer} />}
          <Layer {...clusterCircle} />
          <Layer {...clusterCount} />
          <Layer {...unclusteredHit} />
        </Source>

        {/* ── Draw sources ── */}
        <Source id="draw-poly" type="geojson" data={drawPolyGJ}>
          <Layer {...drawFillLyr} />
          <Layer {...drawOutlineLyr} />
        </Source>
        <Source id="draw-line" type="geojson" data={drawLineGJ}>
          <Layer {...drawLineLyr} />
        </Source>
        <Source id="draw-dots" type="geojson" data={drawDotsGJ}>
          <Layer {...drawDotLyr} />
        </Source>

        {/* ── HTML price markers ── */}
        {mapped.map(listing => (
          <Marker
            key={listing.id}
            longitude={Number(listing.longitude)}
            latitude={Number(listing.latitude)}
            anchor="bottom"
            onClick={(e: any) => {
              e.originalEvent?.stopPropagation();
              if (stateRef.current.drawMode) return;
              setPopupInfo(p =>
                p?.listing.id === listing.id ? null
                  : { listing, lng: Number(listing.longitude), lat: Number(listing.latitude) }
              );
            }}
          >
            <PricePin
              listing={listing}
              isActive={popupInfo?.listing.id === listing.id}
              onClick={(e) => {
                e.stopPropagation();
                if (stateRef.current.drawMode) return;
                setPopupInfo(p =>
                  p?.listing.id === listing.id ? null
                    : { listing, lng: Number(listing.longitude), lat: Number(listing.latitude) }
                );
              }}
            />
          </Marker>
        ))}

        {/* ── Popup ── */}
        {popupInfo && (
          <Popup
            longitude={popupInfo.lng}
            latitude={popupInfo.lat}
            anchor="top"
            offset={14}
            closeOnClick={false}
            onClose={() => setPopupInfo(null)}
          >
            <PropertyPopup listing={popupInfo.listing} onClose={() => setPopupInfo(null)} />
          </Popup>
        )}
      </Map>

      {/* ── Toolbar (top right) ── */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 flex-wrap justify-end">
        {/* Heatmap toggle */}
        <button
          onClick={() => setShowHeatmap(v => !v)}
          title="Toggle price heatmap"
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl backdrop-blur-sm text-xs font-medium transition-all shadow-sm border ${
            showHeatmap
              ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
              : "bg-card/90 border-border text-foreground hover:border-primary/50"
          }`}
        >
          <Flame className="w-3.5 h-3.5" /> Heatmap
        </button>

        {/* Draw area */}
        {!polygonClosed && (
          <button
            onClick={() => drawMode
              ? (setDrawMode(false), setDrawnPoints([]), setHoverPoint(null))
              : setDrawMode(true)
            }
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl backdrop-blur-sm text-xs font-medium transition-all shadow-sm border ${
              drawMode
                ? "bg-primary/20 border-primary text-primary"
                : "bg-card/90 border-border text-foreground hover:border-primary/50"
            }`}
          >
            <PenLine className="w-3.5 h-3.5" />
            {drawMode ? "Drawing…" : "Draw area"}
          </button>
        )}

        {/* Finish polygon */}
        {drawMode && !polygonClosed && drawnPoints.length >= 3 && (
          <button
            onClick={() => closePolygon(drawnPoints)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium shadow-sm"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Finish
          </button>
        )}

        {/* Clear polygon */}
        {polygonClosed && (
          <button
            onClick={clearPolygon}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-destructive/20 border border-destructive/40 text-destructive text-xs font-medium backdrop-blur-sm shadow-sm"
          >
            <X className="w-3.5 h-3.5" /> Clear area
          </button>
        )}

        {/* Fit all */}
        <button
          onClick={fitBounds}
          title="Fit all pins"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-card/90 border border-border backdrop-blur-sm text-xs font-medium text-foreground hover:border-primary/50 transition-all shadow-sm"
        >
          <Maximize2 className="w-3.5 h-3.5" /> Fit all
        </button>
      </div>

      {/* ── Draw hint ── */}
      {drawMode && !polygonClosed && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 pointer-events-none whitespace-nowrap">
          <p className="text-xs bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 border border-primary/30 text-primary font-medium shadow-sm">
            {drawnPoints.length === 0
              ? "Click map to start drawing"
              : drawnPoints.length < 3
              ? `${drawnPoints.length} point${drawnPoints.length > 1 ? "s" : ""} — keep clicking`
              : "Click near start ● to close, or press Finish"}
          </p>
        </div>
      )}

      {/* ── Polygon match count ── */}
      {polygonClosed && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 pointer-events-none whitespace-nowrap">
          <p className="text-xs bg-primary/15 backdrop-blur-sm rounded-xl px-3 py-2 border border-primary/35 text-primary font-semibold shadow-sm">
            {polygonMatchCount} {polygonMatchCount === 1 ? "property" : "properties"} in area
          </p>
        </div>
      )}

      {/* ── Heatmap legend ── */}
      {showHeatmap && (
        <div className="absolute bottom-14 left-3 z-10 pointer-events-none">
          <div className="bg-card/90 backdrop-blur-sm rounded-xl p-2.5 border border-border shadow-sm">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Price / m²</p>
            <div className="flex items-center gap-1.5">
              <div className="w-24 h-3 rounded-full"
                style={{ background: "linear-gradient(to right, rgba(0,128,255,0.8), rgba(0,220,150,0.9), rgba(255,220,0,0.9), rgba(255,100,0,1), rgba(255,30,30,1))" }} />
              <div className="flex justify-between w-24 absolute ml-0">
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-0.5 w-24">
              <span>Low</span><span>High</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Type legend ── */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
        {Object.entries(TYPE_HEX).map(([type, colour]) => (
          <div
            key={type}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-md"
            style={{ background: `${colour}18`, border: `1px solid ${colour}44`, color: colour }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colour }} />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </div>
        ))}
      </div>

      {/* ── Cluster hint ── */}
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
