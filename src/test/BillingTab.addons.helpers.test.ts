import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import {
  getAddonSectionsForParticipant,
  resolveAddonKey,
} from "@/pages/dashboard/billing/addons";
import { StatusBadge } from "@/pages/dashboard/billing/StatusBadge";

describe("billing add-on helpers", () => {
  it("maps delivered report and promotion add-ons to Stripe checkout keys", () => {
    expect(resolveAddonKey({ name: "Property Report" })).toBe(
      "property_report_single",
    );
    expect(resolveAddonKey({ name: "Valuation Bundle x 5" })).toBe(
      "valuation_bundle",
    );
    expect(resolveAddonKey({ name: "Neighbourhood Bundle x 3" })).toBe(
      "neighbourhood_report_bundle",
    );
    expect(resolveAddonKey({ name: "Featured Listing" })).toBe(
      "featured_listing",
    );
    expect(resolveAddonKey({ name: "Priority Placement" })).toBe(
      "priority_placement",
    );
    expect(resolveAddonKey({ name: "Featured+Priority" })).toBe(
      "featured_priority_bundle",
    );
    expect(resolveAddonKey({ name: "Spotlight" })).toBe(
      "featured_listing",
    );
    expect(resolveAddonKey({ name: "Priority Rank" })).toBe(
      "priority_placement",
    );
    expect(resolveAddonKey({ name: "Spotlight + Priority Rank" })).toBe(
      "featured_priority_bundle",
    );
    expect(resolveAddonKey({ name: "Extra Agent Seat" })).toBeNull();
    expect(resolveAddonKey({ name: "Market Intelligence", manual: true })).toBeNull();
    expect(resolveAddonKey({ name: "Custom onboarding" })).toBeNull();
  });

  it("keeps institutional add-ons aligned with investor add-ons and falls back to buyer", () => {
    const investorSections = getAddonSectionsForParticipant("investor");

    const institutionalSections = getAddonSectionsForParticipant("institutional");
    expect(institutionalSections).toEqual(investorSections);
    expect(institutionalSections).not.toBe(investorSections);
    expect(getAddonSectionsForParticipant("unknown-role")[0].category).toContain(
      "AI Reports",
    );
  });

  it("returns isolated add-on sections so callers cannot mutate shared billing copy", () => {
    const firstRead = getAddonSectionsForParticipant("seller");
    firstRead[0].category = "Mutated category";
    firstRead[0].items[0].name = "Mutated item";

    const secondRead = getAddonSectionsForParticipant("seller");

    expect(secondRead[0].category).toBe("Listing Promotions");
    expect(secondRead[0].items[0].name).toBe("Spotlight");
  });

  it("exposes the same fixed-price promotion catalog to sellers, agents, and developers", () => {
    for (const role of ["seller", "agent", "developer"]) {
      const promotions = getAddonSectionsForParticipant(role)
        .find((section) => section.category === "Listing Promotions");
      const purchasable = promotions?.items.flatMap((item) => {
        const key = resolveAddonKey(item);
        return key
          ? [{ name: item.name, key, price: item.price, unit: item.unit }]
          : [];
      });

      expect(purchasable).toEqual([
        { name: "Spotlight", key: "featured_listing", price: "€39", unit: "/ 30 days" },
        { name: "Priority Rank", key: "priority_placement", price: "€59", unit: "/ 30 days" },
        { name: "Spotlight + Priority Rank", key: "featured_priority_bundle", price: "€79", unit: "/ 30 days" },
      ]);
    }
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
