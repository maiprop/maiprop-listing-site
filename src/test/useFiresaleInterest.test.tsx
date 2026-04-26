/**
 * Tests for the four hooks in `@/hooks/useFiresaleInterest`. Covers the
 * mine / mine-all / queue queries, the express-interest mutation (with
 * file upload + upsert), and the admin status mutation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const { fromMock, getUserMock, storageFromMock, uploadMock, toastMock, randomUUIDMock } = vi.hoisted(
  () => ({
    fromMock: vi.fn(),
    getUserMock: vi.fn(),
    storageFromMock: vi.fn(),
    uploadMock: vi.fn(),
    toastMock: { success: vi.fn(), error: vi.fn() },
    randomUUIDMock: vi.fn(),
  }),
);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...a: unknown[]) => fromMock(...a),
    auth: { getUser: () => getUserMock() },
    storage: { from: (...a: unknown[]) => storageFromMock(...a) },
  },
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import {
  useMyFiresaleInterest,
  useMyFiresaleInterests,
  useFiresaleInterestQueue,
  useExpressInterest,
  useUpdateInterestStatus,
} from "@/hooks/useFiresaleInterest";

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  fromMock.mockReset();
  getUserMock.mockReset();
  storageFromMock.mockReset();
  uploadMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  randomUUIDMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: "inv-1" } } });
  storageFromMock.mockReturnValue({ upload: uploadMock });
  // Provide a deterministic UUID so we can assert on the path.
  vi.stubGlobal("crypto", { ...crypto, randomUUID: () => "uuid-1" });
});

describe("useMyFiresaleInterest", () => {
  it("returns null when no dealId is provided (query disabled)", async () => {
    const { result } = renderHook(() => useMyFiresaleInterest(undefined), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
  });

  it("returns null when there is no auth user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useMyFiresaleInterest("d-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("returns the row scoped to deal_id + investor_id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "i-1", deal_id: "d-1", investor_id: "inv-1" },
    });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    fromMock.mockReturnValue({ select: () => ({ eq: eq1 }) });
    const { result } = renderHook(() => useMyFiresaleInterest("d-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eq1).toHaveBeenCalledWith("deal_id", "d-1");
    expect(eq2).toHaveBeenCalledWith("investor_id", "inv-1");
    expect(result.current.data).toMatchObject({ id: "i-1" });
  });
});

describe("useMyFiresaleInterests", () => {
  it("returns an empty Set when no auth user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useMyFiresaleInterests(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeInstanceOf(Set);
    expect((result.current.data as Set<string>).size).toBe(0);
  });

  it("returns a Map keyed by deal_id when authenticated", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { deal_id: "d-1", status: "interested", proof_of_funds_url: null },
        { deal_id: "d-2", status: "shortlisted", proof_of_funds_url: "u/2" },
      ],
    });
    fromMock.mockReturnValue({ select: () => ({ eq }) });
    const { result } = renderHook(() => useMyFiresaleInterests(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const map = result.current.data as Map<string, unknown>;
    expect(map.size).toBe(2);
    expect(map.has("d-1")).toBe(true);
    expect(map.has("d-2")).toBe(true);
  });
});

describe("useFiresaleInterestQueue", () => {
  it("returns [] when dealId is undefined", async () => {
    const { result } = renderHook(() => useFiresaleInterestQueue(undefined), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
  });

  it("orders POF-uploaded entries first, then by created_at ascending", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: "a", proof_of_funds_url: null, created_at: "2026-01-01" },
        { id: "b", proof_of_funds_url: "u/b", created_at: "2026-02-01" },
        { id: "c", proof_of_funds_url: "u/c", created_at: "2026-01-15" },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    fromMock.mockReturnValue({ select: () => ({ eq }) });
    const { result } = renderHook(() => useFiresaleInterestQueue("d-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const ids = (result.current.data as { id: string }[]).map((r) => r.id);
    // POF first (c, b — sorted by created_at), then non-POF (a)
    expect(ids).toEqual(["c", "b", "a"]);
  });

  it("propagates supabase errors", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("boom") });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) });
    const { result } = renderHook(() => useFiresaleInterestQueue("d-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useExpressInterest", () => {
  it("uploads the proof file to storage and upserts the row, then toasts success", async () => {
    uploadMock.mockResolvedValue({ data: { path: "firesale/inv-1/d-1/proof_uuid-1.pdf" }, error: null });
    const single = vi.fn().mockResolvedValue({ data: { id: "i-1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    fromMock.mockReturnValue({ upsert });

    const file = new File(["x"], "proof.pdf", { type: "application/pdf" });
    const { result } = renderHook(() => useExpressInterest(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        dealId: "d-1",
        proofFile: file,
        proofAmount: "1500000",
        message: "Please reach out",
      });
    });
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^firesale\/inv-1\/d-1\/proof_/),
      file,
      { upsert: true },
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        deal_id: "d-1",
        investor_id: "inv-1",
        status: "interested",
        message: "Please reach out",
        proof_amount: 1_500_000,
        proof_of_funds_url: "firesale/inv-1/d-1/proof_uuid-1.pdf",
      }),
      { onConflict: "deal_id,investor_id" },
    );
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/registered/i));
  });

  it("works without a proof file (no upload, no proof_of_funds_url field)", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "i-1" }, error: null });
    const upsert = vi.fn().mockReturnValue({ select: () => ({ single }) });
    fromMock.mockReturnValue({ upsert });
    const { result } = renderHook(() => useExpressInterest(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ dealId: "d-1", message: "" });
    });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ proof_of_funds_url: expect.anything() }),
      { onConflict: "deal_id,investor_id" },
    );
  });

  it("rejects when not authenticated and toasts error", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useExpressInterest(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ dealId: "d-1" }).catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/wrong/i));
  });

  it("toasts error when storage upload fails", async () => {
    uploadMock.mockResolvedValue({ data: null, error: new Error("storage-denied") });
    const { result } = renderHook(() => useExpressInterest(), { wrapper: wrapper() });
    const file = new File(["x"], "p.pdf");
    await act(async () => {
      await result.current.mutateAsync({ dealId: "d-1", proofFile: file }).catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalled();
  });
});

describe("useUpdateInterestStatus", () => {
  it("updates the status by id and toasts success", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });
    const { result } = renderHook(() => useUpdateInterestStatus(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: "i-1", dealId: "d-1", status: "engaged" });
    });
    expect(update).toHaveBeenCalledWith({ status: "engaged" });
    expect(eq).toHaveBeenCalledWith("id", "i-1");
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/updated/i));
  });

  it("toasts error on supabase failure", async () => {
    const eq = vi.fn().mockResolvedValue({ error: new Error("boom") });
    fromMock.mockReturnValue({ update: () => ({ eq }) });
    const { result } = renderHook(() => useUpdateInterestStatus(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: "x", dealId: "d", status: "passed" }).catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalled();
  });
});
