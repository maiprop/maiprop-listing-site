import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { PropertyAIInsightsSection } from "@/components/property/PropertyAIInsightsSection";
import { renderWithProviders } from "@/test/utils";
import i18n from "@/i18n";

vi.unmock("react-i18next");

const user = { id: "user-1", email: "user@example.test" } as User;

describe("PropertyAIInsightsSection localization", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("el");
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders the complete rental insight surface in Greek", () => {
    renderWithProviders(
      <PropertyAIInsightsSection
        user={user}
        isPro={false}
        loading={false}
        data={{
          vsMarket: 4,
          rentalYield: 0,
          estimatedValue: 1600,
          pricePerSqmEstimate: 20,
          marketComparison: "at_market",
          confidenceLabel: "High",
        }}
        quota={{ allowed: true, reason: null, used: 2, limit: 5, remaining: 3 }}
        quotaLoading={false}
        hasRequested
        onLoad={vi.fn()}
        listingType="rent"
      />,
    );

    expect(screen.getByText("AI ανάλυση αγοράς")).toBeInTheDocument();
    expect(screen.getByText("Εκτέλεση AI ανάλυσης όταν τη χρειάζεστε")).toBeInTheDocument();
    expect(screen.getByText("Απομένουν 3 από 5 αιτήματα AI ανάλυσης στο δωρεάν πλάνο αυτόν τον μήνα.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ανανέωση AI ανάλυσης" })).toBeInTheDocument();
    expect(screen.getByText("έναντι μισθωτικής αγοράς")).toBeInTheDocument();
    expect(screen.getByText("Στην αγορά")).toBeInTheDocument();
    expect(screen.getByText("Ενοίκιο / m² / μήνα")).toBeInTheDocument();
    expect(screen.getByText("€20/m²/μήνα")).toBeInTheDocument();
    expect(screen.getByText("Εκτιμώμενο μηνιαίο ενοίκιο ανά τετραγωνικό μέτρο")).toBeInTheDocument();
    expect(screen.getByText("AI εκτίμηση ενοικίου")).toBeInTheDocument();
    expect(screen.getByText("€1.600/μήνα")).toBeInTheDocument();
    expect(screen.getByText("Βεβαιότητα: Υψηλή")).toBeInTheDocument();
  });

  it("localizes the unavailable state and quota-reached actions", () => {
    const view = renderWithProviders(
      <PropertyAIInsightsSection
        user={user}
        isPro={false}
        loading={false}
        data={null}
        quota={{ allowed: true, reason: null, used: 0, limit: 5, remaining: 5 }}
        hasRequested
        onLoad={vi.fn()}
      />,
    );

    expect(screen.getByText("Η ανάλυση αγοράς δεν είναι διαθέσιμη")).toBeInTheDocument();

    view.rerender(
      <PropertyAIInsightsSection
        user={user}
        isPro={false}
        loading={false}
        data={null}
        quota={{ allowed: false, reason: "monthly_limit_reached", used: 5, limit: 5, remaining: 0 }}
        hasRequested={false}
        onLoad={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "Αναβάθμιση σε Pro" })).toHaveAttribute("href", "/pricing");
    expect(screen.getByRole("link", { name: "Αγορά πρόσθετης AI ανάλυσης" })).toHaveAttribute(
      "href",
      "/dashboard?tab=billing&addon=valuation_single",
    );
  });
});
