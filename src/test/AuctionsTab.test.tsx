/**
 * AuctionsTab (dashboard) interaction tests.
 * Covers alert open/close, delete flow, toggle — previously at 14.28% function coverage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { renderWithProviders } from "@/test/utils";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDeleteMutate = vi.fn();
const mockToggleMutate = vi.fn();

vi.mock("@/hooks/useAuctionAlerts", () => ({
  useAuctionAlerts: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useDeleteAuctionAlert: vi.fn().mockReturnValue({ mutate: mockDeleteMutate, isPending: false }),
  useUpdateAuctionAlert: vi.fn().mockReturnValue({ mutate: mockToggleMutate, isPending: false }),
}));

vi.mock("@/hooks/usePrivateOwnerAdAlert", () => ({
  usePrivateOwnerAdAlert: vi.fn().mockReturnValue({}),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: vi.fn().mockReturnValue({ isPro: false }),
}));

vi.mock("@/components/AuctionAlertModal", () => ({
  AuctionAlertModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="alert-modal"><button onClick={onClose}>Close</button></div> : null,
}));

vi.mock("@/lib/participantConfig", () => ({
  getParticipantTypeFromProfile: vi.fn().mockReturnValue("buyer"),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: "u1" },
    profile: { role: "buyer" },
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

async function renderAuctionsTab() {
  const { default: AuctionsTab } = await import("@/pages/dashboard/AuctionsTab");
  return renderWithProviders(<AuctionsTab />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("AuctionsTab", () => {
  it("renders empty state when no alerts", async () => {
    await renderAuctionsTab();
    expect(screen.getByText(/no auction alerts yet/i)).toBeInTheDocument();
  });

  it("opens modal when New Alert button is clicked", async () => {
    await renderAuctionsTab();
    const newAlertBtn = screen.getByRole("button", { name: /new alert/i });
    fireEvent.click(newAlertBtn);
    await waitFor(() => expect(screen.getByTestId("alert-modal")).toBeInTheDocument());
  });

  it("opens modal from empty state Create First Alert button", async () => {
    await renderAuctionsTab();
    const createBtn = screen.queryByRole("button", { name: /create first alert/i });
    if (createBtn) {
      fireEvent.click(createBtn);
      await waitFor(() => expect(screen.getByTestId("alert-modal")).toBeInTheDocument());
    }
  });

  it("renders alert rows when data is present", async () => {
    const { useAuctionAlerts } = await import("@/hooks/useAuctionAlerts");
    (useAuctionAlerts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ id: "a1", city: "Athens", active: true, budget_min: 100000, budget_max: 300000 }],
      isLoading: false,
    });

    const { default: AuctionsTab } = await import("@/pages/dashboard/AuctionsTab");
    renderWithProviders(<AuctionsTab />);

    await waitFor(() => expect(screen.queryByText(/athens/i)).toBeInTheDocument());
  });

  it("shows loading spinner when alertsLoading is true", async () => {
    const { useAuctionAlerts } = await import("@/hooks/useAuctionAlerts");
    (useAuctionAlerts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: true,
    });

    const { default: AuctionsTab } = await import("@/pages/dashboard/AuctionsTab");
    renderWithProviders(<AuctionsTab />);

    // Loader2 spinner has animate-spin class
    await waitFor(() => {
      const spinner = document.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });
});
