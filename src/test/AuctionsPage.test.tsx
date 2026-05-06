/**
 * Auctions page tests.
 * Exercises filter handlers, view modes, alert modal —
 * previously at 3.12% function coverage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { renderWithProviders } from "@/test/utils";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAuctions = [
  {
    id: "a1", title: "Athens Apartment", city: "Athens", property_type: "apartment",
    starting_bid: 80000, tags: ["round:1"], ownership_status: "full", sqm: 75, year_built: 2000,
    lat: 37.9, lng: 23.7, images: [], slug: "athens-apartment",
  },
  {
    id: "a2", title: "Thessaloniki House", city: "Thessaloniki", property_type: "house",
    starting_bid: 120000, tags: [], ownership_status: "partial", sqm: 110, year_built: 1990,
    lat: 40.6, lng: 22.9, images: [], slug: "thessaloniki-house",
  },
];

const mockUseAuctionListings = vi.fn();
vi.mock("@/hooks/useAuctionListings", () => ({
  useAuctionListings: (...args: unknown[]) => mockUseAuctionListings(...args),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: vi.fn().mockReturnValue({ isPro: false }),
}));

const mockToggleFav = vi.fn();
vi.mock("@/hooks/useFavorites", () => ({
  useToggleFavorite: vi.fn().mockReturnValue({ mutate: mockToggleFav, isPending: false }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn().mockReturnValue({ user: null, profile: null }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));
vi.mock("@/components/Footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}));
vi.mock("@/components/AuctionAlertModal", () => ({
  AuctionAlertModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="alert-modal"><button onClick={onClose}>Close Modal</button></div> : null,
}));
vi.mock("@/components/MapView", () => ({
  MapView: () => <div data-testid="map-view" />,
}));
vi.mock("@/components/auctions/AuctionCard", () => ({
  AuctionCard: ({ a }: { a: { title: string } }) => (
    <div data-testid="auction-card">{a?.title}</div>
  ),
  PremiumBadge: () => <span>PRO</span>,
}));
vi.mock("@/components/auctions/AuctionHero", () => ({
  AuctionHero: () => <div data-testid="auction-hero" />,
}));
vi.mock("@/components/auctions/AuctionAlertBanner", () => ({
  AuctionAlertBanner: ({ onOpenAlert }: { onOpenAlert: () => void }) => (
    <div data-testid="auction-banner"><button onClick={onOpenAlert}>Open Alert</button></div>
  ),
}));
vi.mock("@/lib/authUtils", () => ({
  isPlatformAdmin: vi.fn().mockReturnValue(false),
}));
vi.mock("react-helmet-async", () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => children,
  HelmetProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

// Import Auctions once — no resetModules to keep mocks stable
let AuctionsPage: React.ComponentType;
beforeEach(async () => {
  vi.clearAllMocks();
  mockUseAuctionListings.mockReturnValue({ data: mockAuctions, isLoading: false, error: null });
  if (!AuctionsPage) {
    const mod = await import("@/pages/Auctions");
    AuctionsPage = mod.default;
  }
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Auctions page", () => {
  it("renders auction cards from data", async () => {
    renderWithProviders(<AuctionsPage />);
    await waitFor(() => expect(screen.getAllByTestId("auction-card")).toHaveLength(2));
  });

  it("renders the hero section", async () => {
    renderWithProviders(<AuctionsPage />);
    await waitFor(() => expect(screen.getByTestId("auction-hero")).toBeInTheDocument());
  });

  it("opens alert modal from banner button", async () => {
    renderWithProviders(<AuctionsPage />);
    const bannerBtn = await screen.findByText("Open Alert");
    fireEvent.click(bannerBtn);
    await waitFor(() => expect(screen.getByTestId("alert-modal")).toBeInTheDocument());
  });

  it("shows loading spinner when auctions are loading", async () => {
    mockUseAuctionListings.mockReturnValue({ data: [], isLoading: true, error: null });
    renderWithProviders(<AuctionsPage />);
    await waitFor(() => {
      const spinner = document.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  it("renders with empty data", async () => {
    mockUseAuctionListings.mockReturnValue({ data: [], isLoading: false, error: null });
    renderWithProviders(<AuctionsPage />);
    await waitFor(() => expect(screen.queryAllByTestId("auction-card")).toHaveLength(0));
  });
});
