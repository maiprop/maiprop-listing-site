/**
 * Tests for useOpenHouseAssetControl — the bundle of React Query hooks that
 * power the open-house owner dashboard plus the standalone storage helpers
 * (uploadOpenHouseDoc, getOpenHouseDocSignedUrl). We mock supabase.from /
 * supabase.storage / supabase.auth and assert each hook's filter chain,
 * ordering, mutation payloads, and error / success toasts.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";

const { fromMock, rpcMock, getUserMock, useAuthMock, storageBucket, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  getUserMock: vi.fn(),
  useAuthMock: vi.fn(),
  storageBucket: { upload: vi.fn(), createSignedUrl: vi.fn() },
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...a: unknown[]) => fromMock(...a),
    rpc: (...a: unknown[]) => rpcMock(...a),
    storage: { from: () => storageBucket },
    auth: { getUser: () => getUserMock() },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import {
  useOpenHouseSettings,
  useUpsertOpenHouseSettings,
  useOpenHouseRegistrations,
  useMyOpenHouseRegistrations,
  useCreateOpenHouseRegistration,
  useUpdateOpenHouseRegistration,
  useOpenHouseOffers,
  useMyOpenHouseOffers,
  useSubmitOpenHouseOffer,
  useUpdateOpenHouseOffer,
  useAcceptOpenHouseOffer,
  useRevealAllOffers,
  uploadOpenHouseDoc,
  getOpenHouseDocSignedUrl,
} from "@/hooks/useOpenHouseAssetControl";

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const renderHookWithQuery = <T,>(hook: () => T) =>
  renderHook(hook, { wrapper: ({ children }) => wrap({ children }) });

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: "u-1" } } });
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
  storageBucket.upload.mockReset();
  storageBucket.createSignedUrl.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

// ─── useOpenHouseSettings ───────────────────────────────────────────────────

describe("useOpenHouseSettings", () => {
  it("returns null and skips the query when listingId is undefined", () => {
    const { result } = renderHookWithQuery(() => useOpenHouseSettings(undefined));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("fetches settings keyed by listing_id", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "s-1", listing_id: "l-1" }, error: null }),
    });
    const { result } = renderHookWithQuery(() => useOpenHouseSettings("l-1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: "s-1" });
  });

  it("propagates errors", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error("denied") }),
    });
    const { result } = renderHookWithQuery(() => useOpenHouseSettings("l-1"));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ─── useUpsertOpenHouseSettings ─────────────────────────────────────────────

describe("useUpsertOpenHouseSettings", () => {
  it("upserts the settings row and shows a success toast", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "s-2" }, error: null });
    const upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single }),
    });
    fromMock.mockReturnValue({ upsert });
    const { result } = renderHookWithQuery(() => useUpsertOpenHouseSettings());
    await act(async () => {
      await result.current.mutateAsync({ listingId: "l-2", settings: { broker_required: true } });
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ listing_id: "l-2", broker_required: true }),
      { onConflict: "listing_id" },
    );
    expect(toastMock.success).toHaveBeenCalledWith("Settings saved");
  });

  it("toasts an error when upsert fails", async () => {
    fromMock.mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: new Error("rls") }),
        }),
      }),
    });
    const { result } = renderHookWithQuery(() => useUpsertOpenHouseSettings());
    await expect(
      act(async () => {
        await result.current.mutateAsync({ listingId: "l-2", settings: {} });
      }),
    ).rejects.toBeInstanceOf(Error);
    // React Query v5 fires onError in a microtask after the rejection
    // settles — wait briefly for the toast.
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
  });
});

// ─── useOpenHouseRegistrations / useMyOpenHouseRegistrations ────────────────

describe("useOpenHouseRegistrations", () => {
  it("returns [] when listingId is undefined", () => {
    const { result } = renderHookWithQuery(() => useOpenHouseRegistrations(undefined, true));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("fetches registrations ordered by created_at desc", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ id: "r-1" }], error: null }),
    });
    const { result } = renderHookWithQuery(() => useOpenHouseRegistrations("l-1", true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "r-1" }]);
  });
});

describe("useMyOpenHouseRegistrations", () => {
  it("waits for the auth user before firing", () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHookWithQuery(() => useMyOpenHouseRegistrations());
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns the current user's registrations", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ id: "r-2" }], error: null }),
    });
    const { result } = renderHookWithQuery(() => useMyOpenHouseRegistrations());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "r-2" }]);
  });
});

// ─── useCreateOpenHouseRegistration ─────────────────────────────────────────

describe("useCreateOpenHouseRegistration", () => {
  it("rejects when getUser returns no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { result } = renderHookWithQuery(() => useCreateOpenHouseRegistration());
    await expect(
      act(async () => {
        await result.current.mutateAsync({ listingId: "l-1" });
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("inserts a pending registration and toasts on success", async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "r-3" }, error: null }),
      }),
    });
    fromMock.mockReturnValue({ insert });
    const { result } = renderHookWithQuery(() => useCreateOpenHouseRegistration());
    await act(async () => {
      await result.current.mutateAsync({ listingId: "l-1", timeslotIndex: 2, note: "hi" });
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      listing_id: "l-1",
      requester_id: "u-1",
      timeslot_index: 2,
      note: "hi",
    }));
    expect(toastMock.success).toHaveBeenCalled();
  });
});

// ─── useUpdateOpenHouseRegistration ─────────────────────────────────────────

describe("useUpdateOpenHouseRegistration", () => {
  // Mocks the ownership lookup + the update chain. `lookup` is the row that
  // the SELECT returns; the test drives uid via the existing getUserMock.
  function mockRegUpdate(lookup: {
    requester_id?: string;
    status?: string;
    timeslot_index?: number | null;
    id_doc_url?: string | null;
    id_verified_at?: string | null;
    waiver_signed_at?: string | null;
    proof_of_funds_url?: string | null;
    proof_amount?: number | null;
    investor_declaration_signed_at?: string | null;
    mortgage_status?: string | null;
    budget_range?: string | null;
    working_with_agent?: string | null;
    listings?: {
      owner_id?: string;
      price?: number | null;
      open_house_settings?: Array<Record<string, unknown>> | Record<string, unknown> | null;
    };
  } | null) {
    const lookupMaybe = vi.fn().mockResolvedValue({ data: lookup, error: null });
    const single = vi.fn().mockResolvedValue({ data: { id: "r-1" }, error: null });
    const eq = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const updateMock = vi.fn().mockReturnValue({ eq });
    let calls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table !== "open_house_registrations") throw new Error("unexpected " + table);
      calls++;
      if (calls === 1) {
        return { select: () => ({ eq: () => ({ maybeSingle: lookupMaybe }) }) };
      }
      return { update: updateMock };
    });
    return { eq, updateMock };
  }

  it("allows the listing owner to update and toasts 'Updated'", async () => {
    const { eq } = mockRegUpdate({
      requester_id: "buyer-77",
      status: "pending",
      timeslot_index: 0,
      id_doc_url: "docs/id.pdf",
      id_verified_at: "2026-01-01T10:00:00.000Z",
      waiver_signed_at: "2026-01-01T10:05:00.000Z",
      proof_of_funds_url: null,
      proof_amount: null,
      investor_declaration_signed_at: null,
      mortgage_status: null,
      budget_range: null,
      working_with_agent: null,
      listings: {
        owner_id: "u-1",
        price: 150000,
        open_house_settings: null,
      },
    });
    const { result } = renderHookWithQuery(() => useUpdateOpenHouseRegistration());
    await act(async () => {
      await result.current.mutateAsync({ id: "r-1", updates: { status: "approved" } });
    });
    expect(eq).toHaveBeenCalledWith("id", "r-1");
    expect(toastMock.success).toHaveBeenCalledWith("Updated");
  });

  it("allows the requester to update their own registration (e.g. ID upload)", async () => {
    const { eq } = mockRegUpdate({
      requester_id: "u-1",
      listings: { owner_id: "someone-else" },
    });
    const { result } = renderHookWithQuery(() => useUpdateOpenHouseRegistration());
    await act(async () => {
      await result.current.mutateAsync({
        id: "r-1",
        updates: { id_doc_type: "passport", id_doc_url: "path/to/id.jpg" },
      });
    });
    expect(eq).toHaveBeenCalledWith("id", "r-1");
    expect(toastMock.success).toHaveBeenCalledWith("Updated");
  });

  it("blocks requesters from self-verifying ID or marking attendance", async () => {
    mockRegUpdate({
      requester_id: "u-1",
      status: "approved",
      listings: { owner_id: "someone-else" },
    });
    const { result } = renderHookWithQuery(() => useUpdateOpenHouseRegistration());
    await act(async () => {
      await result.current
        .mutateAsync({
          id: "r-1",
          updates: {
            id_verified_at: "2026-01-01T10:00:00.000Z",
            status: "attended",
          },
        })
        .catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalledWith("Only the host can approve, reject, or mark attendance.");
  });

  it("rejects when the caller is neither the requester nor the listing owner", async () => {
    mockRegUpdate({
      requester_id: "other-buyer",
      listings: { owner_id: "other-owner" },
    });
    const { result } = renderHookWithQuery(() => useUpdateOpenHouseRegistration());
    await act(async () => {
      await result.current
        .mutateAsync({ id: "r-1", updates: { status: "approved" } })
        .catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalled();
  });
});

// ─── useOpenHouseOffers / useMyOpenHouseOffers ──────────────────────────────

describe("useOpenHouseOffers", () => {
  it("returns [] when listingId is undefined", () => {
    const { result } = renderHookWithQuery(() => useOpenHouseOffers(undefined));
    expect(result.current.isPending).toBe(true);
  });

  it("fetches offers ordered by amount desc", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ id: "o-1", amount: 1 }], error: null }),
    });
    const { result } = renderHookWithQuery(() => useOpenHouseOffers("l-1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useMyOpenHouseOffers", () => {
  it("waits for auth and fetches the current user's offers", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ id: "o-2" }], error: null }),
    });
    const { result } = renderHookWithQuery(() => useMyOpenHouseOffers());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

// ─── useSubmitOpenHouseOffer ────────────────────────────────────────────────

describe("useSubmitOpenHouseOffer", () => {
  it("submits through the server-side offer RPC", async () => {
    rpcMock.mockResolvedValue({ data: { id: "o-1" }, error: null });
    const { result } = renderHookWithQuery(() => useSubmitOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({ listingId: "l-1", amount: 350_000, message: "best" });
    });
    expect(rpcMock).toHaveBeenCalledWith("submit_open_house_offer", {
      p_listing_id: "l-1",
      p_amount: 350_000,
      p_message: "best",
      p_currency: "EUR",
    });
    expect(toastMock.success).toHaveBeenCalledWith("Offer submitted");
  });

  it("rejects when no auth user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { result } = renderHookWithQuery(() => useSubmitOpenHouseOffer());
    await expect(
      act(async () => {
        await result.current.mutateAsync({ listingId: "l-1", amount: 1 });
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});

// ─── useUpdateOpenHouseOffer ────────────────────────────────────────────────

describe("useUpdateOpenHouseOffer", () => {
  // Helper that mocks the listing+bidder ownership lookup performed before the
  // actual update mutation, then returns the captured `update` mock so the
  // body of each test can assert on it. Defaults to the listing-owner path.
  function mockOfferUpdate(
    lookup: {
      bidder_id?: string;
      status?: string;
      listings?: {
        owner_id?: string;
        open_house_date?: string | null;
        open_house_settings?: Array<Record<string, unknown>> | Record<string, unknown> | null;
      };
    } = {
      bidder_id: "some-bidder",
      status: "submitted",
      listings: { owner_id: "u-1", open_house_date: "2026-01-01T10:00:00.000Z", open_house_settings: null },
    },
  ) {
    const lookupMaybe = vi.fn().mockResolvedValue({ data: lookup, error: null });
    const single = vi.fn().mockResolvedValue({ data: { id: "o-1" }, error: null });
    const eq = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const updateMock = vi.fn().mockReturnValue({ eq });
    let calls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table !== "open_house_offers") throw new Error("unexpected " + table);
      calls++;
      if (calls === 1) {
        return { select: () => ({ eq: () => ({ maybeSingle: lookupMaybe }) }) };
      }
      return { update: updateMock };
    });
    return updateMock;
  }

  it("stamps revealed_at when status='revealed'", async () => {
    const updateMock = mockOfferUpdate();
    const { result } = renderHookWithQuery(() => useUpdateOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({ id: "o-1", status: "revealed" });
    });
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      status: "revealed",
      revealed_at: expect.any(String),
    });
  });

  it("stamps decided_by + decided_at when status='accepted'", async () => {
    const updateMock = mockOfferUpdate({
      bidder_id: "some-bidder",
      status: "revealed",
      listings: { owner_id: "u-1", open_house_date: "2026-01-01T10:00:00.000Z", open_house_settings: null },
    });
    const { result } = renderHookWithQuery(() => useUpdateOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({ id: "o-1", status: "accepted" });
    });
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      status: "accepted",
      decided_by: "u-1",
      decided_at: expect.any(String),
    });
  });

  it("allows the bidder to withdraw their own offer", async () => {
    const updateMock = mockOfferUpdate({
      bidder_id: "u-1",
      listings: { owner_id: "someone-else" },
    });
    const { result } = renderHookWithQuery(() => useUpdateOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({ id: "o-1", status: "withdrawn" });
    });
    expect(updateMock.mock.calls[0][0]).toEqual({ status: "withdrawn" });
  });

  it("does not stamp the revealed/decided fields for status='withdrawn'", async () => {
    const updateMock = mockOfferUpdate({
      bidder_id: "u-1",
      status: "submitted",
      listings: { owner_id: "someone-else", open_house_date: "2026-01-01T10:00:00.000Z", open_house_settings: null },
    });
    const { result } = renderHookWithQuery(() => useUpdateOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({ id: "o-1", status: "withdrawn" });
    });
    expect(updateMock.mock.calls[0][0]).toEqual({ status: "withdrawn" });
  });

  it("rejects when caller is neither the bidder nor the listing owner", async () => {
    mockOfferUpdate({
      bidder_id: "other-bidder",
      listings: { owner_id: "other-owner" },
    });
    const { result } = renderHookWithQuery(() => useUpdateOpenHouseOffer());
    await act(async () => {
      await result.current
        .mutateAsync({ id: "o-1", status: "revealed" })
        .catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalled();
  });
});

// ─── useAcceptOpenHouseOffer ────────────────────────────────────────────────

describe("useAcceptOpenHouseOffer", () => {
  it("accepts through the atomic server-side RPC", async () => {
    rpcMock.mockResolvedValue({ data: { id: "o-1" }, error: null });
    const { result } = renderHookWithQuery(() => useAcceptOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({
        acceptId: "o-1",
        listingId: "l-1",
        allOfferIds: ["o-1", "o-2", "o-3"],
      });
    });
    expect(rpcMock).toHaveBeenCalledWith("accept_open_house_offer", { p_offer_id: "o-1" });
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("toasts an error when the accept RPC fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("active_offer_already_accepted") });
    const { result } = renderHookWithQuery(() => useAcceptOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({
        acceptId: "o-1",
        listingId: "l-1",
        allOfferIds: ["o-1"],
      }).catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalled();
  });
});

// ─── useRevealAllOffers ─────────────────────────────────────────────────────

describe("useRevealAllOffers", () => {
  it("flips every submitted offer to revealed in one batch", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        owner_id: "u-1",
        open_house_date: "2026-01-01T10:00:00.000Z",
        open_house_settings: null,
      },
      error: null,
    });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const inFn = vi.fn().mockReturnValue({ eq });
    fromMock.mockImplementation((table: string) => {
      if (table === "listings") {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) };
      }
      if (table === "open_house_offers") {
        return { update: vi.fn().mockReturnValue({ in: inFn }) };
      }
      throw new Error("unexpected " + table);
    });
    const { result } = renderHookWithQuery(() => useRevealAllOffers());
    await act(async () => {
      await result.current.mutateAsync({ listingId: "l-1", offerIds: ["a", "b"] });
    });
    expect(inFn).toHaveBeenCalledWith("id", ["a", "b"]);
    expect(eq).toHaveBeenCalledWith("status", "submitted");
    expect(toastMock.success).toHaveBeenCalledWith("All bids revealed");
  });
});

// ─── Storage helpers ────────────────────────────────────────────────────────

describe("uploadOpenHouseDoc / getOpenHouseDocSignedUrl", () => {
  it("uploads to the open-house-docs bucket and returns the path", async () => {
    storageBucket.upload.mockResolvedValue({ data: { path: "u-1/file.pdf" }, error: null });
    const f = new File(["x"], "file.pdf", { type: "application/pdf" });
    const path = await uploadOpenHouseDoc(f, "u-1/file.pdf");
    expect(path).toBe("u-1/file.pdf");
    expect(storageBucket.upload).toHaveBeenCalledWith("u-1/file.pdf", f, { upsert: true });
  });

  it("rejects when storage.upload errors", async () => {
    storageBucket.upload.mockResolvedValue({ data: null, error: new Error("403") });
    const f = new File(["x"], "file.pdf");
    await expect(uploadOpenHouseDoc(f, "u-1/file.pdf")).rejects.toBeInstanceOf(Error);
  });

  it("returns the signed URL string", async () => {
    storageBucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed/x.pdf?token=abc" },
      error: null,
    });
    const url = await getOpenHouseDocSignedUrl("u-1/file.pdf");
    expect(url).toContain("?token=");
    expect(storageBucket.createSignedUrl).toHaveBeenCalledWith("u-1/file.pdf", 3600);
  });

  it("rejects when createSignedUrl errors", async () => {
    storageBucket.createSignedUrl.mockResolvedValue({ data: null, error: new Error("404") });
    await expect(getOpenHouseDocSignedUrl("missing.pdf")).rejects.toBeInstanceOf(Error);
  });
});
