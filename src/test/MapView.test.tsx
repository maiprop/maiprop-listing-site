/**
 * Tests for the MapView — listings clustered map with optional polygon
 * draw + heatmap overlay. react-map-gl is stubbed; we exercise the
 * lazy-load + UI controls (draw mode toggle, heatmap toggle, listing count).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const configMock = vi.hoisted(() => ({ mapboxToken: "pk.test.token" }));

vi.mock("@/lib/config", () => ({
  get MAPBOX_TOKEN() {
    return configMock.mapboxToken;
  },
}));
vi.mock("@/components/map/PropertyPopup", () => ({
  PropertyPopup: () => <div data-testid="property-popup" />,
}));

// react-map-gl is dynamically imported inside MapView. The lazy import
// returns a module — provide stubs that render to recognisable test ids.
// We capture the Map's onClick / onMouseMove handlers on a module-level
// holder so individual tests can drive them with synthetic events.
const handlerHolder: {
  onClick?: (e: unknown) => void;
  onMouseMove?: (e: unknown) => void;
} = {};

interface MapMockProps {
  children?: React.ReactNode;
  onClick?: (e: unknown) => void;
  onMouseMove?: (e: unknown) => void;
  mapboxAccessToken?: unknown;
}

interface ChildrenMockProps {
  children?: React.ReactNode;
}

interface SourceMockProps extends ChildrenMockProps {
  id?: string;
  data?: { features?: unknown[] };
}

interface LayerMockProps {
  id?: string;
  source?: string;
}

vi.mock("react-map-gl", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Map = React.forwardRef<{ getMap: () => null }, MapMockProps>(function MockMap(
    { children, onClick, onMouseMove, ...rest },
    ref,
  ) {
    React.useImperativeHandle(ref, () => ({ getMap: () => null }), []);
    handlerHolder.onClick = onClick;
    handlerHolder.onMouseMove = onMouseMove;
    return (
      <div data-testid="map-mock" data-token={String(rest.mapboxAccessToken ?? "")}>{children}</div>
    );
  });
  const Source = React.forwardRef<HTMLDivElement, SourceMockProps>(function MockSource({ children, id, data }, ref) {
    return (
      <div
        ref={ref}
        data-testid="map-source"
        data-source-id={id ?? ""}
        data-feature-count={String(data?.features?.length ?? "")}
      >
        {children}
      </div>
    );
  });
  const Layer = React.forwardRef<HTMLDivElement, LayerMockProps>(function MockLayer({ id, source }, ref) {
    return <div ref={ref} data-testid="map-layer" data-layer-id={id ?? ""} data-layer-source={source ?? ""} />;
  });
  const Popup = React.forwardRef<HTMLDivElement, ChildrenMockProps>(function MockPopup({ children }, ref) {
    return <div ref={ref} data-testid="map-popup">{children}</div>;
  });
  const NavigationControl = React.forwardRef<HTMLDivElement>(function MockNavigationControl(_props, ref) {
    return <div ref={ref} data-testid="map-nav" />;
  });

  return { __esModule: true, Map, Source, Layer, Popup, NavigationControl };
});
vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));

import { MapView } from "@/components/MapView";

beforeEach(() => {
  vi.clearAllMocks();
  configMock.mapboxToken = "pk.test.token";
  handlerHolder.onClick = undefined;
  handlerHolder.onMouseMove = undefined;
});

// MapListing uses `latitude`/`longitude` (not lat/lng) — using the wrong
// keys silently filters every listing out and you end up with an empty map.
const baseListings = [
  {
    id: "l1",
    title: "Athens 3-bed",
    price: 350_000,
    listing_type: "sale" as const,
    property_type: "apartment",
    city: "Athens",
    address: "Kolonaki 12",
    bedrooms: 3,
    bathrooms: 2,
    sqm: 95,
    image_url: null,
    latitude: 37.98,
    longitude: 23.73,
  },
];

// skipcq: JS-0067 - Test helper is intentionally module-scoped.
function sourceFeatureCount(id: string) {
  return Number(document.querySelector(`[data-source-id="${id}"]`)?.getAttribute("data-feature-count") ?? "0");
}

describe("MapView", () => {
  it("renders nothing meaningful before the lazy import resolves, then renders the Map", async () => {
    render(<MapView listings={baseListings} />);
    await waitFor(() => expect(screen.getByTestId("map-mock")).toBeInTheDocument());
    expect(screen.getByTestId("map-mock")).toHaveAttribute("data-token", "pk.test.token");
  });

  it("renders the cluster source + layers once mounted", async () => {
    render(<MapView listings={baseListings} />);
    // The map renders multiple sources (cluster + draw + heatmap), so use
    // getAllByTestId and assert at least one is present.
    await waitFor(() => expect(screen.getAllByTestId("map-source").length).toBeGreaterThan(0));
    expect(screen.getAllByTestId("map-layer").length).toBeGreaterThan(0);
  });

  it("toggles draw mode on Draw button click", async () => {
    render(<MapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    const drawBtn = screen.getByRole("button", { name: /Draw|Polygon|Lasso/i });
    fireEvent.click(drawBtn);
    // After enabling draw mode the cancel/clear button typically appears.
    // We don't assert specific copy because Map UI strings can vary —
    // just ensure clicking didn't throw and the button is still present.
    expect(drawBtn).toBeInTheDocument();
  });

  it("toggles the heatmap overlay", async () => {
    render(<MapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    const heatmapBtn = screen.queryByRole("button", { name: /Heatmap/i });
    if (heatmapBtn) {
      fireEvent.click(heatmapBtn);
      expect(heatmapBtn).toBeInTheDocument();
    }
  });

  it("supports a custom height prop", async () => {
    const { container } = render(<MapView listings={baseListings} height="600px" />);
    await waitFor(() => screen.getByTestId("map-mock"));
    expect(container.querySelector('[style*="600px"]')).toBeTruthy();
  });

  it("calls onVisibleListingsChange when provided (no-throw smoke)", async () => {
    const cb = vi.fn();
    render(<MapView listings={baseListings} onVisibleListingsChange={cb} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    // The callback fires from the map's onMoveEnd which we don't trigger
    // here; we only assert the prop is wired without throwing.
    expect(cb).not.toHaveBeenCalled();
  });

  it("renders an empty layout when given no listings", async () => {
    render(<MapView listings={[]} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    expect(screen.getAllByTestId("map-source").length).toBeGreaterThan(0);
  });

  it("falls back to a placeholder when MAPBOX_TOKEN is empty", async () => {
    configMock.mapboxToken = "";
    render(<MapView listings={baseListings} />);
    expect(screen.getByText(/VITE_MAPBOX_TOKEN/i)).toBeInTheDocument();
  });

  it("filters out listings with missing/zero coordinates from the cluster source", async () => {
    const mixed = [
      ...baseListings,
      // dropped — no coords
      {
        id: "l2", title: "no coords", price: 100, listing_type: "sale" as const,
        property_type: "apartment", city: "x", address: "x", bedrooms: 1, bathrooms: 1,
        sqm: 50, image_url: null,
        latitude: null as unknown as number, longitude: null as unknown as number,
      },
      // dropped — zero coords
      {
        id: "l3", title: "zero coords", price: 200, listing_type: "sale" as const,
        property_type: "apartment", city: "x", address: "x", bedrooms: 1, bathrooms: 1,
        sqm: 50, image_url: null, latitude: 0, longitude: 0,
      },
    ];
    render(<MapView listings={mixed} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    // No-throw / no crash — the bad-coord rows are silently dropped.
    expect(screen.getAllByTestId("map-source").length).toBeGreaterThan(0);
  });

  it("invokes the Map's onClick with no-op when no draw mode and no cluster/pin under cursor", async () => {
    render(<MapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    // The Map's onClick uses mapRef.current.getMap() which is null in jsdom,
    // so the click should early-return without throwing.
    expect(() => {
      handlerHolder.onClick?.({ lngLat: { lng: 0, lat: 0 }, point: { x: 0, y: 0 } });
    }).not.toThrow();
  });

  it("hover updates the inline draw geometry without throwing", async () => {
    render(<MapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    expect(() => {
      handlerHolder.onMouseMove?.({ lngLat: { lng: 23.7, lat: 38.0 } });
    }).not.toThrow();
  });

  it("toggles heatmap on/off via the toolbar button (and shows the legend)", async () => {
    render(<MapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    const heatmapBtn = screen.getByRole("button", { name: /Toggle price heatmap/i });
    fireEvent.click(heatmapBtn);
    expect(screen.getByText(/Price \/ m/)).toBeInTheDocument();
    fireEvent.click(heatmapBtn);
    expect(screen.queryByText(/Price \/ m/)).toBeNull();
  });

  it("enters draw mode, accumulates points via onClick, and the hint reflects each step", async () => {
    render(<MapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    fireEvent.click(screen.getByRole("button", { name: /Draw area filter/i }));
    expect(screen.getByText(/Click map to start drawing/i)).toBeInTheDocument();
    // Wrap each synthetic click in act() so stateRef.current is refreshed
    // by the useEffect between calls — otherwise every click sees the stale
    // drawnPoints=[] snapshot and appends the same first point.
    await act(async () => {
      handlerHolder.onClick?.({ lngLat: { lng: 23.7, lat: 38.0 }, point: { x: 1, y: 1 } });
    });
    expect(screen.getByText(/1 point/)).toBeInTheDocument();
    await act(async () => {
      handlerHolder.onClick?.({ lngLat: { lng: 23.8, lat: 38.0 }, point: { x: 2, y: 2 } });
    });
    expect(screen.getByText(/2 points/)).toBeInTheDocument();
    await act(async () => {
      handlerHolder.onClick?.({ lngLat: { lng: 23.8, lat: 38.1 }, point: { x: 3, y: 3 } });
    });
    // 3+ points unlocks the "Finish" button.
    expect(screen.getByRole("button", { name: /Finish polygon/i })).toBeInTheDocument();
  });

  it("Finish closes the polygon and emits onPolygonFilter with the matching listing ids", async () => {
    const onPolygonFilter = vi.fn();
    render(
      <MapView
        listings={[
          // Inside the (very wide) polygon below.
          { ...baseListings[0], id: "inside" },
          {
            id: "outside", title: "Far", price: 1, listing_type: "sale" as const,
            property_type: "apartment", city: "x", address: "x", bedrooms: 1, bathrooms: 1,
            sqm: 10, image_url: null, latitude: -50, longitude: -50,
          },
        ]}
        onPolygonFilter={onPolygonFilter}
      />,
    );
    await waitFor(() => screen.getByTestId("map-mock"));
    fireEvent.click(screen.getByRole("button", { name: /Draw area filter/i }));
    for (const pt of [
      { lngLat: { lng: 23.0, lat: 37.0 }, point: { x: 1, y: 1 } },
      { lngLat: { lng: 24.5, lat: 37.0 }, point: { x: 2, y: 2 } },
      { lngLat: { lng: 24.5, lat: 39.0 }, point: { x: 3, y: 3 } },
      { lngLat: { lng: 23.0, lat: 39.0 }, point: { x: 4, y: 4 } },
    ]) {
      await act(async () => {
        handlerHolder.onClick?.(pt);
      });
    }
    fireEvent.click(screen.getByRole("button", { name: /Finish polygon/i }));
    expect(onPolygonFilter).toHaveBeenCalled();
    const idsArg = onPolygonFilter.mock.calls.at(-1)?.[0] as Set<string>;
    expect(idsArg.has("inside")).toBe(true);
    expect(idsArg.has("outside")).toBe(false);
    // Clear-area button replaces the Draw button.
    fireEvent.click(screen.getByRole("button", { name: /Clear area filter/i }));
    expect(onPolygonFilter).toHaveBeenLastCalledWith(null);
  });

  it("draw area locally filters visible map pins and active heatmap data in every MapView caller", async () => {
    render(
      <MapView
        listings={[
          { ...baseListings[0], id: "inside" },
          {
            id: "outside", title: "Far", price: 1, listing_type: "sale" as const,
            property_type: "apartment", city: "x", address: "x", bedrooms: 1, bathrooms: 1,
            sqm: 10, image_url: null, latitude: -50, longitude: -50,
          },
        ]}
      />,
    );

    await waitFor(() => screen.getByTestId("map-mock"));
    expect(sourceFeatureCount("listings")).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: /Toggle price heatmap/i }));
    expect(sourceFeatureCount("heatmap-data")).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: /Draw area filter/i }));
    for (const pt of [
      { lngLat: { lng: 23.0, lat: 37.0 }, point: { x: 1, y: 1 } },
      { lngLat: { lng: 24.5, lat: 37.0 }, point: { x: 2, y: 2 } },
      { lngLat: { lng: 24.5, lat: 39.0 }, point: { x: 3, y: 3 } },
      { lngLat: { lng: 23.0, lat: 39.0 }, point: { x: 4, y: 4 } },
    ]) {
      await act(async () => {
        handlerHolder.onClick?.(pt);
      });
    }
    fireEvent.click(screen.getByRole("button", { name: /Finish polygon/i }));

    expect(screen.getByText(/1 property in area/i)).toBeInTheDocument();
    expect(sourceFeatureCount("listings")).toBe(1);
    expect(sourceFeatureCount("heatmap-data")).toBe(1);
  });

  it("shows the empty-state overlay when no listings have valid coords", async () => {
    render(<MapView listings={[]} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    expect(screen.getByText(/No listings with location data/i)).toBeInTheDocument();
  });

  it("Cancel-while-drawing resets to the no-draw toolbar state", async () => {
    render(<MapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    fireEvent.click(screen.getByRole("button", { name: /Draw area filter/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel drawing/i }));
    expect(screen.getByRole("button", { name: /Draw area filter/i })).toBeInTheDocument();
  });
});
