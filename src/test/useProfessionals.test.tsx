/**
 * Tests for the useProfessionals / useProfessional / useProfessionalByUserId
 * hooks. Each hook drives a Supabase RPC or table read, so we mock the
 * client module and assert both the happy path and the RPC-fallback branch.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { useProfessionals, useProfessional, useProfessionalByUserId } from "@/hooks/useProfessionals";

function wrap(children: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderHookWithQuery<T>(hook: () => T) {
  return renderHook(hook, {
    wrapper: ({ children }) => wrap(children),
  });
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe("useProfessionals", () => {
  it("returns the RPC result when available", async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: "p1", display_name: "Alice" }],
      error: null,
    });
    const { result } = renderHookWithQuery(() => useProfessionals("legal"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith("get_professionals_with_priority", {
      p_category: "legal",
    });
    expect(result.current.data).toEqual([{ id: "p1", display_name: "Alice" }]);
  });

  it("falls back to a direct table query when the RPC returns an error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc missing" } });
    const fallbackQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
        resolve({ data: [{ id: "fallback" }], error: null });
        return this;
      },
    };
    fromMock.mockReturnValue(fallbackQuery);
    const { result } = renderHookWithQuery(() => useProfessionals());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fromMock).toHaveBeenCalledWith("professionals");
    expect(result.current.data).toEqual([{ id: "fallback" }]);
  });

  it("re-throws if the fallback also errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc missing" } });
    const fallbackQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then(resolve: (v: { data: null; error: unknown }) => unknown) {
        resolve({ data: null, error: new Error("db down") });
        return this;
      },
    };
    fromMock.mockReturnValue(fallbackQuery);
    const { result } = renderHookWithQuery(() => useProfessionals());
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useProfessional(id)", () => {
  it("waits for the id before firing the query", () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    fromMock.mockReturnValue(builder);
    const { result } = renderHookWithQuery(() => useProfessional(""));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("fetches a single professional row by id", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "p2", display_name: "Bob" },
      error: null,
    });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single,
    });
    const { result } = renderHookWithQuery(() => useProfessional("p2"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "p2", display_name: "Bob" });
    expect(single).toHaveBeenCalled();
  });
});

describe("useProfessionalByUserId(userId)", () => {
  it("returns null and skips the query when userId is undefined", () => {
    const { result } = renderHookWithQuery(() => useProfessionalByUserId(undefined));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns the professional record matching a user id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "p3" }, error: null });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    });
    const { result } = renderHookWithQuery(() => useProfessionalByUserId("u1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "p3" });
  });
});
