import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const useProfessionalsMock = vi.fn();
const useAuthMock = vi.fn();
const useSubscriptionMock = vi.fn();
const modalNavigateMock = vi.fn<(category: string) => void>();

vi.mock("@/hooks/useProfessionals", () => ({
  useProfessionals: () => useProfessionalsMock(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => useSubscriptionMock(),
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/AIServiceMatchModal", () => ({
  AIServiceMatchModal: ({ onClose, onNavigate }: { onClose: () => void; onNavigate: (category: string) => void }) => {
    modalNavigateMock.mockImplementation(onNavigate);
    return (
      <div role="dialog" aria-label="AI service match">
        <button onClick={() => { modalNavigateMock("architect"); onNavigate("architect"); }}>Choose architect</button>
        <button onClick={onClose}>Close</button>
      </div>
    );
  },
}));

const pros = [
  {
    id: "agent-1",
    display_name: "Maria Agent",
    title: "Residential Advisor",
    category: "real_estate_agent",
    city: "Athens",
    rating: 4.9,
    reviews_count: 12,
    projects_count: 8,
    experience_years: 10,
    specialties: ["Buying", "Rentals"],
    subscription_tier: "pro",
    verified: true,
  },
  {
    id: "architect-1",
    display_name: "Nikos Architect",
    title: "Renovation Architect",
    category: "architect",
    city: "Chania",
    rating: 0,
    reviews_count: 0,
    projects_count: 2,
    experience_years: 3,
    specialties: ["Permits", "Renovation"],
    subscription_tier: "free",
    verified: false,
  },
  {
    id: "valuer-1",
    display_name: "Petros Valuer",
    title: "Bank Valuer",
    category: "financial_advisor",
    city: "Patras",
    rating: 4.2,
    reviews_count: 3,
    projects_count: 5,
    experience_years: 7,
    specialties: ["Valuations"],
    subscription_tier: "free",
    verified: true,
  },
];

describe("Professionals page behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfessionalsMock.mockReturnValue({ data: pros, isLoading: false });
    useAuthMock.mockReturnValue({ user: null, profile: null });
    useSubscriptionMock.mockReturnValue({ isPro: false });
  });

  it("filters by URL category and links pro contact actions directly to contact mode", async () => {
    const { default: Professionals } = await import("@/pages/Professionals");

    renderWithProviders(<Professionals />, { initialPath: "/professionals?category=real_estate_agent" });

    expect(screen.getByText("Maria Agent")).toBeInTheDocument();
    expect(screen.queryByText("Nikos Architect")).not.toBeInTheDocument();
    expect(screen.getByText(/1 professional found in Real Estate Agents/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contact maria agent/i })).toHaveAttribute(
      "href",
      "/professionals/agent-1?contact=1",
    );
  });

  it("searches names, titles, specialties, and city without mutating the URL", async () => {
    const { default: Professionals } = await import("@/pages/Professionals");

    renderWithProviders(<Professionals />, { initialPath: "/professionals" });

    fireEvent.change(screen.getByLabelText(/search professionals/i), { target: { value: "permits" } });

    expect(screen.getByText("Nikos Architect")).toBeInTheDocument();
    expect(screen.queryByText("Maria Agent")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view contact details for nikos architect/i })).toHaveAttribute(
      "href",
      "/professionals/architect-1",
    );
  });

  it("toggles desktop category groups and clears back to all professionals", async () => {
    const { default: Professionals } = await import("@/pages/Professionals");

    renderWithProviders(<Professionals />, { initialPath: "/professionals" });

    fireEvent.click(screen.getByRole("button", { name: /design & planning/i }));
    expect(screen.getByText("Nikos Architect")).toBeInTheDocument();
    expect(screen.queryByText("Maria Agent")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /all professionals/i }));
    expect(screen.getByText("Maria Agent")).toBeInTheDocument();
    expect(screen.getByText("Nikos Architect")).toBeInTheDocument();
  });

  it("shows loading, empty, and AI modal navigation states", async () => {
    const { default: Professionals } = await import("@/pages/Professionals");

    useProfessionalsMock.mockReturnValueOnce({ data: [], isLoading: true });
    const { rerender } = renderWithProviders(<Professionals />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();

    useProfessionalsMock.mockReturnValueOnce({ data: [], isLoading: false });
    rerender(<Professionals />);
    expect(screen.getByText("No professionals found")).toBeInTheDocument();

    useProfessionalsMock.mockReturnValue({ data: pros, isLoading: false });
    rerender(<Professionals />);
    fireEvent.click(screen.getByRole("button", { name: /explore directory/i }));
    expect(screen.getByRole("dialog", { name: /ai service match/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /choose architect/i }));
    expect(modalNavigateMock).toHaveBeenCalledWith("architect");
    expect(screen.getByText("Nikos Architect")).toBeInTheDocument();
  });

  it("falls back for sparse and unknown professional records", async () => {
    useProfessionalsMock.mockReturnValue({
      data: [
        {
          id: "unknown-1",
          display_name: "",
          title: "",
          category: "drone_operator",
          city: "",
          rating: null,
          reviews_count: null,
          projects_count: null,
          experience_years: null,
          specialties: [],
          subscription_tier: "FREE",
          verified: false,
          hourly_rate: 60,
        },
      ],
      isLoading: false,
    });
    const { default: Professionals } = await import("@/pages/Professionals");

    renderWithProviders(<Professionals />, { initialPath: "/professionals" });

    expect(screen.getAllByText("Professional").length).toBeGreaterThan(0);
    expect(screen.getByText(/drone_operator/i)).toBeInTheDocument();
    expect(screen.getByText("Greece")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/€60\/hr/)).toBeInTheDocument();
  });

  it("handles URL/category edge cases, mobile category changes, and scroller controls", async () => {
    const scrollByMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollBy", {
      configurable: true,
      value: scrollByMock,
    });
    const { default: Professionals } = await import("@/pages/Professionals");

    const { rerender } = renderWithProviders(<Professionals />, { initialPath: "/professionals?category=not_a_category" });

    expect(screen.getByText("No professionals found")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "finance" } });
    expect(screen.getByText("1 professional found in Finance & Insurance")).toBeInTheDocument();
    expect(screen.getByText("Petros Valuer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /scroll categories left/i }));
    fireEvent.click(screen.getByRole("button", { name: /scroll categories right/i }));
    expect(scrollByMock).toHaveBeenCalledWith({ left: -280, behavior: "smooth" });
    expect(scrollByMock).toHaveBeenCalledWith({ left: 280, behavior: "smooth" });

    rerender(<Professionals />);
    fireEvent.change(screen.getByLabelText(/search professionals/i), { target: { value: "not-found" } });
    expect(screen.getByText("No professionals found")).toBeInTheDocument();
  });

  it("limits free buyer directory browsing to the configured per-category window", async () => {
    useProfessionalsMock.mockReturnValue({
      data: Array.from({ length: 6 }, (_, index) => ({
        id: `architect-${index + 1}`,
        display_name: `Architect ${index + 1}`,
        title: "Architect",
        category: "architect",
        city: "Athens",
        rating: 4,
        reviews_count: 1,
        projects_count: 1,
        experience_years: 5,
        specialties: [],
        subscription_tier: "free",
        verified: false,
      })),
      isLoading: false,
    });
    const { default: Professionals } = await import("@/pages/Professionals");

    renderWithProviders(<Professionals />, { initialPath: "/professionals?category=architect" });

    expect(screen.getByText("Architect 1")).toBeInTheDocument();
    expect(screen.getByText("Architect 5")).toBeInTheDocument();
    expect(screen.queryByText("Architect 6")).not.toBeInTheDocument();
    expect(screen.getByText(/5 professionals found in Design & Planning/i)).toBeInTheDocument();
  });

  it("does not let search reveal professionals outside the free per-category window", async () => {
    useProfessionalsMock.mockReturnValue({
      data: Array.from({ length: 6 }, (_, index) => ({
        id: `architect-search-${index + 1}`,
        display_name: `Architect ${index + 1}`,
        title: "Architect",
        category: "architect",
        city: "Athens",
        rating: 4,
        reviews_count: 1,
        projects_count: 1,
        experience_years: 5,
        specialties: [],
        subscription_tier: "free",
        verified: false,
      })),
      isLoading: false,
    });
    const { default: Professionals } = await import("@/pages/Professionals");

    renderWithProviders(<Professionals />, { initialPath: "/professionals?category=architect" });
    fireEvent.change(screen.getByLabelText(/search professionals/i), { target: { value: "Architect 6" } });

    expect(screen.queryByText("Architect 6")).not.toBeInTheDocument();
    expect(screen.getByText("No professionals found")).toBeInTheDocument();
  });

  it("keeps Pro directory browsing unlimited", async () => {
    useSubscriptionMock.mockReturnValue({ isPro: true });
    useProfessionalsMock.mockReturnValue({
      data: Array.from({ length: 6 }, (_, index) => ({
        id: `architect-pro-${index + 1}`,
        display_name: `Pro Architect ${index + 1}`,
        title: "Architect",
        category: "architect",
        city: "Athens",
        rating: 4,
        reviews_count: 1,
        projects_count: 1,
        experience_years: 5,
        specialties: [],
        subscription_tier: "free",
        verified: false,
      })),
      isLoading: false,
    });
    const { default: Professionals } = await import("@/pages/Professionals");

    renderWithProviders(<Professionals />, { initialPath: "/professionals?category=architect" });

    expect(screen.getByText("Pro Architect 6")).toBeInTheDocument();
    expect(screen.getByText(/6 professionals found in Design & Planning/i)).toBeInTheDocument();
  });
});
