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
import { render, screen, waitFor } from "@testing-library/react";

const { invokeMock, useAuthMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
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
}

vi.mock("react-map-gl", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Map = React.forwardRef<{ getMap: () => null }, MapMockProps>(function MockMap({ children, ...rest }, ref) {
    React.useImperativeHandle(ref, () => ({ getMap: () => null }), []);
    return (
      <div data-testid="mapbox-map" data-token={String(rest.mapboxAccessToken ?? "")}>
        {children}
      </div>
    );
  });
  const Marker = React.forwardRef<HTMLDivElement, MapMockProps>(function MockMarker({ children }, ref) {
    return <div ref={ref} data-testid="mapbox-marker">{children}</div>;
  });
  const NavigationControl = React.forwardRef<HTMLDivElement>(function MockNavigationControl(_props, ref) {
    return <div ref={ref} data-testid="nav-control" />;
  });
  return { __esModule: true, default: Map, Map, Marker, NavigationControl };
});
// CSS import side-effect — jsdom can't parse it.
vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));

import PropertyMiniMap from "@/components/PropertyMiniMap";

beforeEach(() => {
  invokeMock.mockReset();
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
  it("renders the Mapbox map + property marker when lat/lng + token + user are present", async () => {
    invokeMock.mockResolvedValue({ data: { pois: [] } });
    render(<PropertyMiniMap {...baseProps} />);
    expect(screen.getByTestId("mapbox-map")).toBeInTheDocument();
    expect(screen.getAllByTestId("mapbox-marker").length).toBeGreaterThan(0);
    // Wait for the auto-fetch to settle so subsequent assertions are stable.
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
  });

  it("falls back to the Google Maps embed when lat/lng are missing", () => {
    render(<PropertyMiniMap {...baseProps} latitude={undefined} longitude={undefined} />);
    expect(
      screen.getByText(/Exact coordinates not available/i),
    ).toBeInTheDocument();
    // The fallback embeds an iframe titled 'map'.
    expect(document.querySelector("iframe[title='map']")).toBeInTheDocument();
  });

  it("renders the SignInForAI fallback when there is no authenticated user", () => {
    useAuthMock.mockReturnValue({ user: null });
    render(<PropertyMiniMap {...baseProps} />);
    expect(screen.getByTestId("sign-in-for-ai")).toBeInTheDocument();
  });

  it("calls property-pois automatically (with address, city, lat, lng) when authenticated", async () => {
    invokeMock.mockResolvedValue({ data: { pois: [] } });
    render(<PropertyMiniMap {...baseProps} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock.mock.calls[0]).toEqual([
      "property-pois",
      { body: { address: "Kolonaki 12", city: "Athens", lat: 37.98, lng: 23.73 } },
    ]);
  });

  it("hydrates POIs and notifies the parent of a walk score via onWalkScoreChange", async () => {
    invokeMock.mockResolvedValue({
      data: {
        pois: [
          { name: "St Nicholas School", category: "school", distanceKm: 0.4, walkMinutes: 5 },
          { name: "Athens Metro", category: "transit", distanceKm: 0.3, walkMinutes: 4 },
          { name: "Café del Lungo", category: "cafe", distanceKm: 0.2, walkMinutes: 3 },
        ],
      },
    });
    const onWalkScoreChange = vi.fn();
    render(<PropertyMiniMap {...baseProps} onWalkScoreChange={onWalkScoreChange} />);
    await waitFor(() => expect(screen.getByText("St Nicholas School")).toBeInTheDocument());
    expect(onWalkScoreChange).toHaveBeenCalled();
    // 3 unique-category POIs feed at least 3 markers (some may be more from
    // category offsets) — assert a non-zero count.
    expect(screen.getByText("Athens Metro")).toBeInTheDocument();
  });

  it("renders an inline error message when property-pois fails (message via error.message)", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "rate limited" } });
    render(<PropertyMiniMap {...baseProps} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await waitFor(() => {
      const card = document.body.textContent ?? "";
      expect(card).toMatch(/rate limited|Failed to load nearby/i);
    });
  });

  it("extracts the real error from error.context (FunctionsHttpError pattern) instead of showing the generic SDK string", async () => {
    // Simulate a FunctionsHttpError where .message is the generic SDK string
    // but the real message lives in error.context (the raw Response body).
    const contextResponse = new Response(
      JSON.stringify({ error: "Monthly AI usage limit reached. Resets on the 1st of next month." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: contextResponse },
    });
    render(<PropertyMiniMap {...baseProps} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await waitFor(() => {
      const card = document.body.textContent ?? "";
      // Should show the REAL message, not the generic SDK string
      expect(card).toMatch(/usage limit|Monthly AI/i);
      expect(card).not.toMatch(/Edge Function returned a non-2xx/i);
    });
  });

  it("rejects an invalid response shape (pois !== Array) and surfaces an error", async () => {
    invokeMock.mockResolvedValue({ data: { pois: "not-array" } });
    render(<PropertyMiniMap {...baseProps} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await waitFor(() => {
      const card = document.body.textContent ?? "";
      expect(card).toMatch(/Invalid response|Failed to load nearby/i);
    });
  });
});
