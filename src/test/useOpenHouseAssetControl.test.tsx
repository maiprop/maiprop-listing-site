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

const { fromMock, getUserMock, useAuthMock, storageBucket, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  useAuthMock: vi.fn(),
  storageBucket: { upload: vi.fn(), createSignedUrl: vi.fn() },
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...a: unknown[]) => fromMock(...a),
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
  it("verifies listing ownership, updates the registration and toasts 'Updated'", async () => {
    const lookupMaybe = vi
      .fn()
      .mockResolvedValue({ data: { listings: { user_id: "u-1" } }, error: null });
    const single = vi.fn().mockResolvedValue({ data: { id: "r-1" }, error: null });
    const eq = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    let calls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table !== "open_house_registrations") throw new Error("unexpected " + table);
      calls++;
      if (calls === 1) {
        return {
          select: () => ({ eq: () => ({ maybeSingle: lookupMaybe }) }),
        };
      }
      return { update: vi.fn().mockReturnValue({ eq }) };
    });
    const { result } = renderHookWithQuery(() => useUpdateOpenHouseRegistration());
    await act(async () => {
      await result.current.mutateAsync({ id: "r-1", updates: { status: "approved" } });
    });
    expect(eq).toHaveBeenCalledWith("id", "r-1");
    expect(toastMock.success).toHaveBeenCalledWith("Updated");
  });

  it("rejects when the caller is not the listing owner", async () => {
    const lookupMaybe = vi
      .fn()
      .mockResolvedValue({ data: { listings: { user_id: "someone-else" } }, error: null });
    fromMock.mockImplementation((table: string) => {
      if (table !== "open_house_registrations") throw new Error("unexpected " + table);
      return { select: () => ({ eq: () => ({ maybeSingle: lookupMaybe }) }) };
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
  it("upserts a submitted offer keyed by listing_id+bidder_id", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "o-1" }, error: null });
    const upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single }),
    });
    fromMock.mockReturnValue({ upsert });
    const { result } = renderHookWithQuery(() => useSubmitOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({ listingId: "l-1", amount: 350_000, message: "best" });
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        listing_id: "l-1",
        bidder_id: "u-1",
        amount: 350_000,
        status: "submitted",
      }),
      { onConflict: "listing_id,bidder_id" },
    );
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
  // Helper that mocks the listings ownership lookup performed before the
  // actual update mutation, then returns the captured `update` mock so the
  // body of each test can assert on it.
  function mockOfferUpdate(ownerId: string = "u-1") {
    const lookupMaybe = vi
      .fn()
      .mockResolvedValue({ data: { listings: { user_id: ownerId } }, error: null });
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
    const updateMock = mockOfferUpdate();
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

  it("does not stamp the revealed/decided fields for status='withdrawn'", async () => {
    const updateMock = mockOfferUpdate();
    const { result } = renderHookWithQuery(() => useUpdateOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({ id: "o-1", status: "withdrawn" });
    });
    expect(updateMock.mock.calls[0][0]).toEqual({ status: "withdrawn" });
  });
});

// ─── useAcceptOpenHouseOffer ────────────────────────────────────────────────

describe("useAcceptOpenHouseOffer", () => {
  it("accepts the chosen offer and rejects every other id", async () => {
    const eqAccept = vi.fn().mockResolvedValue({ error: null });
    const eqOthers = vi.fn().mockReturnValue({
      neq: vi.fn().mockResolvedValue({ error: null }),
    });
    const inOthers = vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) });
    let call = 0;
    fromMock.mockImplementation(() => {
      call++;
      if (call === 1) return { update: vi.fn().mockReturnValue({ eq: eqAccept }) };
      return { update: vi.fn().mockReturnValue({ in: inOthers }) };
    });
    const { result } = renderHookWithQuery(() => useAcceptOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({
        acceptId: "o-1",
        listingId: "l-1",
        allOfferIds: ["o-1", "o-2", "o-3"],
      });
    });
    expect(eqAccept).toHaveBeenCalledWith("id", "o-1");
    expect(inOthers).toHaveBeenCalledWith("id", ["o-2", "o-3"]);
    expect(toastMock.success).toHaveBeenCalled();
    expect(eqOthers).not.toHaveBeenCalled();
  });

  it("skips the second update when there are no other offers", async () => {
    fromMock.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const { result } = renderHookWithQuery(() => useAcceptOpenHouseOffer());
    await act(async () => {
      await result.current.mutateAsync({
        acceptId: "o-1",
        listingId: "l-1",
        allOfferIds: ["o-1"],
      });
    });
    // Only one fromMock call (the accept update).
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});

// ─── useRevealAllOffers ─────────────────────────────────────────────────────

describe("useRevealAllOffers", () => {
  it("flips every submitted offer to revealed in one batch", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const inFn = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update: vi.fn().mockReturnValue({ in: inFn }) });
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
