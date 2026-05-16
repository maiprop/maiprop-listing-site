import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PropertyReportCard } from "@/components/property/PropertyReportCard";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useSubscription: vi.fn(),
  useReportUsage: vi.fn(),
  mutateAsync: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.useAuth() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => mocks.useSubscription() }));
vi.mock("@/hooks/useUsageAddons", () => ({
  REPORT_EXTRA_COST: 9,
  REPORT_INCLUDED: 3,
  useRecordReport: () => ({ mutateAsync: mocks.mutateAsync }),
  useReportUsage: () => mocks.useReportUsage(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

const listing = {
  id: "listing-1",
  title: "Test listing",
  city: "Athens",
  latitude: 37.98,
  longitude: 23.72,
  sqm: 80,
};

function renderCard(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PropertyReportCard listingId="listing-1" listing={listing as any} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PropertyReportCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: "user-1" } });
    mocks.useSubscription.mockReturnValue({ isPro: true });
    mocks.useReportUsage.mockReturnValue({ data: 0 });
    mocks.mutateAsync.mockResolvedValue(undefined);
  });

  it("disables the report action when required listing data is missing", () => {
    renderCard({ listing: { ...listing, latitude: null } });

    expect(screen.getByText(/needs map coordinates/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /report unavailable/i })).toBeDisabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("switches to an unavailable disabled state when OS returns no report html", async () => {
    mocks.invoke.mockResolvedValue({
      data: { ok: true, report: null, reason: "No valuation report for this listing" },
      error: null,
    });

    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /load report/i }));

    await waitFor(() => expect(screen.getByText(/No valuation report/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /report unavailable/i })).toBeDisabled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});
