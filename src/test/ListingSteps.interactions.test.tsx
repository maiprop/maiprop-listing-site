import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { StepDetails } from "@/components/listings/StepDetails";
import { StepPricing } from "@/components/listings/StepPricing";
import type { ListingFormData, AIPriceSuggestion } from "@/hooks/useListingForm";

const baseForm = (overrides: Partial<ListingFormData> = {}) => ({
  title: "",
  description: "",
  property_type: "apartment",
  listing_type: "sale",
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
    fireEvent.change(screen.getByPlaceholderText("2"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /write with ai/i }));
    fireEvent.click(screen.getByRole("button", { name: "B+" }));

    expect(set).toHaveBeenCalledWith("title", "Sunny apartment");
    expect(set).toHaveBeenCalledWith("description", "Bright corner home");
    expect(set).toHaveBeenCalledWith("sqm", "91");
    expect(set).toHaveBeenCalledWith("bedrooms", "3");
    expect(set).toHaveBeenCalledWith("energy_class", "B+");
    expect(handleAiDescription).toHaveBeenCalledTimes(1);
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
    fireEvent.change(screen.getByPlaceholderText("21"), { target: { value: "18.5" } });
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "steep" } });
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "tourist" } });
    fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: "paved" } });

    expect(set).toHaveBeenCalledWith("facade_length", "18.5");
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
    fireEvent.click(screen.getByRole("button", { name: /no agent fee/i }));
    fireEvent.click(screen.getByRole("button", { name: /pets allowed/i }));
    fireEvent.click(screen.getByRole("button", { name: "Exclusive" }));
    fireEvent.click(screen.getByRole("button", { name: /featured badge/i }));
    fireEvent.change(screen.getByDisplayValue("3"), { target: { value: "8" } });

    expect(set).toHaveBeenCalledWith("deposit_months", "1");
    expect(set).toHaveBeenCalledWith("monthly_expenses", "65");
    expect(toggle).toHaveBeenCalledWith("agent_fee_included");
    expect(toggle).toHaveBeenCalledWith("pets_allowed");
    expect(set).toHaveBeenCalledWith("is_exclusive", true);
    expect(set).toHaveBeenCalledWith("is_featured", false);
    expect(set).toHaveBeenCalledWith("priority_placement", 8);
  });

  it("renders auction and open-house validation branches", () => {
    const set = vi.fn();
    const { rerender } = renderWithProviders(
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
    expect(set).toHaveBeenCalledWith("auction_starting_bid", "100000");

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
  });
});
