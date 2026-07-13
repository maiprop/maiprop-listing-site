/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "owner-1" } as { id: string } | null,
  settings: null as Record<string, unknown> | null,
  registrations: [] as Array<Record<string, any>>,
  registrationLoading: false,
  offers: [] as Array<Record<string, any>>,
  myRegistrations: [] as Array<Record<string, any>>,
  myRegistrationsLoading: false,
  myOffers: [] as Array<Record<string, any>>,
  myOffersLoading: false,
  blockers: vi.fn(() => [] as string[]),
  signedUrl: vi.fn(),
  updateRegistration: { mutate: vi.fn(), isPending: false },
  updateOffer: { mutate: vi.fn(), isPending: false },
  acceptOffer: { mutate: vi.fn(), isPending: false },
  reopenSelection: { mutate: vi.fn(), isPending: false },
  revealAll: { mutate: vi.fn(), isPending: false },
  upsertSettings: { mutate: vi.fn(), isPending: false },
  toastError: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/hooks/useFocusTrap", () => ({ useFocusTrap: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => state.toastError(...args) } }));
vi.mock("@/hooks/useOpenHouseAssetControl", () => ({
  useOpenHouseSettings: () => ({ data: state.settings, isLoading: false }),
  useOpenHouseRegistrations: () => ({ data: state.registrations, isLoading: state.registrationLoading }),
  useOpenHouseOffers: () => ({ data: state.offers }),
  useUpsertOpenHouseSettings: () => state.upsertSettings,
  useUpdateOpenHouseRegistration: () => state.updateRegistration,
  useUpdateOpenHouseOffer: () => state.updateOffer,
  useAcceptOpenHouseOffer: () => state.acceptOffer,
  useReopenOpenHouseOfferSelection: () => state.reopenSelection,
  useRevealAllOffers: () => state.revealAll,
  useMyOpenHouseRegistrations: () => ({ data: state.myRegistrations, isLoading: state.myRegistrationsLoading }),
  useMyOpenHouseOffers: () => ({ data: state.myOffers, isLoading: state.myOffersLoading }),
  getOpenHouseApprovalBlockers: (...args: unknown[]) => state.blockers(...args),
  getOpenHouseDocSignedUrl: (...args: unknown[]) => state.signedUrl(...args),
}));

import OpenHouseAssetControlPanel from "@/components/OpenHouseAssetControlPanel";
import OpenHouseDashboardSection from "@/components/OpenHouseDashboardSection";

const baseRegistration = {
  id: "reg-1",
  requester_id: "buyer-1",
  status: "pending",
  timeslot_index: 0,
  contact_name: "Buyer One",
  contact_email: "buyer@example.com",
  contact_phone: "+306900000000",
  visit_purpose: "Buying",
  id_doc_url: "docs/id.pdf",
  id_verified_at: null,
  waiver_signed_at: null,
  proof_of_funds_url: "docs/pof.pdf",
  pof_verified_status: "unreviewed",
  proof_amount: 250000,
  investor_declaration_signed_at: null,
  profiles: { display_name: "Buyer Profile", first_name: "Buyer", last_name: "One" },
};

const baseSettings = {
  id: "settings-1",
  listing_id: "listing-1",
  timeslots: [{ start: "10:00", end: "11:00", max_visitors: 3 }],
  max_visitors_per_slot: 3,
  max_total_visitors: 12,
  broker_required: true,
  require_proof_of_funds: true,
  min_proof_amount: 200000,
  require_investor_declaration: true,
  offer_deadline: null,
  allow_sealed_bids: true,
};

function renderPanel(props: Record<string, unknown> = {}) {
  return render(
    <OpenHouseAssetControlPanel
      listingId="listing-1"
      isOwner
      listingPrice={350000}
      {...props}
    />,
  );
}

function renderDashboard(myListings: Array<Record<string, unknown>> = []) {
  return render(
    <MemoryRouter>
      <OpenHouseDashboardSection myListings={myListings as any} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: "owner-1" };
  state.settings = baseSettings;
  state.registrations = [];
  state.registrationLoading = false;
  state.offers = [];
  state.myRegistrations = [];
  state.myRegistrationsLoading = false;
  state.myOffers = [];
  state.myOffersLoading = false;
  state.updateRegistration.isPending = false;
  state.updateOffer.isPending = false;
  state.acceptOffer.isPending = false;
  state.reopenSelection.isPending = false;
  state.revealAll.isPending = false;
  state.upsertSettings.isPending = false;
  state.blockers.mockReturnValue([]);
  state.signedUrl.mockResolvedValue("https://signed.example/doc.pdf");
  vi.spyOn(window, "open").mockImplementation(() => null);
});

describe("OpenHouseAssetControlPanel branch coverage", () => {
  it("renders loading, empty, collapsed, and deadline-aware empty states", () => {
    state.registrationLoading = true;
    state.settings = { ...baseSettings, offer_deadline: "2020-01-01T00:00:00.000Z" };
    const view = renderPanel();
    expect(screen.getByText(/deadline has passed with no bids/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /participants/i }));
    expect(screen.queryByTestId("open-house-pipeline")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /participants/i }));
    expect(screen.getByTestId("open-house-pipeline")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sealed bids/i }));
    expect(screen.queryByText(/deadline has passed with no bids/i)).not.toBeInTheDocument();

    state.registrationLoading = false;
    state.settings = { ...baseSettings, offer_deadline: "2099-01-01T00:00:00.000Z" };
    view.rerender(<OpenHouseAssetControlPanel listingId="listing-1" isOwner />);
    fireEvent.click(screen.getByRole("button", { name: /sealed bids/i }));
    expect(screen.getByText(/submitted offers will appear here/i)).toBeInTheDocument();
    expect(screen.getByText(/no registrations yet/i)).toBeInTheDocument();
  });

  it("renders every participant identity, status, qualification, and no-action fallback", async () => {
    state.blockers.mockImplementation((reg: any) => reg.id === "pending-none" ? ["ID missing"] : []);
    state.registrations = [
      {
        ...baseRegistration,
        id: "pending-none",
        contact_name: null,
        contact_email: null,
        contact_phone: null,
        visit_purpose: null,
        profiles: { display_name: null, first_name: "First", last_name: "Last" },
        id_doc_url: null,
        proof_of_funds_url: null,
        proof_amount: null,
      },
      {
        ...baseRegistration,
        id: "approved-verified",
        status: "approved",
        contact_name: null,
        profiles: { display_name: "Displayed Buyer" },
        id_verified_at: "2026-01-01T00:00:00.000Z",
        waiver_signed_at: "2026-01-01T00:00:00.000Z",
        pof_verified_status: "verified",
        investor_declaration_signed_at: "2026-01-01T00:00:00.000Z",
      },
      { ...baseRegistration, id: "attended-rejected", status: "attended", contact_name: null, profiles: null, pof_verified_status: "rejected", proof_amount: null },
      { ...baseRegistration, id: "rejected-review", status: "rejected", pof_verified_status: "unreviewed" },
      { ...baseRegistration, id: "cancelled", status: "cancelled", id_verified_at: null },
      { ...baseRegistration, id: "custom", status: "waitlisted", contact_name: null, profiles: null, id_doc_url: null, proof_of_funds_url: null },
    ];
    renderPanel();

    expect(screen.getByText("First Last")).toBeInTheDocument();
    expect(screen.getAllByText("Visitor").length).toBeGreaterThan(0);
    expect(screen.getByText(/EUR 250,000 verified/i)).toBeInTheDocument();
    expect(screen.getByText(/POF rejected/i)).toBeInTheDocument();
    expect(screen.getAllByText(/EUR 250,000 pending review/i)).toHaveLength(2);
    expect(screen.getByText(/Missing before approval: ID missing/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /ID/i })[0]);
    await waitFor(() => expect(window.open).toHaveBeenCalledWith("https://signed.example/doc.pdf", "_blank", "noopener,noreferrer"));
    state.signedUrl.mockRejectedValueOnce(new Error("storage unavailable"));
    fireEvent.click(screen.getAllByRole("button", { name: /ID/i })[0]);
    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith("Could not open document"));
  });

  it("covers host actions, dialog cancellation, pending controls, and undefined host identity", () => {
    state.user = null;
    state.registrations = [{ ...baseRegistration, id: "pending" }];
    state.updateRegistration.isPending = true;
    renderPanel({ openHouseTransactionType: null });

    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(state.updateRegistration.mutate).toHaveBeenCalledWith(expect.objectContaining({
      id: "pending",
      updates: expect.objectContaining({ status: "approved", approved_by: undefined }),
    }));

    fireEvent.click(screen.getByRole("button", { name: /^reject$/i }));
    fireEvent.click(within(screen.getByRole("dialog", { name: /rejection reason/i })).getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByRole("dialog", { name: /rejection reason/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reject pof/i }));
    fireEvent.click(within(screen.getByRole("dialog", { name: /proof of funds rejection reason/i })).getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByRole("dialog", { name: /proof of funds rejection reason/i })).not.toBeInTheDocument();
  });

  it("normalizes empty and invalid settings while preserving explicit host choices", () => {
    state.settings = null;
    const view = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /asset control settings/i }));
    const numericInputs = view.container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    fireEvent.change(numericInputs[0], { target: { value: "bad" } });
    fireEvent.change(screen.getByPlaceholderText(/no total cap/i), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /\+ add slot/i }));
    fireEvent.change(screen.getByPlaceholderText("Max"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(state.upsertSettings.mutate).toHaveBeenCalledWith({
      listingId: "listing-1",
      settings: expect.objectContaining({
        max_visitors_per_slot: 0,
        max_total_visitors: null,
        min_proof_amount: null,
        offer_deadline: null,
      }),
    });

    state.settings = {
      ...baseSettings,
      timeslots: null,
      max_visitors_per_slot: null,
      max_total_visitors: null,
      broker_required: null,
      require_proof_of_funds: null,
      min_proof_amount: null,
      require_investor_declaration: null,
      offer_deadline: null,
      allow_sealed_bids: null,
    };
    state.upsertSettings.isPending = true;
    view.rerender(<OpenHouseAssetControlPanel listingId="listing-1" isOwner />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("covers sealed, revealed, rejected, withdrawn, winner, lock, and mutation-pending bid states", () => {
    state.settings = { ...baseSettings, offer_deadline: "2099-01-01T00:00:00.000Z" };
    state.offers = [
      { id: "submitted", amount: 200000, status: "submitted", profiles: null, message: null },
      { id: "revealed", amount: 300000, status: "revealed", profiles: { display_name: null }, message: "cash" },
      { id: "rejected", amount: 250000, status: "rejected", profiles: { display_name: "Rejected" }, message: null },
      { id: "withdrawn", amount: 500000, status: "withdrawn", profiles: null, message: null },
    ];
    const view = renderPanel();
    expect(screen.getByText(/300,000 highest/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reveal all bids/i })).toBeDisabled();

    state.settings = { ...baseSettings, offer_deadline: "2020-01-01T00:00:00.000Z" };
    state.revealAll.isPending = true;
    state.updateOffer.isPending = true;
    state.acceptOffer.isPending = true;
    view.rerender(<OpenHouseAssetControlPanel listingId="listing-1" isOwner />);
    expect(screen.getByRole("button", { name: /reveal all bids/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^accept$/i })).toBeDisabled();

    state.revealAll.isPending = false;
    state.updateOffer.isPending = false;
    state.acceptOffer.isPending = false;
    state.offers = [{ id: "winner", amount: 330000, status: "accepted", profiles: null, message: null }];
    state.reopenSelection.isPending = true;
    view.rerender(<OpenHouseAssetControlPanel listingId="listing-1" isOwner />);
    expect(screen.getAllByText("Bidder").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /reopen selection/i })).toBeDisabled();
  });
});

describe("OpenHouseDashboardSection branch coverage", () => {
  it("renders empty and independent registration/offer loading states", () => {
    const empty = renderDashboard();
    expect(screen.getByText(/no open house activity yet/i)).toBeInTheDocument();
    empty.unmount();

    state.myRegistrationsLoading = true;
    state.myOffersLoading = true;
    renderDashboard();
    expect(screen.getByText("My Registrations")).toBeInTheDocument();
    expect(screen.getByText("My Sealed Offers")).toBeInTheDocument();
  });

  it("renders owner countdown variants and expands sale/rent management", () => {
    const now = Date.now();
    const listings = [
      { id: "soon", listing_type: "open_house", title: "Soon", status: "active", price: 950, open_house_transaction_type: "rent", open_house_date: new Date(now + 30 * 60_000).toISOString(), cover_image_url: "https://img/soon.jpg", views_count: 4 },
      { id: "today", listing_type: "open_house", title: "Today", status: "paused", price: 350000, open_house_transaction_type: "sale", open_house_date: new Date(now + 8 * 3_600_000).toISOString(), cover_image_url: null, views_count: null },
      { id: "later", listing_type: "open_house", title: "Later", status: "active", price: 400000, open_house_date: new Date(now + 72 * 3_600_000).toISOString() },
      { id: "undated", listing_type: "open_house", title: "Undated", status: "draft", price: 100000, open_house_date: null },
      { id: "ordinary", listing_type: "sale", title: "Not open house" },
    ];
    renderDashboard(listings);
    expect(screen.getByText(/^\d+m away$/i)).toBeInTheDocument();
    expect(screen.getByText(/^\d+h \d+m away$/i)).toBeInTheDocument();
    expect(screen.queryByText(/72h/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Soon"));
    expect(screen.getByText("Asset Control Settings")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Soon"));
    expect(screen.queryByText("Asset Control Settings")).not.toBeInTheDocument();
  });

  it("renders participant status, offer eligibility, image, fallback, and filtering states", () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const future = new Date(Date.now() + 8 * 3_600_000).toISOString();
    state.myRegistrations = [
      { id: "pending-1", listing_id: "l1", status: "pending", timeslot_index: 0, listings: { title: "Pending Home", open_house_date: future, cover_image_url: "https://img/pending.jpg" } },
      { id: "pending-2", listing_id: "l2", status: "pending", timeslot_index: null, listings: { title: "Second Pending", open_house_date: null, cover_image_url: null } },
      { id: "approved", listing_id: "l3", status: "approved", listings: { title: "Approved Home", open_house_date: future } },
      { id: "attended-past", listing_id: "l4", status: "attended", listings: { title: "Offer Ready", open_house_date: past } },
      { id: "attended-future", listing_id: "l5", status: "attended", listings: { title: "Offer Later", open_house_date: future } },
      { id: "custom", listing_id: "l6", status: "waitlisted", listings: null },
      { id: "cancelled", listing_id: "l7", status: "cancelled", listings: { title: "Hidden" } },
    ];
    state.myOffers = [
      { id: "sealed", listing_id: "l4", amount: 100000, status: "submitted", listings: { title: "Sealed Home", city: "Athens", cover_image_url: "https://img/offer.jpg" } },
      { id: "accepted", listing_id: "l5", amount: 120000, status: "accepted", listings: { title: "Won Home", city: null, cover_image_url: null } },
      { id: "custom-offer", listing_id: "l6", amount: 90000, status: "expired", listings: null },
      { id: "withdrawn", listing_id: "l7", amount: 1, status: "withdrawn", listings: { title: "Hidden Offer" } },
    ];
    renderDashboard();
    expect(screen.getByText(/2 registrations pending/i)).toBeInTheDocument();
    expect(screen.getByText(/1 approved/i)).toBeInTheDocument();
    expect(screen.getByText(/you can submit an offer/i)).toBeInTheDocument();
    expect(screen.getByText(/offer opens after/i)).toBeInTheDocument();
    expect(screen.getByText(/attend the open house/i)).toBeInTheDocument();
    expect(screen.getAllByText("Open House").length).toBeGreaterThan(0);
    expect(screen.getByText(/^🔒 Sealed$/i)).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden Offer")).not.toBeInTheDocument();
  });
});
