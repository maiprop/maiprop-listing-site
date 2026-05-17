import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { authState, subscriptionState } = vi.hoisted(() => ({
  authState: { user: null as { id: string } | null },
  subscriptionState: { isPro: false },
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => subscriptionState }));

import DocumentTemplates from "@/pages/DocumentTemplates";

const renderPage = () =>
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <DocumentTemplates />
    </MemoryRouter>,
  );

beforeEach(() => {
  authState.user = null;
  subscriptionState.isPro = false;
  URL.createObjectURL = vi.fn(() => "blob:template");
  URL.revokeObjectURL = vi.fn();
});

describe("DocumentTemplates behavior", () => {
  it("switches categories, previews, closes overlays, and gates anonymous downloads", () => {
    renderPage();

    expect(screen.getByText("Preliminary Purchase Agreement")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rental Templates/i }));
    expect(screen.queryByText("Preliminary Purchase Agreement")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Investor Templates/i }));
    expect(screen.getAllByText(/Investor/i).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: /Sale Templates/i }));

    fireEvent.click(screen.getAllByRole("button", { name: /Preview/i })[0]);
    expect(screen.getAllByText("Preliminary Purchase Agreement").length).toBeGreaterThan(1);
    fireEvent.click(screen.getAllByRole("button", { name: /Pro Only/i }).at(-1)!);
    expect(screen.getByText("Pro Plan Required")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Maybe Later/i }));
    expect(screen.queryByText("Pro Plan Required")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Close preview/i }));
    expect(screen.getAllByText("Preliminary Purchase Agreement")).toHaveLength(1);

    fireEvent.click(screen.getAllByRole("button", { name: /Pro Only/i })[0]);
    expect(screen.getByText("Pro Plan Required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upgrade to Pro/i })).toHaveAttribute("href", "/pricing");
  });

  it("downloads templates for Pro users from card and preview actions", () => {
    authState.user = { id: "user-1" };
    subscriptionState.isPro = true;
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");

    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /Download/i })[0]);
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:template");

    fireEvent.click(screen.getAllByRole("button", { name: /Preview/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Download/i })[0]);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  });
});
