import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Map, {
  Source,
  Layer,
  Popup,
  NavigationControl,
  MapRef,
} from "react-map-gl";
import {
  MapPin, Maximize2, PenLine,
  X, Flame, CheckCircle2,
} from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map.getSource("listings") as any).getClusterExpansionZoom(clusterId, (_err: unknown, zoom: number) => {
        if (_err) return;
        map.easeTo({ center: (clusters[0].geometry as unknown as { coordinates: [number, number] }).coordinates, zoom: zoom + 0.5, duration: 450 });
      });
      return;
    }

    // Price label click → open popup
    const pins = map.queryRenderedFeatures(event.point, { layers: ["price-labels"] });
    if (pins.length) {
      const props = pins[0].properties!;
      const id = props.id;
      const listing = mapped.find(l => l.id === id);
      if (listing) {
        setPopupInfo(p =>
          p?.listing.id === id ? null
            : { listing, lng: Number(listing.longitude), lat: Number(listing.latitude) }
        );
      }
      return;
    }

    setPopupInfo(null);
  }, [closePolygon, mapped]);

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
        interactiveLayerIds={["clusters", "price-labels"]}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMoveEnd={computeVisible}
        onZoomEnd={computeVisible}
        onLoad={computeVisible}
        cursor={drawMode && !polygonClosed ? "crosshair" : undefined}
      >
        <NavigationControl position="bottom-right" />

        {/* Heatmap source */}
        {showHeatmap && (
          <Source id="heatmap-data" type="geojson" data={geoJSON}>
            <Layer {...heatmapLayer} id="price-heatmap" source="heatmap-data" />
          </Source>
        )}

        {/* Main listings source */}
        <Source id="listings" type="geojson" data={geoJSON} cluster clusterMaxZoom={13} clusterRadius={55}>
          <Layer {...clusterCircle} />
          <Layer {...clusterCount} />
          <Layer {...unclusteredHit} />
          <Layer {...priceLabelLayer} />
        </Source>

        {/* Draw sources */}
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

        {/* Popup */}
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
