/**
 * Tests for the four hooks in `@/hooks/useConsultations`. The hooks call
 * supabase via various chains (insert, select+single, update+eq+single).
 * Each chain is mocked per-test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const { useAuthMock, fromMock, toastMock, loggerMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  fromMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  loggerMock: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

import {
  useSubmitConsultation,
  useMyConsultationRequests,
  useUpdateConsultationRequest,
} from "@/hooks/useConsultations";

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  useAuthMock.mockReset();
  fromMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.warning.mockReset();
  loggerMock.warn.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
});

describe("useSubmitConsultation", () => {
  it("rejects anonymous professional requests before touching Supabase", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const consInsert = vi.fn();
    fromMock.mockImplementation((table: string) => {
      if (table === "consultation_requests") return { insert: consInsert };
      throw new Error("unexpected table " + table);
    });

    const { result } = renderHook(() => useSubmitConsultation(), { wrapper: wrapper() });
    await act(async () => {
      await result.current
        .mutateAsync({
          professional_id: "p-1",
          requester_name: "Guest",
          requester_email: "guest@example.com",
          request_type: "message",
        })
        .catch(() => {});
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(consInsert).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("Please sign in to contact professionals.");
  });

  it("inserts the consultation row and lets the database trigger create the CRM lead", async () => {
    const consInsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "consultation_requests") return { insert: consInsert };
      throw new Error("unexpected table " + table);
    });

    const { result } = renderHook(() => useSubmitConsultation(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        professional_id: "p-1",
        requester_name: "Bob",
        requester_email: "bob@example.com",
        request_type: "callback",
        message: "Call me at 5pm",
      });
    });

    expect(consInsert).toHaveBeenCalledWith(expect.objectContaining({
      professional_id: "p-1",
      requester_id: "u-1",
      requester_name: "Bob",
      requester_email: "bob@example.com",
      request_type: "callback",
      message: "Call me at 5pm",
      // optional fields default to null
      requester_phone: null,
      service: null,
    }));
    expect(toastMock.success).toHaveBeenCalledWith("Callback request sent.");
  });

  it("normalizes blank preferred schedule fields before insert", async () => {
    const consInsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "consultation_requests") return { insert: consInsert };
      throw new Error("unexpected table " + table);
    });

    const { result } = renderHook(() => useSubmitConsultation(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        professional_id: "p-1",
        requester_name: "Bob",
        requester_email: "bob@example.com",
        request_type: "consultation",
        preferred_date: "",
        preferred_time: " ",
      });
    });

    expect(consInsert).toHaveBeenCalledWith(expect.objectContaining({
      preferred_date: null,
      preferred_time: null,
      meeting_type: "in_person",
    }));
  });

  it("persists video meeting type for consultation room authorization", async () => {
    const consInsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "consultation_requests") return { insert: consInsert };
      throw new Error("unexpected table " + table);
    });

    const { result } = renderHook(() => useSubmitConsultation(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        professional_id: "p-1",
        requester_name: "Bob",
        requester_email: "bob@example.com",
        request_type: "consultation",
        meeting_type: "video",
      });
    });

    expect(consInsert).toHaveBeenCalledWith(expect.objectContaining({
      meeting_type: "video",
    }));
  });

  it("toasts an error when consultation insert fails", async () => {
    const consInsert = vi.fn().mockResolvedValue({ error: new Error("denied") });
    fromMock.mockImplementation((_t: string) => ({ insert: consInsert }));
    const { result } = renderHook(() => useSubmitConsultation(), { wrapper: wrapper() });
    await act(async () => {
      await result.current
        .mutateAsync({
          professional_id: "p", requester_name: "x", requester_email: "x@x.com", request_type: "message",
        })
        .catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/Could not send/i));
  });
});
describe("useMyConsultationRequests", () => {
  it("returns empty when the user has no professional row", async () => {
    const proSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "professionals")
        return { select: () => ({ eq: () => ({ maybeSingle: proSingle }) }) };
      throw new Error("should not query " + table);
    });
    const { result } = renderHook(() => useMyConsultationRequests(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("returns rows scoped to the matched professional id", async () => {
    const proSingle = vi.fn().mockResolvedValue({ data: { id: "p-99" }, error: null });
    const order = vi.fn().mockResolvedValue({ data: [{ id: "c-1", message: "hi" }], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    fromMock.mockImplementation((table: string) => {
      if (table === "professionals")
        return { select: () => ({ eq: () => ({ maybeSingle: proSingle }) }) };
      if (table === "consultation_requests")
        return { select: () => ({ eq }) };
      throw new Error("unexpected " + table);
    });
    const { result } = renderHook(() => useMyConsultationRequests(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eq).toHaveBeenCalledWith("professional_id", "p-99");
    expect(result.current.data).toEqual([{ id: "c-1", message: "hi" }]);
  });
});

/**
 * Helper: mock supabase.from() to dispatch by table.
 * - "professionals" → returns { id: "p-99" } via select+eq+maybeSingle (used
 *   by update hooks to resolve the current user's professional id).
 * - "consultation_requests" → caller-supplied chain.
 */
function mockFromBy(consultationChain: unknown, proId: string | null = "p-99") {
  const proMaybeSingle = vi.fn().mockResolvedValue({ data: proId ? { id: proId } : null, error: null });
  fromMock.mockImplementation((table: string) => {
    if (table === "professionals") {
      return { select: () => ({ eq: () => ({ maybeSingle: proMaybeSingle }) }) };
    }
    if (table === "consultation_requests") return consultationChain;
    throw new Error("unexpected table " + table);
  });
}

describe("useUpdateConsultationRequest", () => {
  it("updates with id + professional_id ownership filter, returns the row, toasts success", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "c-1", status: "confirmed" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eqProf = vi.fn().mockReturnValue({ select });
    const eqId = vi.fn().mockReturnValue({ eq: eqProf });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    mockFromBy({ update });
    const { result } = renderHook(() => useUpdateConsultationRequest(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: "c-1", updates: { status: "confirmed" } });
    });
    expect(update).toHaveBeenCalledWith({ status: "confirmed" });
    expect(eqId).toHaveBeenCalledWith("id", "c-1");
    expect(eqProf).toHaveBeenCalledWith("professional_id", "p-99");
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/updated/i));
  });

  it("toasts error on failure", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: new Error("nope") });
    mockFromBy({ update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single }) }) }) }) });
    const { result } = renderHook(() => useUpdateConsultationRequest(), { wrapper: wrapper() });
    await act(async () => {
      await result.current
        .mutateAsync({ id: "c-1", updates: {} })
        .catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/Could not update/i));
  });

  it("rejects when caller has no professional profile (no row touched)", async () => {
    const update = vi.fn();
    mockFromBy({ update }, null);
    const { result } = renderHook(() => useUpdateConsultationRequest(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: "c-1", updates: {} }).catch(() => {});
    });
    expect(update).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalled();
  });
});
