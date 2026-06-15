/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useCallback, useEffect } from "react";
import type { ComponentType } from "react";
import {
  computeWalkScore,
  walkScoreLabel,
  walkScoreColour,
} from "@/lib/walkScore";
import type { MapRef } from "react-map-gl";
import {
  MapPin,
  ExternalLink,
  School,
  Bus,
  Coffee,
  Hospital,
  ShoppingBag,
  TreePine,
  Loader2,
  Zap,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAPBOX_TOKEN } from "@/lib/config";
import { getAiErrorMessage, isAiMonthlyLimitError } from "@/lib/aiErrorUtils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SignInForAI } from "@/components/SignInForAI";
import { AIQuotaStatus } from "@/components/AIQuotaStatus";
import { isAiQuotaReached, useAiQuota } from "@/hooks/useAiQuota";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface POI {
  name: string;
  category: "school" | "transit" | "cafe" | "hospital" | "shopping" | "park";
  distanceKm: number;
  walkMinutes: number;
  description?: string;
  isFallbackEstimate?: boolean;
}

type PoiResponse = {
  pois: POI[];
  generatedBy?: "ai" | "fallback";
  warning?: string;
};

const CATEGORY_META: Record<
  POI["category"],
  {
    icon: React.ComponentType<any>;
    label: string;
    colour: string;
    markerColour: string;
  }
> = {
  school: {
    icon: School,
    label: "Schools",
    colour: "text-blue-400",
    markerColour: "#60a5fa",
  },
  transit: {
    icon: Bus,
    label: "Transit",
    colour: "text-emerald-400",
    markerColour: "#34d399",
  },
  cafe: {
    icon: Coffee,
    label: "Cafés",
    colour: "text-amber-400",
    markerColour: "#fbbf24",
  },
  hospital: {
    icon: Hospital,
    label: "Medical",
    colour: "text-red-400",
    markerColour: "#f87171",
  },
  shopping: {
    icon: ShoppingBag,
    label: "Shopping",
    colour: "text-purple-400",
    markerColour: "#c084fc",
  },
  park: {
    icon: TreePine,
    label: "Parks",
    colour: "text-green-400",
    markerColour: "#4ade80",
  },
};

const getPoiKey = (poi: POI): string =>
  `${poi.category}-${poi.name}-${poi.distanceKm}-${poi.walkMinutes}`;

const isMapNearViewport = (el: Element): boolean => {
  const rect = el.getBoundingClientRect();
  const viewportH = window.innerHeight || document.documentElement.clientHeight;
  return rect.top < viewportH + 450 && rect.bottom > -250;
};

// Approximate offset for map marker placement (since we don't have real coords for POIs)
const CATEGORY_OFFSETS: Record<POI["category"], [number, number]> = {
  school: [0.003, 0.004],
  transit: [-0.002, 0.002],
  cafe: [0.004, -0.003],
  hospital: [-0.005, -0.002],
  shopping: [0.001, -0.005],
  park: [-0.003, 0.005],
};

// ── Edge-function caller ───────────────────────────────────────────────────────

async function fetchPOIs(
  address: string,
  city: string,
  lat: number,
  lng: number,
): Promise<PoiResponse> {
  const { data, error } = await supabase.functions.invoke("property-pois", {
    body: { address, city, lat, lng },
  });
  if (error) {
    // FunctionsHttpError.message is always the generic SDK string.
    // The real error (quota exceeded, rate limit, auth failure) is in
    // error.context — the raw Response object from the edge function.
    let msg: string = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx instanceof Response) {
        const body = (await ctx.clone().json()) as { error?: string };
        if (typeof body?.error === "string") msg = body.error;
      }
    } catch {
      /* ignore extraction failure — fall back to SDK message */
    }
    throw new Error(msg);
  }
  // Some usage-limit paths return HTTP 200 with { error: "..." } in the body.
  if (typeof data?.error === "string") throw new Error(data.error);
  if (!Array.isArray(data?.pois))
    throw new Error("Failed to load nearby places");
  return {
    pois: data.pois as POI[],
    generatedBy: data.generatedBy === "fallback" ? "fallback" : "ai",
    warning: typeof data.warning === "string" ? data.warning : undefined,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function POIBadge({ poi }: { poi: POI }) {
  const meta = CATEGORY_META[poi.category];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-secondary border border-border hover:border-primary/30 transition-colors group">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${meta.markerColour}20` }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: meta.markerColour }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{poi.name}</p>
        {poi.description && (
          <p className="text-[10px] text-muted-foreground truncate">
            {poi.description}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-bold text-foreground">
          {poi.distanceKm < 1
            ? `${Math.round(poi.distanceKm * 1000)}m`
            : `${poi.distanceKm.toFixed(1)}km`}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {poi.walkMinutes} min
        </p>
      </div>
    </div>
  );
}

const categoryButtonClass = (active: boolean) =>
  `flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
    active
      ? "bg-primary text-primary-foreground border-primary"
      : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
  }`;

const CategoryFilterButton = ({
  category,
  activeCategory,
  onSelect,
}: {
  category: "all" | POI["category"];
  activeCategory: string;
  onSelect: (category: "all" | POI["category"]) => void;
}) => {
  const isActive = activeCategory === category;
  if (category === "all") {
    return (
      <button
        key={category}
        onClick={() => onSelect(category)}
        className={categoryButtonClass(isActive)}
      >
        <MapPin className="w-3 h-3" />
        All
      </button>
    );
  }

  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <button
      key={category}
      onClick={() => onSelect(category)}
      className={categoryButtonClass(isActive)}
    >
      <Icon className="w-3 h-3" />
      {meta.label}
    </button>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

interface PropertyMiniMapProps {
  latitude?: number | null;
  longitude?: number | null;
  address: string;
  city: string;
  title: string;
  onWalkScoreChange?: (score: number) => void;
}

export default function PropertyMiniMap({
  latitude,
  longitude,
  address,
  city,
  title: _title,
  onWalkScoreChange,
}: PropertyMiniMapProps) {
  const { user } = useAuth();
  const mapRef = useRef<MapRef>(null);
  const mapShellRef = useRef<HTMLDivElement>(null);
  const lat = latitude ? Number(latitude) : null;
  const lng = longitude ? Number(longitude) : null;
  const fallbackLocationQuery = [address, city, "Greece"].filter(Boolean).join(", ");

  const [pois, setPois] = useState<POI[] | null>(null);
  const [loadingPOIs, setLoadingPOIs] = useState(false);
  const [poiError, setPoiError] = useState<string | null>(null);
  const [poiWarning, setPoiWarning] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<POI["category"] | "all">(
    "all",
  );
  const [mapLoaded, setMapLoaded] = useState(false);
  const [shouldLoadMap, setShouldLoadMap] = useState(false);
  const [MapComponents, setMapComponents] = useState<{
    Map: ComponentType<any>;
    Marker: ComponentType<any>;
    NavigationControl: ComponentType<any>;
  } | null>(null);
  const {
    quota: poiQuota,
    quotaLoading: poiQuotaLoading,
    quotaChecked: poiQuotaChecked,
    refreshQuota: refreshPoiQuota,
  } = useAiQuota("property-pois", user, { enabled: Boolean(lat && lng && shouldLoadMap) });
  const poiQuotaReached = isAiQuotaReached(poiQuota);

  useEffect(() => {
    setShouldLoadMap(false);
    setMapLoaded(false);
    setMapComponents(null);
  }, [lat, lng]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !lat || !lng || shouldLoadMap) return;
    const el = mapShellRef.current;
    if (!el || typeof IntersectionObserver === "undefined" || isMapNearViewport(el)) {
      setShouldLoadMap(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoadMap(true);
        observer.disconnect();
      },
      { threshold: 0.01, rootMargin: "450px 0px" },
    );
    observer.observe(el);

    const fallback = window.setTimeout(() => setShouldLoadMap(true), 2500);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [lat, lng, shouldLoadMap]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !lat || !lng || !shouldLoadMap || MapComponents) return;
    let cancelled = false;
    const loadMap = async () => {
      const mapModule = await import("react-map-gl");
      await import("mapbox-gl/dist/mapbox-gl.css");
      if (!cancelled) {
        setMapComponents({
          Map: mapModule.Map,
          Marker: mapModule.Marker,
          NavigationControl: mapModule.NavigationControl,
        });
      }
    };
    loadMap();
    return () => {
      cancelled = true;
    };
  }, [lat, lng, shouldLoadMap, MapComponents]);

  // Auto-load POIs when coords are available (requires auth)
  const loadPOIs = useCallback(async () => {
    if (!lat || !lng || !user || !shouldLoadMap) return;
    setLoadingPOIs(true);
    setPoiError(null);
    setPoiWarning(null);
    try {
      if (poiQuota && !poiQuota.allowed) {
        setPois(null);
        return;
      }
      const data = await fetchPOIs(address, city, lat, lng);
      setPois(data.pois);
      setPoiWarning(data.generatedBy === "fallback" ? data.warning ?? "Generic nearby-place estimates used." : null);
      // Compute walk score and notify parent
      const score = computeWalkScore(data.pois);
      onWalkScoreChange?.(score);
      await refreshPoiQuota();
    } catch (e: unknown) {
      if (isAiMonthlyLimitError(e, null)) {
        await refreshPoiQuota();
        setPoiError(null);
      } else {
        setPoiError(getAiErrorMessage(e, null, "Failed to load nearby places"));
      }
    } finally {
      setLoadingPOIs(false);
    }
  }, [address, city, lat, lng, shouldLoadMap, user, poiQuota, onWalkScoreChange, refreshPoiQuota]);

  useEffect(() => {
    if (
      !lat ||
      !lng ||
      !user ||
      !shouldLoadMap ||
      pois ||
      poiError ||
      loadingPOIs ||
      poiQuotaLoading ||
      !poiQuotaChecked
    ) {
      return;
    }
    if (poiQuota && !poiQuota.allowed) return;
    void loadPOIs();
  }, [lat, lng, user, shouldLoadMap, pois, poiError, loadingPOIs, poiQuotaLoading, poiQuotaChecked, poiQuota, loadPOIs]);

  const filteredPOIs = pois
    ? activeCategory === "all"
      ? pois
      : pois.filter((p) => p.category === activeCategory)
    : [];

  const uniqueCategories = pois
    ? (["all", ...Array.from(new Set(pois.map((p) => p.category)))] as Array<
        "all" | POI["category"]
      >)
    : [];

  // Street view URL — opens Google Maps street view mode
  const streetViewUrl =
    lat && lng
      ? `https://www.google.com/maps?q=${lat},${lng}&layer=c&cbll=${lat},${lng}&cbp=12,0,,0,0`
      : `https://www.google.com/maps/search/${encodeURIComponent(fallbackLocationQuery)}`;

  const googleMapsUrl =
    lat && lng
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/${encodeURIComponent(fallbackLocationQuery)}`;

  if (!lat || !lng) {
    // Fallback: Google Maps embed when no lat/lng
    return (
      <div className="glass-card rounded-xl overflow-hidden border border-border">
        <div
          data-property-map-header
          className="px-5 py-4 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="flex min-w-0 w-full flex-1 items-start gap-2 sm:w-auto">
            <MapPin className="w-4 h-4 text-primary" />
            <h3 className="min-w-0 w-full break-words font-display font-semibold text-sm leading-tight sm:w-auto">
              Location & Nearby
            </h3>
          </div>
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5 h-7 whitespace-nowrap border-primary/30 text-primary hover:bg-primary/10"
            >
              <ExternalLink className="w-3 h-3" /> Open in Maps
            </Button>
          </a>
        </div>
        <div className="relative h-56 bg-secondary">
          <iframe
            title="map"
            loading="lazy"
            className="w-full h-full border-0"
            src={`https://maps.google.com/maps?q=${encodeURIComponent(fallbackLocationQuery)}&output=embed&z=13`}
          />
        </div>
        <div className="p-3 text-center text-xs text-muted-foreground">
          Exact coordinates not available — AI analysis unavailable
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl overflow-hidden border border-border">
      {/* Header */}
      <div
        data-property-map-header
        className="px-5 py-4 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex min-w-0 w-full flex-1 items-start gap-2 sm:w-auto">
          <MapPin className="w-4 h-4 text-primary" />
          <h3 className="min-w-0 w-full break-words font-display font-semibold text-sm leading-tight sm:w-auto">
            Location & Nearby Places
          </h3>
          {pois && (
            <span className="shrink-0 whitespace-nowrap text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {pois.length} places
            </span>
          )}
        </div>
        <div data-property-map-actions className="grid w-full shrink-0 grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <a href={streetViewUrl} target="_blank" rel="noopener noreferrer">
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5 h-7 whitespace-nowrap border-border hover:border-primary/50"
            >
              <ExternalLink className="w-3 h-3" /> Street View
            </Button>
          </a>
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5 h-7 whitespace-nowrap border-primary/30 text-primary hover:bg-primary/10"
            >
              <MapPin className="w-3 h-3" /> Google Maps
            </Button>
          </a>
        </div>
      </div>

      {/* Mapbox mini map — fallback to Google if no token */}
      <div ref={mapShellRef} className="relative h-64">
        {!MAPBOX_TOKEN ? (
          <iframe
            title="map"
            loading="lazy"
            className="w-full h-full border-0"
            src={`https://maps.google.com/maps?q=${lat},${lng}&output=embed&z=15`}
          />
        ) : !shouldLoadMap ? (
          <div className="w-full h-full flex items-center justify-center bg-secondary">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              Map loads when visible
            </div>
          </div>
        ) : !MapComponents ? (
          <div className="w-full h-full flex items-center justify-center bg-secondary">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading map...
            </div>
          </div>
        ) : (
          <MapComponents.Map
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{ longitude: lng, latitude: lat, zoom: 15 }}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            onLoad={() => setMapLoaded(true)}
            scrollZoom={false}
            dragPan={true}
          >
            <MapComponents.NavigationControl position="bottom-right" />

            {/* Property pin */}
            <MapComponents.Marker
              longitude={lng}
              latitude={lat}
              anchor="bottom"
            >
              <div className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-primary border-2 border-white shadow-lg flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="w-1 h-2 bg-primary rounded-b-full" />
              </div>
            </MapComponents.Marker>

            {/* POI markers on map */}
            {mapLoaded &&
              filteredPOIs.map((poi, idx) => {
                const offset = CATEGORY_OFFSETS[poi.category];
                const poiLng = lng + offset[0] * (1 + (idx % 3) * 0.3);
                const poiLat = lat + offset[1] * (1 + (idx % 2) * 0.4);
                const meta = CATEGORY_META[poi.category];
                const Icon = meta.icon;
                return (
                  <MapComponents.Marker
                    key={getPoiKey(poi)}
                    longitude={poiLng}
                    latitude={poiLat}
                    anchor="center"
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shadow-md border border-white/30"
                      style={{ background: meta.markerColour }}
                      title={poi.name}
                    >
                      <Icon className="w-3 h-3 text-background" />
                    </div>
                  </MapComponents.Marker>
                );
              })}
          </MapComponents.Map>
        )}

        {/* Coords badge */}
        <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px] text-muted-foreground border border-border pointer-events-none">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
      </div>

      {/* AI POIs section */}
      <div className="p-4">
        {!user ? (
          <SignInForAI feature="AI Nearby Places" />
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  AI Nearby Places
                </span>
                {loadingPOIs && (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                )}
              </div>
              {pois && !poiQuotaReached && (
                <button
                  onClick={loadPOIs}
                  disabled={loadingPOIs || poiQuotaLoading}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${loadingPOIs ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
              )}
            </div>

            <AIQuotaStatus
              featureName="AI Nearby Places"
              quota={poiQuota}
              quotaLoading={poiQuotaLoading || !poiQuotaChecked}
              className="mb-3"
            />

            {/* Loading state */}
            {loadingPOIs && !pois && (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">
                  AI is analysing nearby places…
                </p>
              </div>
            )}

            {/* Error state */}
            {poiError && !loadingPOIs && !poiQuotaReached && (
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
                <p className="text-xs text-destructive">{poiError}</p>
                <button
                  onClick={loadPOIs}
                  className="text-xs text-destructive hover:underline shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Category filters */}
            {pois && uniqueCategories.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-3">
                {uniqueCategories.map((category) => (
                  <CategoryFilterButton
                    key={category}
                    category={category as "all" | POI["category"]}
                    activeCategory={activeCategory}
                    onSelect={setActiveCategory}
                  />
                ))}
              </div>
            )}

            {/* POI list */}
            {filteredPOIs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredPOIs.map((poi) => (
                  <POIBadge key={getPoiKey(poi)} poi={poi} />
                ))}
              </div>
            )}

            {/* Empty state when no POIs yet and not loading */}
            {!pois && !loadingPOIs && !poiError && !poiQuotaReached && (
              <div className="flex flex-col items-center gap-2 py-4">
                <p className="text-xs text-muted-foreground">
                  Loading nearby places analysis…
                </p>
              </div>
            )}

            {/* Disclaimer */}
            {pois && (
              <>
                {/* Walk Score summary */}
                {(() => {
                  const ws = computeWalkScore(pois);
                  const label = walkScoreLabel(ws);
                  const colour = walkScoreColour(ws);
                  const r = 14,
                    c = 2 * Math.PI * r;
                  return (
                    <div className="flex items-center gap-3 px-3 py-3 bg-secondary rounded-xl border border-border mt-2">
                      <svg width="44" height="44" viewBox="0 0 44 44">
                        <circle
                          cx="22"
                          cy="22"
                          r={r}
                          fill="none"
                          stroke="hsl(var(--border))"
                          strokeWidth="3.5"
                        />
                        <circle
                          cx="22"
                          cy="22"
                          r={r}
                          fill="none"
                          stroke={colour}
                          strokeWidth="3.5"
                          strokeDasharray={`${(c * ws) / 100} ${c * (1 - ws / 100)}`}
                          strokeLinecap="round"
                          transform="rotate(-90 22 22)"
                        />
                        <text
                          x="22"
                          y="26"
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="700"
                          fill={colour}
                        >
                          {ws}
                        </text>
                      </svg>
                      <div>
                        <p
                          className="text-xs font-bold"
                          style={{ color: colour }}
                        >
                          {label}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Walk Score · out of 100
                        </p>
                      </div>
                    </div>
                  );
                })()}
                <p className="text-[10px] text-muted-foreground mt-3 text-center">
                  AI estimates based on property location — distances are
                  approximate walking distances
                </p>
                {poiWarning && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{poiWarning} Verify exact place names and distances before relying on them.</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
