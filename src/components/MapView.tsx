import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  MapPin, Maximize2, PenLine,
  X, Flame, CheckCircle2,
} from "lucide-react";
import { MAPBOX_TOKEN } from "@/lib/config";
import {
  type MapListing,
  pointInPolygon,
  EMPTY_GJ,
  buildGeoJSON,
  clusterCircle, clusterCount, unclusteredHit, priceLabelLayer,
  heatmapLayer,
  drawLineLyr, drawFillLyr, drawOutlineLyr, drawDotLyr,
} from "@/components/map/mapConfig";
import { PropertyPopup } from "@/components/map/PropertyPopup";

export type { MapListing };

export interface MapViewProps {
  listings: MapListing[];
  onVisibleListingsChange?: (ids: Set<string>) => void;
  onPolygonFilter?: (ids: Set<string> | null) => void;
  height?: string;
}

const VISIBLE_RECALC_THROTTLE_MS = 120;
const HEATMAP_SAMPLE_LIMIT = 1500;

// skipcq: JS-0067 - Pure map helper is intentionally module-scoped.
function sampleListingsForHeatmap(listings: MapListing[], limit = HEATMAP_SAMPLE_LIMIT) {
  if (listings.length <= limit) return listings;
  const step = listings.length / limit;
  return Array.from({ length: limit }, (_unused, index) => listings[Math.floor(index * step)]);
}

// skipcq: JS-0067 - Pure map helper is intentionally module-scoped.
function boundsKey(bounds: { getWest: () => number; getSouth: () => number; getEast: () => number; getNorth: () => number }) {
  return [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ].map((value) => value.toFixed(4)).join(":");
}

// skipcq: JS-0067 - Exported React component is intentionally module-scoped.
// skipcq: JS-R1005 - MapView keeps Mapbox load state, drawing, heatmap, and visibility callbacks together.
export function MapView({ listings, onVisibleListingsChange, onPolygonFilter, height }: MapViewProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [MapComponents, setMapComponents] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  // Lazy load mapbox-gl
  useEffect(() => {
    const loadMap = async () => {
      const mapModule = await import('react-map-gl');
      setMapComponents({
        Map: mapModule.Map,
        Source: mapModule.Source,
        Layer: mapModule.Layer,
        Popup: mapModule.Popup,
        NavigationControl: mapModule.NavigationControl
      });
      // Dynamically import CSS
      await import('mapbox-gl/dist/mapbox-gl.css');
    };
    loadMap();
  }, []);

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

  const listingById = useMemo(() => new Map(mapped.map((listing) => [listing.id, listing])), [mapped]);

  const mapBounds = useMemo(() => {
    if (mapped.length === 0) return null;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const listing of mapped) {
      const lng = Number(listing.longitude);
      const lat = Number(listing.latitude);
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return [[minLng, minLat], [maxLng, maxLat]] as [[number, number], [number, number]];
  }, [mapped]);

  const geoJSON = useMemo(() => buildGeoJSON(mapped), [mapped]);
  const heatmapGeoJSON = useMemo(() => buildGeoJSON(sampleListingsForHeatmap(mapped)), [mapped]);

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
    if (!mapRef.current || !mapBounds) return;
    mapRef.current.fitBounds(
      mapBounds,
      { padding: 60, duration: 600 }
    );
  }, [mapBounds]);

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

  const lastVisibleBoundsKeyRef = useRef<string | null>(null);
  const visibleTimerRef = useRef<number | null>(null);
  const visibleRafRef = useRef<number | null>(null);

  const scheduleComputeVisible = useCallback((force = false) => {
    if (!onVisibleListingsChange) return;
    const map = mapRef.current?.getMap?.();
    const bounds = map?.getBounds?.();
    if (!bounds) return;
    const key = boundsKey(bounds);
    if (!force && key === lastVisibleBoundsKeyRef.current) return;
    lastVisibleBoundsKeyRef.current = key;

    if (visibleTimerRef.current != null) {
      window.clearTimeout(visibleTimerRef.current);
    }
    visibleTimerRef.current = window.setTimeout(() => {
      if (visibleRafRef.current != null) {
        window.cancelAnimationFrame(visibleRafRef.current);
      }
      visibleRafRef.current = window.requestAnimationFrame(() => {
        visibleRafRef.current = null;
        computeVisible();
      });
    }, force ? 0 : VISIBLE_RECALC_THROTTLE_MS);
  }, [computeVisible, onVisibleListingsChange]);

  useEffect(() => () => {
    if (visibleTimerRef.current != null) window.clearTimeout(visibleTimerRef.current);
    if (visibleRafRef.current != null) window.cancelAnimationFrame(visibleRafRef.current);
  }, []);

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onClick = useCallback((event: any) => {
    const { drawMode, polygonClosed, drawnPoints } = stateRef.current;

    if (drawMode && !polygonClosed) {
      const clickPoint: [number, number] = [event.lngLat.lng, event.lngLat.lat];

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

    // Cluster click → expand
    const clusters = map.queryRenderedFeatures(event.point, { layers: ["clusters"] });
    if (clusters.length) {
      const clusterId = clusters[0].properties?.cluster_id;
      (map.getSource("listings") as { getClusterExpansionZoom: (id: number, callback: (err: unknown, zoom: number) => void) => void }).getClusterExpansionZoom(clusterId, (_err: unknown, zoom: number) => {
        if (_err) return;
        map.easeTo({ center: (clusters[0].geometry as unknown as { coordinates: [number, number] }).coordinates, zoom: zoom + 0.5, duration: 450 });
      });
      return;
    }

    // Price label click → open popup
    const pins = map.queryRenderedFeatures(event.point, { layers: ["price-labels"] });
    if (pins.length) {
      const props = pins[0].properties;
      if (!props?.id) return;
      const id = props.id;
      const listing = listingById.get(id);
      if (listing) {
        setPopupInfo(p =>
          p?.listing.id === id ? null
            : { listing, lng: Number(listing.longitude), lat: Number(listing.latitude) }
        );
      }
      return;
    }

    setPopupInfo(null);
  }, [closePolygon, listingById]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onMouseMove = useCallback((e: any) => {
    const { drawMode, polygonClosed } = stateRef.current;
    if (drawMode && !polygonClosed)
      setHoverPoint([e.lngLat.lng, e.lngLat.lat]);
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className="rounded-2xl overflow-hidden border border-border shadow-card relative flex items-center justify-center bg-secondary"
        style={{ height: height ?? "calc(100vh - 14rem)" }}
      >
        <div className="text-center p-6">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Map requires VITE_MAPBOX_TOKEN to be configured.</p>
          <a href="https://www.google.com/maps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm mt-2 inline-block">
            Open Google Maps →
          </a>
        </div>
      </div>
    );
  }

  if (!MapComponents) {
    return (
      <div
        className="rounded-2xl overflow-hidden border border-border shadow-card relative flex items-center justify-center bg-secondary"
        style={{ height: height ?? "calc(100vh - 14rem)" }}
      >
        <div className="text-center p-6">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden border border-border shadow-card relative"
      style={{ height: height ?? "calc(100vh - 14rem)" }}
    >
      <MapComponents.Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: 23.7275, latitude: 38.5, zoom: 6 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        interactiveLayerIds={["clusters", "price-labels"]}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMoveEnd={() => scheduleComputeVisible()}
        onZoomEnd={() => scheduleComputeVisible()}
        onLoad={() => scheduleComputeVisible(true)}
        cursor={drawMode && !polygonClosed ? "crosshair" : undefined}
      >
        <MapComponents.NavigationControl position="bottom-right" />

        {/* Heatmap source */}
        {showHeatmap && (
          <MapComponents.Source id="heatmap-data" type="geojson" data={heatmapGeoJSON}>
            <MapComponents.Layer {...heatmapLayer} id="price-heatmap" source="heatmap-data" />
          </MapComponents.Source>
        )}

        {/* Main listings source */}
        <MapComponents.Source id="listings" type="geojson" data={geoJSON} cluster clusterMaxZoom={13} clusterRadius={55}>
          <MapComponents.Layer {...clusterCircle} />
          <MapComponents.Layer {...clusterCount} />
          <MapComponents.Layer {...unclusteredHit} />
          <MapComponents.Layer {...priceLabelLayer} />
        </MapComponents.Source>

        {/* Draw sources */}
        <MapComponents.Source id="draw-poly" type="geojson" data={drawPolyGJ}>
          <MapComponents.Layer {...drawFillLyr} />
          <MapComponents.Layer {...drawOutlineLyr} />
        </MapComponents.Source>
        <MapComponents.Source id="draw-line" type="geojson" data={drawLineGJ}>
          <MapComponents.Layer {...drawLineLyr} />
        </MapComponents.Source>
        <MapComponents.Source id="draw-dots" type="geojson" data={drawDotsGJ}>
          <MapComponents.Layer {...drawDotLyr} />
        </MapComponents.Source>

        {/* Popup */}
        {popupInfo && (
          <MapComponents.Popup
            longitude={popupInfo.lng}
            latitude={popupInfo.lat}
            anchor="top"
            offset={14}
            closeOnClick={false}
            onClose={() => setPopupInfo(null)}
          >
            <PropertyPopup listing={popupInfo.listing} onClose={() => setPopupInfo(null)} />
          </MapComponents.Popup>
        )}
      </MapComponents.Map>

      {/* ── Toolbar (top right) ── */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 flex-wrap justify-end">
        <button
          onClick={() => setShowHeatmap(v => !v)}
          title="Toggle price heatmap"
          aria-label="Toggle price heatmap"
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl backdrop-blur-sm text-xs font-medium transition-all shadow-sm border ${
            showHeatmap
              ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
              : "bg-card/90 border-border text-foreground hover:border-primary/50"
          }`}
        >
          <Flame className="w-3.5 h-3.5" /> Heatmap
        </button>

        {!polygonClosed && (
          <button
            onClick={() => drawMode
              ? (setDrawMode(false), setDrawnPoints([]), setHoverPoint(null))
              : setDrawMode(true)
            }
            aria-label={drawMode ? "Cancel drawing" : "Draw area filter"}
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

        {drawMode && !polygonClosed && drawnPoints.length >= 3 && (
          <button
            onClick={() => closePolygon(drawnPoints)}
            aria-label="Finish polygon"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium shadow-sm"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Finish
          </button>
        )}

        {polygonClosed && (
          <button
            onClick={clearPolygon}
            aria-label="Clear area filter"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-destructive/20 border border-destructive/40 text-destructive text-xs font-medium backdrop-blur-sm shadow-sm"
          >
            <X className="w-3.5 h-3.5" /> Clear area
          </button>
        )}

        <button
          onClick={fitBounds}
          title="Fit all pins"
          aria-label="Fit all pins"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-card/90 border border-border backdrop-blur-sm text-xs font-medium text-foreground hover:border-primary/50 transition-all shadow-sm"
        >
          <Maximize2 className="w-3.5 h-3.5" /> Fit all
        </button>
      </div>

      {/* Draw hint */}
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

      {/* Polygon match count */}
      {polygonClosed && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 pointer-events-none whitespace-nowrap">
          <p className="text-xs bg-primary/15 backdrop-blur-sm rounded-xl px-3 py-2 border border-primary/35 text-primary font-semibold shadow-sm">
            {polygonMatchCount} {polygonMatchCount === 1 ? "property" : "properties"} in area
          </p>
        </div>
      )}

      {/* Heatmap legend */}
      {showHeatmap && (
        <div className="absolute bottom-14 left-3 z-10 pointer-events-none">
          <div className="bg-card/90 backdrop-blur-sm rounded-xl p-2.5 border border-border shadow-sm">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Price / m²</p>
            <div className="flex items-center gap-1.5">
              <div className="w-24 h-3 rounded-full"
                style={{ background: "linear-gradient(to right, rgba(0,128,255,0.8), rgba(0,220,150,0.9), rgba(255,220,0,0.9), rgba(255,100,0,1), rgba(255,30,30,1))" }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-0.5 w-24">
              <span>Low</span><span>High</span>
            </div>
          </div>
        </div>
      )}

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
