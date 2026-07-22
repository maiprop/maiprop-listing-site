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
const functionsInvokeMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: { invoke: (...args: unknown[]) => functionsInvokeMock(...args) },
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
  useUpdateProjectListingCover,
  useDeleteProject,
} from "@/hooks/useProjects";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrap(children: React.ReactNode, queryClient = createQueryClient()) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
function renderHookWithQuery<T>(hook: () => T, queryClient?: QueryClient) {
  return renderHook(hook, { wrapper: ({ children }) => wrap(children, queryClient) });
}

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  functionsInvokeMock.mockReset();
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
    fromMock.mockImplementation((table: string) => {
      if (table === "projects") return { select };
      if (table === "listing_reference_catalogue") {
        return { select: () => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    });
    const { result } = renderHookWithQuery(() => useProjects());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "pr1", name: "A", listings: [] }]);
  });

  it("selects linked listing metadata needed by project UI and canonical routes", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: "pr1", name: "A" }],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ order });
    const listingIn = vi.fn().mockResolvedValue({
      data: [{
        id: "l1",
        project_id: "pr1",
        title: "Project listing",
        city: "Athens",
        listing_type: "new_build",
        cover_image_url: "https://cdn.example.com/project.webp",
      }],
      error: null,
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "projects") return { select };
      if (table === "listing_reference_catalogue") {
        return { select: () => ({ in: listingIn }) };
      }
      throw new Error(`unexpected table: ${table}`);
    });
    const { result } = renderHookWithQuery(() => useProjects());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fromMock).toHaveBeenCalledWith("listing_reference_catalogue");
    expect(listingIn).toHaveBeenCalledWith("project_id", ["pr1"]);
    expect(result.current.data?.[0].listings).toEqual([
      expect.objectContaining({ id: "l1", listing_type: "new_build" }),
    ]);
  });

  it("filters by owner_id when ownerId is provided", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [{ id: "pr2" }], error: null });
    const order = vi.fn().mockReturnValue({ eq });
    const select = vi.fn().mockReturnValue({ order });
    fromMock.mockImplementation((table: string) => {
      if (table === "projects") return { select };
      if (table === "listing_reference_catalogue") {
        return { select: () => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    });
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
    fromMock.mockImplementation((table: string) => {
      if (table === "projects") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: "pr1", name: "Solo" },
            error: null,
          }),
        };
      }
      if (table === "listing_reference_catalogue") {
        return { select: () => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    });
    const { result } = renderHookWithQuery(() => useProject("pr1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "pr1", name: "Solo", listings: [] });
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

  it("updates through the project-management edge boundary", async () => {
    functionsInvokeMock.mockResolvedValue({ data: { data: { id: "pr1" }, error: null }, error: null });
    const { result } = renderHookWithQuery(() => useUpdateProject());
    await act(async () => {
      await result.current.mutateAsync({ id: "pr1", updates: { name: "n" } });
    });
    expect(fromMock).not.toHaveBeenCalled();
    expect(functionsInvokeMock).toHaveBeenCalledWith("project-management", {
      body: {
        action: "update_project",
        id: "pr1",
        updates: { name: "n" },
      },
    });
  });
});

describe("useUpdateProjectListingCover()", () => {
  it("rejects when not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHookWithQuery(() => useUpdateProjectListingCover());
    await expect(
      act(async () => {
        await result.current.mutateAsync({
          projectId: "pr1",
          listingId: "listing-1",
          coverImageUrl: "https://cdn.example.com/cover.webp",
        });
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("updates the linked listing cover through the project-management edge boundary", async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    functionsInvokeMock.mockResolvedValue({
      data: { data: { id: "listing-1", project_id: "pr1", cover_image_url: "https://cdn.example.com/cover.webp" }, error: null },
      error: null,
    });

    const { result } = renderHookWithQuery(() => useUpdateProjectListingCover(), queryClient);
    await act(async () => {
      await result.current.mutateAsync({
        projectId: "pr1",
        listingId: "listing-1",
        coverImageUrl: "https://cdn.example.com/cover.webp",
      });
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(functionsInvokeMock).toHaveBeenCalledWith("project-management", {
      body: {
        action: "update_listing_cover",
        projectId: "pr1",
        listingId: "listing-1",
        coverImageUrl: "https://cdn.example.com/cover.webp",
      },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["homepage-featured"] });
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

  it("deletes through the project-management edge boundary", async () => {
    functionsInvokeMock.mockResolvedValue({ data: { data: { id: "pr1" }, error: null }, error: null });
    const { result } = renderHookWithQuery(() => useDeleteProject());
    await act(async () => {
      await result.current.mutateAsync("pr1");
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(functionsInvokeMock).toHaveBeenCalledWith("project-management", {
      body: {
        action: "delete_project",
        id: "pr1",
      },
    });
  });
});
