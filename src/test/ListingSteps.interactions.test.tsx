import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { StepDetails } from "@/components/listings/StepDetails";
import { StepPricing } from "@/components/listings/StepPricing";
import { StepType } from "@/components/listings/StepType";
import type { ListingFormData, AIPriceSuggestion } from "@/hooks/useListingForm";

const baseForm = (overrides: Partial<ListingFormData> = {}) => ({
  title: "",
  description: "",
  property_type: "apartment",
  listing_type: "sale",
  open_house_transaction_type: "sale",
  sqm: "",
  year_built: "",
  bedrooms: "",
  bathrooms: "",
  wc_count: "",
  kitchens: "",
  living_rooms: "",
  levels: "",
  floor: "",
  total_floors: "",
  heating_system: "",
  construction_status: "",
  commercial_subtype: "",
  plot_surface: "",
  floor_height: "",
  facade_length: "",
  plot_depth: "",
  coverage_ratio: "",
  building_allowance: "",
  distance_from_sea: "",
  distance_from_city: "",
  slope: "",
  zone_type: "",
  road_type: "",
  energy_class: "",
  price: "",
  deposit_months: "",
  monthly_expenses: "",
  min_rental_months: "",
  available_from: "",
  agent_fee_included: false,
  pets_allowed: false,
  short_term_rental: false,
  auction_starting_bid: "",
  auction_date: "",
  auction_court: "",
  open_house_date: "",
  is_exclusive: false,
  is_featured: false,
  priority_placement: 0,
  city: "",
  ...overrides,
} as ListingFormData);

const noopRef = () => () => {};

describe("listing step detail interactions", () => {
  it("forwards listing type, off-market, property type, and subtype changes", () => {
    const set = vi.fn();
    const toggle = vi.fn();
    renderWithProviders(
      <StepType
        form={baseForm({
          listing_type: "sale",
          property_type: "commercial",
          commercial_subtype: "retail",
          is_pre_sale: true,
          is_off_market: false,
        })}
        set={set}
        toggle={toggle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /for rent/i }));
    fireEvent.click(screen.getByLabelText(/off-market/i));
    fireEvent.click(screen.getByRole("button", { name: /land/i }));
    fireEvent.click(screen.getByTitle(/street-level commercial space/i));

    expect(set).toHaveBeenCalledWith("listing_type", "rent");
    expect(toggle).toHaveBeenCalledWith("is_off_market");
    expect(set).toHaveBeenCalledWith("property_type", "land");
    expect(set).toHaveBeenCalledWith("commercial_subtype", "");
  });

  it("treats open house as a sale/rental subcategory in the listing type step", () => {
    const set = vi.fn();
    renderWithProviders(
      <StepType
        form={baseForm({ listing_type: "rent", open_house_transaction_type: "rent", is_off_market: false })}
        set={set}
        toggle={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText(/open house viewing/i));

    expect(set).toHaveBeenCalledWith("open_house_transaction_type", "rent");
    expect(set).toHaveBeenCalledWith("listing_type", "open_house");
  });

  it("shows validation messages and forwards residential field edits", () => {
    const set = vi.fn();
    const handleAiDescription = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <StepDetails
        form={baseForm({ property_type: "apartment" })}
        set={set}
        errors={{ title: "Title is required", sqm: "Area is required" }}
        setFieldRef={noopRef}
        aiDescLoading={false}
        handleAiDescription={handleAiDescription}
      />,
    );

    expect(screen.getByText(/Title is required/)).toBeInTheDocument();
    expect(screen.getByText(/Area is required/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/modern 2-bed/i), { target: { value: "Sunny apartment" } });
    fireEvent.change(screen.getByPlaceholderText(/Describe the property/i), { target: { value: "Bright corner home" } });
    fireEvent.change(screen.getByPlaceholderText("85"), { target: { value: "91" } });
    fireEvent.change(screen.getByPlaceholderText("2010"), { target: { value: "2008" } });
    const numericTwos = screen.getAllByPlaceholderText("2");
    fireEvent.change(numericTwos[0], { target: { value: "3" } });
    fireEvent.change(screen.getAllByPlaceholderText("1")[0], { target: { value: "2" } });
    fireEvent.change(screen.getAllByPlaceholderText("1")[1], { target: { value: "1" } });
    fireEvent.change(screen.getAllByPlaceholderText("1")[2], { target: { value: "1" } });
    fireEvent.change(screen.getAllByPlaceholderText("1")[3], { target: { value: "1" } });
    fireEvent.change(screen.getAllByPlaceholderText("1")[4], { target: { value: "2" } });
    fireEvent.change(screen.getByPlaceholderText("3"), { target: { value: "4" } });
    fireEvent.change(screen.getByPlaceholderText("6"), { target: { value: "7" } });
    const [heating, condition] = screen.getAllByRole("combobox");
    fireEvent.change(heating, { target: { value: "autonomous_gas" } });
    fireEvent.change(condition, { target: { value: "renovated" } });
    fireEvent.click(screen.getByRole("button", { name: /write with ai/i }));
    fireEvent.click(screen.getByRole("button", { name: "B+" }));

    expect(set).toHaveBeenCalledWith("title", "Sunny apartment");
    expect(set).toHaveBeenCalledWith("description", "Bright corner home");
    expect(set).toHaveBeenCalledWith("sqm", "91");
    expect(set).toHaveBeenCalledWith("year_built", "2008");
    expect(set).toHaveBeenCalledWith("bedrooms", "3");
    expect(set).toHaveBeenCalledWith("bathrooms", "2");
    expect(set).toHaveBeenCalledWith("wc_count", "1");
    expect(set).toHaveBeenCalledWith("kitchens", "1");
    expect(set).toHaveBeenCalledWith("living_rooms", "1");
    expect(set).toHaveBeenCalledWith("levels", "2");
    expect(set).toHaveBeenCalledWith("floor", "4");
    expect(set).toHaveBeenCalledWith("total_floors", "7");
    expect(set).toHaveBeenCalledWith("heating_system", "autonomous_gas");
    expect(set).toHaveBeenCalledWith("construction_status", "renovated");
    expect(set).toHaveBeenCalledWith("energy_class", "B+");
    expect(handleAiDescription).toHaveBeenCalledTimes(1);
  });

  it("renders commercial-specific fields and forwards every commercial edit", () => {
    const set = vi.fn();
    renderWithProviders(
      <StepDetails
        form={baseForm({ property_type: "commercial", sqm: "250" })}
        set={set}
        errors={{}}
        setFieldRef={noopRef}
        aiDescLoading={false}
        handleAiDescription={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/modern 2-bed/i), { target: { value: "Street shop" } });
    fireEvent.change(screen.getByPlaceholderText(/Describe the property/i), { target: { value: "High-street commercial unit" } });
    fireEvent.change(screen.getByPlaceholderText("85"), { target: { value: "260" } });
    fireEvent.change(screen.getByPlaceholderText("2010"), { target: { value: "1998" } });
    const [subtype, heating, condition] = screen.getAllByRole("combobox");
    fireEvent.change(subtype, { target: { value: "warehouse" } });
    fireEvent.change(screen.getByPlaceholderText("500"), { target: { value: "540" } });
    fireEvent.change(screen.getByPlaceholderText("3.5"), { target: { value: "4.2" } });
    fireEvent.change(screen.getAllByPlaceholderText("2")[0], { target: { value: "3" } });
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "1" } });
    fireEvent.change(screen.getByPlaceholderText("4"), { target: { value: "6" } });
    fireEvent.change(heating, { target: { value: "central" } });
    fireEvent.change(condition, { target: { value: "renovated" } });
    fireEvent.click(screen.getByRole("button", { name: "A" }));

    expect(set).toHaveBeenCalledWith("title", "Street shop");
    expect(set).toHaveBeenCalledWith("description", "High-street commercial unit");
    expect(set).toHaveBeenCalledWith("sqm", "260");
    expect(set).toHaveBeenCalledWith("year_built", "1998");
    expect(set).toHaveBeenCalledWith("commercial_subtype", "warehouse");
    expect(set).toHaveBeenCalledWith("plot_surface", "540");
    expect(set).toHaveBeenCalledWith("floor_height", "4.2");
    expect(set).toHaveBeenCalledWith("wc_count", "3");
    expect(set).toHaveBeenCalledWith("floor", "1");
    expect(set).toHaveBeenCalledWith("total_floors", "6");
    expect(set).toHaveBeenCalledWith("heating_system", "central");
    expect(set).toHaveBeenCalledWith("construction_status", "renovated");
    expect(set).toHaveBeenCalledWith("energy_class", "A");
  });

  it("renders land-specific selects and forwards their changes", () => {
    const set = vi.fn();
    renderWithProviders(
      <StepDetails
        form={baseForm({ property_type: "land", sqm: "500" })}
        set={set}
        errors={{}}
        setFieldRef={noopRef}
        aiDescLoading={true}
        handleAiDescription={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /generating/i })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/modern 2-bed/i), { target: { value: "Buildable plot" } });
    fireEvent.change(screen.getByPlaceholderText(/Describe the property/i), { target: { value: "Corner land plot" } });
    fireEvent.change(screen.getByPlaceholderText("85"), { target: { value: "620" } });
    fireEvent.change(screen.getByPlaceholderText("2010"), { target: { value: "2000" } });
    fireEvent.change(screen.getByPlaceholderText("21"), { target: { value: "18.5" } });
    fireEvent.change(screen.getByPlaceholderText("36"), { target: { value: "42" } });
    fireEvent.change(screen.getByPlaceholderText("50"), { target: { value: "60" } });
    fireEvent.change(screen.getByPlaceholderText("400"), { target: { value: "450" } });
    fireEvent.change(screen.getByPlaceholderText("500"), { target: { value: "800" } });
    fireEvent.change(screen.getByPlaceholderText("2000"), { target: { value: "1800" } });
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "steep" } });
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "tourist" } });
    fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: "paved" } });

    expect(set).toHaveBeenCalledWith("title", "Buildable plot");
    expect(set).toHaveBeenCalledWith("description", "Corner land plot");
    expect(set).toHaveBeenCalledWith("sqm", "620");
    expect(set).toHaveBeenCalledWith("year_built", "2000");
    expect(set).toHaveBeenCalledWith("facade_length", "18.5");
    expect(set).toHaveBeenCalledWith("plot_depth", "42");
    expect(set).toHaveBeenCalledWith("coverage_ratio", "60");
    expect(set).toHaveBeenCalledWith("building_allowance", "450");
    expect(set).toHaveBeenCalledWith("distance_from_sea", "800");
    expect(set).toHaveBeenCalledWith("distance_from_city", "1800");
    expect(set).toHaveBeenCalledWith("slope", "steep");
    expect(set).toHaveBeenCalledWith("zone_type", "tourist");
    expect(set).toHaveBeenCalledWith("road_type", "paved");
    expect(screen.queryByText("Energy Class")).not.toBeInTheDocument();
  });
});

describe("listing step pricing interactions", () => {
  it("requests and applies AI price suggestions while showing validation state", () => {
    const set = vi.fn();
    const suggestion: AIPriceSuggestion = {
      min: 210000,
      suggested: 240000,
      max: 265000,
      confidence: "high",
      reasoning: "Comparable sales support this range.",
    };
    const handleAiPrice = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <StepPricing
        form={baseForm({ listing_type: "sale", sqm: "80", price: "200000" })}
        set={set}
        toggle={vi.fn()}
        errors={{ price: "Price is required" }}
        setFieldRef={noopRef}
        aiPriceLoading={false}
        aiPriceSuggestion={suggestion}
        handleAiPrice={handleAiPrice}
        participantType="owner"
        isPro={false}
      />,
    );

    expect(screen.getByText(/Price is required/)).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("2,500") && content.includes("/m"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /re-estimate/i }));
    fireEvent.click(screen.getByRole("button", { name: /use this price/i }));
    fireEvent.change(screen.getByPlaceholderText("250000"), { target: { value: "245000" } });

    expect(handleAiPrice).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("price", "240000");
    expect(set).toHaveBeenCalledWith("price", "245000");
  });

  it("forwards rental toggles and Pro featured controls", () => {
    const set = vi.fn();
    const toggle = vi.fn();
    renderWithProviders(
      <StepPricing
        form={baseForm({
          listing_type: "rent",
          is_featured: true,
          priority_placement: 3,
        })}
        set={set}
        toggle={toggle}
        errors={{}}
        setFieldRef={noopRef}
        aiPriceLoading={true}
        aiPriceSuggestion={null}
        handleAiPrice={vi.fn()}
        participantType="agent"
        isPro={true}
      />,
    );

    expect(screen.getByRole("button", { name: /analysing/i })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("2"), { target: { value: "1" } });
    fireEvent.change(screen.getByPlaceholderText("50"), { target: { value: "65" } });
    fireEvent.change(screen.getByPlaceholderText("12"), { target: { value: "18" } });
    fireEvent.change(document.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByRole("button", { name: /no agent fee/i }));
    fireEvent.click(screen.getByRole("button", { name: /pets allowed/i }));
    fireEvent.click(screen.getByRole("button", { name: /short-term/i }));
    fireEvent.click(screen.getByRole("button", { name: "Exclusive" }));
    fireEvent.click(screen.getByRole("button", { name: /featured badge/i }));
    fireEvent.change(screen.getByDisplayValue("3"), { target: { value: "8" } });

    expect(set).toHaveBeenCalledWith("deposit_months", "1");
    expect(set).toHaveBeenCalledWith("monthly_expenses", "65");
    expect(set).toHaveBeenCalledWith("min_rental_months", "18");
    expect(set).toHaveBeenCalledWith("available_from", "2026-08-01");
    expect(toggle).toHaveBeenCalledWith("agent_fee_included");
    expect(toggle).toHaveBeenCalledWith("pets_allowed");
    expect(toggle).toHaveBeenCalledWith("short_term_rental");
    expect(set).toHaveBeenCalledWith("is_exclusive", true);
    expect(set).toHaveBeenCalledWith("is_featured", false);
    expect(set).toHaveBeenCalledWith("priority_placement", 8);
  });

  it("renders auction and open-house validation branches", () => {
    const set = vi.fn();
    const { rerender, container } = renderWithProviders(
      <StepPricing
        form={baseForm({ listing_type: "auction" })}
        set={set}
        toggle={vi.fn()}
        errors={{ auction_starting_bid: "Starting bid is required" }}
        setFieldRef={noopRef}
        aiPriceLoading={false}
        aiPriceSuggestion={null}
        handleAiPrice={vi.fn()}
        participantType="owner"
        isPro={false}
      />,
    );

    expect(screen.getByText(/Starting bid is required/)).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole("spinbutton")[1], { target: { value: "100000" } });
    fireEvent.change(container.querySelector('input[type="datetime-local"]') as HTMLInputElement, { target: { value: "2026-09-01T10:30" } });
    fireEvent.change(screen.getByPlaceholderText(/eAuction/i), { target: { value: "Athens notary" } });
    expect(set).toHaveBeenCalledWith("auction_starting_bid", "100000");
    expect(set).toHaveBeenCalledWith("auction_date", "2026-09-01T10:30");
    expect(set).toHaveBeenCalledWith("auction_court", "Athens notary");

    rerender(
      <StepPricing
        form={baseForm({ listing_type: "open_house" })}
        set={set}
        toggle={vi.fn()}
        errors={{ open_house_date: "Open house date is required" }}
        setFieldRef={noopRef}
        aiPriceLoading={false}
        aiPriceSuggestion={null}
        handleAiPrice={vi.fn()}
        participantType="owner"
        isPro={false}
      />,
    );
    expect(screen.getByText(/Open house date is required/)).toBeInTheDocument();
    fireEvent.change(container.querySelector('input[type="datetime-local"]') as HTMLInputElement, { target: { value: "2026-09-02T18:00" } });
    expect(set).toHaveBeenCalledWith("open_house_date", "2026-09-02T18:00");
  });

  it("shows rental pricing terms for rental open houses", () => {
    const set = vi.fn();
    const toggle = vi.fn();
    renderWithProviders(
      <StepPricing
        form={baseForm({ listing_type: "open_house", open_house_transaction_type: "rent" })}
        set={set}
        toggle={toggle}
        errors={{}}
        setFieldRef={noopRef}
        aiPriceLoading={false}
        aiPriceSuggestion={null}
        handleAiPrice={vi.fn()}
        participantType="owner"
        isPro={false}
      />,
    );

    expect(screen.getByText(/Monthly Rent/i)).toBeInTheDocument();
    expect(screen.getByText(/Rental Terms/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("800"), { target: { value: "1800" } });
    fireEvent.change(screen.getByLabelText(/Open house subcategory/i), { target: { value: "sale" } });
    expect(set).toHaveBeenCalledWith("price", "1800");
    expect(set).toHaveBeenCalledWith("open_house_transaction_type", "sale");
    fireEvent.click(screen.getByText(/Pets Allowed/i));
    expect(toggle).toHaveBeenCalledWith("pets_allowed");
  });
});
