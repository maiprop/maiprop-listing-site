import { describe, expect, it } from "vitest";
import {
  getAddonSectionsForParticipant,
  resolveAddonKey,
} from "@/pages/dashboard/billing/addons";

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
});
