import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useAuth: vi.fn(),
  useProfessional: vi.fn(),
  useRelatedProfessionals: vi.fn(),
  useServices: vi.fn(),
  useAvailability: vi.fn(),
  useListings: vi.fn(),
  useStartConversation: vi.fn(),
  useModal: vi.fn(),
  modal: { isOpen: vi.fn(), open: vi.fn(), close: vi.fn() },
  toast: { error: vi.fn() },
  invalidateQueries: vi.fn(),
  channelOn: vi.fn(),
  channelSubscribe: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { ...actual, useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) };
});

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.useAuth() }));
vi.mock("@/hooks/useProfessionals", () => ({
  useProfessional: (...args: unknown[]) => mocks.useProfessional(...args),
  useRelatedProfessionals: (...args: unknown[]) => mocks.useRelatedProfessionals(...args),
}));
vi.mock("@/hooks/useProfessionalServices", () => ({
  useProfessionalServices: (...args: unknown[]) => mocks.useServices(...args),
  useProfessionalAvailability: (...args: unknown[]) => mocks.useAvailability(...args),
}));
vi.mock("@/hooks/useListings", () => ({ useListings: (...args: unknown[]) => mocks.useListings(...args) }));
vi.mock("@/hooks/useProfessionalReviews", () => ({
  useProfessionalReviews: () => ({ data: [{ id: "review-1" }] }),
  computeStats: () => ({ total: 1, avg: 4, distribution: {} }),
}));
vi.mock("@/hooks/useMessages", () => ({ useStartConversation: () => mocks.useStartConversation() }));
vi.mock("@/hooks/useModal", () => ({ useModal: () => mocks.useModal() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: mocks.channelOn.mockReturnThis(),
      subscribe: mocks.channelSubscribe.mockReturnThis(),
    })),
    removeChannel: mocks.removeChannel,
  },
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer /> }));
vi.mock("@/components/SendMessageModal", () => ({ default: () => null }));
vi.mock("@/components/BookConsultationModal", () => ({ default: () => null }));
vi.mock("@/components/RequestCallbackModal", () => ({ default: () => null }));
vi.mock("@/components/AIServiceMatchModal", () => ({
  AIServiceMatchModal: ({ onClose, onNavigate }: { onClose: () => void; onNavigate: (category: string) => void }) => (
    <div>
      <button onClick={onClose}>Close AI match</button>
      <button onClick={() => onNavigate("valuer")}>Choose valuer</button>
    </div>
  ),
}));
vi.mock("@/components/professionals/ProfileComponents", () => ({
  StarRating: ({ rating }: { rating: number }) => <span>Rating stars {rating}</span>,
  ListingGrid: ({ listings }: { listings: { id: string; title?: string }[] }) => (
    <div>{listings.map((listing) => <span key={listing.id}>{listing.title ?? listing.id}</span>)}</div>
  ),
}));
vi.mock("@/components/professionals/ProfessionalOverviewTab", () => ({
  ProfessionalOverviewTab: () => <div>Professional overview</div>,
}));
vi.mock("@/components/professionals/ProfessionalServicesTab", () => ({
  ProfessionalServicesTab: ({ onOpenModal }: { onOpenModal: (key: "consult") => void }) => (
    <button onClick={() => onOpenModal("consult")}>Request service consultation</button>
  ),
}));
vi.mock("@/components/professionals/ProfessionalReviewsTab", () => ({
  ProfessionalReviewsTab: () => <div>Professional reviews</div>,
}));

import ProfessionalProfile from "@/pages/ProfessionalProfile";

const PROFILE_ID = "88888888-8888-4888-8888-888888888888";

const professional = (overrides: Record<string, unknown> = {}) => ({
  id: PROFILE_ID,
  user_id: "professional-user",
  display_name: "Nora Notary",
  title: "Notary Public",
  category: "notary",
  city: "Athens",
  bio: "Property transfer specialist",
  avatar_url: null,
  rating: 4.5,
  reviews_count: 3,
  verified: true,
  hourly_rate: 80,
  experience_years: 7,
  specialties: ["Transfers"],
  languages: ["Greek"],
  license_number: "NOTARY-1",
  website_url: "https://notary.example",
  video_link: null,
  projects_count: 11,
  average_deal_size: null,
  average_portfolio_asset_size: null,
  subscription_tier: "free",
  ...overrides,
});

const renderProfile = (path = `/professionals/${PROFILE_ID}`) => renderWithProviders(
  <Routes>
    <Route path="/professionals/:id" element={<ProfessionalProfile />} />
  </Routes>,
  { initialPath: path },
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: null });
  mocks.useProfessional.mockReturnValue({ data: professional(), isLoading: false });
  mocks.useRelatedProfessionals.mockReturnValue({ data: [] });
  mocks.useServices.mockReturnValue({ data: [] });
  mocks.useAvailability.mockReturnValue({ data: [] });
  mocks.useListings.mockReturnValue({ data: [] });
  mocks.useStartConversation.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue("conversation-1"), isPending: false });
  mocks.modal.isOpen.mockReturnValue(false);
  mocks.useModal.mockReturnValue(mocks.modal);
});

describe("ProfessionalProfile business branches", () => {
  it("shows loading without exposing stale profile details", () => {
    mocks.useProfessional.mockReturnValue({ data: null, isLoading: true });
    const { container } = renderProfile();

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Nora Notary")).not.toBeInTheDocument();
    expect(mocks.useRelatedProfessionals).toHaveBeenCalledWith(undefined, undefined);
  });

  it("shows a self-supplied license number without implying verified licensing", () => {
    mocks.useProfessional.mockReturnValue({ data: professional({ verified: false, license_number: "NOTARY-1" }), isLoading: false });
    renderProfile();
    expect(screen.getAllByText("Pending Verification").length).toBeGreaterThan(0);
    expect(screen.getByText("License number provided")).toBeInTheDocument();
    expect(screen.getByText("NOTARY-1")).toBeInTheDocument();
    expect(screen.queryByText("Licensed Professional")).not.toBeInTheDocument();
  });

  it("distinguishes loading and failed related requests from no peers", () => {
    mocks.useRelatedProfessionals.mockReturnValue({ data: undefined, isPending: true, isError: false });
    const loading = renderProfile();
    expect(screen.getByText("Loading similar professionals…")).toBeInTheDocument();
    expect(screen.queryByText("No others in this category yet.")).not.toBeInTheDocument();
    loading.unmount();

    mocks.useRelatedProfessionals.mockReturnValue({ data: undefined, isPending: false, isError: true });
    renderProfile();
    expect(screen.getByText("Could not load similar professionals.")).toBeInTheDocument();
    expect(screen.queryByText("No others in this category yet.")).not.toBeInTheDocument();
  });

  it("keeps sparse free-agent contact actions gated and derives fallback portfolio data", () => {
    mocks.useProfessional.mockReturnValue({
      data: professional({
        display_name: "Free Agent",
        title: "",
        category: "real_estate_agent",
        city: "",
        rating: null,
        reviews_count: null,
        verified: false,
        hourly_rate: null,
        experience_years: null,
        specialties: [],
        license_number: null,
        website_url: null,
        projects_count: null,
      }),
      isLoading: false,
    });
    mocks.useListings.mockReturnValue({
      data: [
        { id: "rent-1", listing_type: "rent", property_type: "", price: "not-a-number", city: "", region: "Peloponnese" },
        { id: "rent-2", listing_type: "rent", property_type: null, price: 0, city: "", region: "" },
      ],
    });

    renderProfile();

    expect(screen.getAllByText("Pending Verification").length).toBeGreaterThan(0);
    expect(screen.getByText("Active Listings")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /chat|send inquiry|book consultation/i })).not.toBeInTheDocument();
  });

  it("opens signed-in Pro services, callbacks, reviews, and AI category navigation", () => {
    mocks.useAuth.mockReturnValue({ user: { id: "buyer-1" } });
    mocks.useProfessional.mockReturnValue({
      data: professional({
        subscription_tier: "PRO",
        category: "specialist_not_in_catalog",
        avatar_url: "https://cdn.example/avatar.jpg",
        title: "",
        video_link: "https://video.example",
      }),
      isLoading: false,
    });
    mocks.useRelatedProfessionals.mockReturnValue({
      data: [
        { id: "peer-1", display_name: "", city: "", avatar_url: null },
        { id: "peer-2", display_name: "Peer Two", city: "Athens", avatar_url: "https://cdn.example/peer.jpg" },
      ],
    });
    mocks.modal.isOpen.mockImplementation((key: string) => key === "aiMatch");

    renderProfile();

    expect(screen.getByRole("img", { name: "Nora Notary" })).toHaveAttribute("src", "https://cdn.example/avatar.jpg");
    fireEvent.click(screen.getByRole("button", { name: /^services$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Request service consultation" }));
    fireEvent.click(screen.getByRole("button", { name: /request callback/i }));
    fireEvent.click(screen.getByRole("button", { name: /^reviews/i }));
    expect(screen.getByText("Professional reviews")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Choose valuer" }));
    fireEvent.click(screen.getByRole("button", { name: "Close AI match" }));

    expect(mocks.modal.open).toHaveBeenCalledWith("consult");
    expect(mocks.modal.open).toHaveBeenCalledWith("callback");
    expect(mocks.navigate).toHaveBeenCalledWith("/professionals?category=valuer");
    expect(mocks.modal.close).toHaveBeenCalled();
    expect(screen.getByText("Professional")).toBeInTheDocument();
    expect(screen.getByText("Greece")).toBeInTheDocument();
  });

  it("opens contact-query inquiries for authenticated Pro viewers and removes the one-shot query", async () => {
    mocks.useAuth.mockReturnValue({ user: { id: "buyer-1" } });
    mocks.useProfessional.mockReturnValue({ data: professional({ subscription_tier: "pro" }), isLoading: false });

    renderProfile(`/professionals/${PROFILE_ID}?contact=1`);

    await waitFor(() => expect(mocks.modal.open).toHaveBeenCalledWith("msg"));
    expect(mocks.navigate).not.toHaveBeenCalledWith("/login", expect.anything());
  });

  it("redirects anonymous contact-query inquiries to login but leaves free profiles gated", async () => {
    mocks.useProfessional.mockReturnValue({ data: professional({ subscription_tier: "pro" }), isLoading: false });
    const first = renderProfile(`/professionals/${PROFILE_ID}?contact=1`);

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Please sign in to send an inquiry."));
    expect(mocks.navigate).toHaveBeenCalledWith("/login", {
      state: { from: { pathname: `/professionals/${PROFILE_ID}` } },
    });
    first.unmount();

    vi.clearAllMocks();
    mocks.useProfessional.mockReturnValue({ data: professional({ subscription_tier: "free" }), isLoading: false });
    mocks.useRelatedProfessionals.mockReturnValue({ data: [] });
    mocks.useServices.mockReturnValue({ data: [] });
    mocks.useAvailability.mockReturnValue({ data: [] });
    mocks.useListings.mockReturnValue({ data: [] });
    mocks.useStartConversation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.useModal.mockReturnValue(mocks.modal);
    renderProfile(`/professionals/${PROFILE_ID}?contact=1`);

    await waitFor(() => expect(mocks.modal.open).not.toHaveBeenCalled());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("surfaces unavailable and failed chat states without navigating", async () => {
    mocks.useAuth.mockReturnValue({ user: { id: "buyer-1" } });
    mocks.useProfessional.mockReturnValue({
      data: professional({ subscription_tier: "pro", user_id: null }),
      isLoading: false,
    });
    const first = renderProfile();

    fireEvent.click(screen.getAllByRole("button", { name: /^chat$/i })[0]);
    expect(mocks.toast.error).toHaveBeenCalledWith("This professional cannot receive messages yet.");
    expect(mocks.navigate).not.toHaveBeenCalledWith("/messages", expect.anything());
    first.unmount();

    const mutateAsync = vi.fn().mockRejectedValue(new Error("conversation unavailable"));
    mocks.useProfessional.mockReturnValue({ data: professional({ subscription_tier: "pro" }), isLoading: false });
    mocks.useStartConversation.mockReturnValue({ mutateAsync, isPending: false });
    renderProfile();
    fireEvent.click(screen.getAllByRole("button", { name: /^chat$/i })[0]);

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Could not open chat."));
    expect(mocks.navigate).not.toHaveBeenCalledWith("/messages", expect.anything());
  });

  it("shows pending chat state and an empty Pro-agent portfolio", () => {
    mocks.useAuth.mockReturnValue({ user: { id: "buyer-1" } });
    mocks.useProfessional.mockReturnValue({
      data: professional({
        subscription_tier: "pro",
        category: "real_estate_agent",
        rating: 0,
        projects_count: 0,
        experience_years: 0,
        average_deal_size: "",
        average_portfolio_asset_size: "",
      }),
      isLoading: false,
    });
    mocks.useStartConversation.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    mocks.useListings.mockReturnValue({ data: [] });

    const { container } = renderProfile();
    expect(container.querySelectorAll(".animate-spin").length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole("button", { name: /^listings$/i }));
    expect(screen.getByText("No active listings at the moment.")).toBeInTheDocument();
    expect(screen.getAllByText("New").length).toBeGreaterThan(0);
  });

  it("invalidates an agent portfolio on realtime listing changes and unsubscribes", () => {
    mocks.channelOn.mockImplementation(() => ({ on: mocks.channelOn, subscribe: mocks.channelSubscribe }));
    mocks.channelSubscribe.mockReturnValue({ id: "listing-channel" });
    mocks.useProfessional.mockReturnValue({
      data: professional({ subscription_tier: "pro", category: "real_estate_agent" }),
      isLoading: false,
    });
    mocks.useListings.mockReturnValue({
      data: [{ id: "sale-1", title: "Sale Home", listing_type: "sale", property_type: "villa", price: 450000, city: "Athens" }],
    });

    const view = renderProfile();
    const listingChange = mocks.channelOn.mock.calls.find(([event]) => event === "postgres_changes")?.[2] as (() => void) | undefined;
    expect(listingChange).toBeTypeOf("function");
    act(() => listingChange?.());
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["listings"] });

    fireEvent.click(screen.getByRole("button", { name: /^listings/i }));
    expect(screen.getByText("Sale Home")).toBeInTheDocument();
    expect(screen.queryByText("For Rent")).not.toBeInTheDocument();

    view.unmount();
    expect(mocks.removeChannel).toHaveBeenCalled();
  });

  it("handles a malformed professionals response as an empty peer directory", () => {
    mocks.useRelatedProfessionals.mockReturnValue({ data: { unexpected: true } });
    renderProfile();
    expect(screen.getByText("No others in this category yet.")).toBeInTheDocument();
  });
});
