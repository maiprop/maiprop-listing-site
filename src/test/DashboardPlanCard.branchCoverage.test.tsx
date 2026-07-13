import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardPlanCard } from "@/components/DashboardPlanCard";
import { renderWithProviders } from "@/test/utils";

const usage = {
  savedSearches: 0,
  searchAlerts: 0,
  viewingsThisMonth: 0,
  auctionAlerts: 0,
  listings: 0,
};

describe("DashboardPlanCard role and tier matrix", () => {
  it("shows every buyer Free allowance and explains an exhausted limit", () => {
    renderWithProviders(
      <DashboardPlanCard
        audience="buyer"
        isPro={false}
        usage={{
          savedSearches: 1,
          searchAlerts: 1,
          viewingsThisMonth: 1,
          auctionAlerts: 1,
          listings: 0,
        }}
        className="business-plan-card"
      />,
    );

    expect(screen.getByText("Free Plan")).toBeInTheDocument();
    expect(screen.getByText("Saved searches").nextSibling).toHaveTextContent("1 / 1");
    expect(screen.getByText("Search alerts").nextSibling).toHaveTextContent("1 / 1");
    expect(screen.getByText("Viewings this month").nextSibling).toHaveTextContent("1 / 1");
    expect(screen.getByText("Auction alerts").nextSibling).toHaveTextContent("1 / 1");
    expect(screen.getByRole("link", { name: /Upgrade/i })).toHaveAttribute("href", "/pricing");
    expect(screen.getByText(/Upgrade to Pro to unlock higher limits/i)).toHaveTextContent("29");
    expect(screen.getByText("Saved searches").parentElement?.parentElement?.parentElement)
      .toHaveClass("business-plan-card");
  });

  it("shows buyer Pro allowances without a Free upgrade prompt", () => {
    renderWithProviders(
      <DashboardPlanCard
        audience="buyer"
        isPro
        usage={{ ...usage, searchAlerts: 5, viewingsThisMonth: 10, auctionAlerts: 5 }}
      />,
    );

    expect(screen.getByText("Pro Plan")).toBeInTheDocument();
    expect(screen.queryByText("Saved searches")).not.toBeInTheDocument();
    expect(screen.getByText("Search alerts").nextSibling).toHaveTextContent("5 / 5");
    expect(screen.getByText("Viewings this month").nextSibling).toHaveTextContent("10 / 10");
    expect(screen.getByText("Auction alerts").nextSibling).toHaveTextContent("5 / 5");
    expect(screen.queryByRole("link", { name: /Upgrade/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/From .*month/i)).not.toBeInTheDocument();
  });

  it("uses seller listing limits and omits an unlimited viewing row", () => {
    renderWithProviders(
      <DashboardPlanCard audience="seller" isPro={false} usage={{ ...usage, listings: 2 }} />,
    );

    expect(screen.getByText("Listings").nextSibling).toHaveTextContent("2 / 2");
    expect(screen.queryByText("Viewings this month")).not.toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Pro/i)).toHaveTextContent("29");
  });

  it("uses the agent Free listing and viewing limits below the threshold", () => {
    renderWithProviders(
      <DashboardPlanCard
        audience="agent"
        isPro={false}
        usage={{ ...usage, listings: 4, viewingsThisMonth: 2 }}
      />,
    );

    expect(screen.getByText("Listings").nextSibling).toHaveTextContent("4 / 5");
    expect(screen.getByText("Viewings this month").nextSibling).toHaveTextContent("2 / 3");
    expect(screen.queryByText(/higher limits/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upgrade/i })).toHaveAttribute("href", "/pricing");
  });

  it("keeps developer Free accounts on the mandatory subscription path", () => {
    renderWithProviders(
      <DashboardPlanCard audience="developer" isPro={false} usage={{ ...usage, listings: 3 }} />,
    );

    expect(screen.getByText("Listings").nextSibling).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: /Subscribe/i })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByRole("link", { name: /Upgrade/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/higher limits/i)).not.toBeInTheDocument();
  });

  it("describes the developer Pro entitlement as unlimited", () => {
    renderWithProviders(
      <DashboardPlanCard audience="developer" isPro usage={{ ...usage, listings: 12 }} />,
    );

    expect(screen.getByText("Listings").nextSibling).toHaveTextContent("12");
    expect(screen.getByText(/Unlimited listings, project showcases/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Subscribe/i })).not.toBeInTheDocument();
  });

  it("renders professional Free and Pro status without inventing usage limits", () => {
    const { rerender } = renderWithProviders(
      <DashboardPlanCard audience="professional" isPro={false} usage={usage} />,
    );

    expect(screen.getByText("Free Plan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upgrade/i })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByText("Listings")).not.toBeInTheDocument();

    rerender(<DashboardPlanCard audience="professional" isPro usage={usage} />);
    expect(screen.getByText("Pro Plan")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Upgrade/i })).not.toBeInTheDocument();
  });
});
