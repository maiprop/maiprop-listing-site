/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const {
  useAuthMock,
  useOpenHouseSettingsMock,
  useOpenHouseRegistrationsMock,
  useOpenHouseOffersMock,
  useUpsertOpenHouseSettingsMock,
  useUpdateOpenHouseRegistrationMock,
  useUpdateOpenHouseOfferMock,
  useAcceptOpenHouseOfferMock,
  useReopenOpenHouseOfferSelectionMock,
  useRevealAllOffersMock,
  useMyOpenHouseRegistrationsMock,
  useMyOpenHouseOffersMock,
  getOpenHouseDocSignedUrlMock,
  updateRegMock,
  updateOfferMock,
  acceptOfferMock,
  reopenSelectionMock,
  revealAllMock,
  upsertSettingsMock,
  toastMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useOpenHouseSettingsMock: vi.fn(),
  useOpenHouseRegistrationsMock: vi.fn(),
  useOpenHouseOffersMock: vi.fn(),
  useUpsertOpenHouseSettingsMock: vi.fn(),
  useUpdateOpenHouseRegistrationMock: vi.fn(),
  useUpdateOpenHouseOfferMock: vi.fn(),
  useAcceptOpenHouseOfferMock: vi.fn(),
  useReopenOpenHouseOfferSelectionMock: vi.fn(),
  useRevealAllOffersMock: vi.fn(),
  useMyOpenHouseRegistrationsMock: vi.fn(),
  useMyOpenHouseOffersMock: vi.fn(),
  getOpenHouseDocSignedUrlMock: vi.fn(),
  updateRegMock: { mutate: vi.fn(), isPending: false },
  updateOfferMock: { mutate: vi.fn(), isPending: false },
  acceptOfferMock: { mutate: vi.fn(), isPending: false },
  reopenSelectionMock: { mutate: vi.fn(), isPending: false },
  revealAllMock: { mutate: vi.fn(), isPending: false },
  upsertSettingsMock: { mutate: vi.fn(), isPending: false },
  toastMock: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useManageableOrganizations", () => ({ useManageableOrganizations: () => ({ data: [], isLoading: false }) }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/hooks/useOpenHouseAssetControl", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useOpenHouseAssetControl")>(
    "@/hooks/useOpenHouseAssetControl",
  );
  return {
    ...actual,
    useOpenHouseSettings: (...a: unknown[]) => useOpenHouseSettingsMock(...a),
    useOpenHouseRegistrations: (...a: unknown[]) => useOpenHouseRegistrationsMock(...a),
    useOpenHouseOffers: (...a: unknown[]) => useOpenHouseOffersMock(...a),
    useUpsertOpenHouseSettings: () => useUpsertOpenHouseSettingsMock(),
    useUpdateOpenHouseRegistration: () => useUpdateOpenHouseRegistrationMock(),
    useUpdateOpenHouseOffer: () => useUpdateOpenHouseOfferMock(),
    useAcceptOpenHouseOffer: () => useAcceptOpenHouseOfferMock(),
    useReopenOpenHouseOfferSelection: () => useReopenOpenHouseOfferSelectionMock(),
    useRevealAllOffers: () => useRevealAllOffersMock(),
    useMyOpenHouseRegistrations: () => useMyOpenHouseRegistrationsMock(),
    useMyOpenHouseOffers: () => useMyOpenHouseOffersMock(),
    getOpenHouseDocSignedUrl: (...a: unknown[]) => getOpenHouseDocSignedUrlMock(...a),
  };
});

import OpenHouseAssetControlPanel from "@/components/OpenHouseAssetControlPanel";
import OpenHouseDashboardSection from "@/components/OpenHouseDashboardSection";

const settings = {
  id: "settings-1",
  listing_id: "listing-1",
  timeslots: [{ start: "10:00", end: "11:00", max_visitors: 2 }],
  max_visitors_per_slot: 2,
  max_total_visitors: null,
  broker_required: false,
  require_proof_of_funds: true,
  min_proof_amount: 200000,
  require_investor_declaration: true,
  offer_deadline: null,
  allow_sealed_bids: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const completeRegistration = {
  id: "reg-complete",
  requester_id: "buyer-1",
  status: "pending",
  timeslot_index: 0,
  contact_name: "Complete Buyer",
  contact_email: "complete@example.com",
  contact_phone: "+306911111111",
  contact_permission_at: "2026-01-01T00:00:00.000Z",
  id_verification_consent_at: "2026-01-01T00:00:00.000Z",
  privacy_acknowledged_at: "2026-01-01T00:00:00.000Z",
  visit_purpose: "Buying",
  id_doc_url: "docs/id.pdf",
  id_verified_at: "2026-01-01T00:00:00.000Z",
  waiver_signed_at: "2026-01-01T00:00:00.000Z",
  proof_of_funds_url: "docs/pof.pdf",
  pof_verified_status: "verified",
  proof_amount: 300000,
  investor_declaration_signed_at: "2026-01-01T00:00:00.000Z",
  mortgage_status: "yes",
  budget_range: "200k_500k",
  working_with_agent: "no",
  profiles: { display_name: "Complete Buyer" },
};

const incompleteRegistration = {
  ...completeRegistration,
  id: "reg-missing",
  contact_name: "Missing Buyer",
  id_verified_at: null,
  waiver_signed_at: null,
  proof_of_funds_url: null,
  proof_amount: null,
  investor_declaration_signed_at: null,
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function renderPanel(props: Partial<React.ComponentProps<typeof OpenHouseAssetControlPanel>> = {}) {
  return render(<OpenHouseAssetControlPanel listingId="listing-1" isOwner listingPrice={350000} {...props} />);
}

function getActionButtons(name: RegExp, exactText: string) {
  return screen
    .getAllByRole("button", { name })
    .filter((button) => button.textContent?.trim() === exactText);
}

beforeEach(() => {
  useAuthMock.mockReturnValue({ user: { id: "owner-1" } });
  useOpenHouseSettingsMock.mockReturnValue({ data: settings, isLoading: false });
  useOpenHouseRegistrationsMock.mockReturnValue({
    isLoading: false,
    data: [
      incompleteRegistration,
      completeRegistration,
      { ...completeRegistration, id: "reg-approved", status: "approved", contact_name: "Approved Buyer" },
    ],
  });
  useOpenHouseOffersMock.mockReturnValue({
    data: [
      { id: "offer-submitted", amount: 275000, status: "submitted", message: "sealed", profiles: { display_name: "Sealed Bidder" } },
      { id: "offer-revealed", amount: 310000, status: "revealed", message: "cash", profiles: { display_name: "Ready Bidder" } },
      { id: "offer-accepted", amount: 330000, status: "accepted", message: null, profiles: { display_name: "Winner" } },
    ],
  });
  useUpsertOpenHouseSettingsMock.mockReturnValue(upsertSettingsMock);
  useUpdateOpenHouseRegistrationMock.mockReturnValue(updateRegMock);
  useUpdateOpenHouseOfferMock.mockReturnValue(updateOfferMock);
  useAcceptOpenHouseOfferMock.mockReturnValue(acceptOfferMock);
  useReopenOpenHouseOfferSelectionMock.mockReturnValue(reopenSelectionMock);
  useRevealAllOffersMock.mockReturnValue(revealAllMock);
  useMyOpenHouseRegistrationsMock.mockReturnValue({ data: [], isLoading: false });
  useMyOpenHouseOffersMock.mockReturnValue({ data: [], isLoading: false });
  getOpenHouseDocSignedUrlMock.mockResolvedValue("https://signed.example/id.pdf");
  updateRegMock.mutate.mockReset();
  updateOfferMock.mutate.mockReset();
  acceptOfferMock.mutate.mockReset();
  reopenSelectionMock.mutate.mockReset();
  revealAllMock.mutate.mockReset();
  upsertSettingsMock.mutate.mockReset();
  toastMock.error.mockReset();
  toastMock.success.mockReset();
  vi.spyOn(window, "open").mockImplementation(() => null);
});

describe("OpenHouseAssetControlPanel", () => {
  it("renders nothing for non-owners", () => {
    const { container } = renderPanel({ isOwner: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("uses wrapping mobile-safe layout for participant pipeline and row actions", () => {
    renderPanel();

    expect(screen.getByTestId("open-house-pipeline")).toHaveClass("flex-col", "sm:flex-row");
    expect(screen.getAllByTestId("open-house-registration-row")[0]).toHaveClass("overflow-hidden");
    expect(screen.getAllByTestId("open-house-registration-actions")[0]).toHaveClass("w-full", "sm:w-auto");
  });

  it("blocks incomplete approval but allows verify, approve, reject, and attendance actions", () => {
    renderPanel();

    fireEvent.click(getActionButtons(/approve/i, "Approve")[0]);
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/Approval blocked/));

    fireEvent.click(screen.getByRole("button", { name: /verify id/i }));
    expect(updateRegMock.mutate).toHaveBeenCalledWith({
      id: "reg-missing",
      updates: { id_verified_at: expect.any(String) },
    });

    fireEvent.click(getActionButtons(/approve/i, "Approve")[1]);
    expect(updateRegMock.mutate).toHaveBeenCalledWith({
      id: "reg-complete",
      updates: expect.objectContaining({
        status: "approved",
        approved_by: "owner-1",
        approved_at: expect.any(String),
      }),
    });

    fireEvent.click(getActionButtons(/reject/i, "Reject")[0]);
    fireEvent.change(screen.getByPlaceholderText(/Timeslot full/i), { target: { value: "Incomplete documents" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm rejection/i }));
    expect(updateRegMock.mutate).toHaveBeenCalledWith({
      id: "reg-missing",
      updates: { status: "rejected", rejection_reason: "Incomplete documents" },
    });

    fireEvent.click(screen.getByRole("button", { name: /mark attended/i }));
    expect(updateRegMock.mutate).toHaveBeenCalledWith({
      id: "reg-approved",
      updates: expect.objectContaining({ status: "attended", attended_at: expect.any(String) }),
    });
  });

  it("allows rental open-house approval without sale-only financial blockers in the owner panel", () => {
    useOpenHouseRegistrationsMock.mockReturnValue({
      isLoading: false,
      data: [
        {
          ...completeRegistration,
          id: "reg-rental",
          contact_name: "Rental Visitor",
          proof_of_funds_url: null,
          pof_verified_status: null,
          proof_amount: null,
          investor_declaration_signed_at: null,
          mortgage_status: null,
          budget_range: null,
          working_with_agent: null,
        },
      ],
    });

    renderPanel({ listingPrice: 950, openHouseTransactionType: "rent" });

    expect(screen.queryByText(/Proof of funds missing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Investor declaration not signed/i)).not.toBeInTheDocument();

    fireEvent.click(getActionButtons(/approve/i, "Approve")[0]);

    expect(toastMock.error).not.toHaveBeenCalled();
    expect(updateRegMock.mutate).toHaveBeenCalledWith({
      id: "reg-rental",
      updates: expect.objectContaining({
        status: "approved",
        approved_by: "owner-1",
        approved_at: expect.any(String),
      }),
    });
  });

  it("lets hosts review proof of funds before approval", () => {
    useOpenHouseRegistrationsMock.mockReturnValue({
      isLoading: false,
      data: [
        {
          ...completeRegistration,
          id: "reg-pof-pending",
          contact_name: "POF Pending Buyer",
          pof_verified_status: "unreviewed",
        },
      ],
    });

    renderPanel();

    expect(screen.getByText(/Proof of funds not verified/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /verify pof/i }));
    expect(updateRegMock.mutate).toHaveBeenCalledWith({
      id: "reg-pof-pending",
      updates: { pof_verified_status: "verified", pof_rejection_reason: null },
    });

    fireEvent.click(screen.getByRole("button", { name: /reject pof/i }));
    expect(screen.getByRole("dialog", { name: /proof of funds rejection reason/i })).toBeInTheDocument();
    const confirmPofRejection = screen.getByRole("button", { name: /confirm pof rejection/i });
    expect(confirmPofRejection).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Document expired/i), {
      target: { value: "Document expired" },
    });
    expect(confirmPofRejection).not.toBeDisabled();
    fireEvent.click(confirmPofRejection);
    expect(updateRegMock.mutate).toHaveBeenCalledWith({
      id: "reg-pof-pending",
      updates: {
        pof_verified_status: "rejected",
        pof_rejection_reason: "Document expired",
      },
    });
  });

  it("saves settings after changing controls", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /asset control settings/i }));
    fireEvent.click(screen.getByRole("button", { name: /\+ add slot/i }));
    const timeInputs = screen.getAllByDisplayValue(/^\d\d:\d\d$/);
    fireEvent.change(timeInputs[0], { target: { value: "09:30" } });
    fireEvent.change(timeInputs[1], { target: { value: "10:30" } });
    fireEvent.change(screen.getAllByPlaceholderText("Max")[0], { target: { value: "3" } });
    fireEvent.change(screen.getAllByDisplayValue("2")[0], { target: { value: "4" } });
    fireEvent.change(screen.getByPlaceholderText(/No total cap/i), { target: { value: "8" } });
    fireEvent.click(screen.getByLabelText(/broker/i));
    fireEvent.click(screen.getByLabelText(/require proof of funds/i));
    fireEvent.click(screen.getByLabelText(/require proof of funds/i));
    fireEvent.change(screen.getByPlaceholderText(/Min amount/i), { target: { value: "250000" } });
    fireEvent.click(screen.getByLabelText(/require investor/i));
    fireEvent.click(screen.getByLabelText(/require investor/i));
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="datetime-local"]')!, {
      target: { value: "2026-06-01T12:00" },
    });
    fireEvent.click(screen.getByLabelText(/allow sealed bids/i));
    fireEvent.click(screen.getAllByRole("button", { name: "×" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(upsertSettingsMock.mutate).toHaveBeenCalledWith({
      listingId: "listing-1",
      settings: expect.objectContaining({
        min_proof_amount: 250000,
        max_total_visitors: 8,
        require_proof_of_funds: true,
        require_investor_declaration: true,
        broker_required: true,
        allow_sealed_bids: false,
      }),
    });
  });

  it("opens registration documents and reports signed-url failures", async () => {
    renderPanel();

    fireEvent.click(screen.getAllByRole("button", { name: /ID/i })[0]);
    expect(getOpenHouseDocSignedUrlMock).toHaveBeenCalledWith("docs/id.pdf");

    getOpenHouseDocSignedUrlMock.mockRejectedValueOnce(new Error("storage"));
    fireEvent.click(screen.getAllByRole("button", { name: /ID/i })[0]);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Could not open document"));
  });

  it("shows winner state and hides bulk reveal once an offer is accepted", () => {
    renderPanel();

    expect(screen.getByText(/Winner selected/i)).toBeInTheDocument();
    expect(screen.getByText(/Winning Bid/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reveal all bids/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reopen selection/i }));
    expect(reopenSelectionMock.mutate).toHaveBeenCalledWith({ listingId: "listing-1" });
  });

  it("exercises offer reveal, accept, reject, and bulk reveal actions when no winner exists", () => {
    useOpenHouseOffersMock.mockReturnValue({
      data: [
        { id: "offer-submitted", amount: 275000, status: "submitted", message: "sealed", profiles: { display_name: "Sealed Bidder" } },
        { id: "offer-revealed", amount: 310000, status: "revealed", message: "cash", profiles: { display_name: "Ready Bidder" } },
      ],
    });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /reveal all bids/i }));
    expect(revealAllMock.mutate).toHaveBeenCalledWith({
      listingId: "listing-1",
      offerIds: ["offer-submitted"],
    });

    fireEvent.click(screen.getByRole("button", { name: /^reveal$/i }));
    expect(updateOfferMock.mutate).toHaveBeenCalledWith({ id: "offer-submitted", status: "revealed" });

    const revealedOfferRow = screen.getByText(/Ready Bidder/).closest("div")!.parentElement!.parentElement!;
    const acceptButton = within(revealedOfferRow).getByRole("button", { name: /accept/i });
    fireEvent.click(acceptButton);
    expect(acceptOfferMock.mutate).toHaveBeenCalledWith({
      acceptId: "offer-revealed",
      listingId: "listing-1",
      allOfferIds: ["offer-submitted", "offer-revealed"],
    });

    fireEvent.click(within(revealedOfferRow).getAllByRole("button").find((button) => button !== acceptButton)!);
    expect(updateOfferMock.mutate).toHaveBeenCalledWith({ id: "offer-revealed", status: "rejected" });
  });
});

describe("OpenHouseDashboardSection", () => {
  const listing = {
    id: "listing-1",
    owner_id: "owner-1",
    organization_id: null,
    title: "Owner Open House",
    listing_type: "open_house",
    status: "active",
    open_house_date: "2026-05-17T12:00:00.000Z",
    views_count: 12,
    cover_image_url: null,
    price: 350000,
  };

  it("renders the empty dashboard state with visitor and owner paths", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <OpenHouseDashboardSection myListings={[]} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/No open house activity yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse Open Houses/i })).toHaveAttribute("href", "/open-houses");
    expect(screen.getByRole("link", { name: /Create Listing/i })).toHaveAttribute("href", "/listings/new");
  });

  it("summarizes owner listings, pending registrations, approved registrations, and active offers", () => {
    useMyOpenHouseRegistrationsMock.mockReturnValue({
      isLoading: false,
      data: [
        { id: "mine-pending", listing_id: "listing-1", status: "pending", timeslot_index: 0, listings: { title: "Villa", open_house_date: "2026-05-18T12:00:00.000Z", cover_image_url: null } },
        { id: "mine-approved", listing_id: "listing-2", status: "approved", timeslot_index: null, listings: { title: "Flat", open_house_date: "2026-05-19T12:00:00.000Z", cover_image_url: null } },
        { id: "mine-cancelled", listing_id: "listing-3", status: "cancelled", timeslot_index: null, listings: { title: "Hidden", open_house_date: "2026-05-19T12:00:00.000Z", cover_image_url: null } },
      ],
    });
    useMyOpenHouseOffersMock.mockReturnValue({
      isLoading: false,
      data: [
        { id: "offer-a", listing_id: "listing-1", amount: 300000, status: "submitted", listings: { title: "Villa", city: "Athens", cover_image_url: null } },
        { id: "offer-b", listing_id: "listing-2", amount: 310000, status: "accepted", listings: { title: "Flat", city: "Piraeus", cover_image_url: null } },
        { id: "offer-hidden", listing_id: "listing-3", amount: 1, status: "withdrawn", listings: null },
      ],
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <OpenHouseDashboardSection myListings={[listing as any]} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/My Open House Listings/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit listing/i })).toHaveAttribute("href", "/listings/listing-1/edit");
    expect(screen.getByText(/1 pending/i)).toBeInTheDocument();
    expect(screen.getByText(/1 approved/i)).toBeInTheDocument();
    expect(screen.getByText(/Offers remain/i)).toBeInTheDocument();
    expect(screen.getByText(/submitted/i)).toBeInTheDocument();
    expect(screen.getByText(/accepted/i)).toBeInTheDocument();
  });

  it("passes listing price into the expanded owner panel so high-value screening blockers apply", () => {
    useOpenHouseRegistrationsMock.mockReturnValue({
      isLoading: false,
      data: [
        {
          ...completeRegistration,
          id: "reg-missing-screening",
          contact_name: "Screening Missing",
          mortgage_status: null,
          budget_range: null,
          working_with_agent: null,
        },
      ],
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <OpenHouseDashboardSection myListings={[listing as any]} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("Owner Open House"));
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining("Mortgage/funds question missing"));
    expect(updateRegMock.mutate).not.toHaveBeenCalledWith(expect.objectContaining({
      id: "reg-missing-screening",
    }));
  });
});
