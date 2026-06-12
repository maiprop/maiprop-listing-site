import type { LayerProps } from "react-map-gl";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _raw?: any;
};

// ── Colour helpers ─────────────────────────────────────────────────────────────

export const TYPE_HEX: Record<string, string> = {
  sale: "#00d4c8",
  rent: "#9b6bfc",
  auction: "#f5c518",
  firesale: "#e84040",
  new_build: "#ff8a3d",
};

export function typeColour(t?: string) { return TYPE_HEX[t || "sale"] ?? TYPE_HEX.sale; }

export function priceLabel(p: number) {
  if (p >= 1_000_000) return `€${(p / 1_000_000).toFixed(1)}M`;
  if (p >= 1000) return `€${Math.round(p / 1000)}k`;
  return `€${p}`;
}

// ── Point-in-polygon (ray-casting) ──────────────────────────────────────────

export function pointInPolygon(point: [number, number], ring: [number, number][]) {
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

export const EMPTY_GJ = { type: "FeatureCollection" as const, features: [] };

// ── GeoJSON builder ───────────────────────────────────────────────────────────

export function buildGeoJSON(listings: MapListing[]) {
  return {
    type: "FeatureCollection" as const,
    features: listings.filter(l => l.latitude != null && l.longitude != null).map(l => ({
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
      },
      geometry: {
        type: "Point" as const,
        coordinates: [Number(l.longitude), Number(l.latitude)],
      },
    })),
  };
}

// ── Layer definitions ─────────────────────────────────────────────────────────

export const clusterCircle: LayerProps = {
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

export const clusterCount: LayerProps = {
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

export const unclusteredHit: LayerProps = {
  id: "unclustered-point",
  type: "circle",
  source: "listings",
  filter: ["!", ["has", "point_count"]],
  paint: { "circle-radius": 0, "circle-opacity": 0 },
};

export const priceLabelLayer: LayerProps = {
  id: "price-labels",
  type: "symbol",
  source: "listings",
  filter: ["!", ["has", "point_count"]],
  layout: {
    "text-field": ["get", "label"],
    "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
    "text-size": 11,
    "text-anchor": "center",
    "icon-allow-overlap": true,
    "text-allow-overlap": true,
  },
  paint: {
    "text-color": "#0a0f1a",
    "text-halo-color": ["get", "colour"],
    "text-halo-width": 8,
    "text-halo-blur": 1,
  },
};

export const heatmapLayer: LayerProps = {
  id: "price-heatmap",
  type: "heatmap",
  source: "heatmap-data",
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

export const drawLineLyr: LayerProps = {
  id: "draw-line",
  type: "line",
  source: "draw-line",
  paint: {
    "line-color": "#00d4c8",
    "line-width": 2,
    "line-dasharray": [3, 2],
  },
};

export const drawFillLyr: LayerProps = {
  id: "draw-fill",
  type: "fill",
  source: "draw-poly",
  paint: { "fill-color": "#00d4c8", "fill-opacity": 0.12 },
};

export const drawOutlineLyr: LayerProps = {
  id: "draw-outline",
  type: "line",
  source: "draw-poly",
  paint: { "line-color": "#00d4c8", "line-width": 2 },
};

export const drawDotLyr: LayerProps = {
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
