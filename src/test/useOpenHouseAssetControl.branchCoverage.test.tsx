/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const rpc = vi.fn();
  const invoke = vi.fn();
  const getUser = vi.fn();
  const useAuth = vi.fn();
  const services = {
    upsertOpenHouseSettingsRow: vi.fn(),
    updateOpenHouseRegistrationRow: vi.fn(),
    updateOpenHouseOfferRow: vi.fn(),
    revealSubmittedOpenHouseOffers: vi.fn(),
  };
  const client: any = {
    from: (...args: unknown[]) => from(...args),
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    auth: { getUser: () => getUser() },
    storage: { from: vi.fn() },
  };
  return { from, rpc, invoke, getUser, useAuth, services, client, toast: { success: vi.fn(), error: vi.fn() } };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks.client }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.useAuth() }));
vi.mock("@/services/openHouseAssetService", () => mocks.services);
vi.mock("sonner", () => ({ toast: mocks.toast }));

import {
  useAcceptOpenHouseOffer,
  useCreateOpenHouseRegistration,
  useMyOpenHouseOffers,
  useMyOpenHouseRegistrations,
  useOpenHouseCapacity,
  useOpenHouseOffers,
  useOpenHouseRegistrations,
  useReopenOpenHouseOfferSelection,
  useRevealAllOffers,
  useSubmitOpenHouseOffer,
  useUpdateOpenHouseOffer,
  useUpdateOpenHouseRegistration,
} from "@/hooks/useOpenHouseAssetControl";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderQueryHook = <T,>(hook: () => T) => renderHook(hook, { wrapper });

async function rejectMutation(promise: Promise<unknown>) {
  await act(async () => {
    await promise.catch(() => undefined);
  });
}

function orderedQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  };
}

function maybeSingleQuery(result: { data: any; error: unknown }) {
  if (result.data?.listings) {
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: "listing-1", ...result.data.listings }], error: null });
    result = { ...result, data: { ...result.data, listings: undefined, listing_id: "listing-1" } };
  }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

const registrationInput = {
  listingId: "listing-1",
  contactName: "Buyer",
  contactEmail: "buyer@example.com",
  contactPhone: "+306900000000",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: { id: "user-1" } });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mocks.services.upsertOpenHouseSettingsRow.mockResolvedValue({ id: "settings-1" });
  mocks.services.updateOpenHouseRegistrationRow.mockResolvedValue({ id: "registration-1" });
  mocks.services.updateOpenHouseOfferRow.mockResolvedValue({ id: "offer-1" });
  mocks.services.revealSubmittedOpenHouseOffers.mockResolvedValue(undefined);
});

describe("open-house query failure and null branches", () => {
  it("surfaces capacity transport errors and accepts an empty aggregate", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error("capacity unavailable") });
    const failed = renderQueryHook(() => useOpenHouseCapacity("listing-1"));
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
    failed.unmount();

    mocks.invoke.mockResolvedValueOnce({ data: null, error: null });
    const empty = renderQueryHook(() => useOpenHouseCapacity("listing-1"));
    await waitFor(() => expect(empty.result.current.isSuccess).toBe(true));
    expect(empty.result.current.data).toBeNull();
  });

  it("surfaces registration query errors and normalizes null owner/mine rows", async () => {
    mocks.from.mockReturnValueOnce(orderedQuery({ data: null, error: new Error("registrations denied") }));
    const failed = renderQueryHook(() => useOpenHouseRegistrations("listing-1", true));
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
    failed.unmount();

    mocks.from.mockReturnValueOnce(orderedQuery({ data: null, error: null }));
    const ownerEmpty = renderQueryHook(() => useOpenHouseRegistrations("listing-1", true));
    await waitFor(() => expect(ownerEmpty.result.current.data).toEqual([]));
    ownerEmpty.unmount();

    mocks.from.mockReturnValueOnce(orderedQuery({ data: null, error: new Error("mine denied") }));
    const mineFailed = renderQueryHook(() => useMyOpenHouseRegistrations());
    await waitFor(() => expect(mineFailed.result.current.isError).toBe(true));
    mineFailed.unmount();

    mocks.from.mockReturnValueOnce(orderedQuery({ data: null, error: null }));
    const mineEmpty = renderQueryHook(() => useMyOpenHouseRegistrations());
    await waitFor(() => expect(mineEmpty.result.current.data).toEqual([]));
  });

  it("surfaces offer query errors and normalizes null owner/mine rows", async () => {
    mocks.from.mockReturnValueOnce(orderedQuery({ data: null, error: new Error("offers denied") }));
    const failed = renderQueryHook(() => useOpenHouseOffers("listing-1"));
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
    failed.unmount();

    mocks.from.mockReturnValueOnce(orderedQuery({ data: null, error: null }));
    const ownerEmpty = renderQueryHook(() => useOpenHouseOffers("listing-1"));
    await waitFor(() => expect(ownerEmpty.result.current.data).toEqual([]));
    ownerEmpty.unmount();

    mocks.from.mockReturnValueOnce(orderedQuery({ data: null, error: new Error("mine denied") }));
    const mineFailed = renderQueryHook(() => useMyOpenHouseOffers());
    await waitFor(() => expect(mineFailed.result.current.isError).toBe(true));
    mineFailed.unmount();

    mocks.from.mockReturnValueOnce(orderedQuery({ data: null, error: null }));
    const mineEmpty = renderQueryHook(() => useMyOpenHouseOffers());
    await waitFor(() => expect(mineEmpty.result.current.data).toEqual([]));
  });
});

describe("open-house registration mutation branches", () => {
  it("recovers duplicate registration rows and sends null optional values", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "existing-registration" }, error: null });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single,
    });
    mocks.invoke.mockResolvedValue({ data: { error: { code: "23505", message: "duplicate" } }, error: null });
    const { result } = renderQueryHook(() => useCreateOpenHouseRegistration());
    let row: unknown;
    await act(async () => {
      row = await result.current.mutateAsync(registrationInput);
    });
    expect(row).toEqual({ id: "existing-registration" });
    expect(mocks.invoke).toHaveBeenCalledWith("open-house-registration", {
      body: expect.objectContaining({ timeslotIndex: null, visitPurpose: null, note: null }),
    });
  });

  it("maps duplicate fetch, stale-FK, missing-result, and non-string failures", async () => {
    const { result } = renderQueryHook(() => useCreateOpenHouseRegistration());

    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: new Error("read denied") }),
    });
    mocks.invoke.mockResolvedValueOnce({ data: { error: { code: "23505", message: "duplicate" } }, error: null });
    await rejectMutation(result.current.mutateAsync(registrationInput));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("You already have a registration for this open house.");

    mocks.invoke.mockResolvedValueOnce({ data: { error: { code: "23503", message: "fk" } }, error: null });
    await rejectMutation(result.current.mutateAsync(registrationInput));
    expect(mocks.toast.error).toHaveBeenLastCalledWith(expect.stringContaining("account could not be verified"));

    mocks.invoke.mockResolvedValueOnce({ data: {}, error: null });
    await rejectMutation(result.current.mutateAsync(registrationInput));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Registration failed. Please try again.");

    mocks.invoke.mockResolvedValueOnce({ data: { error: { code: "other", message: 42 } }, error: null });
    await rejectMutation(result.current.mutateAsync(registrationInput));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Registration failed. Please try again.");
  });

  it("rejects unauthenticated, failed lookup, incomplete approval, and invalid attendance", async () => {
    const { result } = renderQueryHook(() => useUpdateOpenHouseRegistration());
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    await rejectMutation(result.current.mutateAsync({ id: "registration-1", updates: { status: "approved" } }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Not authenticated");

    mocks.from.mockReturnValueOnce(maybeSingleQuery({ data: null, error: new Error("lookup failed") }));
    await rejectMutation(result.current.mutateAsync({ id: "registration-1", updates: { status: "approved" } }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("lookup failed");

    mocks.from.mockReturnValueOnce(maybeSingleQuery({
      data: {
        requester_id: "buyer-1",
        status: "pending",
        listings: {
          owner_id: "user-1",
          price: 300000,
          open_house_transaction_type: "sale",
          open_house_settings: [{ require_proof_of_funds: true, min_proof_amount: 250000 }],
        },
      },
      error: null,
    }));
    await rejectMutation(result.current.mutateAsync({ id: "registration-1", updates: { status: "approved" } }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith(expect.stringContaining("Registration is incomplete"));

    mocks.from.mockReturnValueOnce(maybeSingleQuery({
      data: { requester_id: "buyer-1", status: "pending", listings: { owner_id: "user-1" } },
      error: null,
    }));
    await rejectMutation(result.current.mutateAsync({ id: "registration-1", updates: { status: "attended" } }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Only approved registrations can be marked as attended.");
  });
});

describe("open-house offer mutation authorization branches", () => {
  it("passes null messages and preserves unmapped RPC errors", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id: "offer-1" }, error: null });
    const { result } = renderQueryHook(() => useSubmitOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({ listingId: "listing-1", amount: 100000, message: "" });
    });
    expect(mocks.rpc).toHaveBeenCalledWith("submit_open_house_offer", expect.objectContaining({ p_message: null }));

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "custom_offer_guard" } });
    await rejectMutation(result.current.mutateAsync({ listingId: "listing-1", amount: 100000 }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("custom_offer_guard");
  });

  it("blocks offer updates on auth, lookup, reveal, accept, and actor constraints", async () => {
    const { result } = renderQueryHook(() => useUpdateOpenHouseOffer());
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    await rejectMutation(result.current.mutateAsync({ id: "offer-1", status: "revealed" }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Not authenticated");

    mocks.from.mockReturnValueOnce(maybeSingleQuery({ data: null, error: new Error("offer lookup failed") }));
    await rejectMutation(result.current.mutateAsync({ id: "offer-1", status: "revealed" }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("offer lookup failed");

    mocks.from.mockReturnValueOnce(maybeSingleQuery({
      data: {
        bidder_id: "buyer-1",
        status: "submitted",
        listings: {
          owner_id: "user-1",
          open_house_date: "2099-01-01T00:00:00.000Z",
          open_house_settings: [{ offer_deadline: "2099-01-02T00:00:00.000Z" }],
        },
      },
      error: null,
    }));
    await rejectMutation(result.current.mutateAsync({ id: "offer-1", status: "revealed" }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/cannot be revealed|deadline/i));

    mocks.from.mockReturnValueOnce(maybeSingleQuery({
      data: { bidder_id: "buyer-1", status: "submitted", listings: { owner_id: "user-1" } },
      error: null,
    }));
    await rejectMutation(result.current.mutateAsync({ id: "offer-1", status: "accepted" }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Only revealed bids can be accepted.");

    mocks.getUser.mockResolvedValue({ data: { user: { id: "buyer-1" } } });
    mocks.from.mockReturnValueOnce(maybeSingleQuery({
      data: { bidder_id: "buyer-1", status: "submitted", listings: { owner_id: "owner-1" } },
      error: null,
    }));
    await rejectMutation(result.current.mutateAsync({ id: "offer-1", status: "rejected" }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Bidders can only withdraw their own bids.");

    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.from.mockReturnValueOnce(maybeSingleQuery({
      data: { bidder_id: "buyer-1", status: "submitted", listings: { owner_id: "user-1" } },
      error: null,
    }));
    await rejectMutation(result.current.mutateAsync({ id: "offer-1", status: "withdrawn" }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Only the bidder can withdraw a bid.");
  });

  it("covers accept and reopen authentication and RPC failures", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const accept = renderQueryHook(() => useAcceptOpenHouseOffer());
    await rejectMutation(accept.result.current.mutateAsync({ acceptId: "offer-1", listingId: "listing-1", allOfferIds: [] }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Not authenticated");
    accept.unmount();

    const reopen = renderQueryHook(() => useReopenOpenHouseOfferSelection());
    await rejectMutation(reopen.result.current.mutateAsync({ listingId: "listing-1" }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Not authenticated");
    reopen.unmount();

    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.rpc.mockResolvedValue({ error: new Error("rpc denied") });
    const acceptRpc = renderQueryHook(() => useAcceptOpenHouseOffer());
    await rejectMutation(acceptRpc.result.current.mutateAsync({ acceptId: "offer-1", listingId: "listing-1", allOfferIds: ["offer-2"] }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("rpc denied");
    acceptRpc.unmount();

    const reopenRpc = renderQueryHook(() => useReopenOpenHouseOfferSelection());
    await rejectMutation(reopenRpc.result.current.mutateAsync({ listingId: "listing-1" }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("rpc denied");
  });

  it("blocks bulk reveal for unauthenticated, lookup, non-owner, and early-deadline callers", async () => {
    const { result } = renderQueryHook(() => useRevealAllOffers());
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    await rejectMutation(result.current.mutateAsync({ listingId: "listing-1", offerIds: ["offer-1"] }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Not authenticated");

    mocks.rpc.mockReturnValueOnce(maybeSingleQuery({ data: null, error: new Error("listing failed") }));
    await rejectMutation(result.current.mutateAsync({ listingId: "listing-1", offerIds: ["offer-1"] }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("listing failed");

    mocks.rpc.mockReturnValueOnce(maybeSingleQuery({ data: { owner_id: "other-owner" }, error: null }));
    await rejectMutation(result.current.mutateAsync({ listingId: "listing-1", offerIds: ["offer-1"] }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Only the host can reveal sealed bids.");

    mocks.rpc.mockReturnValueOnce(maybeSingleQuery({
      data: {
        owner_id: "user-1",
        open_house_date: "2099-01-01T00:00:00.000Z",
        open_house_settings: { offer_deadline: "2099-01-02T00:00:00.000Z" },
      },
      error: null,
    }));
    await rejectMutation(result.current.mutateAsync({ listingId: "listing-1", offerIds: ["offer-1"] }));
    expect(mocks.toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/cannot be revealed|deadline/i));
    expect(mocks.services.revealSubmittedOpenHouseOffers).not.toHaveBeenCalled();
  });
});
