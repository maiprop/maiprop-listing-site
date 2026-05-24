/**
 * Unit tests for AuctionFiltersPanel component.
 * Covers: hidden state, filter panel visibility, accessibility (htmlFor/id),
 * ChevronDown icons, premium locked vs unlocked states, and active filter chips.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { AuctionFiltersPanel } from "@/components/auctions/AuctionFiltersPanel";

const ROUND_OPTIONS = [
  { value: "", label: "All Rounds" },
  { value: "1", label: "1st Auction" },
  { value: "2", label: "2nd Auction" },
  { value: "3plus", label: "3rd+ Auction" },
];

interface PanelProps {
  showFilters?: boolean;
  selectedCity?: string;
  setSelectedCity?: (v: string) => void;
  filterType?: string;
  setFilterType?: (v: string) => void;
  filterBidRange?: string;
  setFilterBidRange?: (v: string) => void;
  filterYearRange?: string;
  setFilterYearRange?: (v: string) => void;
  filterOwnership?: string;
  setFilterOwnership?: (v: string) => void;
  filterRound?: string;
  setFilterRound?: (v: string) => void;
  filterYield?: string;
  setFilterYield?: (v: string) => void;
  isPro?: boolean;
  isMaiPropOsUser?: boolean;
  activeFilterCount?: number;
  clearFilters?: () => void;
}

const renderPanel = (overrides: PanelProps = {}) => {
  const props = {
    showFilters: false,
    selectedCity: "All Cities",
    setSelectedCity: vi.fn(),
    cityOptions: ["All Cities", "Athens", "Thessaloniki"],
    filterType: "",
    setFilterType: vi.fn(),
    filterBidRange: "",
    setFilterBidRange: vi.fn(),
    filterYearRange: "",
    setFilterYearRange: vi.fn(),
    filterOwnership: "",
    setFilterOwnership: vi.fn(),
    filterRound: "",
    setFilterRound: vi.fn(),
    filterYield: "",
    setFilterYield: vi.fn(),
    roundOptions: ROUND_OPTIONS,
    isPro: false,
    isMaiPropOsUser: false,
    activeFilterCount: 0,
    clearFilters: vi.fn(),
    ...overrides,
  };
  return renderWithProviders(<AuctionFiltersPanel {...props} />);
};

// ── hidden state ──────────────────────────────────────────────────────────────

describe("AuctionFiltersPanel — hidden state", () => {
  it("renders nothing when showFilters=false and no active filters", () => {
    const { container } = renderPanel({ showFilters: false, activeFilterCount: 0 });
    expect(container.firstChild).toBeNull();
  });

  it("shows active-filter chips when showFilters=false but activeFilterCount > 0", () => {
    renderPanel({ showFilters: false, activeFilterCount: 1, filterType: "apartment" });
    expect(screen.getByText(/Active:/)).toBeInTheDocument();
    expect(screen.getByText(/apartment/i)).toBeInTheDocument();
  });
});

// ── filter panel visibility ───────────────────────────────────────────────────

describe("AuctionFiltersPanel — filter panel", () => {
  it("shows filter panel when showFilters=true", () => {
    renderPanel({ showFilters: true });
    expect(screen.getByText("Auction Filters")).toBeInTheDocument();
    expect(screen.getByText("Standard Filters")).toBeInTheDocument();
  });

  it("shows 'Clear all' button in header when active filters exist", () => {
    renderPanel({ showFilters: true, activeFilterCount: 2 });
    expect(screen.getByRole("button", { name: /Clear all/i })).toBeInTheDocument();
  });

  it("does not show 'Clear all' in header when no active filters", () => {
    renderPanel({ showFilters: true, activeFilterCount: 0 });
    // "Clear all" button should not appear in the header area (only chips area has it)
    const buttons = screen.queryAllByRole("button", { name: /Clear all/i });
    expect(buttons).toHaveLength(0);
  });
});

// ── accessibility (htmlFor / id pairs) ───────────────────────────────────────

describe("AuctionFiltersPanel — accessibility", () => {
  it("City label is associated with City select via htmlFor/id", () => {
    renderPanel({ showFilters: true });
    const label = screen.getByText("City");
    expect(label).toHaveAttribute("for", "filter-city");
    const select = document.getElementById("filter-city");
    expect(select).toBeInTheDocument();
    expect(select?.tagName).toBe("SELECT");
  });

  it("Property Type label is associated with its select", () => {
    renderPanel({ showFilters: true });
    const label = screen.getByText("Property Type");
    expect(label).toHaveAttribute("for", "filter-type");
    expect(document.getElementById("filter-type")).toBeInTheDocument();
  });

  it("First Offer Price label is associated with its select", () => {
    renderPanel({ showFilters: true });
    expect(screen.getByText("First Offer Price")).toHaveAttribute("for", "filter-bid");
    expect(document.getElementById("filter-bid")).toBeInTheDocument();
  });

  it("Construction Year label is associated with its select", () => {
    renderPanel({ showFilters: true });
    expect(screen.getByText("Construction Year")).toHaveAttribute("for", "filter-year");
    expect(document.getElementById("filter-year")).toBeInTheDocument();
  });

  it("premium selects have htmlFor/id when Pro user", () => {
    renderPanel({ showFilters: true, isPro: true });
    expect(document.getElementById("filter-ownership")).toBeInTheDocument();
    expect(document.getElementById("filter-round")).toBeInTheDocument();
    expect(document.getElementById("filter-yield")).toBeInTheDocument();
  });
});

// ── premium locked / unlocked ─────────────────────────────────────────────────

describe("AuctionFiltersPanel — premium tiers", () => {
  it("shows locked state for free (non-Pro) users", () => {
    renderPanel({ showFilters: true, isPro: false, isMaiPropOsUser: false });
    // Multiple elements may contain "Upgrade to Pro" — confirm at least one exists
    expect(screen.getAllByText(/Upgrade to Pro/i).length).toBeGreaterThan(0);
    // Premium select inputs must NOT be present
    expect(document.getElementById("filter-ownership")).toBeNull();
  });

  it("shows premium selects for Pro users", () => {
    renderPanel({ showFilters: true, isPro: true });
    expect(document.getElementById("filter-ownership")).toBeInTheDocument();
    expect(document.getElementById("filter-round")).toBeInTheDocument();
    expect(document.getElementById("filter-yield")).toBeInTheDocument();
    expect(screen.queryByText(/Upgrade to Pro/i)).toBeNull();
  });

  it("shows premium selects for OS (admin) users even when isPro=false", () => {
    renderPanel({ showFilters: true, isPro: false, isMaiPropOsUser: true });
    expect(document.getElementById("filter-ownership")).toBeInTheDocument();
    expect(screen.queryByText(/Upgrade to Pro/i)).toBeNull();
  });
});

// ── select onChange wiring ────────────────────────────────────────────────────

describe("AuctionFiltersPanel — select interaction", () => {
  it("calls setSelectedCity when city dropdown changes", () => {
    const setSelectedCity = vi.fn();
    renderPanel({ showFilters: true, setSelectedCity });
    const el = document.getElementById("filter-city");
    if (!(el instanceof HTMLSelectElement)) throw new Error("filter-city select not found");
    fireEvent.change(el, { target: { value: "Athens" } });
    expect(setSelectedCity).toHaveBeenCalledWith("Athens");
  });

  it("calls setFilterType when property type dropdown changes", () => {
    const setFilterType = vi.fn();
    renderPanel({ showFilters: true, setFilterType });
    const el = document.getElementById("filter-type");
    if (!(el instanceof HTMLSelectElement)) throw new Error("filter-type select not found");
    fireEvent.change(el, { target: { value: "house" } });
    expect(setFilterType).toHaveBeenCalledWith("house");
  });

  it("calls setFilterOwnership for Pro user", () => {
    const setFilterOwnership = vi.fn();
    renderPanel({ showFilters: true, isPro: true, setFilterOwnership });
    const el = document.getElementById("filter-ownership");
    if (!(el instanceof HTMLSelectElement)) throw new Error("filter-ownership select not found");
    fireEvent.change(el, { target: { value: "full" } });
    expect(setFilterOwnership).toHaveBeenCalledWith("full");
  });
});

// ── active filter chips ───────────────────────────────────────────────────────

describe("AuctionFiltersPanel — active filter chips", () => {
  it("shows type chip when filterType is active", () => {
    renderPanel({ showFilters: false, activeFilterCount: 1, filterType: "house" });
    const chip = screen.getByText(/house/i);
    expect(chip).toBeInTheDocument();
  });

  it("clicking type chip calls setFilterType with empty string", () => {
    const setFilterType = vi.fn();
    renderPanel({ showFilters: false, activeFilterCount: 1, filterType: "house", setFilterType });
    // The chip button contains "house" text and an X icon
    const chips = screen.getAllByRole("button");
    const typeChip = chips.find((b) => b.textContent?.toLowerCase().includes("house"));
    if (!typeChip) throw new Error("house chip button not found");
    fireEvent.click(typeChip);
    expect(setFilterType).toHaveBeenCalledWith("");
  });

  it("shows 'Clear all' button in chips row when filters active", () => {
    renderPanel({ showFilters: false, activeFilterCount: 1, filterType: "apartment" });
    const clearAll = screen.getByRole("button", { name: /Clear all/i });
    expect(clearAll).toBeInTheDocument();
  });

  it("calls clearFilters when 'Clear all' is clicked in chips row", () => {
    const clearFilters = vi.fn();
    renderPanel({ showFilters: false, activeFilterCount: 1, filterType: "apartment", clearFilters });
    fireEvent.click(screen.getByRole("button", { name: /Clear all/i }));
    expect(clearFilters).toHaveBeenCalledOnce();
  });

  it("does not show premium chips for free users even if filterOwnership set", () => {
    renderPanel({
      showFilters: false,
      activeFilterCount: 1,
      filterType: "apartment",
      filterOwnership: "private",
      isPro: false,
      isMaiPropOsUser: false,
    });
    // The premium chip for ownership should not appear
    expect(screen.queryByText(/private/i)).toBeNull();
  });

  it("shows ownership chip for Pro users", () => {
    renderPanel({
      showFilters: false,
      activeFilterCount: 2,
      filterType: "apartment",
      // "full" maps to OWNERSHIP_STATUSES label "Full"
      filterOwnership: "full",
      isPro: true,
    });
    const chips = screen.getAllByRole("button");
    // OWNERSHIP_STATUSES label for "full" is "Full"
    const ownershipChip = chips.find((b) => b.textContent?.toLowerCase().includes("full"));
    expect(ownershipChip).toBeInTheDocument();
  });
});
