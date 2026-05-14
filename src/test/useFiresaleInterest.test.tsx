import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fromMock,
  getUserMock,
  storageFromMock,
  uploadMock,
  rpcMock,
  toastMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  storageFromMock: vi.fn(),
  uploadMock: vi.fn(),
  rpcMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: { getUser: () => getUserMock() },
    storage: { from: (...args: unknown[]) => storageFromMock(...args) },
  },
}));

vi.mock("sonner", () => ({ toast: toastMock }));

import {
  hasPriorityProof,
  isActiveReservation,
  sortFiresaleInterestQueue,
  useExpressInterest,
  useFiresaleInterestQueue,
  useMyFiresaleInterest,
  useMyFiresaleInterests,
  useUpdateInterestStatus,
} from "@/hooks/useFiresaleInterest";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  fromMock.mockReset();
  getUserMock.mockReset();
  storageFromMock.mockReset();
  uploadMock.mockReset();
  rpcMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();

  getUserMock.mockResolvedValue({ data: { user: { id: "inv-1" } } });
  rpcMock.mockResolvedValue({ error: null });
  storageFromMock.mockReturnValue({ upload: uploadMock });
  vi.stubGlobal("crypto", { ...crypto, randomUUID: () => "uuid-1" });
});

describe("queue helpers", () => {
  it("detects priority proof and active reservations", () => {
    expect(hasPriorityProof({ proof_of_funds_url: null, proof_amount: null, proof_of_funds_verified_at: null })).toBe(false);
    expect(hasPriorityProof({ proof_of_funds_url: "proof.pdf", proof_amount: null, proof_of_funds_verified_at: null })).toBe(true);
    expect(isActiveReservation({ status: "reserved", reservation_expires_at: "2999-01-01T00:00:00.000Z" })).toBe(true);
    expect(isActiveReservation({ status: "reserved", reservation_expires_at: "2000-01-01T00:00:00.000Z" })).toBe(false);
  });

  it("sorts reserved first, then prioritized, then proof-backed interested rows", () => {
    const rows = [
      { id: "late", status: "interested", proof_of_funds_url: null, proof_amount: null, proof_of_funds_verified_at: null, reservation_expires_at: null, created_at: "2026-01-03" },
      { id: "reserved", status: "reserved", proof_of_funds_url: null, proof_amount: null, proof_of_funds_verified_at: null, reservation_expires_at: "2999-01-01T00:00:00.000Z", created_at: "2026-01-04" },
      { id: "prio", status: "prioritized", proof_of_funds_url: "proof.pdf", proof_amount: 500000, proof_of_funds_verified_at: null, reservation_expires_at: null, created_at: "2026-01-02" },
      { id: "proof", status: "interested", proof_of_funds_url: "proof.pdf", proof_amount: 1000000, proof_of_funds_verified_at: null, reservation_expires_at: null, created_at: "2026-01-01" },
    ] as never[];

    expect(sortFiresaleInterestQueue(rows).map((row) => row.id)).toEqual(["reserved", "prio", "proof", "late"]);
  });
});

describe("useMyFiresaleInterest", () => {
  it("returns undefined when disabled", async () => {
    const { result } = renderHook(() => useMyFiresaleInterest(undefined), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
  });

  it("scopes query to deal and investor after releasing expiries", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "i-1", deal_id: "d-1", investor_id: "inv-1" } });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    fromMock.mockReturnValue({ select: () => ({ eq: eq1 }) });

    const { result } = renderHook(() => useMyFiresaleInterest("d-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcMock).toHaveBeenCalledWith("release_expired_firesale_reservations", { p_deal_id: "d-1" });
    expect(eq1).toHaveBeenCalledWith("deal_id", "d-1");
    expect(eq2).toHaveBeenCalledWith("investor_id", "inv-1");
  });
});

describe("useMyFiresaleInterests", () => {
  it("returns an empty Map when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useMyFiresaleInterests(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeInstanceOf(Map);
    expect((result.current.data as Map<string, unknown>).size).toBe(0);
  });

  it("returns a Map keyed by deal_id", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { deal_id: "d-1", status: "interested", proof_of_funds_url: null },
        { deal_id: "d-2", status: "reserved", proof_of_funds_url: "proof.pdf" },
      ],
    });
    fromMock.mockReturnValue({ select: () => ({ eq }) });

    const { result } = renderHook(() => useMyFiresaleInterests(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcMock).toHaveBeenCalledWith("release_expired_firesale_reservations", { p_deal_id: undefined });
    expect((result.current.data as Map<string, unknown>).has("d-2")).toBe(true);
  });
});

describe("useFiresaleInterestQueue", () => {
  it("returns undefined when disabled", async () => {
    const { result } = renderHook(() => useFiresaleInterestQueue(undefined), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
  });

  it("sorts the queue using reservation and proof priority", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: "plain", status: "interested", proof_of_funds_url: null, proof_amount: null, proof_of_funds_verified_at: null, reservation_expires_at: null, created_at: "2026-01-03" },
        { id: "priority", status: "prioritized", proof_of_funds_url: "proof.pdf", proof_amount: 1000, proof_of_funds_verified_at: null, reservation_expires_at: null, created_at: "2026-01-02" },
        { id: "reserved", status: "reserved", proof_of_funds_url: null, proof_amount: null, proof_of_funds_verified_at: null, reservation_expires_at: "2999-01-01T00:00:00.000Z", created_at: "2026-01-04" },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    fromMock.mockReturnValue({ select: () => ({ eq }) });

    const { result } = renderHook(() => useFiresaleInterestQueue("d-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect((result.current.data as { id: string }[]).map((row) => row.id)).toEqual(["reserved", "priority", "plain"]);
  });

  it("surfaces Supabase errors", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("boom") });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) });

    const { result } = renderHook(() => useFiresaleInterestQueue("d-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useExpressInterest", () => {
  it("uploads proof and upserts a prioritized row", async () => {
    uploadMock.mockResolvedValue({ data: { path: "inv-1/firesale/d-1/proof_uuid-1.pdf" }, error: null });
    const single = vi.fn().mockResolvedValue({ data: { id: "i-1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    fromMock.mockReturnValue({ upsert });

    const { result } = renderHook(() => useExpressInterest(), { wrapper: wrapper() });
    const file = new File(["x"], "proof.pdf", { type: "application/pdf" });

    await act(async () => {
      await result.current.mutateAsync({
        dealId: "d-1",
        proofFile: file,
        proofAmount: "1500000",
        message: "Ready to move",
      });
    });

    expect(uploadMock).toHaveBeenCalled();
    expect(uploadMock).toHaveBeenCalledWith(
      "inv-1/firesale/d-1/proof_uuid-1.pdf",
      file,
      { upsert: true },
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        deal_id: "d-1",
        investor_id: "inv-1",
        status: "prioritized",
        proof_amount: 1500000,
        proof_of_funds_url: "inv-1/firesale/d-1/proof_uuid-1.pdf",
      }),
      { onConflict: "deal_id,investor_id" },
    );
  });

  it("uses interested status when no proof is provided", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "i-1" }, error: null });
    const upsert = vi.fn().mockReturnValue({ select: () => ({ single }) });
    fromMock.mockReturnValue({ upsert });

    const { result } = renderHook(() => useExpressInterest(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ dealId: "d-1", message: "No docs yet" });
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "interested" }),
      { onConflict: "deal_id,investor_id" },
    );
  });
});

describe("useUpdateInterestStatus", () => {
  it("uses the admin workflow RPC", async () => {
    const { result } = renderHook(() => useUpdateInterestStatus(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        id: "i-1",
        dealId: "d-1",
        status: "reserved",
        reservationHours: 24,
        verifyProof: true,
      });
    });

    expect(rpcMock).toHaveBeenCalledWith("admin_update_firesale_interest_workflow", {
      p_interest_id: "i-1",
      p_status: "reserved",
      p_reservation_hours: 24,
      p_verify_pof: true,
      p_admin_note: undefined,
      p_proof_amount: undefined,
    });
  });

  it("toasts an error when the RPC fails", async () => {
    rpcMock.mockResolvedValueOnce({ error: new Error("boom") });
    const { result } = renderHook(() => useUpdateInterestStatus(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: "i-1", dealId: "d-1", status: "passed" }).catch(() => {});
    });

    expect(toastMock.error).toHaveBeenCalled();
  });
});
