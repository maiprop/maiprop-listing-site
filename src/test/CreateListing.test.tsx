/**
 * Tests for the CreateListing wizard page. We shallow-mock the child
 * step components + all underlying hooks so we can drive the outer
 * navigation, guard branches, and draft banners without pulling in the
 * full useListingForm machinery.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { useAuthMock, useSubMock, useListingFormMock, useMyListingsMock, useListingMock, useConnectionsMock, getPlanLimitsMock, useFormWizardMock, toastMock, navigateMock, paramsState } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useSubMock: vi.fn(),
  useListingFormMock: vi.fn(),
  useMyListingsMock: vi.fn(),
  useListingMock: vi.fn(),
  useConnectionsMock: vi.fn(),
  getPlanLimitsMock: vi.fn(),
  useFormWizardMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
  navigateMock: vi.fn(),
  paramsState: { listingId: undefined as string | undefined },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => useSubMock() }));
vi.mock("@/hooks/useListingForm", () => ({ useListingForm: (...a: unknown[]) => useListingFormMock(...a) }));
vi.mock("@/hooks/useListings", () => ({
  useMyListings: () => useMyListingsMock(),
  useListing: (id: string) => useListingMock(id),
}));
vi.mock("@/hooks/useCreateListingConnections", () => ({ useCreateListingConnections: () => useConnectionsMock() }));
vi.mock("@/hooks/usePlanLimits", () => ({ getPlanLimits: (...a: unknown[]) => getPlanLimitsMock(...a) }));
vi.mock("@/hooks/useFormWizard", () => ({ useFormWizard: () => useFormWizardMock() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
// Shallow-mock every step so we never hit their internal inputs.
vi.mock("@/components/listings/StepType", () => ({ StepType: () => <div data-testid="step-type" /> }));
vi.mock("@/components/listings/StepDetails", () => ({ StepDetails: () => <div data-testid="step-details" /> }));
vi.mock("@/components/listings/StepFeatures", () => ({ StepFeatures: () => <div data-testid="step-features" /> }));
vi.mock("@/components/listings/StepLocation", () => ({ StepLocation: () => <div data-testid="step-location" /> }));
vi.mock("@/components/listings/StepPricing", () => ({ StepPricing: () => <div data-testid="step-pricing" /> }));
vi.mock("@/components/listings/StepPhotos", () => ({ StepPhotos: () => <div data-testid="step-photos" /> }));
vi.mock("@/lib/participantConfig", () => ({
  getParticipantTypeFromProfile: (p: { participant_type?: string } | null) => p?.participant_type ?? "buyer",
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock, useParams: () => paramsState };
});

import CreateListing from "@/pages/CreateListing";

const wrap = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
);

const baseWizard = (overrides: Record<string, unknown> = {}) => ({
  step: "type",
  stepIndex: 0,
  isFirst: true,
  isLast: false,
  goNext: vi.fn(),
  goPrev: vi.fn(),
  goTo: vi.fn(),
  ...overrides,
});

const baseForm = (overrides: Record<string, unknown> = {}) => ({
  form: {},
  errors: {},
  setErrors: vi.fn(),
  submitting: false,
  draftBanner: null as null | "visible" | "autosaved",
  aiDescLoading: false,
  aiPriceLoading: false,
  aiPriceSuggestion: null,
  images: [],
  coverImageId: null,
  setCoverImageId: vi.fn(),
  set: vi.fn(),
  toggle: vi.fn(),
  checkDraft: vi.fn(),
  handleSaveDraft: vi.fn(),
  handleRestoreDraft: vi.fn(),
  handleDiscardDraft: vi.fn(),
  handleFilesSelected: vi.fn(),
  handleDrop: vi.fn(),
  handleReorder: vi.fn(),
  handleRemove: vi.fn(),
  handleAiDescription: vi.fn(),
  handleAiPrice: vi.fn(),
  validateStep: vi.fn().mockReturnValue({}),
  handleSubmit: vi.fn(),
  completionPct: 20,
  ...overrides,
});

beforeEach(() => {
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({
    user: { id: "u-1" },
    profile: { role: "seller", participant_type: "seller" },
  });
  useSubMock.mockReset();
  useSubMock.mockReturnValue({ isPro: false });
  useListingFormMock.mockReset();
  useListingFormMock.mockReturnValue(baseForm());
  useMyListingsMock.mockReset();
  useMyListingsMock.mockReturnValue({ data: [] });
  useListingMock.mockReset();
  useListingMock.mockReturnValue({ data: null, isLoading: false });
  paramsState.listingId = undefined;
  useConnectionsMock.mockReset();
  useConnectionsMock.mockReturnValue({});
  getPlanLimitsMock.mockReset();
  getPlanLimitsMock.mockReturnValue({ listings: 5 });
  useFormWizardMock.mockReset();
  useFormWizardMock.mockReturnValue(baseWizard());
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  navigateMock.mockReset();
});

describe("CreateListing", () => {
  it("renders the wizard shell + step 'type' content when the user is an eligible seller", () => {
    render(<CreateListing />, { wrapper: wrap });
    expect(screen.getByText(/Create New Listing/i)).toBeInTheDocument();
    expect(screen.getByTestId("step-type")).toBeInTheDocument();
  });

  it("redirects non-eligible users (participant_type=buyer) and toasts an error", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { role: "buyer", participant_type: "buyer" },
    });
    render(<CreateListing />, { wrapper: wrap });
    // A spinner + 'Redirecting…' label appears.
    expect(screen.getByText(/Redirecting/i)).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalledWith(
      expect.stringMatching(/sellers, agents, institutions, and developers/i),
    );
    expect(navigateMock).toHaveBeenCalledWith("/dashboard/settings", { replace: true });
  });

  it("renders the 'Listing Limit Reached' card when the user is at their plan cap", () => {
    getPlanLimitsMock.mockReturnValue({ listings: 2 });
    useMyListingsMock.mockReturnValue({ data: [{ id: "a" }, { id: "b" }] });
    render(<CreateListing />, { wrapper: wrap });
    expect(screen.getByText(/Listing Limit Reached/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upgrade Plan/i })).toBeInTheDocument();
  });

  it("shows the 'Draft auto-saved' banner when draftBanner === 'autosaved'", () => {
    useListingFormMock.mockReturnValue(baseForm({ draftBanner: "autosaved" }));
    render(<CreateListing />, { wrapper: wrap });
    expect(screen.getByText(/Draft auto-saved/i)).toBeInTheDocument();
  });

  it("shows the 'saved draft' restore banner with Restore + Discard actions", () => {
    const handleRestoreDraft = vi.fn();
    const handleDiscardDraft = vi.fn();
    useListingFormMock.mockReturnValue(
      baseForm({ draftBanner: "visible", handleRestoreDraft, handleDiscardDraft }),
    );
    render(<CreateListing />, { wrapper: wrap });
    fireEvent.click(screen.getByRole("button", { name: /Restore/i }));
    expect(handleRestoreDraft).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Discard/i }));
    expect(handleDiscardDraft).toHaveBeenCalled();
  });

  it("renders the correct step content as `step` advances through the wizard", () => {
    const steps = ["type", "details", "features", "location", "pricing", "photos"] as const;
    for (const s of steps) {
      useFormWizardMock.mockReturnValue(baseWizard({ step: s, stepIndex: steps.indexOf(s) }));
      const { unmount } = render(<CreateListing />, { wrapper: wrap });
      expect(screen.getByTestId(`step-${s}`)).toBeInTheDocument();
      unmount();
    }
  });

  it("surfaces the progress percentage from useListingForm", () => {
    useListingFormMock.mockReturnValue(baseForm({ completionPct: 73 }));
    render(<CreateListing />, { wrapper: wrap });
    expect(screen.getByText("73%")).toBeInTheDocument();
  });

  it("resets pre-sale fields when a non-developer seller lands with a stale pre-sale form", () => {
    const set = vi.fn();
    useListingFormMock.mockReturnValue(baseForm({
      form: { is_pre_sale: true },
      set,
    }));
    render(<CreateListing />, { wrapper: wrap });

    expect(useListingFormMock).toHaveBeenCalledWith(expect.objectContaining({ allowPreSale: false, mode: "create" }));
    expect(set).toHaveBeenCalledWith("is_pre_sale", false);
    expect(set).toHaveBeenCalledWith("construction_status", "");
  });

  it("keeps the legacy pre-sale creation gate disabled for developers", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      profile: { role: "developer", participant_type: "developer" },
    });
    render(<CreateListing />, { wrapper: wrap });
    expect(useListingFormMock).toHaveBeenCalledWith(expect.objectContaining({ allowPreSale: false, mode: "create" }));
    expect(screen.getByTestId("step-type")).toBeInTheDocument();
  });

  it("hydrates the full listing editor and skips create-only listing caps", () => {
    paramsState.listingId = "l-edit";
    getPlanLimitsMock.mockReturnValue({ listings: 1 });
    useMyListingsMock.mockReturnValue({ data: [{ id: "existing" }] });
    const editListing = {
      id: "l-edit",
      owner_id: "u-1",
      title: "Editable home",
      listing_type: "sale",
      property_type: "apartment",
      listing_images: [],
      profiles: null,
      ownerIsPro: false,
      ownerParticipantType: "seller",
    };
    useListingMock.mockReturnValue({ data: editListing, isLoading: false });

    render(<CreateListing />, { wrapper: wrap });

    expect(screen.getByText(/Edit Listing/i)).toBeInTheDocument();
    expect(screen.queryByText(/Listing Limit Reached/i)).not.toBeInTheDocument();
    expect(useListingFormMock).toHaveBeenCalledWith(expect.objectContaining({
      mode: "edit",
      listingId: "l-edit",
      initialListing: editListing,
    }));
  });

  it("routes unavailable edit states back to the canonical listings dashboard", () => {
    paramsState.listingId = "missing";
    useListingMock.mockReturnValue({ data: null, isLoading: false });

    render(<CreateListing />, { wrapper: wrap });

    expect(screen.getByText(/Listing not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Listings/i })).toHaveAttribute("href", "/dashboard/listings");
  });

  it("shows publishing stuck-state controls while the submit mutation is pending", () => {
    const handleSaveDraft = vi.fn();
    const handleSubmit = vi.fn();
    useFormWizardMock.mockReturnValue(baseWizard({ step: "photos", stepIndex: 5, isFirst: false, isLast: true }));
    useListingFormMock.mockReturnValue(baseForm({
      submitting: true,
      handleSaveDraft,
      handleSubmit,
    }));
    render(<CreateListing />, { wrapper: wrap });

    expect(screen.getByRole("button", { name: /Save Draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Publishing/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Publishing/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(handleSaveDraft).not.toHaveBeenCalled();
  });
});
