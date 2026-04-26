/**
 * Tests for useProjectViews and useRecordProjectView. The first wraps a
 * `count: "exact", head: true` Supabase query; the second is a mutation that
 * stamps the current authenticated user (or null) onto the row.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

const fromMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    auth: { getUser: () => getUserMock() },
  },
}));

import { useProjectViews, useRecordProjectView } from "@/hooks/useProjectViews";

function wrap(children: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
function renderHookWithQuery<T>(hook: () => T) {
  return renderHook(hook, { wrapper: ({ children }) => wrap(children) });
}

beforeEach(() => {
  fromMock.mockReset();
  getUserMock.mockReset();
});

describe("useProjectViews", () => {
  it("stays pending and returns no fetch when projectId is undefined", () => {
    const { result } = renderHookWithQuery(() => useProjectViews(undefined));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns the count from the head query", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 42, error: null }),
    };
    fromMock.mockReturnValue(builder);
    const { result } = renderHookWithQuery(() => useProjectViews("pr1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ count: 42 });
    expect(builder.select).toHaveBeenCalledWith("*", { count: "exact", head: true });
  });

  it("normalises a null count to 0", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: null, error: null }),
    };
    fromMock.mockReturnValue(builder);
    const { result } = renderHookWithQuery(() => useProjectViews("pr2"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ count: 0 });
  });

  it("propagates query errors", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: null, error: new Error("nope") }),
    };
    fromMock.mockReturnValue(builder);
    const { result } = renderHookWithQuery(() => useProjectViews("pr3"));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useRecordProjectView", () => {
  it("inserts a row stamped with the current user id when signed-in", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const insert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert });

    const { result } = renderHookWithQuery(() => useRecordProjectView());
    await act(async () => {
      await result.current.mutateAsync("project-x");
    });
    expect(insert).toHaveBeenCalledWith({ project_id: "project-x", viewer_id: "user-1" });
  });

  it("falls back to viewer_id=null when there is no signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const insert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert });

    const { result } = renderHookWithQuery(() => useRecordProjectView());
    await act(async () => {
      await result.current.mutateAsync("project-y");
    });
    expect(insert).toHaveBeenCalledWith({ project_id: "project-y", viewer_id: null });
  });

  it("rejects when the insert fails", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u" } } });
    fromMock.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: new Error("rls") }) });
    const { result } = renderHookWithQuery(() => useRecordProjectView());
    await expect(
      act(async () => {
        await result.current.mutateAsync("project-z");
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});
