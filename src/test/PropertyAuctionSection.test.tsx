import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { PropertyAuctionSection } from "@/components/property/PropertyAuctionSection";

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({ isPro: false, loading: false }),
}));

vi.mock("@/components/PastDealsTable", () => ({
  PastDealsTable: () => <div data-testid="past-deals" />,
}));

const baseProps = {
  listingId: "auction-1",
  auctionDate: "2026-06-10T00:00:00Z",
  auctionStartingBid: 128000,
  ownershipDisplay: { label: "Full ownership", cls: "bg-primary/10 text-primary" },
  ownershipPct: 100,
  ownershipStatus: "full",
};

describe("PropertyAuctionSection", () => {
  it("renders a safe external eAuction CTA on DB-backed auction details", () => {
    renderWithProviders(
      <PropertyAuctionSection {...baseProps} websiteUrl="https://www.eauction.gr/Auction/Details/123" />,
    );

    expect(screen.getByRole("link", { name: /open eauction/i })).toHaveAttribute(
      "href",
      "https://www.eauction.gr/Auction/Details/123",
    );
  });

  it("does not render unsafe eAuction URLs", () => {
    renderWithProviders(
      <PropertyAuctionSection {...baseProps} websiteUrl="javascript:alert(1)" />,
    );

    expect(screen.queryByRole("link", { name: /open eauction/i })).not.toBeInTheDocument();
  });
});
