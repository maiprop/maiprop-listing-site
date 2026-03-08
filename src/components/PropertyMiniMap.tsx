import { useState, useRef, useCallback, useEffect } from "react";
import { computeWalkScore, walkScoreLabel, walkScoreColour } from "@/lib/walkScore";
import Map, { Marker, NavigationControl, MapRef } from "react-map-gl";
import {
  MapPin, ExternalLink, School, Bus, Coffee, Hospital,
  ShoppingBag, TreePine, Loader2, Zap, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAPBOX_TOKEN } from "@/lib/config";
import { supabase } from "@/integrations/supabase/client";
import "mapbox-gl/dist/mapbox-gl.css";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface POI {
  name: string;
  category: "school" | "transit" | "cafe" | "hospital" | "shopping" | "park";
  distanceKm: number;
  walkMinutes: number;
  description?: string;
}

const CATEGORY_META: Record<
  POI["category"],
  { icon: React.ComponentType<any>; label: string; colour: string; markerColour: string }
> = {
  school:   { icon: School,      label: "Schools",   colour: "text-blue-400",   markerColour: "#60a5fa" },
  transit:  { icon: Bus,         label: "Transit",   colour: "text-emerald-400", markerColour: "#34d399" },
  cafe:     { icon: Coffee,      label: "Cafés",     colour: "text-amber-400",   markerColour: "#fbbf24" },
  hospital: { icon: Hospital,    label: "Medical",   colour: "text-red-400",     markerColour: "#f87171" },
  shopping: { icon: ShoppingBag, label: "Shopping",  colour: "text-purple-400",  markerColour: "#c084fc" },
  park:     { icon: TreePine,    label: "Parks",     colour: "text-green-400",   markerColour: "#4ade80" },
};

// Approximate offset for map marker placement (since we don't have real coords for POIs)
const CATEGORY_OFFSETS: Record<POI["category"], [number, number]> = {
  school:   [0.003, 0.004],
  transit:  [-0.002, 0.002],
  cafe:     [0.004, -0.003],
  hospital: [-0.005, -0.002],
  shopping: [0.001, -0.005],
  park:     [-0.003, 0.005],
};

// ── Edge-function caller ───────────────────────────────────────────────────────

async function fetchPOIs(
  address: string,
  city: string,
  lat: number,
  lng: number
): Promise<POI[]> {
  const { data, error } = await supabase.functions.invoke("property-pois", {
    body: { address, city, lat, lng },
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data?.pois)) throw new Error("Invalid response");
  return data.pois as POI[];
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
          <p className="text-[10px] text-muted-foreground truncate">{poi.description}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-bold text-foreground">{poi.distanceKm < 1 ? `${Math.round(poi.distanceKm * 1000)}m` : `${poi.distanceKm.toFixed(1)}km`}</p>
        <p className="text-[10px] text-muted-foreground">{poi.walkMinutes} min</p>
      </div>
    </div>
  );
}

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
  latitude, longitude, address, city, title,
}: PropertyMiniMapProps) {
  const mapRef = useRef<MapRef>(null);
  const lat = latitude ? Number(latitude) : null;
  const lng = longitude ? Number(longitude) : null;

  const [pois, setPois] = useState<POI[] | null>(null);
  const [loadingPOIs, setLoadingPOIs] = useState(false);
  const [poiError, setPoiError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<POI["category"] | "all">("all");
  const [mapLoaded, setMapLoaded] = useState(false);

  // Auto-load POIs when coords are available
  const loadPOIs = useCallback(async () => {
    if (!lat || !lng) return;
    setLoadingPOIs(true);
    setPoiError(null);
    try {
      const data = await fetchPOIs(address, city, lat, lng);
      setPois(data);
    } catch (e: any) {
      setPoiError(e.message || "Failed to load nearby places");
    } finally {
      setLoadingPOIs(false);
    }
  }, [address, city, lat, lng]);

  useEffect(() => {
    if (lat && lng) loadPOIs();
  }, [lat, lng]); // eslint-disable-line

  const filteredPOIs = pois
    ? (activeCategory === "all" ? pois : pois.filter(p => p.category === activeCategory))
    : [];

  const uniqueCategories = pois
    ? (["all", ...Array.from(new Set(pois.map(p => p.category)))] as Array<"all" | POI["category"]>)
    : [];

  // Street view URL
  const streetViewUrl = lat && lng
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
    : `https://www.google.com/maps/search/${encodeURIComponent(address + ", " + city)}`;

  const googleMapsUrl = lat && lng
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : `https://www.google.com/maps/search/${encodeURIComponent(address + ", " + city)}`;

  if (!lat || !lng) {
    // Fallback: Google Maps embed when no lat/lng
    return (
      <div className="glass-card rounded-xl overflow-hidden border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Location & Nearby</h3>
          </div>
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="text-xs gap-1.5 h-7 border-primary/30 text-primary hover:bg-primary/10">
              <ExternalLink className="w-3 h-3" /> Open in Maps
            </Button>
          </a>
        </div>
        <div className="relative h-56 bg-secondary">
          <iframe
            title="map"
            loading="lazy"
            className="w-full h-full border-0"
            src={`https://maps.google.com/maps?q=${encodeURIComponent(city + ", Greece")}&output=embed&z=13`}
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
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">Location & Nearby Places</h3>
          {pois && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {pois.length} places
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a href={streetViewUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline"
              className="text-xs gap-1.5 h-7 border-border hover:border-primary/50">
              <ExternalLink className="w-3 h-3" /> Street View
            </Button>
          </a>
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline"
              className="text-xs gap-1.5 h-7 border-primary/30 text-primary hover:bg-primary/10">
              <MapPin className="w-3 h-3" /> Google Maps
            </Button>
          </a>
        </div>
      </div>

      {/* Mapbox mini map */}
      <div className="relative h-64">
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ longitude: lng, latitude: lat, zoom: 15 }}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          onLoad={() => setMapLoaded(true)}
          scrollZoom={false}
          dragPan={true}
        >
          <NavigationControl position="bottom-right" />

          {/* Property pin */}
          <Marker longitude={lng} latitude={lat} anchor="bottom">
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-full bg-primary border-2 border-white shadow-lg flex items-center justify-center">
                <MapPin className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="w-1 h-2 bg-primary rounded-b-full" />
            </div>
          </Marker>

          {/* POI markers on map */}
          {mapLoaded && filteredPOIs.map((poi, idx) => {
            const offset = CATEGORY_OFFSETS[poi.category];
            const poiLng = lng + offset[0] * (1 + (idx % 3) * 0.3);
            const poiLat = lat + offset[1] * (1 + (idx % 2) * 0.4);
            const meta = CATEGORY_META[poi.category];
            const Icon = meta.icon;
            return (
              <Marker key={`${poi.category}-${idx}`} longitude={poiLng} latitude={poiLat} anchor="center">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shadow-md border border-white/30"
                  style={{ background: meta.markerColour }}
                  title={poi.name}
                >
                  <Icon className="w-3 h-3 text-background" />
                </div>
              </Marker>
            );
          })}
        </Map>

        {/* Coords badge */}
        <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px] text-muted-foreground border border-border pointer-events-none">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
      </div>

      {/* AI POIs section */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              AI Nearby Places
            </span>
            {loadingPOIs && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          {pois && (
            <button
              onClick={loadPOIs}
              disabled={loadingPOIs}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${loadingPOIs ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
        </div>

        {/* Loading state */}
        {loadingPOIs && !pois && (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">AI is analysing nearby places…</p>
          </div>
        )}

        {/* Error state */}
        {poiError && !loadingPOIs && (
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
            {uniqueCategories.map(cat => {
              const isAll = cat === "all";
              const meta = isAll ? null : CATEGORY_META[cat as POI["category"]];
              const Icon = isAll ? MapPin : meta!.icon;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {isAll ? "All" : meta!.label}
                </button>
              );
            })}
          </div>
        )}

        {/* POI list */}
        {filteredPOIs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredPOIs.map((poi, i) => (
              <POIBadge key={i} poi={poi} />
            ))}
          </div>
        )}

        {/* Empty state when no POIs yet and not loading */}
        {!pois && !loadingPOIs && !poiError && (
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-xs text-muted-foreground">Loading nearby places analysis…</p>
          </div>
        )}

        {/* Disclaimer */}
        {pois && (
          <p className="text-[10px] text-muted-foreground mt-3 text-center">
            AI estimates based on property location — distances are approximate walking distances
          </p>
        )}
      </div>
    </div>
  );
}
