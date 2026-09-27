/**
 * Tests for PropertyMiniMap — Mapbox-driven map + POI panel + AI insights.
 *
 * react-map-gl + mapbox-gl are unusable in jsdom (they need WebGL). We stub
 * Map/Marker/NavigationControl with simple wrappers and assert the
 * component's data/decision logic: walkscore card, POI category grouping,
 * loading + error branches, sign-in fallback for unauthenticated users.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { fromMock, invokeMock, useAuthMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  invokeMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...a: unknown[]) => fromMock(...a),
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/lib/config", () => ({ MAPBOX_TOKEN: "pk.test.token" }));
vi.mock("@/components/SignInForAI", () => ({
  SignInForAI: () => <div data-testid="sign-in-for-ai">SIGN-IN-FOR-AI</div>,
}));

// Stub react-map-gl primitives — jsdom can't run WebGL.
interface MapMockProps {
  children?: React.ReactNode;
  mapboxAccessToken?: unknown;
  latitude?: number;
  longitude?: number;
  onLoad?: () => void;
}

vi.mock("react-map-gl", () => {
  const Map = React.forwardRef<{ getMap: () => null }, MapMockProps>(function MockMap({ children, onLoad, ...rest }, ref) {
    React.useImperativeHandle(ref, () => ({ getMap: () => null }), []);
    React.useEffect(() => {
      onLoad?.();
    }, [onLoad]);
    return (
      <div data-testid="mapbox-map" data-token={String(rest.mapboxAccessToken ?? "")}>
        {children}
      </div>
    );
  });
  const Marker = React.forwardRef<HTMLDivElement, MapMockProps>(function MockMarker({ children, latitude, longitude }, ref) {
    return <div ref={ref} data-testid="mapbox-marker" data-latitude={latitude} data-longitude={longitude}>{children}</div>;
  });
  const NavigationControl = React.forwardRef<HTMLDivElement>(function MockNavigationControl(_props, ref) {
    return <div ref={ref} data-testid="nav-control" />;
  });
  return { __esModule: true, default: Map, Map, Marker, NavigationControl };
});
// CSS import side-effect — jsdom can't parse it.
vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));

import PropertyMiniMap from "@/components/PropertyMiniMap";

type InvokeResult = { data?: unknown; error?: unknown };

let quotaInvokeResult: InvokeResult;
let poisInvokeResult: InvokeResult;

const suggestionResponse = (pois: unknown[]) => ({
  responseVersion: 2,
  pois,
  generatedBy: "ai",
  warning: "AI-generated nearby-place suggestions are not independently verified. Confirm names and distances before relying on them.",
  provenance: {
    source: "ai_model_suggestion",
    independentlyVerified: false,
    coordinatesProvided: false,
  },
});

const invokeCallsFor = (functionName: string) =>
  invokeMock.mock.calls.filter((call: unknown[]) => call[0] === functionName);

beforeEach(() => {
  invokeMock.mockReset();
  fromMock.mockReset();
  quotaInvokeResult = {
    data: { allowed: true, reason: null, used: 1, limit: 5, remaining: 4 },
    error: null,
  };
  poisInvokeResult = {
    data: suggestionResponse([
      { name: "Possible nearby cafe", category: "cafe", distanceKm: 0.2, walkMinutes: 3 },
    ]),
    error: null,
  };
  invokeMock.mockImplementation(async (functionName: string) => {
    if (functionName === "ai-quota-status") return quotaInvokeResult;
    return poisInvokeResult;
  });
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
});

const baseProps = {
  title: "Athens 3-bed",
  address: "Kolonaki 12",
  city: "Athens",
  latitude: 37.98,
  longitude: 23.73,
};

describe("PropertyMiniMap", () => {
  it("retains the unverified qualifier through a pending refresh and its failure", async () => {
    render(<PropertyMiniMap {...baseProps} />);
    expect(await screen.findByText("Possible nearby cafe")).toBeInTheDocument();
    expect(screen.getByText(/not independently verified/i)).toBeInTheDocument();
    let finish!: (value: InvokeResult) => void;
    invokeMock.mockImplementation((name: string) => name === "ai-quota-status"
      ? Promise.resolve(quotaInvokeResult)
      : new Promise<InvokeResult>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.getByText("Possible nearby cafe")).toBeInTheDocument();
    expect(screen.getByText(/not independently verified/i)).toBeInTheDocument();
    await act(async () => finish({ error: new Error("refresh unavailable") }));
    expect(await screen.findByText("refresh unavailable")).toBeInTheDocument();
    expect(screen.getByText("Possible nearby cafe")).toBeInTheDocument();
    expect(screen.getByText(/not independently verified/i)).toBeInTheDocument();
  });
  it("renders the Mapbox map + property marker when lat/lng + token + user are present", async () => {
    render(<PropertyMiniMap {...baseProps} />);
    expect(await screen.findByTestId("mapbox-map")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId("mapbox-marker").length).toBeGreaterThan(0));
    // Wait for the auto-fetch to settle so subsequent assertions are stable.
    await waitFor(() => expect(invokeCallsFor("property-pois")).toHaveLength(1));
  });

  it("defers Mapbox loading until the map area is near the viewport", async () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const originalIntersectionObserver = window.IntersectionObserver;
    let triggerIntersect: ((entries: Partial<IntersectionObserverEntry>[]) => void) | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const MockIntersectionObserver = vi.fn(function MockIntersectionObserver(callback: IntersectionObserverCallback) {
      triggerIntersect = (entries) => callback(entries as IntersectionObserverEntry[], {} as IntersectionObserver);
      return { observe, unobserve: vi.fn(), disconnect, takeRecords: () => [] } as unknown as IntersectionObserver;
    });

    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 2000,
        top: 2000,
        bottom: 2250,
        left: 0,
        right: 100,
        width: 100,
        height: 250,
        toJSON: () => ({}),
      }),
    });
    window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

    try {
      render(<PropertyMiniMap {...baseProps} />);
      expect(await screen.findByText(/Map loads when visible/i)).toBeInTheDocument();
      expect(screen.queryByTestId("mapbox-map")).not.toBeInTheDocument();
      expect(observe).toHaveBeenCalled();
      expect(invokeCallsFor("ai-quota-status")).toHaveLength(0);
      expect(invokeCallsFor("property-pois")).toHaveLength(0);

      act(() => triggerIntersect?.([{ isIntersecting: true }]));
      expect(await screen.findByTestId("mapbox-map")).toBeInTheDocument();
      expect(disconnect).toHaveBeenCalled();
      await waitFor(() => expect(invokeCallsFor("property-pois")).toHaveLength(1));
      await waitFor(() => expect(invokeCallsFor("ai-quota-status")).toHaveLength(2));
    } finally {
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: originalRect,
      });
      window.IntersectionObserver = originalIntersectionObserver;
    }
  });

  it("falls back to the Google Maps embed when lat/lng are missing", () => {
    render(<PropertyMiniMap {...baseProps} latitude={undefined} longitude={undefined} />);
    expect(
      screen.getByText(/Exact coordinates not available/i),
    ).toBeInTheDocument();
    // The fallback embeds an iframe titled 'map'.
    expect(document.querySelector("iframe[title='map']")).toBeInTheDocument();
    expect(document.querySelector("iframe[title='map']")?.getAttribute("src")).toContain("Kolonaki%2012");
  });

  it("keeps the no-coordinates header responsive on narrow screens", () => {
    render(<PropertyMiniMap {...baseProps} latitude={undefined} longitude={undefined} />);

    const heading = screen.getByText("Location & Nearby");
    const header = heading.closest("[data-property-map-header]");
    expect(header).toHaveClass("flex-col");
    expect(header).toHaveClass("sm:flex-row");
    expect(heading).toHaveClass("break-words");
    expect(heading).toHaveClass("w-full");
    expect(screen.getByRole("button", { name: /Open in Maps/i })).toHaveClass("whitespace-nowrap");
  });

  it("keeps the coordinates header from crushing the title beside map action buttons", async () => {
    render(<PropertyMiniMap {...baseProps} />);

    const heading = await screen.findByText("Location & Nearby Places");
    const header = heading.closest("[data-property-map-header]");
    const actions = header?.querySelector("[data-property-map-actions]");
    expect(header).toHaveClass("flex-col");
    expect(header).toHaveClass("sm:flex-row");
    expect(heading).toHaveClass("w-full");
    expect(actions).toHaveClass("grid");
    expect(actions).toHaveClass("w-full");
    expect(actions).toHaveClass("min-[380px]:grid-cols-2");
  });

  it("renders the SignInForAI fallback when there is no authenticated user", () => {
    useAuthMock.mockReturnValue({ user: null });
    render(<PropertyMiniMap {...baseProps} />);
    expect(screen.getByTestId("sign-in-for-ai")).toBeInTheDocument();
  });

  it("calls property-pois automatically (with address, city, lat, lng) when authenticated", async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PropertyMiniMap {...baseProps} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(invokeCallsFor("property-pois")).toHaveLength(1));
    expect(invokeMock).toHaveBeenCalledWith("ai-quota-status", {
      body: { bucket: "property-pois" },
      timeout: 4_000,
    });
    expect(invokeCallsFor("property-pois")[0]).toEqual([
      "property-pois",
      { body: { responseVersion: 2, address: "Kolonaki 12", city: "Athens", lat: 37.98, lng: 23.73 } },
    ]);
  });

  it("renders qualified model suggestions without deriving, displaying, or writing a walk score", async () => {
    poisInvokeResult = {
      data: suggestionResponse([
          { name: "St Nicholas School", category: "school", distanceKm: 0.4, walkMinutes: 5 },
          { name: "Athens Metro", category: "transit", distanceKm: 0.3, walkMinutes: 4 },
          { name: "Café del Lungo", category: "cafe", distanceKm: 0.2, walkMinutes: 3 },
        ]),
      error: null,
    };
    render(<PropertyMiniMap {...baseProps} />);
    await waitFor(() => expect(screen.getByText("St Nicholas School")).toBeInTheDocument());
    expect(screen.getByText("Athens Metro")).toBeInTheDocument();
    expect(screen.getByText(/not independently verified/i)).toBeInTheDocument();
    expect(screen.queryByText(/Walk Score · out of 100/i)).not.toBeInTheDocument();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("keeps the sourced property marker stable while suggestion filters change", async () => {
    poisInvokeResult = {
      data: suggestionResponse([
          { name: "St Nicholas School", category: "school", distanceKm: 0.4, walkMinutes: 5 },
          { name: "Athens Metro", category: "transit", distanceKm: 0.3, walkMinutes: 4 },
          { name: "Cafe del Lungo", category: "cafe", distanceKm: 0.2, walkMinutes: 3 },
        ]),
      error: null,
    };

    render(<PropertyMiniMap {...baseProps} />);
    await waitFor(() => expect(screen.getByText("St Nicholas School")).toBeInTheDocument());
    const markerBefore = screen.getAllByTestId("mapbox-marker");
    expect(markerBefore).toHaveLength(1);
    expect(markerBefore[0]).toHaveAttribute("data-latitude", "37.98");
    expect(markerBefore[0]).toHaveAttribute("data-longitude", "23.73");

    fireEvent.click(screen.getByRole("button", { name: /Caf/i }));

    expect(screen.queryByText("St Nicholas School")).not.toBeInTheDocument();
    expect(screen.queryByText("Athens Metro")).not.toBeInTheDocument();
    expect(screen.getByText("Cafe del Lungo")).toBeInTheDocument();
    const markerAfter = screen.getAllByTestId("mapbox-marker");
    expect(markerAfter).toHaveLength(1);
    expect(markerAfter[0]).toHaveAttribute("data-latitude", "37.98");
    expect(markerAfter[0]).toHaveAttribute("data-longitude", "23.73");
  });

  it("accepts zero-valued source coordinates without treating them as missing", async () => {
    render(<PropertyMiniMap {...baseProps} latitude={0} longitude={0} />);
    expect(await screen.findByTestId("mapbox-map")).toBeInTheDocument();
    await waitFor(() => expect(invokeCallsFor("property-pois")).toHaveLength(1));
    expect(invokeCallsFor("property-pois")[0]).toEqual([
      "property-pois",
      { body: { responseVersion: 2, address: "Kolonaki 12", city: "Athens", lat: 0, lng: 0 } },
    ]);
  });

  it("ignores a late POI response after the property location changes", async () => {
    let resolveAthens: ((value: InvokeResult) => void) | undefined;
    const athensResponse = new Promise<InvokeResult>((resolve) => { resolveAthens = resolve; });
    invokeMock.mockImplementation(async (functionName: string, options?: { body?: { city?: string } }) => {
      if (functionName === "ai-quota-status") return quotaInvokeResult;
      if (options?.body?.city === "Athens") return athensResponse;
      return {
        data: suggestionResponse([
          { name: "Piraeus suggestion", category: "transit", distanceKm: 0.3, walkMinutes: 4 },
        ]),
        error: null,
      };
    });

    const { rerender } = render(<PropertyMiniMap {...baseProps} />);
    await waitFor(() => expect(invokeCallsFor("property-pois")).toHaveLength(1));
    rerender(<PropertyMiniMap {...baseProps} address="Piraeus 1" city="Piraeus" latitude={37.94} longitude={23.64} />);
    expect(await screen.findByText("Piraeus suggestion")).toBeInTheDocument();

    await act(async () => {
      resolveAthens?.({
        data: suggestionResponse([
          { name: "Stale Athens suggestion", category: "cafe", distanceKm: 0.2, walkMinutes: 3 },
        ]),
        error: null,
      });
      await athensResponse;
    });
    expect(screen.queryByText("Stale Athens suggestion")).not.toBeInTheDocument();
    expect(screen.getByText("Piraeus suggestion")).toBeInTheDocument();
  });

  it("renders an inline error message when property-pois fails (message via error.message)", async () => {
    poisInvokeResult = { data: null, error: { message: "rate limited" } };
    render(<PropertyMiniMap {...baseProps} />);
    await waitFor(() => expect(invokeCallsFor("property-pois")).toHaveLength(1));
    await waitFor(() => {
      const card = document.body.textContent ?? "";
      expect(card).toMatch(/rate limited|Failed to load nearby/i);
    });
  });

  it("shows the quota counter and upgrade CTA instead of calling property-pois when the cap is reached", async () => {
    quotaInvokeResult = {
      data: { allowed: false, reason: "monthly_limit_reached", used: 5, limit: 5, remaining: 0 },
      error: null,
    };
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PropertyMiniMap {...baseProps} />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/5 \/ 5 used/i)).toBeInTheDocument();
    expect(screen.getByText(/Monthly cap reached/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upgrade/i })).toHaveAttribute("href", "/pricing");
    expect(invokeCallsFor("property-pois")).toHaveLength(0);
  });

  it("rejects an invalid response shape (pois !== Array) and surfaces an error", async () => {
    poisInvokeResult = { data: { pois: "not-array" }, error: null };
    render(<PropertyMiniMap {...baseProps} />);
    await waitFor(() => expect(invokeCallsFor("property-pois")).toHaveLength(1));
    await waitFor(() => {
      const card = document.body.textContent ?? "";
      expect(card).toMatch(/Invalid response|Failed to load nearby/i);
    });
  });

  it("rejects legacy fallback and malformed suggestion payloads as unavailable SDK input", async () => {
    for (const data of [
      {
        pois: [{ name: "School proximity estimate", category: "school", distanceKm: 0.4, walkMinutes: 5, isFallbackEstimate: true }],
        generatedBy: "fallback",
      },
      suggestionResponse([
        { name: "Impossible distance", category: "school", distanceKm: Number.POSITIVE_INFINITY, walkMinutes: 5 },
      ]),
    ]) {
      poisInvokeResult = { data, error: null };
      const { unmount } = render(<PropertyMiniMap {...baseProps} />);
      await waitFor(() => expect(document.body.textContent).toMatch(/Failed to load nearby places/i));
      expect(screen.queryByText("School proximity estimate")).not.toBeInTheDocument();
      expect(screen.queryByText("Impossible distance")).not.toBeInTheDocument();
      expect(screen.queryByText(/Walk Score · out of 100/i)).not.toBeInTheDocument();
      unmount();
      invokeMock.mockClear();
    }
  });
});
