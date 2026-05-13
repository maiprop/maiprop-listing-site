/**
 * Tests for the `Portfolios` page. We mock the data layer (usePortfolios,
 * usePortfolio, useFavorites + the 3 mutations), the auth context, the
 * Navbar/Footer/PropertyCard/ProGate to keep the render light, and the
 * sonner toast.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const {
  useAuthMock, usePortfoliosMock, usePortfolioMock, useFavoritesMock,
  createMutMock, updateMutMock, deleteMutMock, toastMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  usePortfoliosMock: vi.fn(),
  usePortfolioMock: vi.fn(),
  useFavoritesMock: vi.fn(),
  createMutMock: vi.fn(),
  updateMutMock: vi.fn(),
  deleteMutMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/usePortfolios", () => ({
  usePortfolios: () => usePortfoliosMock(),
  usePortfolio: (id: string) => usePortfolioMock(id),
  useCreatePortfolio: () => createMutMock(),
  useUpdatePortfolio: () => updateMutMock(),
  useDeletePortfolio: () => deleteMutMock(),
}));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => useFavoritesMock() }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <div data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <div data-testid="footer" /> }));
vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: ({ property }: { property: { title: string; id: string } }) =>
    <div data-testid="prop-card">{property.title}</div>,
}));
vi.mock("@/components/gates/ProGate", () => ({
  ProGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/listingUtils", () => ({
  dbListingToCard: (l: { id: string; title: string }) => ({ id: l.id, title: l.title }),
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import Portfolios from "@/pages/Portfolios";

const wrap = (ui: React.ReactNode) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>
);

beforeEach(() => {
  useAuthMock.mockReset();
  usePortfoliosMock.mockReset();
  usePortfolioMock.mockReset();
  useFavoritesMock.mockReset();
  createMutMock.mockReset();
  updateMutMock.mockReset();
  deleteMutMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();

  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
  useFavoritesMock.mockReturnValue({ data: [] });
  usePortfolioMock.mockReturnValue({ data: null });
  createMutMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  updateMutMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  deleteMutMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe("Portfolios — auth gate", () => {
  it("renders a sign-in prompt when no user is logged in", () => {
    useAuthMock.mockReturnValue({ user: null });
    usePortfoliosMock.mockReturnValue({ data: [], isLoading: false });
    render(wrap(<Portfolios />));
    expect(screen.getByText(/Sign in to manage portfolios/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in/i })).toHaveAttribute("href", "/login");
  });
});

describe("Portfolios — empty + loading states", () => {
  it("renders the loading spinner while the portfolios query is in flight", () => {
    usePortfoliosMock.mockReturnValue({ data: [], isLoading: true });
    const { container } = render(wrap(<Portfolios />));
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows the 'No portfolios yet' empty state and a Create CTA", () => {
    usePortfoliosMock.mockReturnValue({ data: [], isLoading: false });
    render(wrap(<Portfolios />));
    expect(screen.getByText(/No portfolios yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create your first portfolio/i })).toBeInTheDocument();
  });

  it("opens the create panel when 'New Portfolio' is clicked, and rejects empty submissions", () => {
    const create = vi.fn();
    createMutMock.mockReturnValue({ mutate: create, isPending: false });
    usePortfoliosMock.mockReturnValue({ data: [], isLoading: false });
    render(wrap(<Portfolios />));
    fireEvent.click(screen.getByRole("button", { name: /^New Portfolio$/i }));
    // Now the input + Create button appear.
    fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/required/i));
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a portfolio with the trimmed name when Create is clicked", () => {
    const create = vi.fn().mockImplementation((_: string, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    createMutMock.mockReturnValue({ mutate: create, isPending: false });
    usePortfoliosMock.mockReturnValue({ data: [], isLoading: false });
    render(wrap(<Portfolios />));
    fireEvent.click(screen.getByRole("button", { name: /^New Portfolio$/i }));
    const input = screen.getByPlaceholderText(/Athens Buy-to-Let/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  My pf  " } });
    fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));
    expect(create).toHaveBeenCalledWith("My pf", expect.any(Object));
    // After successful create the panel collapses.
    expect(screen.queryByPlaceholderText(/Athens Buy-to-Let/i)).toBeNull();
  });
});

describe("Portfolios — portfolio cards", () => {
  const portfolio = {
    id: "p-1",
    name: "Greek beach houses",
    listing_ids: ["l-1"],
    listings: [{ id: "l-1", title: "Bright apt", price: 250_000 }],
  };

  it("renders the portfolio with its property count + total value", () => {
    usePortfoliosMock.mockReturnValue({ data: [portfolio], isLoading: false });
    usePortfolioMock.mockReturnValue({ data: portfolio });
    render(wrap(<Portfolios />));
    expect(screen.getByText("Greek beach houses")).toBeInTheDocument();
    // Pattern matcher because '1 properties · €250,000 total' is split text.
    expect(screen.getByText(/1 properties/)).toBeInTheDocument();
    expect(screen.getByText(/€250,000/)).toBeInTheDocument();
    // PropertyCard mock renders the title.
    expect(screen.getByTestId("prop-card")).toHaveTextContent("Bright apt");
  });

  it("Rename → Save calls updatePortfolio.mutate with the new name", () => {
    const update = vi.fn().mockImplementation((_: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    updateMutMock.mockReturnValue({ mutate: update, isPending: false });
    usePortfoliosMock.mockReturnValue({ data: [portfolio], isLoading: false });
    usePortfolioMock.mockReturnValue({ data: portfolio });
    render(wrap(<Portfolios />));
    fireEvent.click(screen.getByLabelText(/Rename portfolio/i));
    const editInput = screen.getByDisplayValue("Greek beach houses") as HTMLInputElement;
    fireEvent.change(editInput, { target: { value: "Renamed pf" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(update).toHaveBeenCalledWith(
      { id: "p-1", updates: { name: "Renamed pf" } },
      expect.any(Object),
    );
  });

  it("Delete opens the confirmation dialog and then calls deletePortfolio.mutate", () => {
    const del = vi.fn();
    deleteMutMock.mockReturnValue({ mutate: del, isPending: false });
    usePortfoliosMock.mockReturnValue({ data: [portfolio], isLoading: false });
    usePortfolioMock.mockReturnValue({ data: portfolio });
    render(wrap(<Portfolios />));
    fireEvent.click(screen.getByLabelText(/Delete portfolio/i));
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(del).toHaveBeenCalledWith("p-1");
  });

  it("Canceling delete does NOT mutate", () => {
    const del = vi.fn();
    deleteMutMock.mockReturnValue({ mutate: del, isPending: false });
    usePortfoliosMock.mockReturnValue({ data: [portfolio], isLoading: false });
    usePortfolioMock.mockReturnValue({ data: portfolio });
    render(wrap(<Portfolios />));
    fireEvent.click(screen.getByLabelText(/Delete portfolio/i));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(del).not.toHaveBeenCalled();
  });

  it("'Add from saved' surfaces favourite listings and adds them on click", () => {
    const update = vi.fn();
    updateMutMock.mockReturnValue({ mutate: update, isPending: false });
    useFavoritesMock.mockReturnValue({
      data: [
        { listings: { id: "fav-1", title: "Sea view" } },
        { listings: { id: "l-1", title: "Already in pf" } }, // filtered out
      ],
    });
    usePortfoliosMock.mockReturnValue({ data: [portfolio], isLoading: false });
    usePortfolioMock.mockReturnValue({ data: portfolio });
    render(wrap(<Portfolios />));
    fireEvent.click(screen.getByRole("button", { name: /\+ Add from saved/i }));
    // Only the listing not yet in the portfolio is offered.
    const addBtn = screen.getByRole("button", { name: /Sea view/i });
    fireEvent.click(addBtn);
    expect(update).toHaveBeenCalledWith({
      id: "p-1",
      updates: { listing_ids: ["l-1", "fav-1"] },
    });
  });

  it("'Remove' on a property strips it from the portfolio", () => {
    const update = vi.fn();
    updateMutMock.mockReturnValue({ mutate: update, isPending: false });
    usePortfoliosMock.mockReturnValue({ data: [portfolio], isLoading: false });
    usePortfolioMock.mockReturnValue({ data: portfolio });
    render(wrap(<Portfolios />));
    fireEvent.click(screen.getByRole("button", { name: /Remove/i }));
    expect(update).toHaveBeenCalledWith({ id: "p-1", updates: { listing_ids: [] } });
  });

  it("'+ Add from saved' shows a 'Browse listings' message when no favourites are available to add", () => {
    useFavoritesMock.mockReturnValue({ data: [] });
    usePortfoliosMock.mockReturnValue({ data: [portfolio], isLoading: false });
    usePortfolioMock.mockReturnValue({ data: portfolio });
    render(wrap(<Portfolios />));
    fireEvent.click(screen.getByRole("button", { name: /\+ Add from saved/i }));
    expect(screen.getByText(/No saved properties/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse listings/i })).toHaveAttribute("href", "/listings");
  });
});
