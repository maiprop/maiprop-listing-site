import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoleSwitchModal } from "@/components/RoleSwitchModal";
import { ProfessionalReviewsTab } from "@/components/professionals/ProfessionalReviewsTab";
import { StepLocation } from "@/components/listings/StepLocation";
import type { ListingFormData } from "@/hooks/useListingForm";

const mocks = vi.hoisted(() => ({
  reviews: [] as Array<Record<string, unknown>>,
  submitReview: { isPending: false, mutate: vi.fn() },
}));

vi.mock("@/hooks/useProfessionalReviews", () => ({
  useProfessionalReviews: () => ({ data: mocks.reviews }),
  useSubmitReview: () => mocks.submitReview,
}));

vi.mock("@/lib/config", () => ({
  GOOGLE_MAPS_API_KEY: "",
  GOOGLE_PLACES_AUTOCOMPLETE_ENABLED: false,
}));

const form = (overrides: Partial<ListingFormData> = {}) => ({
  city: "",
  address: "",
  region: "",
  postal_code: "",
  cadastre_number: "",
  enfia_zone: "",
  ...overrides,
}) as ListingFormData;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reviews = [];
  mocks.submitReview.isPending = false;
  mocks.submitReview.mutate.mockImplementation((_payload, options) => options?.onSuccess?.());
});

describe("branch-heavy form and role components", () => {
  it.each([
    ["buyer", "investor", true, "Invitation required", "Apply for access"],
    ["buyer", "developer", false, "Paid plan required", "Continue to setup"],
    ["buyer", "agent", true, "Higher-tier plan required", "Continue to setup"],
    ["buyer", "professional", false, "Upgrade pricing applies", "Continue to setup"],
    ["professional", "buyer", true, "No refund on downgrade", "Switch role"],
    ["agent", "buyer", false, "Lower-tier plan", "Switch role"],
  ] as const)("renders role-switch branch %s to %s", (fromType, toType, hasActiveSub, notice, action) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <RoleSwitchModal
        fromType={fromType}
        toType={toType}
        hasActiveSub={hasActiveSub}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText(notice)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders role-specific data-safe notices and disabled confirming state", () => {
    render(
      <RoleSwitchModal
        fromType="developer"
        toType="seller"
        hasActiveSub
        confirming
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Your projects are archived/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /switch role/i })).toBeDisabled();
  });

  it("filters, writes, and submits professional reviews with tags and empty states", () => {
    mocks.reviews = [
      {
        id: "r1",
        rating: 5,
        title: "Excellent negotiator",
        body: "Handled the deal cleanly.",
        service_type: "Buyer Representation",
        property_city: "Athens",
        recommended: true,
        created_at: "2026-01-10T00:00:00Z",
        reviewer: { display_name: "Buyer One", avatar_url: null },
      },
      {
        id: "r2",
        rating: 3,
        title: null,
        body: "Average response time.",
        service_type: null,
        property_city: null,
        recommended: false,
        created_at: "2026-02-10T00:00:00Z",
        reviewer: { display_name: null, avatar_url: "https://example.com/avatar.jpg" },
      },
    ];
    const stats = { avg: 4, total: 2, recommended_pct: 50, by_star: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 } };
    render(
      <ProfessionalReviewsTab
        professionalId="pro-1"
        proCategory="real_estate_agent"
        displayName="Maria Agent"
        user={{ id: "user-1" }}
        reviewStats={stats}
      />,
    );

    expect(screen.getByText("4.0")).toBeInTheDocument();
    expect(screen.getByText("50% recommend")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /5/i })[0]);
    expect(screen.getByText("Excellent negotiator")).toBeInTheDocument();
    expect(screen.queryByText("Average response time.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /all/i }));
    expect(screen.getByText("Average response time.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /write a review/i }));
    fireEvent.click(screen.getAllByRole("button")[7]);
    fireEvent.change(screen.getByDisplayValue("Service type"), { target: { value: "Buyer Representation" } });
    fireEvent.change(screen.getByPlaceholderText("City"), { target: { value: "Athens" } });
    fireEvent.change(screen.getByPlaceholderText(/headline/i), { target: { value: "Sharp diligence" } });
    fireEvent.change(screen.getByPlaceholderText(/your experience/i), { target: { value: "Clear and quick." } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(mocks.submitReview.mutate).toHaveBeenCalledWith(expect.objectContaining({
      rating: 1,
      title: "Sharp diligence",
      body: "Clear and quick.",
      service_type: "",
      property_city: "Athens",
      recommended: false,
    }), expect.any(Object));
  });

  it("shows anonymous no-review state and opens first-review form for signed-in users", () => {
    render(
      <ProfessionalReviewsTab
        professionalId="pro-empty"
        proCategory="lawyer"
        displayName="Nikos Lawyer"
        user={{ id: "user-1" }}
        reviewStats={{ avg: 0, total: 0, recommended_pct: 0, by_star: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No reviews yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /be the first/i }));
    expect(screen.getByText("Your review")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/close review form/i));
    expect(screen.queryByText("Your review")).not.toBeInTheDocument();
  });

  it("handles StepLocation connection, validation, input, and Nominatim suggestion branches", async () => {
    const set = vi.fn();
    const setFieldRef = vi.fn(() => vi.fn());
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: vi.fn().mockResolvedValue([
        {
          display_name: "Voukourestiou 14, Athens, Attica, 10674",
          address: { road: "Voukourestiou", house_number: "14", city: "Athens", state: "Attica", postcode: "10674" },
        },
      ]),
    } as unknown as Response);

    render(
      <StepLocation
        form={form({ city: "Athens", address: "Voukourestiou" })}
        set={set}
        errors={{ city: "City is required", address: "Address is required" }}
        setFieldRef={setFieldRef}
        connections={{ loading: false, supabaseOk: false, storageOk: true, locationOk: false }}
        stepActive
      />,
    );

    expect(screen.getByText("Some services need attention")).toBeInTheDocument();
    expect(screen.getByText(/Supabase:.*Unavailable/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("e.g. Athens"), { target: { value: "Piraeus" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Voukourestiou 14"), { target: { value: "Voukourestiou 14" } });
    expect(set).toHaveBeenCalledWith("city", "Piraeus");
    expect(set).toHaveBeenCalledWith("address", "Voukourestiou 14");

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 450));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const suggestion = await screen.findByText(/Voukourestiou 14, Athens/i);
    fireEvent.click(suggestion);
    expect(set).toHaveBeenCalledWith("address", "14 Voukourestiou");
    expect(set).toHaveBeenCalledWith("city", "Athens");
    expect(set).toHaveBeenCalledWith("region", "Attica");
    expect(set).toHaveBeenCalledWith("postal_code", "10674");

    fireEvent.focus(screen.getByPlaceholderText("Attica"));
    fireEvent.click(screen.getByRole("option", { name: "Athens" }));
    expect(set).toHaveBeenCalledWith("region", "Athens");

    fetchMock.mockRestore();
  }, 10000);

  it("shows all-ok and loading connection branches for StepLocation", () => {
    const { rerender } = render(
      <StepLocation
        form={form()}
        set={vi.fn()}
        errors={{}}
        setFieldRef={() => () => undefined}
        connections={{ loading: true, supabaseOk: true, storageOk: true, locationOk: true, locationSource: "google" }}
        stepActive={false}
      />,
    );
    expect(screen.getByText(/Checking connections/i)).toBeInTheDocument();

    rerender(
      <StepLocation
        form={form()}
        set={vi.fn()}
        errors={{}}
        setFieldRef={() => () => undefined}
        connections={{ loading: false, supabaseOk: true, storageOk: true, locationOk: true, locationSource: "google" }}
        stepActive={false}
      />,
    );
    expect(screen.getByText("All required services connected")).toBeInTheDocument();
    expect(screen.getByText(/Google Places/i)).toBeInTheDocument();
  });
});
