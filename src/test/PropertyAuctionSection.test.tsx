import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { PropertyAuctionSection } from "@/components/property/PropertyAuctionSection";

const accessState = vi.hoisted(() => ({
  isPro: false,
  profile: {
    role: "buyer",
    participant_type: "buyer",
    is_platform_admin: false,
  },
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({ isPro: accessState.isPro, loading: false }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: accessState.profile,
  }),
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
  beforeEach(() => {
    accessState.isPro = false;
    accessState.profile.role = "buyer";
    accessState.profile.participant_type = "buyer";
    accessState.profile.is_platform_admin = false;
  });

  it("shows OS past deals only to entitled investor audiences", () => {
    accessState.isPro = true;
    accessState.profile.role = "investor";
    accessState.profile.participant_type = "investor";

    const view = renderWithProviders(<PropertyAuctionSection {...baseProps} />);
    expect(screen.getByTestId("past-deals")).toBeInTheDocument();

    accessState.profile.role = "agent";
    accessState.profile.participant_type = "agent";
    view.rerender(<PropertyAuctionSection {...baseProps} />);
    expect(screen.queryByTestId("past-deals")).not.toBeInTheDocument();
  });

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
