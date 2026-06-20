import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FiresaleInvestorPanel } from "@/components/firesale/FiresaleInvestorPanel";
import { renderWithProviders } from "@/test/utils";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/hooks/useEligibleForQuickSale", () => ({
  useEligibleForQuickSale: () => ({ eligible: false }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

describe("FiresaleInvestorPanel accessibility", () => {
  it("does not render comparison table values with low-opacity muted text", () => {
    renderWithProviders(<FiresaleInvestorPanel invitationStatus="none" onRequestInvitation={vi.fn()} />);

    expect(screen.getByText("Traditional").className).not.toContain("text-muted-foreground/60");
    expect(screen.getByText("3-6 months").className).not.toContain("text-muted-foreground/60");
  });
});
