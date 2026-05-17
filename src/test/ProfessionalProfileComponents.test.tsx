import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { ProfessionalOverviewTab } from "@/components/professionals/ProfessionalOverviewTab";
import { ProfessionalServicesTab } from "@/components/professionals/ProfessionalServicesTab";

const service = {
  id: "svc-1",
  professional_id: "pro-1",
  service_key: "valuation",
  service_name: "Property Valuation",
  description: "Market valuation for purchase.",
  category: "valuer",
  pricing_model: "fixed",
  rate_amount: 250,
  currency: "EUR",
  estimated_hours: null,
  video_enabled: true,
  is_premium: true,
  is_active: true,
};

const availability = [
  { id: "a-1", professional_id: "pro-1", day_of_week: 1, start_time: "09:00", end_time: "13:00", is_active: true },
  { id: "a-2", professional_id: "pro-1", day_of_week: 3, start_time: "14:00", end_time: "18:00", is_active: true },
];

const basePro = {
  id: "pro-1",
  user_id: "owner-1",
  title: "Senior Agent",
  display_name: "Maria Agent",
  category: "real_estate_agent",
  city: "Athens",
  bio: "Helps clients buy and sell in Athens.",
  avatar_url: null,
  rating: 4.8,
  reviews_count: 9,
  verified: true,
  hourly_rate: 120,
  experience_years: 12,
  specialties: ["Luxury", "Seaside"],
  languages: ["English", "Greek"],
  license_number: "REA-123",
  website_url: "https://agency.example",
  video_link: "https://video.example/intro",
  projects_count: 42,
  average_deal_size: "EUR 400,000",
  average_portfolio_asset_size: "EUR 1.2M",
  subscription_tier: "pro",
  calendar_notes: null,
  notes: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

describe("ProfessionalServicesTab", () => {
  it("uses Book actions for signed-in users viewing Pro professionals", () => {
    const onOpenModal = vi.fn();
    renderWithProviders(
      <ProfessionalServicesTab
        dbServices={[service]}
        dbAvailability={availability}
        professionalIsPro
        user={{ id: "user-1" }}
        onOpenModal={onOpenModal}
      />,
    );

    expect(screen.getByText("Property Valuation")).toBeInTheDocument();
    expect(screen.getByText("Remote available")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Book" }));
    fireEvent.click(screen.getByRole("button", { name: /Book a Consultation/i }));
    expect(onOpenModal).toHaveBeenNthCalledWith(1, "consult");
    expect(onOpenModal).toHaveBeenNthCalledWith(2, "consult");
    expect(screen.getAllByText("Mon").length).toBeGreaterThan(0);
    expect(screen.getAllByText((_content, element) => element?.textContent?.includes("09:00") ?? false).length).toBeGreaterThan(0);
  });

  it("falls back to inquiry actions and Pro-feature copy for free profiles", () => {
    const onOpenModal = vi.fn();
    renderWithProviders(
      <ProfessionalServicesTab
        dbServices={[{ ...service, rate_amount: null, video_enabled: false, is_premium: false }]}
        dbAvailability={[]}
        professionalIsPro={false}
        user={null}
        onOpenModal={onOpenModal}
      />,
    );

    expect(screen.getByText("On Request")).toBeInTheDocument();
    expect(screen.getByText(/Availability not yet configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Online booking is a Pro feature/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enquire" }));
    fireEvent.click(screen.getByRole("button", { name: /Send an Inquiry/i }));
    expect(onOpenModal).toHaveBeenNthCalledWith(1, "msg");
    expect(onOpenModal).toHaveBeenNthCalledWith(2, "msg");
  });

  it("renders empty service state", () => {
    renderWithProviders(
      <ProfessionalServicesTab
        dbServices={[]}
        dbAvailability={[]}
        professionalIsPro
        user={{ id: "user-1" }}
        onOpenModal={vi.fn()}
      />,
    );
    expect(screen.getByText(/No services listed yet/i)).toBeInTheDocument();
  });
});

describe("ProfessionalOverviewTab", () => {
  it("shows Pro real-estate agent social, portfolio KPI, and credential paths", () => {
    renderWithProviders(
      <ProfessionalOverviewTab
        pro={basePro as never}
        isRealEstateAgent
        professionalIsPro
        agentListingsCount={5}
        agentPortfolioKpis={{
          averageDealSize: "EUR 520,000",
          typologyMix: "villa 3, apartment 2",
          mainServiceArea: "Vouliagmeni",
          mainDealType: "Sale",
        }}
      />,
    );

    expect(screen.getByText("Helps clients buy and sell in Athens.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /agency.example/i })).toHaveAttribute("href", "https://agency.example");
    expect(screen.getByRole("link", { name: /Watch intro/i })).toHaveAttribute("href", "https://video.example/intro");
    expect(screen.getByText("Portfolio Analysis")).toBeInTheDocument();
    expect(screen.getAllByText("EUR 520,000").length).toBeGreaterThan(0);
    expect(screen.getByText("villa 3, apartment 2")).toBeInTheDocument();
    expect(screen.getByText("Average portfolio asset size:")).toBeInTheDocument();
    expect(screen.getByText("REA-123")).toBeInTheDocument();
    expect(screen.getByText("English, Greek")).toBeInTheDocument();
  });

  it("shows basic-agent portfolio and upgrade path", () => {
    renderWithProviders(
      <ProfessionalOverviewTab
        pro={{ ...basePro, subscription_tier: "free", website_url: "https://basic.example" } as never}
        isRealEstateAgent
        professionalIsPro={false}
        agentListingsCount={7}
      />,
    );

    expect(screen.getByText("Portfolio Overview")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See plans/i })).toHaveAttribute("href", "/pricing");
  });

  it("shows non-agent rates, projects, and specialties", () => {
    renderWithProviders(
      <ProfessionalOverviewTab
        pro={{ ...basePro, category: "valuer", average_portfolio_asset_size: null } as never}
        isRealEstateAgent={false}
        professionalIsPro
        agentListingsCount={0}
      />,
    );

    expect(screen.getByText("Consultation Rate")).toBeInTheDocument();
    expect(screen.getByText("Completed Projects")).toBeInTheDocument();
    expect(screen.getByText("Luxury")).toBeInTheDocument();
    expect(screen.getByText("Seaside")).toBeInTheDocument();
  });
});
