import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PropertyReportCard } from "@/components/property/PropertyReportCard";
import type { ListingWithJoins } from "@/hooks/useListings";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useSubscription: vi.fn(),
  usePropertyReportAddonCredits: vi.fn(),
  useReportUsage: vi.fn(),
  mutateAsync: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.useAuth() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => mocks.useSubscription() }));
vi.mock("@/hooks/useUsageAddons", () => ({
  REPORT_EXTRA_COST: 49,
  REPORT_INCLUDED: 3,
  useRecordReport: () => ({ mutateAsync: mocks.mutateAsync }),
  usePropertyReportAddonCredits: () => mocks.usePropertyReportAddonCredits(),
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
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PropertyReportCard listingId="listing-1" listing={listing as ListingWithJoins} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PropertyReportCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/property/listing-1");
    mocks.useAuth.mockReturnValue({ user: { id: "user-1" } });
    mocks.useSubscription.mockReturnValue({ isPro: true });
    mocks.useReportUsage.mockReturnValue({ data: 0 });
    mocks.usePropertyReportAddonCredits.mockReturnValue({ data: 0 });
    mocks.mutateAsync.mockResolvedValue(undefined);
  });

  it("disables the report action when required listing data is missing", () => {
    renderCard({ listing: { ...listing, latitude: null } });

    expect(screen.getByText(/needs map coordinates/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /report unavailable/i })).toBeDisabled();
    expect(screen.queryByText(/downloadable os html report/i)).not.toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("switches to an unavailable disabled state when OS returns no report html", async () => {
    mocks.invoke.mockResolvedValue({
      data: { ok: true, report: null, reason: "No valuation report for this listing" },
      error: null,
    });

    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /load report/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("fetch-report-from-os", expect.objectContaining({
      body: expect.objectContaining({
        listing_id: "listing-1",
        report_type: "valuation",
        listing: expect.objectContaining({
          id: "listing-1",
          city: "Athens",
          latitude: 37.98,
          longitude: 23.72,
          sqm: 80,
        }),
      }),
    })));
    await waitFor(() => expect(screen.getByText(/No valuation report/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /report unavailable/i })).toBeDisabled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("shows HTML download and browser PDF actions when OS returns report html", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        report: {
          html: "<html><body>Report</body></html>",
          fileName: "maiprop-property-report-listing-1.html",
        },
      },
      error: null,
    });

    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /load report/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /download html/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /print \/ save pdf/i })).toBeInTheDocument();
  });

  it("allows a paid add-on credit after included property reports are used", async () => {
    mocks.useReportUsage.mockReturnValue({ data: 3 });
    mocks.usePropertyReportAddonCredits.mockReturnValue({ data: 1 });
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        report: {
          html: "<html><body>Paid credit report</body></html>",
          fileName: "paid-credit-report.html",
        },
      },
      error: null,
    });

    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /load report/i }));

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("fetch-report-from-os", expect.anything())
    );
  });

  it("starts property report add-on checkout when included reports and paid credits are exhausted", async () => {
    mocks.useReportUsage.mockReturnValue({ data: 3 });
    mocks.usePropertyReportAddonCredits.mockReturnValue({ data: 0 });
    mocks.invoke.mockResolvedValue({
      data: { url: "#stripe-checkout-session" },
      error: null,
    });

    renderCard();

    fireEvent.click(screen.getByRole("button", { name: /get extra report/i }));

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("create-checkout", {
        body: {
          addon_key: "property_report_single",
          target_type: "listing",
          target_id: "listing-1",
          success_url: "/property/listing-1?checkout=success&addon=property_report_single&target_id=listing-1",
          cancel_url: "/property/listing-1?checkout=cancelled&addon=property_report_single&target_id=listing-1",
        },
        timeout: 20_000,
      })
    );
    expect(screen.queryByRole("button", { name: /load report/i })).not.toBeInTheDocument();
  });

  it("opens printable reports without injecting executable script into the HTML blob", async () => {
    let openedBlob: Blob | null = null;
    const focusPrintFrame = vi.fn();
    const printFrame = vi.fn();
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      openedBlob = blob as Blob;
      return "blob:report";
    });
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        report: {
          html: "<html><body><h1>Report</h1></body></html>",
          fileName: "maiprop-property-report-listing-1.html",
        },
      },
      error: null,
    });

    try {
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: /load report/i }));
      const printButton = await screen.findByRole("button", { name: /print \/ save pdf/i });
      fireEvent.click(printButton);

      const iframe = document.querySelector('iframe[src="blob:report"]') as HTMLIFrameElement | null;
      expect(iframe).toBeTruthy();
      Object.defineProperty(iframe, "contentWindow", {
        configurable: true,
        value: { focus: focusPrintFrame, print: printFrame },
      });
      fireEvent.load(iframe as HTMLIFrameElement);

      expect(focusPrintFrame).toHaveBeenCalled();
      expect(printFrame).toHaveBeenCalled();
      expect(await openedBlob?.text()).not.toContain("<script");
    } finally {
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
      document.querySelector('iframe[src="blob:report"]')?.remove();
    }
  });
});
