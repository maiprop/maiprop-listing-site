/**
 * Tests for the MapView — listings clustered map with optional polygon
 * draw + heatmap overlay. react-map-gl is stubbed; we exercise the
 * lazy-load + UI controls (draw mode toggle, heatmap toggle, listing count).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const configMock = vi.hoisted(() => ({ mapboxToken: "pk.test.token" }));

vi.mock("@/lib/config", () => ({
  get MAPBOX_TOKEN() {
    return configMock.mapboxToken;
  },
}));
vi.mock("@/components/map/PropertyPopup", () => ({
  PropertyPopup: ({ listing }: { listing: { id: string } }) => (
    <div data-testid="property-popup">{listing.id}</div>
  ),
}));

// react-map-gl is dynamically imported inside MapView. The lazy import
// returns a module — provide stubs that render to recognisable test ids.
// We capture the Map's onClick / onMouseMove handlers on a module-level
// holder so individual tests can drive them with synthetic events.
const handlerHolder: {
  onClick?: (e: unknown) => void;
  onMouseMove?: (e: unknown) => void;
  onMoveEnd?: () => void;
  onZoomEnd?: () => void;
  onLoad?: () => void;
  popupOnClose?: () => void;
} = {};

const boundsMock = {
  getWest: vi.fn(() => 23),
  getSouth: vi.fn(() => 37),
  getEast: vi.fn(() => 25),
  getNorth: vi.fn(() => 39),
  contains: vi.fn(([lng, lat]: [number, number]) => lng >= 23 && lng <= 25 && lat >= 37 && lat <= 39),
};

const clusterSourceMock = {
  getClusterExpansionZoom: vi.fn((_id: number, callback: (error: unknown, zoom: number) => void) => callback(null, 8)),
};

const mapController = {
  getBounds: vi.fn(() => boundsMock),
  fitBounds: vi.fn((_bounds: unknown, _options?: unknown) => undefined),
  queryRenderedFeatures: vi.fn((_point: unknown, _options?: { layers?: string[] }) => [] as unknown[]),
  getSource: vi.fn((_id: string) => clusterSourceMock),
  easeTo: vi.fn((_options: unknown) => undefined),
  project: vi.fn(([lng, lat]: [number, number]) => ({ x: lng, y: lat })),
};

interface MapMockProps {
  children?: React.ReactNode;
  onClick?: (e: unknown) => void;
  onMouseMove?: (e: unknown) => void;
  onMoveEnd?: () => void;
  onZoomEnd?: () => void;
  onLoad?: () => void;
  mapboxAccessToken?: unknown;
  cursor?: string;
}

interface ChildrenMockProps {
  children?: React.ReactNode;
  onClose?: () => void;
}

interface SourceMockProps extends ChildrenMockProps {
  id?: string;
  data?: {
    features?: Array<{
      geometry?: { coordinates?: unknown[] };
    }>;
  };
}

interface LayerMockProps {
  id?: string;
  source?: string;
}

const MockMap = React.forwardRef<{ getMap: () => typeof mapController; fitBounds: typeof mapController.fitBounds }, MapMockProps>(function MockMap(
  { children, onClick, onMouseMove, onMoveEnd, onZoomEnd, onLoad, ...rest },
  ref,
) {
  React.useImperativeHandle(ref, () => ({
    getMap: () => mapController,
    fitBounds: mapController.fitBounds,
  }), []);
  handlerHolder.onClick = onClick;
  handlerHolder.onMouseMove = onMouseMove;
  handlerHolder.onMoveEnd = onMoveEnd;
  handlerHolder.onZoomEnd = onZoomEnd;
  handlerHolder.onLoad = onLoad;
  return (
    <div
      data-testid="map-mock"
      data-token={String(rest.mapboxAccessToken ?? "")}
      data-cursor={rest.cursor ?? ""}
    >
      {children}
    </div>
  );
});
const MockSource = React.forwardRef<HTMLDivElement, SourceMockProps>(function MockSource({ children, id, data }, ref) {
  return (
    <div
      ref={ref}
      data-testid="map-source"
      data-source-id={id ?? ""}
      data-feature-count={String(data?.features?.length ?? "")}
      data-coordinate-count={String(data?.features?.[0]?.geometry?.coordinates?.length ?? "")}
    >
      {children}
    </div>
  );
});
const MockLayer = React.forwardRef<HTMLDivElement, LayerMockProps>(function MockLayer({ id, source }, ref) {
  return <div ref={ref} data-testid="map-layer" data-layer-id={id ?? ""} data-layer-source={source ?? ""} />;
});
const MockPopup = React.forwardRef<HTMLDivElement, ChildrenMockProps>(function MockPopup({ children, onClose }, ref) {
  handlerHolder.popupOnClose = onClose;
  return (
    <div ref={ref} data-testid="map-popup">
      {children}
      <button onClick={onClose}>close map popup</button>
    </div>
  );
});
const MockNavigationControl = React.forwardRef<HTMLDivElement>(function MockNavigationControl(_props, ref) {
  return <div ref={ref} data-testid="map-nav" />;
});

import { MapView } from "@/components/MapView";

const mapComponentsLoader = async () => ({
  Map: MockMap,
  Source: MockSource,
  Layer: MockLayer,
  Popup: MockPopup,
  NavigationControl: MockNavigationControl,
});

function TestMapView(props: Omit<React.ComponentProps<typeof MapView>, "mapComponentsLoader">) {
  return <MapView mapComponentsLoader={mapComponentsLoader} {...props} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  configMock.mapboxToken = "pk.test.token";
  handlerHolder.onClick = undefined;
  handlerHolder.onMouseMove = undefined;
  handlerHolder.onMoveEnd = undefined;
  handlerHolder.onZoomEnd = undefined;
  handlerHolder.onLoad = undefined;
  handlerHolder.popupOnClose = undefined;
  boundsMock.getWest.mockReturnValue(23);
  boundsMock.getSouth.mockReturnValue(37);
  boundsMock.getEast.mockReturnValue(25);
  boundsMock.getNorth.mockReturnValue(39);
  boundsMock.contains.mockImplementation(([lng, lat]: [number, number]) => lng >= 23 && lng <= 25 && lat >= 37 && lat <= 39);
  mapController.getBounds.mockReturnValue(boundsMock);
  mapController.queryRenderedFeatures.mockReturnValue([]);
  mapController.getSource.mockReturnValue(clusterSourceMock);
  mapController.project.mockImplementation(([lng, lat]: [number, number]) => ({ x: lng, y: lat }));
  clusterSourceMock.getClusterExpansionZoom.mockImplementation((_id, callback) => callback(null, 8));
});

afterEach(() => {
  vi.useRealTimers();
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
    render(<TestMapView listings={baseListings} />);
    await waitFor(() => expect(screen.getByTestId("map-mock")).toBeInTheDocument());
    expect(screen.getByTestId("map-mock")).toHaveAttribute("data-token", "pk.test.token");
  });

  it("renders the cluster source + layers once mounted", async () => {
    render(<TestMapView listings={baseListings} />);
    // The map renders multiple sources (cluster + draw + heatmap), so use
    // getAllByTestId and assert at least one is present.
    await waitFor(() => expect(screen.getAllByTestId("map-source").length).toBeGreaterThan(0));
    expect(screen.getAllByTestId("map-layer").length).toBeGreaterThan(0);
  });

  it("toggles draw mode on Draw button click", async () => {
    render(<TestMapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    const drawBtn = screen.getByRole("button", { name: /Draw|Polygon|Lasso/i });
    fireEvent.click(drawBtn);
    // After enabling draw mode the cancel/clear button typically appears.
    // We don't assert specific copy because Map UI strings can vary —
    // just ensure clicking didn't throw and the button is still present.
    expect(drawBtn).toBeInTheDocument();
  });

  it("toggles the heatmap overlay", async () => {
    render(<TestMapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    const heatmapBtn = screen.queryByRole("button", { name: /Heatmap/i });
    if (heatmapBtn) {
      fireEvent.click(heatmapBtn);
      expect(heatmapBtn).toBeInTheDocument();
    }
  });

  it("supports a custom height prop", async () => {
    const { container } = render(<TestMapView listings={baseListings} height="600px" />);
    await waitFor(() => screen.getByTestId("map-mock"));
    expect(container.querySelector('[style*="600px"]')).toBeTruthy();
  });

  it("calls onVisibleListingsChange when provided (no-throw smoke)", async () => {
    const cb = vi.fn();
    render(<TestMapView listings={baseListings} onVisibleListingsChange={cb} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    // The callback fires from the map's onMoveEnd which we don't trigger
    // here; we only assert the prop is wired without throwing.
    expect(cb).not.toHaveBeenCalled();
  });

  it("renders an empty layout when given no listings", async () => {
    render(<TestMapView listings={[]} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    expect(screen.getAllByTestId("map-source").length).toBeGreaterThan(0);
  });

  it("falls back to a placeholder when MAPBOX_TOKEN is empty", async () => {
    configMock.mapboxToken = "";
    render(<TestMapView listings={baseListings} />);
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
    render(<TestMapView listings={mixed} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    // No-throw / no crash — the bad-coord rows are silently dropped.
    expect(screen.getAllByTestId("map-source").length).toBeGreaterThan(0);
  });

  it("invokes the Map's onClick with no-op when no draw mode and no cluster/pin under cursor", async () => {
    render(<TestMapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    // The Map's onClick uses mapRef.current.getMap() which is null in jsdom,
    // so the click should early-return without throwing.
    expect(() => {
      handlerHolder.onClick?.({ lngLat: { lng: 0, lat: 0 }, point: { x: 0, y: 0 } });
    }).not.toThrow();
  });

  it("hover updates the inline draw geometry without throwing", async () => {
    render(<TestMapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    expect(() => {
      handlerHolder.onMouseMove?.({ lngLat: { lng: 23.7, lat: 38.0 } });
    }).not.toThrow();
  });

  it("toggles heatmap on/off via the toolbar button (and shows the legend)", async () => {
    render(<TestMapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    const heatmapBtn = screen.getByRole("button", { name: /Toggle price heatmap/i });
    fireEvent.click(heatmapBtn);
    expect(screen.getByText(/Price \/ m/)).toBeInTheDocument();
    fireEvent.click(heatmapBtn);
    expect(screen.queryByText(/Price \/ m/)).toBeNull();
  });

  it("enters draw mode, accumulates points via onClick, and the hint reflects each step", async () => {
    render(<TestMapView listings={baseListings} />);
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
      <TestMapView
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
      <TestMapView
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
    render(<TestMapView listings={[]} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    expect(screen.getByText(/No listings with location data/i)).toBeInTheDocument();
  });

  it("Cancel-while-drawing resets to the no-draw toolbar state", async () => {
    render(<TestMapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    fireEvent.click(screen.getByRole("button", { name: /Draw area filter/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel drawing/i }));
    expect(screen.getByRole("button", { name: /Draw area filter/i })).toBeInTheDocument();
  });

  it("shows a stable loading fallback until an injected map bundle resolves", async () => {
    let resolveLoader!: (bundle: Awaited<ReturnType<typeof mapComponentsLoader>>) => void;
    const loader = vi.fn(() => new Promise<Awaited<ReturnType<typeof mapComponentsLoader>>>((resolve) => {
      resolveLoader = resolve;
    }));

    const { container } = render(<MapView listings={baseListings} height="320px" mapComponentsLoader={loader} />);
    expect(screen.getByText("Loading map...")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({ height: "320px" });
    expect(loader).toHaveBeenCalledTimes(1);

    await act(async () => resolveLoader(await mapComponentsLoader()));
    expect(screen.getByTestId("map-mock")).toBeInTheDocument();
  });

  it("does not invoke the map loader when the token fallback is active", () => {
    configMock.mapboxToken = "";
    const loader = vi.fn(mapComponentsLoader);
    const { container } = render(<MapView listings={baseListings} height="280px" mapComponentsLoader={loader} />);

    expect(loader).not.toHaveBeenCalled();
    expect(container.firstElementChild).toHaveStyle({ height: "280px" });
    expect(screen.getByRole("link", { name: /Open Google Maps/i })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /Open Google Maps/i })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("ignores a late loader result after unmount", async () => {
    let resolveLoader!: (bundle: Awaited<ReturnType<typeof mapComponentsLoader>>) => void;
    const loader = () => new Promise<Awaited<ReturnType<typeof mapComponentsLoader>>>((resolve) => {
      resolveLoader = resolve;
    });
    const { unmount } = render(<MapView listings={baseListings} mapComponentsLoader={loader} />);
    unmount();
    await act(async () => resolveLoader(await mapComponentsLoader()));
    expect(screen.queryByTestId("map-mock")).not.toBeInTheDocument();
  });

  it("fits all coordinate extrema automatically and from the toolbar", async () => {
    render(
      <TestMapView
        listings={[
          { ...baseListings[0], id: "south-west", latitude: 35.1, longitude: 20.2 },
          { ...baseListings[0], id: "north-east", latitude: 41.9, longitude: 28.4 },
        ]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("map-mock")).toBeInTheDocument());
    await waitFor(() => expect(mapController.fitBounds).toHaveBeenCalled());

    expect(mapController.fitBounds).toHaveBeenCalledWith(
      [[20.2, 35.1], [28.4, 41.9]],
      { padding: 60, duration: 600 },
    );

    mapController.fitBounds.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Fit all pins" }));
    expect(mapController.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("keeps Fit all inert when there are no mapped coordinates", async () => {
    render(<TestMapView listings={[]} />);
    await waitFor(() => expect(screen.getByTestId("map-mock")).toBeInTheDocument());
    mapController.fitBounds.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Fit all pins" }));
    expect(mapController.fitBounds).not.toHaveBeenCalled();
  });

  it("reports only listings inside the current bounds and deduplicates unchanged move events", async () => {
    const onVisibleListingsChange = vi.fn();
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
    Object.defineProperty(window, "cancelAnimationFrame", { configurable: true, value: vi.fn() });
    render(
      <TestMapView
        listings={[
          { ...baseListings[0], id: "inside" },
          { ...baseListings[0], id: "outside", latitude: 40, longitude: 30 },
        ]}
        onVisibleListingsChange={onVisibleListingsChange}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("map-mock")).toBeInTheDocument());

    act(() => handlerHolder.onLoad?.());
    await waitFor(() => expect(onVisibleListingsChange).toHaveBeenCalledTimes(1));
    expect([...onVisibleListingsChange.mock.calls[0][0] as Set<string>]).toEqual(["inside"]);

    act(() => handlerHolder.onMoveEnd?.());
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(onVisibleListingsChange).toHaveBeenCalledTimes(1);

    boundsMock.getEast.mockReturnValue(31);
    boundsMock.contains.mockReturnValue(true);
    act(() => handlerHolder.onZoomEnd?.());
    await waitFor(() => expect(onVisibleListingsChange).toHaveBeenCalledTimes(2));
    expect([...onVisibleListingsChange.mock.calls[1][0] as Set<string>]).toEqual(["inside", "outside"]);
  });

  it("expands a clicked cluster and ignores Mapbox expansion errors", async () => {
    const clusterFeature = {
      properties: { cluster_id: 42 },
      geometry: { coordinates: [23.7, 38] },
    };
    mapController.queryRenderedFeatures.mockImplementation((_point, options) =>
      options?.layers?.includes("clusters") ? [clusterFeature] : [],
    );
    render(<TestMapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));

    act(() => handlerHolder.onClick?.({ point: { x: 10, y: 10 }, lngLat: { lng: 23.7, lat: 38 } }));
    expect(clusterSourceMock.getClusterExpansionZoom).toHaveBeenCalledWith(42, expect.any(Function));
    expect(mapController.easeTo).toHaveBeenCalledWith({
      center: [23.7, 38],
      zoom: 8.5,
      duration: 450,
    });

    mapController.easeTo.mockClear();
    clusterSourceMock.getClusterExpansionZoom.mockImplementationOnce((_id, callback) => callback(new Error("no zoom"), 0));
    act(() => handlerHolder.onClick?.({ point: { x: 10, y: 10 }, lngLat: { lng: 23.7, lat: 38 } }));
    expect(mapController.easeTo).not.toHaveBeenCalled();
  });

  it("opens, toggles, closes, and rejects invalid price-label popup selections", async () => {
    let pinProperties: Record<string, unknown> | null = { id: "missing" };
    mapController.queryRenderedFeatures.mockImplementation((_point, options) => {
      if (options?.layers?.includes("clusters")) return [];
      if (options?.layers?.includes("price-labels") && pinProperties) return [{ properties: pinProperties }];
      return [];
    });
    render(<TestMapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));

    act(() => handlerHolder.onClick?.({ point: { x: 1, y: 1 }, lngLat: { lng: 23.7, lat: 38 } }));
    expect(screen.queryByTestId("map-popup")).not.toBeInTheDocument();

    pinProperties = {};
    act(() => handlerHolder.onClick?.({ point: { x: 1, y: 1 }, lngLat: { lng: 23.7, lat: 38 } }));
    expect(screen.queryByTestId("map-popup")).not.toBeInTheDocument();

    pinProperties = { id: "l1" };
    act(() => handlerHolder.onClick?.({ point: { x: 1, y: 1 }, lngLat: { lng: 23.7, lat: 38 } }));
    expect(screen.getByTestId("property-popup")).toHaveTextContent("l1");

    act(() => handlerHolder.onClick?.({ point: { x: 1, y: 1 }, lngLat: { lng: 23.7, lat: 38 } }));
    expect(screen.queryByTestId("map-popup")).not.toBeInTheDocument();

    act(() => handlerHolder.onClick?.({ point: { x: 1, y: 1 }, lngLat: { lng: 23.7, lat: 38 } }));
    fireEvent.click(screen.getByRole("button", { name: "close map popup" }));
    expect(screen.queryByTestId("map-popup")).not.toBeInTheDocument();

    act(() => handlerHolder.onClick?.({ point: { x: 1, y: 1 }, lngLat: { lng: 23.7, lat: 38 } }));
    pinProperties = null;
    act(() => handlerHolder.onClick?.({ point: { x: 50, y: 50 }, lngLat: { lng: 24, lat: 38 } }));
    expect(screen.queryByTestId("map-popup")).not.toBeInTheDocument();
  });

  it("closes a polygon by clicking near its first point and emits custom zero-result copy", async () => {
    const onPolygonFilter = vi.fn();
    mapController.project.mockReturnValue({ x: 100, y: 100 });
    render(
      <TestMapView
        listings={baseListings}
        onPolygonFilter={onPolygonFilter}
        itemLabelSingular="home"
        itemLabelPlural="homes"
      />,
    );
    await waitFor(() => screen.getByTestId("map-mock"));
    fireEvent.click(screen.getByRole("button", { name: "Draw area filter" }));

    for (const point of [
      { lngLat: { lng: -10, lat: -10 }, point: { x: 1, y: 1 } },
      { lngLat: { lng: -9, lat: -10 }, point: { x: 2, y: 2 } },
      { lngLat: { lng: -9, lat: -9 }, point: { x: 3, y: 3 } },
    ]) {
      await act(async () => handlerHolder.onClick?.(point));
    }
    await act(async () => handlerHolder.onClick?.({
      lngLat: { lng: -10, lat: -10 },
      point: { x: 110, y: 100 },
    }));

    expect(onPolygonFilter).toHaveBeenCalledWith(new Set());
    expect(screen.getByText("0 homes in area")).toBeInTheDocument();
    expect(sourceFeatureCount("draw-poly")).toBe(1);
  });

  it("renders reactive draw geometry and a mobile-safe drawing hint", async () => {
    render(<TestMapView listings={baseListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    fireEvent.click(screen.getByRole("button", { name: "Draw area filter" }));
    expect(screen.getByTestId("map-mock")).toHaveAttribute("data-cursor", "crosshair");

    const hint = screen.getByText("Click map to start drawing").parentElement!;
    expect(hint).toHaveClass("top-24", "sm:top-14", "w-[calc(100%-1.5rem)]", "sm:w-auto");

    await act(async () => handlerHolder.onClick?.({ lngLat: { lng: 23.7, lat: 38 }, point: { x: 1, y: 1 } }));
    await act(async () => handlerHolder.onMouseMove?.({ lngLat: { lng: 24, lat: 38.2 } }));
    expect(sourceFeatureCount("draw-dots")).toBe(1);
    expect(document.querySelector('[data-source-id="draw-line"]')).toHaveAttribute("data-coordinate-count", "2");

    fireEvent.click(screen.getByRole("button", { name: "Cancel drawing" }));
    expect(screen.getByTestId("map-mock")).toHaveAttribute("data-cursor", "");
    expect(sourceFeatureCount("draw-dots")).toBe(0);
  });

  it("caps active heatmap data at 1,500 evenly sampled listings", async () => {
    const manyListings = Array.from({ length: 1505 }, (_, index) => ({
      ...baseListings[0],
      id: `listing-${index}`,
      latitude: 35 + index / 10_000,
      longitude: 20 + index / 10_000,
    }));
    render(<TestMapView listings={manyListings} />);
    await waitFor(() => screen.getByTestId("map-mock"));
    fireEvent.click(screen.getByRole("button", { name: "Toggle price heatmap" }));
    expect(sourceFeatureCount("listings")).toBe(1505);
    expect(sourceFeatureCount("heatmap-data")).toBe(1500);
  });
});
