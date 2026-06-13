/**
 * Tests for the project hooks (list, single, create, update, delete) — the
 * developer-side equivalent of usePortfolios. Same Supabase + useAuth mock
 * pattern.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

const fromMock = vi.fn();
const rpcMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  useProjects,
  useProject,
  useUpdateProject,
  useDeleteProject,
} from "@/hooks/useProjects";

function wrap(children: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
function renderHookWithQuery<T>(hook: () => T) {
  return renderHook(hook, { wrapper: ({ children }) => wrap(children) });
}

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
});

describe("useProjects()", () => {
  it("waits for an authenticated user before firing", () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHookWithQuery(() => useProjects());
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns all projects when no ownerId filter is provided", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: "pr1", name: "A" }],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ order });
    fromMock.mockReturnValue({ select });
    const { result } = renderHookWithQuery(() => useProjects());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "pr1", name: "A" }]);
  });

  it("selects linked listing metadata needed by project UI and canonical routes", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: "pr1", name: "A", listings: [{ id: "l1", listing_type: "new_build" }] }],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ order });
    fromMock.mockReturnValue({ select });
    const { result } = renderHookWithQuery(() => useProjects());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(select).toHaveBeenCalledWith(expect.stringContaining("listings: listings("));
    expect(select).toHaveBeenCalledWith(expect.stringContaining("listing_type"));
    expect(select).toHaveBeenCalledWith(expect.stringContaining("cover_image_url"));
  });

  it("filters by owner_id when ownerId is provided", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [{ id: "pr2" }], error: null });
    const order = vi.fn().mockReturnValue({ eq });
    const select = vi.fn().mockReturnValue({ order });
    fromMock.mockReturnValue({ select });
    const { result } = renderHookWithQuery(() => useProjects("u-2"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eq).toHaveBeenCalledWith("owner_id", "u-2");
  });
});

describe("useProject(id)", () => {
  it("returns null when id is falsy and skips queries", () => {
    const { result } = renderHookWithQuery(() => useProject(undefined));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("fetches a single project by id", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "pr1", name: "Solo" },
        error: null,
      }),
    });
    const { result } = renderHookWithQuery(() => useProject("pr1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "pr1", name: "Solo" });
  });

  it("rejects when single() returns an error", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: new Error("404") }),
    });
    const { result } = renderHookWithQuery(() => useProject("pr-404"));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateProject()", () => {
  it("rejects when not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHookWithQuery(() => useUpdateProject());
    await expect(
      act(async () => {
        await result.current.mutateAsync({ id: "pr1", updates: { name: "n" } });
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("updates the row scoped to the current user", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "pr1" }, error: null });
    const eqOwner = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single }),
    });
    const eqId = vi.fn().mockReturnValue({ eq: eqOwner });
    fromMock.mockReturnValue({ update: vi.fn().mockReturnValue({ eq: eqId }) });
    const { result } = renderHookWithQuery(() => useUpdateProject());
    await act(async () => {
      await result.current.mutateAsync({ id: "pr1", updates: { name: "n" } });
    });
    expect(eqOwner).toHaveBeenCalledWith("owner_id", "u-1");
  });
});

describe("useDeleteProject()", () => {
  it("rejects when not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHookWithQuery(() => useDeleteProject());
    await expect(
      act(async () => {
        await result.current.mutateAsync("pr1");
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("deletes through the atomic unlink-and-delete RPC", async () => {
    rpcMock.mockResolvedValue({ error: null });
    const { result } = renderHookWithQuery(() => useDeleteProject());
    await act(async () => {
      await result.current.mutateAsync("pr1");
    });
    expect(rpcMock).toHaveBeenCalledWith("delete_project_and_unlink_listings", {
      p_project_id: "pr1",
    });
  });
});
