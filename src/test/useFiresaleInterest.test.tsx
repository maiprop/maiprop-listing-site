import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useAuthMock,
  fromMock,
  getUserMock,
  storageFromMock,
  uploadMock,
  rpcMock,
  invokeMock,
  toastMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  storageFromMock: vi.fn(),
  uploadMock: vi.fn(),
  rpcMock: vi.fn(),
  invokeMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    auth: { getUser: () => getUserMock() },
    storage: { from: (...args: unknown[]) => storageFromMock(...args) },
  },
}));

vi.mock("sonner", () => ({ toast: toastMock }));

import {
  hasPriorityProof,
  isActiveReservation,
  useExpressInterest,
  useFiresaleInterestQueue,
  useMyFiresaleInterests,
  useUpdateInterestStatus,
} from "@/hooks/useFiresaleInterest";
import { accountQueryKey } from "@/lib/identityQueryBoundary";

function wrapperWithClient(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function wrapper() {
  return wrapperWithClient(
    new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
}

beforeEach(() => {
  useAuthMock.mockReset();
  fromMock.mockReset();
  getUserMock.mockReset();
  storageFromMock.mockReset();
  uploadMock.mockReset();
  rpcMock.mockReset();
  invokeMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();

  useAuthMock.mockReturnValue({ user: { id: "inv-1" } });
  getUserMock.mockResolvedValue({ data: { user: { id: "inv-1" } } });
  rpcMock.mockResolvedValue({ error: null });
  invokeMock.mockResolvedValue({ data: { data: { id: "i-1" }, error: null }, error: null });
  storageFromMock.mockReturnValue({ upload: uploadMock });
  vi.stubGlobal("crypto", { ...crypto, randomUUID: () => "uuid-1" });
});

describe("queue helpers", () => {
  it("detects priority proof and active reservations", () => {
    expect(hasPriorityProof({ proof_of_funds_url: null, proof_amount: null, proof_of_funds_verified_at: null })).toBe(false);
    expect(hasPriorityProof({ proof_of_funds_url: "proof.pdf", proof_amount: null, proof_of_funds_verified_at: null })).toBe(true);
    expect(isActiveReservation({ status: "reserved", reservation_expires_at: "2999-01-01T00:00:00.000Z" })).toBe(true);
    expect(isActiveReservation({ status: "reserved", reservation_expires_at: "2000-01-01T00:00:00.000Z" })).toBe(false);
    expect(isActiveReservation({ status: "reserved", reservation_expires_at: null })).toBe(false);
    expect(isActiveReservation({ status: "engaged", reservation_expires_at: null })).toBe(true);
    expect(isActiveReservation({ status: "won", reservation_expires_at: "2000-01-01T00:00:00.000Z" })).toBe(true);
  });
});

describe("useMyFiresaleInterests", () => {
  it("scopes investor interest data to the current account", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const eq = vi.fn().mockResolvedValue({ data: [] });
    fromMock.mockReturnValue({ select: () => ({ eq }) });

    const { result } = renderHook(() => useMyFiresaleInterests(), {
      wrapper: wrapperWithClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryState(
      accountQueryKey("inv-1", "firesale-interest-mine"),
    )).toBeDefined();
  });

  it("returns an empty Map when unauthenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });
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

    expect(rpcMock).not.toHaveBeenCalledWith("release_expired_firesale_reservations", expect.anything());
    expect((result.current.data as Map<string, unknown>).has("d-2")).toBe(true);
  });
});

describe("useFiresaleInterestQueue", () => {
  it("scopes the admin queue to the current account", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ order }) }),
    });

    const { result } = renderHook(() => useFiresaleInterestQueue("d-1"), {
      wrapper: wrapperWithClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryState(
      accountQueryKey("inv-1", "firesale-interest-queue", "d-1"),
    )).toBeDefined();
  });

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
    expect(rpcMock).not.toHaveBeenCalledWith("release_expired_firesale_reservations", expect.anything());
  });

  it("surfaces Supabase errors", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("boom") });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) });

    const { result } = renderHook(() => useFiresaleInterestQueue("d-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useExpressInterest", () => {
  it("uploads proof and submits proof-backed interest through the Edge workflow", async () => {
    uploadMock.mockResolvedValue({ data: { path: "inv-1/firesale/d-1/proof_uuid-1.pdf" }, error: null });
    invokeMock.mockResolvedValueOnce({ data: { data: { id: "i-1" }, error: null }, error: null });

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

    expect(storageFromMock).toHaveBeenCalledWith("firesale-proof-docs");
    expect(uploadMock).toHaveBeenCalled();
    expect(uploadMock).toHaveBeenCalledWith(
      "inv-1/firesale/d-1/proof_uuid-1.pdf",
      file,
      { upsert: false },
    );
    expect(invokeMock).toHaveBeenCalledWith("submit-firesale-interest", {
      body: {
        dealId: "d-1",
        message: "Ready to move",
        proofAmount: 1500000,
        proofOfFundsUrl: "inv-1/firesale/d-1/proof_uuid-1.pdf",
      },
    });
    expect(rpcMock).not.toHaveBeenCalledWith("submit_firesale_interest", expect.anything());
  });

  it("uses interested status when no proof is provided", async () => {
    invokeMock.mockResolvedValueOnce({ data: { data: { id: "i-1" }, error: null }, error: null });

    const { result } = renderHook(() => useExpressInterest(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ dealId: "d-1", message: "No docs yet" });
    });

    expect(invokeMock).toHaveBeenCalledWith("submit-firesale-interest", {
      body: {
        dealId: "d-1",
        message: "No docs yet",
        proofAmount: undefined,
        proofOfFundsUrl: undefined,
      },
    });
  });

  it("rejects unsupported proof documents before storage upload", async () => {
    const { result } = renderHook(() => useExpressInterest(), { wrapper: wrapper() });
    const file = new File(["<svg></svg>"], "proof.svg", { type: "image/svg+xml" });

    await expect(result.current.mutateAsync({
      dealId: "d-1",
      proofFile: file,
    })).rejects.toThrow(/Unsupported proof of funds document type/);

    expect(uploadMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalledWith("submit-firesale-interest", expect.anything());
    expect(rpcMock).not.toHaveBeenCalledWith("submit_firesale_interest", expect.anything());
  });
});

describe("useUpdateInterestStatus", () => {
  it("uses the admin firesale Edge Function", async () => {
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

    expect(invokeMock).toHaveBeenCalledWith("admin-firesale-action", {
      body: {
        action: "update_interest_workflow",
        interestId: "i-1",
        status: "reserved",
        reservationHours: 24,
        verifyProof: true,
        adminNote: undefined,
        proofAmount: undefined,
      },
    });
  });

  it("toasts an error when the Edge Function fails", async () => {
    invokeMock.mockResolvedValueOnce({ data: { data: null, error: "boom" }, error: null });
    const { result } = renderHook(() => useUpdateInterestStatus(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: "i-1", dealId: "d-1", status: "passed" }).catch(() => {});
    });

    expect(toastMock.error).toHaveBeenCalled();
  });
});
