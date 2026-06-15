import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";

const { fromMock, rpcMock, useAuthMock, requireOwnedProjectMock, toastMock, supabaseClientMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  const rpcMock = vi.fn();
  const supabaseClientMock: { from: (...args: unknown[]) => unknown; rpc: (...args: unknown[]) => unknown } = {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: vi.fn(function (this: unknown, ...args: unknown[]) {
      if (this !== supabaseClientMock) {
        throw new TypeError("Cannot read properties of undefined (reading 'rest')");
      }
      return rpcMock(...args);
    }),
  };

  return {
    fromMock,
    rpcMock,
    useAuthMock: vi.fn(),
    requireOwnedProjectMock: vi.fn(),
    toastMock: { success: vi.fn(), error: vi.fn() },
    supabaseClientMock,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseClientMock,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/projectOwnership", () => ({ requireOwnedProject: (...args: unknown[]) => requireOwnedProjectMock(...args) }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { useAddProjectMedia, useDeleteProjectMedia, useProjectMedia } from "@/hooks/useProjectMedia";
import {
  useBulkUpdateProjectUnitPrices,
  useCreateProjectUnit,
  useDeleteProjectUnit,
  useProjectUnits,
  useUpdateProjectUnit,
} from "@/hooks/useProjectUnits";
import { useCreateProjectLead, useDeleteProjectLead, useProjectLeads, useUpdateProjectLead } from "@/hooks/useProjectLeads";

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  useAuthMock.mockReset();
  requireOwnedProjectMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "user-1" } });
  requireOwnedProjectMock.mockResolvedValue(undefined);
});

describe("project media hooks", () => {
  it("waits for a project id before fetching media", () => {
    const { result } = renderHook(() => useProjectMedia(undefined), { wrapper });

    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("orders media by type and sort order", async () => {
    const secondOrder = vi.fn().mockResolvedValue({ data: [{ id: "m1" }], error: null });
    const firstOrder = vi.fn().mockReturnValue({ order: secondOrder });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({ order: firstOrder }),
    });

    const { result } = renderHook(() => useProjectMedia("project-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(firstOrder).toHaveBeenCalledWith("media_type");
    expect(secondOrder).toHaveBeenCalledWith("sort_order");
  });

  it("adds and deletes media after ownership checks", async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: "m2" }, error: null });
    const deleteEqProject = vi.fn().mockResolvedValue({ error: null });
    fromMock
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: insertSingle }) }),
      })
      .mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: deleteEqProject }) }),
      });

    const add = renderHook(() => useAddProjectMedia(), { wrapper });
    await act(async () => {
      await add.result.current.mutateAsync({ project_id: "project-1", url: "u", media_type: "rendering" });
    });

    const del = renderHook(() => useDeleteProjectMedia(), { wrapper });
    await act(async () => {
      await del.result.current.mutateAsync({ id: "m2", projectId: "project-1" });
    });

    expect(requireOwnedProjectMock).toHaveBeenCalledWith("project-1", "user-1");
    expect(deleteEqProject).toHaveBeenCalledWith("project_id", "project-1");
  });
});

describe("project unit hooks", () => {
  it("fetches units using floor and unit-number ordering", async () => {
    const orderUnit = vi.fn().mockResolvedValue({ data: [{ id: "u1" }], error: null });
    const orderFloor = vi.fn().mockReturnValue({ order: orderUnit });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({ order: orderFloor }),
    });

    const { result } = renderHook(() => useProjectUnits("project-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(orderFloor).toHaveBeenCalledWith("floor", { ascending: true, nullsFirst: false });
    expect(orderUnit).toHaveBeenCalledWith("unit_number", { ascending: true, nullsFirst: false });
  });

  it("creates, updates, and deletes units with project ownership enforced", async () => {
    const createSingle = vi.fn().mockResolvedValue({ data: { id: "u2" }, error: null });
    const updateSingle = vi.fn().mockResolvedValue({ data: { id: "u2" }, error: null });
    const deleteEqProject = vi.fn().mockResolvedValue({ error: null });
    fromMock
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: createSingle }) }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: updateSingle }) }) }),
        }),
      })
      .mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: deleteEqProject }) }),
      });

    const createUnit = renderHook(() => useCreateProjectUnit(), { wrapper });
    const updateUnit = renderHook(() => useUpdateProjectUnit(), { wrapper });
    const deleteUnit = renderHook(() => useDeleteProjectUnit(), { wrapper });

    await act(async () => {
      await createUnit.result.current.mutateAsync({
        project_id: "project-1",
        unit_id: "A1",
      });
    });
    await act(async () => {
      await updateUnit.result.current.mutateAsync({
        id: "u2",
        projectId: "project-1",
        updates: { price: 200000 },
      });
    });
    await act(async () => {
      await deleteUnit.result.current.mutateAsync({
        id: "u2",
        projectId: "project-1",
      });
    });

    expect(requireOwnedProjectMock).toHaveBeenCalledTimes(3);
    expect(deleteEqProject).toHaveBeenCalledWith("project_id", "project-1");
  });

  it("skips the bulk RPC when no units are provided and calls it otherwise", async () => {
    const { result } = renderHook(() => useBulkUpdateProjectUnitPrices(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ projectId: "project-1", units: [], percentage: 5 })).resolves.toEqual({ updatedCount: 0 });
    });
    expect(rpcMock).not.toHaveBeenCalled();

    rpcMock.mockResolvedValue({ data: 3, error: null });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: "project-1",
          units: [{ id: "u1", project_id: "project-1", price: 100000, internal_sqm: 50 }],
          percentage: -2,
        }),
      ).resolves.toEqual({ updatedCount: 3 });
    });

    expect(rpcMock).toHaveBeenCalledWith("bulk_update_project_unit_prices", {
      p_project_id: "project-1",
      p_percentage: -2,
    });
  });
});

describe("project lead hooks", () => {
  it("fetches leads newest first", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "lead-1" }], error: null });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({ order }),
    });

    const { result } = renderHook(() => useProjectLeads("project-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("creates, updates, and deletes leads with ownership checks", async () => {
    const createSingle = vi.fn().mockResolvedValue({ data: { id: "lead-1" }, error: null });
    const updateSingle = vi.fn().mockResolvedValue({ data: { id: "lead-1" }, error: null });
    const deleteEqProject = vi.fn().mockResolvedValue({ error: null });
    fromMock
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: createSingle }) }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: updateSingle }) }) }),
        }),
      })
      .mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: deleteEqProject }) }),
      });

    const createLead = renderHook(() => useCreateProjectLead(), { wrapper });
    const updateLead = renderHook(() => useUpdateProjectLead(), { wrapper });
    const deleteLead = renderHook(() => useDeleteProjectLead(), { wrapper });

    await act(async () => {
      await createLead.result.current.mutateAsync({
        project_id: "project-1",
        name: "Lead One",
      });
    });
    await act(async () => {
      await updateLead.result.current.mutateAsync({
        id: "lead-1",
        projectId: "project-1",
        updates: { status: "contacted" },
      });
    });
    await act(async () => {
      await deleteLead.result.current.mutateAsync({
        id: "lead-1",
        projectId: "project-1",
      });
    });

    expect(requireOwnedProjectMock).toHaveBeenCalledTimes(3);
    expect(deleteEqProject).toHaveBeenCalledWith("project_id", "project-1");
  });
});
