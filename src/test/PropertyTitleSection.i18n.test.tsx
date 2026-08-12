import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { PropertyTitleSection } from "@/components/property/PropertyTitleSection";
import type { ListingWithJoins } from "@/hooks/useListings";
import i18n from "@/i18n";
import { renderWithProviders } from "@/test/utils";

vi.unmock("react-i18next");

const auctionListing = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Διαμέρισμα Αθήνας",
  city: "Αθήνα",
  region: "Αττική",
  address: "Ερμού 10",
  listing_type: "auction",
  property_type: "apartment",
  price: 160000,
  auction_starting_bid: 150000,
  sqm: 80,
  bedrooms: 2,
  bathrooms: 1,
  floor: 0,
  total_floors: 6,
  year_built: 2002,
  energy_class: "B+",
  heating_system: null,
  construction_status: null,
  price_per_sqm: null,
  tags: [],
} as unknown as ListingWithJoins;

describe("PropertyTitleSection localization", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("el");
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders UUID-backed auction labels and floor values in Greek", () => {
    renderWithProviders(<PropertyTitleSection db={auctionListing} isAuction />);

    expect(screen.getByText("Προς πλειστηριασμό")).toBeInTheDocument();
    expect(screen.getByText("Εμβαδόν")).toBeInTheDocument();
    expect(screen.getByText("Υπνοδωμάτια")).toBeInTheDocument();
    expect(screen.getByText("Μπάνια")).toBeInTheDocument();
    expect(screen.getByText("Όροφος")).toBeInTheDocument();
    expect(screen.getByText("Ισόγειο / 6")).toBeInTheDocument();
    expect(screen.getByText("Έτος κατασκευής")).toBeInTheDocument();
    expect(screen.getByText("Ενεργειακή κλάση")).toBeInTheDocument();
    expect(screen.queryByText("For auction")).not.toBeInTheDocument();
  });
});
