import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const heroMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  addRecentSearch: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => heroMocks.navigate };
});

vi.mock("@/lib/recentSearches", () => ({
  addRecentSearch: heroMocks.addRecentSearch,
}));

vi.mock("@/lib/professionalServiceCatalog", () => ({
  getProfessionalSearchSuggestions: () => [
    { category: "lawyer", label: "Lawyer" },
    { category: "property_manager", label: "Property Management" },
  ],
}));

vi.mock("@/components/index/LocationInput", () => ({
  LocationInput: ({
    value,
    onChange,
    onSearch,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSearch: (value?: string, selection?: {
      value: string;
      latitude?: string;
      longitude?: string;
      radiusM?: number;
    }) => void;
  }) => (
    <div>
      <input
        aria-label="Location test input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button onClick={() => onSearch()}>commit location</button>
      <button onClick={() => onSearch(" Glyfada ", {
        value: "Glyfada",
        latitude: "37.86",
        longitude: "23.75",
      })}>
        choose geocoded default radius
      </button>
      <button onClick={() => onSearch(" Piraeus ", {
        value: "Piraeus",
        latitude: "37.94",
        longitude: "23.64",
        radiusM: 1200,
      })}>
        choose geocoded radius
      </button>
      <button onClick={() => onSearch(" Incomplete geocode ", {
        value: "Incomplete geocode",
        latitude: "",
        longitude: "23.64",
      })}>
        choose incomplete geocode
      </button>
    </div>
  ),
}));

vi.mock("@/components/index/ServiceInput", () => ({
  ServiceInput: ({
    value,
    onChange,
    onSearch,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSearch: (category: string) => void;
  }) => (
    <div>
      <input
        aria-label="Professional test input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button onClick={() => onChange("Lawyer")}>choose lawyer label</button>
      <button onClick={() => onSearch("property_manager")}>choose professional category</button>
    </div>
  ),
}));

vi.mock("@/components/index/PropertyTypeDropdown", () => ({
  PropertyTypeDropdown: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label="Property type test input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">All</option>
      <option value="villa">Villa</option>
    </select>
  ),
}));

vi.mock("@/components/index/AISearchModal", () => ({
  AISearchModal: ({
    onFiltersApplied,
    onClose,
  }: {
    onFiltersApplied: (filters: Record<string, unknown>) => void;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="AI test modal">
      <button onClick={() => onFiltersApplied({
        city: "  Athens  ",
        listing_type: "rent",
        property_type: " apartment ",
        price_min: "-25.6",
        price_max: 2_000_000_000,
        beds_min: "3.6",
        sqm_min: 150.2,
        features: ["pool", 42, "sea view"],
      })}>
        apply full filters
      </button>
      <button onClick={() => onFiltersApplied({
        city: 42,
        listing_type: "auction",
        property_type: "x".repeat(85),
        price_min: 250_000,
        beds_min: 0,
        sqm_min: "0",
        features: Array.from({ length: 35 }, (_, index) => `feature-${index}`),
      })}>
        apply bounded filters
      </button>
      <button onClick={() => onFiltersApplied({
        price_min: null,
        price_max: "500000",
        features: [false],
      })}>
        apply max only
      </button>
      <button onClick={() => onFiltersApplied({
        listing_type: "lease",
        price_min: "invalid",
        price_max: Number.POSITIVE_INFINITY,
        beds_min: null,
        sqm_min: {},
        features: "pool",
      })}>
        apply invalid filters
      </button>
      <button onClick={onClose}>close AI</button>
    </div>
  ),
}));

vi.mock("@/components/MarketTicker", () => ({
  MarketTicker: () => <aside data-testid="market-ticker">Market ticker</aside>,
}));

import { HeroSection } from "@/components/index/HeroSection";

function stubMatchMedia({ desktop = false, reducedMotion = false } = {}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("min-width") ? desktop : reducedMotion,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderHero() {
  return render(<HeroSection />);
}

beforeEach(() => {
  vi.clearAllMocks();
  stubMatchMedia();
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
  Object.defineProperty(window, "requestIdleCallback", { configurable: true, value: undefined });
  Object.defineProperty(window, "cancelIdleCallback", { configurable: true, value: undefined });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HeroSection business search modes", () => {
  it("builds a buy search from trimmed location and property type and records the recent search", () => {
    renderHero();

    fireEvent.change(screen.getByLabelText("Location test input"), { target: { value: "  Athens  " } });
    fireEvent.change(screen.getByLabelText("Property type test input"), { target: { value: "villa" } });
    fireEvent.click(screen.getByRole("button", { name: "Search properties" }));

    expect(heroMocks.addRecentSearch).toHaveBeenCalledWith("Athens");
    expect(heroMocks.navigate).toHaveBeenCalledWith("/listings?city=Athens&type=villa&listing_type=sale");
  });

  it("preserves geocoded selection data with default and explicit search radii", () => {
    renderHero();

    fireEvent.click(screen.getByRole("button", { name: "choose geocoded default radius" }));
    expect(heroMocks.navigate).toHaveBeenLastCalledWith(
      "/listings?city=Glyfada&location_lat=37.86&location_lng=23.75&location_radius_m=750&listing_type=sale",
    );

    fireEvent.click(screen.getByRole("button", { name: "choose geocoded radius" }));
    expect(heroMocks.navigate).toHaveBeenLastCalledWith(
      "/listings?city=Piraeus&location_lat=37.94&location_lng=23.64&location_radius_m=1200&listing_type=sale",
    );

    fireEvent.click(screen.getByRole("button", { name: "choose incomplete geocode" }));
    expect(heroMocks.navigate).toHaveBeenLastCalledWith("/listings?city=Incomplete+geocode&listing_type=sale");
  });

  it("builds an empty-location rent search without polluting recent searches", () => {
    renderHero();

    fireEvent.click(screen.getByRole("button", { name: /Rent/i }));
    fireEvent.click(screen.getByRole("button", { name: "Search properties" }));

    expect(heroMocks.addRecentSearch).not.toHaveBeenCalled();
    expect(heroMocks.navigate).toHaveBeenCalledWith("/listings?listing_type=rent");
  });

  it("switches to the professional-only mobile search controls and resolves a selected label", () => {
    renderHero();

    fireEvent.click(screen.getByRole("button", { name: /Professionals/i }));
    expect(screen.queryByLabelText("Property type test input")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI-powered search" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "choose lawyer label" }));
    fireEvent.click(screen.getByRole("button", { name: "Search professionals" }));

    expect(heroMocks.navigate).toHaveBeenLastCalledWith("/professionals?category=lawyer");
  });

  it.each([
    ["property manager", "/professionals?category=property_manager"],
    ["LAWYER", "/professionals?category=lawyer"],
    ["  conveyancing expert  ", "/professionals?search=conveyancing+expert"],
    ["   ", "/professionals?"],
  ])("routes professional query %j using the matching business rule", (query, expectedPath) => {
    renderHero();
    fireEvent.click(screen.getByRole("button", { name: /Professionals/i }));
    fireEvent.change(screen.getByLabelText("Professional test input"), { target: { value: query } });
    fireEvent.click(screen.getByRole("button", { name: "Search professionals" }));
    expect(heroMocks.navigate).toHaveBeenLastCalledWith(expectedPath);
  });

  it("routes a professional suggestion directly by canonical category", () => {
    renderHero();
    fireEvent.click(screen.getByRole("button", { name: /Professionals/i }));
    fireEvent.click(screen.getByRole("button", { name: "choose professional category" }));
    expect(heroMocks.navigate).toHaveBeenCalledWith("/professionals?category=property_manager");
  });
});

describe("HeroSection AI filter boundaries", () => {
  it("normalizes valid AI filters, clamps unsafe numeric values, and drops non-string features", () => {
    renderHero();
    fireEvent.click(screen.getByRole("button", { name: "AI-powered search" }));
    fireEvent.click(screen.getByRole("button", { name: "apply full filters" }));

    expect(heroMocks.navigate).toHaveBeenLastCalledWith(
      "/listings?city=Athens&listing_type=rent&type=apartment&price=0-1000000000&beds_min=4&sqm_min=150&features=pool%2Csea+view",
    );
  });

  it("uses default maximums, truncates strings and feature lists, and ignores unsupported listing modes", () => {
    renderHero();
    fireEvent.click(screen.getByRole("button", { name: "AI-powered search" }));
    fireEvent.click(screen.getByRole("button", { name: "apply bounded filters" }));

    const destination = heroMocks.navigate.mock.calls.at(-1)?.[0] as string;
    const params = new URL(destination, "https://maiprop.test").searchParams;
    expect(params.get("listing_type")).toBeNull();
    expect(params.get("type")).toHaveLength(80);
    expect(params.get("price")).toBe("250000-1000000000");
    expect(params.get("beds_min")).toBeNull();
    expect(params.get("sqm_min")).toBeNull();
    expect(params.get("features")?.split(",")).toHaveLength(30);
  });

  it("supports max-only price searches and emits no malformed filters", () => {
    renderHero();
    fireEvent.click(screen.getByRole("button", { name: "AI-powered search" }));
    fireEvent.click(screen.getByRole("button", { name: "apply max only" }));
    expect(heroMocks.navigate).toHaveBeenLastCalledWith("/listings?price=0-500000");

    fireEvent.click(screen.getByRole("button", { name: "apply invalid filters" }));
    expect(heroMocks.navigate).toHaveBeenLastCalledWith("/listings?");
  });

  it("opens and closes the AI search without changing route", () => {
    renderHero();
    fireEvent.click(screen.getByRole("button", { name: "AI-powered search" }));
    expect(screen.getByRole("dialog", { name: "AI test modal" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "close AI" }));
    expect(screen.queryByRole("dialog", { name: "AI test modal" })).not.toBeInTheDocument();
    expect(heroMocks.navigate).not.toHaveBeenCalled();
  });
});

describe("HeroSection constrained-device rendering", () => {
  it("keeps the mobile hero poster-only and does not schedule desktop media", () => {
    vi.useFakeTimers();
    const { container } = renderHero();
    act(() => vi.runOnlyPendingTimers());

    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("preload", "none");
    expect(video.querySelectorAll("source")).toHaveLength(0);
    expect(screen.queryByTestId("market-ticker")).not.toBeInTheDocument();
  });

  it("keeps video disabled for data-saving desktop users while still deferring market data", async () => {
    vi.useFakeTimers();
    stubMatchMedia({ desktop: true });
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    const { container } = renderHero();

    await act(async () => {
      vi.advanceTimersByTime(1700);
      await Promise.resolve();
    });

    expect(container.querySelector("video source")).toBeNull();
    expect(screen.getByTestId("market-ticker")).toBeInTheDocument();
  });

  it("uses idle callbacks on desktop and cancels both deferred jobs on cleanup", async () => {
    vi.useFakeTimers();
    stubMatchMedia({ desktop: true });
    const cancelIdle = vi.fn();
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: vi.fn((callback: IdleRequestCallback) => {
        callback({ didTimeout: false, timeRemaining: () => 10 });
        return 7;
      }),
    });
    Object.defineProperty(window, "cancelIdleCallback", { configurable: true, value: cancelIdle });

    const { container, unmount } = renderHero();
    await act(async () => {
      vi.advanceTimersByTime(900);
      await Promise.resolve();
    });

    expect(container.querySelector("video")).toHaveAttribute("preload", "metadata");
    expect(container.querySelectorAll("video source")).toHaveLength(2);
    expect(screen.getByTestId("market-ticker")).toBeInTheDocument();

    unmount();
    expect(cancelIdle).toHaveBeenCalledTimes(2);
    expect(cancelIdle).toHaveBeenNthCalledWith(1, 7);
  });
});
