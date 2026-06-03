import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import {
  getAddonSectionsForParticipant,
  resolveAddonKey,
} from "@/pages/dashboard/billing/addons";
import { StatusBadge } from "@/pages/dashboard/billing/StatusBadge";

describe("billing add-on helpers", () => {
  it("maps exact and bundled add-ons to the checkout keys used by Stripe", () => {
    expect(resolveAddonKey({ name: "Featured + Priority" })).toBe(
      "featured_priority_bundle",
    );
    expect(resolveAddonKey({ name: "Valuation Bundle x 5" })).toBe(
      "valuation_bundle",
    );
    expect(resolveAddonKey({ name: "Neighbourhood Bundle x 3" })).toBe(
      "neighbourhood_report_bundle",
    );
    expect(resolveAddonKey({ name: "Custom onboarding" })).toBeNull();
  });

  it("keeps institutional add-ons aligned with investor add-ons and falls back to buyer", () => {
    const investorSections = getAddonSectionsForParticipant("investor");

    expect(getAddonSectionsForParticipant("institutional")).toBe(
      investorSections,
    );
    expect(getAddonSectionsForParticipant("unknown-role")[0].category).toContain(
      "AI Reports",
    );
  });

  it("renders known, unknown, and empty invoice statuses with stable labels", () => {
    const { rerender } = render(createElement(StatusBadge, { status: "paid" }));
    expect(screen.getByText("Paid")).toBeInTheDocument();

    rerender(createElement(StatusBadge, { status: "open" }));
    expect(screen.getByText("Due")).toBeInTheDocument();

    rerender(createElement(StatusBadge, { status: "void" }));
    expect(screen.getByText("Void")).toBeInTheDocument();

    rerender(createElement(StatusBadge, { status: "draft" }));
    expect(screen.getByText("Draft")).toBeInTheDocument();

    rerender(createElement(StatusBadge, { status: "uncollectible" }));
    expect(screen.getByText("Uncollectible")).toBeInTheDocument();

    rerender(createElement(StatusBadge, { status: "custom-review" }));
    expect(screen.getByText("custom-review")).toBeInTheDocument();

    rerender(createElement(StatusBadge, { status: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
