/**
 * IDOR (Insecure Direct Object Reference) regression tests.
 *
 * Each test verifies that a mutation hook passes the correct ownership
 * column filter (.eq("project_id"|"user_id", ownerId)) to Supabase alongside
 * .eq("id", recordId). Without these guards, any authenticated user could
 * delete or update another user's records just by knowing the UUID.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ── Module mocks (hoisted above imports) ──────────────────────────────────
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getUser: vi.fn() } },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDeleteProjectMedia } from "@/hooks/useProjectMedia";
import { useDeleteProjectLead, useUpdateProjectLead } from "@/hooks/useProjectLeads";
import { useBulkUpdateProjectUnitPrices, useDeleteProjectUnit, useUpdateProjectUnit, type BulkUpdateProjectUnitPricesInput } from "@/hooks/useProjectUnits";
import { useUpdateContactTask } from "@/hooks/useContacts";
import { useUpdateLead, useDeleteLead } from "@/hooks/useLeads";
import { useToggleFavorite } from "@/hooks/useFavorites";

// ── Helpers ───────────────────────────────────────────────────────────────

const TEST_USER_ID = "user-owner-abc";

/** Minimal React Query wrapper for renderHook */
function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

/**
 * Creates a chainable Supabase query builder mock that:
 * - records every .eq(col, val) call so tests can assert ownership filters
 * - resolves with { data: null, error: null } when awaited (via .then)
 */
function makeChainableMock(resolvedValue: { data: unknown; error: null } = { data: null, error: null }) {
  const eqCalls: Array<[string, unknown]> = [];

  const chain: Record<string, unknown> & { eqCalls: typeof eqCalls } = {
    eqCalls,
    eq: vi.fn().mockImplementation((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return chain;
    }),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedValue),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
    // Thenable so the query builder can be awaited directly
    then: (resolve: (v: typeof resolvedValue) => void, _reject?: (e: unknown) => void) =>
      Promise.resolve(resolvedValue).then(resolve),
    catch: (_reject: (e: unknown) => void) => Promise.resolve(resolvedValue),
  };

  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("IDOR ownership guards on project mutation hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { id: TEST_USER_ID } } as ReturnType<typeof useAuth>);
  });

  // ── useDeleteProjectMedia ───────────────────────────────────────────────

  it("useDeleteProjectMedia includes project_id filter", async () => {
    const ownerChain = makeChainableMock({ data: { id: "proj-xyz" }, error: null });
    const chain = makeChainableMock();
    vi.mocked(supabase).from = vi.fn().mockImplementation((table: string) => {
      if (table === "projects") return ownerChain;
      return { delete: vi.fn().mockReturnValue(chain) };
    });

    const { result } = renderHook(() => useDeleteProjectMedia(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "media-1", projectId: "proj-xyz" });
    });

    expect(chain.eqCalls).toContainEqual(["id", "media-1"]);
    expect(chain.eqCalls).toContainEqual(["project_id", "proj-xyz"]);
    expect(ownerChain.eqCalls).toContainEqual(["owner_id", TEST_USER_ID]);
  });

  // ── useDeleteProjectLead ────────────────────────────────────────────────

  it("useDeleteProjectLead includes project_id filter", async () => {
    const ownerChain = makeChainableMock({ data: { id: "proj-xyz" }, error: null });
    const chain = makeChainableMock();
    vi.mocked(supabase).from = vi.fn().mockImplementation((table: string) => {
      if (table === "projects") return ownerChain;
      return { delete: vi.fn().mockReturnValue(chain) };
    });

    const { result } = renderHook(() => useDeleteProjectLead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "lead-1", projectId: "proj-xyz" });
    });

    expect(chain.eqCalls).toContainEqual(["id", "lead-1"]);
    expect(chain.eqCalls).toContainEqual(["project_id", "proj-xyz"]);
    expect(ownerChain.eqCalls).toContainEqual(["owner_id", TEST_USER_ID]);
  });

  // ── useUpdateProjectLead ────────────────────────────────────────────────

  it("useUpdateProjectLead includes project_id filter", async () => {
    const ownerChain = makeChainableMock({ data: { id: "proj-xyz" }, error: null });
    const chain = makeChainableMock({ data: { id: "lead-1" }, error: null });
    vi.mocked(supabase).from = vi.fn().mockImplementation((table: string) => {
      if (table === "projects") return ownerChain;
      return { update: vi.fn().mockReturnValue(chain) };
    });

    const { result } = renderHook(() => useUpdateProjectLead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "lead-1", projectId: "proj-xyz", updates: { status: "qualified" } });
    });

    expect(chain.eqCalls).toContainEqual(["id", "lead-1"]);
    expect(chain.eqCalls).toContainEqual(["project_id", "proj-xyz"]);
    expect(ownerChain.eqCalls).toContainEqual(["owner_id", TEST_USER_ID]);
  });

  // ── useDeleteProjectUnit ────────────────────────────────────────────────

  it("useDeleteProjectUnit includes project_id filter", async () => {
    const ownerChain = makeChainableMock({ data: { id: "proj-xyz" }, error: null });
    const chain = makeChainableMock();
    vi.mocked(supabase).from = vi.fn().mockImplementation((table: string) => {
      if (table === "projects") return ownerChain;
      return { delete: vi.fn().mockReturnValue(chain) };
    });

    const { result } = renderHook(() => useDeleteProjectUnit(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "unit-1", projectId: "proj-xyz" });
    });

    expect(chain.eqCalls).toContainEqual(["id", "unit-1"]);
    expect(chain.eqCalls).toContainEqual(["project_id", "proj-xyz"]);
    expect(ownerChain.eqCalls).toContainEqual(["owner_id", TEST_USER_ID]);
  });

  // ── useUpdateProjectUnit ────────────────────────────────────────────────

  it("useUpdateProjectUnit includes project_id filter", async () => {
    const ownerChain = makeChainableMock({ data: { id: "proj-xyz" }, error: null });
    const chain = makeChainableMock({ data: { id: "unit-1" }, error: null });
    vi.mocked(supabase).from = vi.fn().mockImplementation((table: string) => {
      if (table === "projects") return ownerChain;
      return { update: vi.fn().mockReturnValue(chain) };
    });

    const { result } = renderHook(() => useUpdateProjectUnit(), { wrapper });

    await act(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await result.current.mutateAsync({ id: "unit-1", projectId: "proj-xyz", updates: { status: "available" } as any });
    });

    expect(chain.eqCalls).toContainEqual(["id", "unit-1"]);
    expect(chain.eqCalls).toContainEqual(["project_id", "proj-xyz"]);
    expect(ownerChain.eqCalls).toContainEqual(["owner_id", TEST_USER_ID]);
  });

  it("useBulkUpdateProjectUnitPrices delegates available-unit ownership checks to the bulk RPC", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: 2,
      error: null,
      success: true,
      count: null,
      status: 200,
      statusText: "OK",
    });

    const { result } = renderHook(() => useBulkUpdateProjectUnitPrices(), { wrapper });
    const units: BulkUpdateProjectUnitPricesInput["units"] = [
      { id: "unit-1", project_id: "proj-xyz", price: 100000, internal_sqm: 50 },
      { id: "unit-2", project_id: "proj-xyz", price: 150000, internal_sqm: 75 },
    ];

    let response: { updatedCount: number } | undefined;
    await act(async () => {
      response = await result.current.mutateAsync({
        projectId: "proj-xyz",
        percentage: 5,
        units,
      });
    });

    expect(supabase.rpc).toHaveBeenCalledWith("bulk_update_project_unit_prices", {
      p_project_id: "proj-xyz",
      p_percentage: 5,
    });
    expect(response?.updatedCount).toBe(2);
  });
});

describe("IDOR ownership guard on useUpdateContactTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { id: TEST_USER_ID } } as ReturnType<typeof useAuth>);
  });

  it("useUpdateContactTask includes user_id filter", async () => {
    const chain = makeChainableMock({ data: { id: "task-1" }, error: null });
    vi.mocked(supabase).from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue(chain),
    });

    const { result } = renderHook(() => useUpdateContactTask(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "task-1", updates: { completed_at: new Date().toISOString() } });
    });

    expect(chain.eqCalls).toContainEqual(["id", "task-1"]);
    expect(chain.eqCalls).toContainEqual(["user_id", TEST_USER_ID]);
  });

  it("useUpdateContactTask throws when not authenticated", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useUpdateContactTask(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: "task-1", updates: { completed_at: new Date().toISOString() } })
      ).rejects.toThrow("Must be logged in");
    });
  });
});

// ── Leads mutations ───────────────────────────────────────────────────────────

describe("IDOR ownership guards on useLeads mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { id: TEST_USER_ID } } as ReturnType<typeof useAuth>);
  });

  it("useUpdateLead includes owner_id filter", async () => {
    const chain = makeChainableMock({ data: { id: "lead-1" }, error: null });
    vi.mocked(supabase).from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue(chain),
    });

    const { result } = renderHook(() => useUpdateLead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "lead-1", updates: { status: "contacted" } });
    });

    expect(chain.eqCalls).toContainEqual(["id", "lead-1"]);
    expect(chain.eqCalls).toContainEqual(["owner_id", TEST_USER_ID]);
  });

  it("useDeleteLead includes owner_id filter", async () => {
    const chain = makeChainableMock();
    vi.mocked(supabase).from = vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue(chain),
    });

    const { result } = renderHook(() => useDeleteLead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("lead-99");
    });

    expect(chain.eqCalls).toContainEqual(["id", "lead-99"]);
    expect(chain.eqCalls).toContainEqual(["owner_id", TEST_USER_ID]);
  });

  it("useDeleteLead throws when not authenticated", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useDeleteLead(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("lead-99")).rejects.toThrow("Not authenticated");
    });
  });
});

// ── Favorites mutations ───────────────────────────────────────────────────────

describe("IDOR ownership guards on useToggleFavorite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { id: TEST_USER_ID } } as ReturnType<typeof useAuth>);
  });

  it("delete path includes user_id and listing_id filters", async () => {
    const chain = makeChainableMock();
    vi.mocked(supabase).from = vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue(chain),
    });

    const { result } = renderHook(() => useToggleFavorite(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ listing_id: "listing-42", isFavorited: true });
    });

    expect(chain.eqCalls).toContainEqual(["user_id", TEST_USER_ID]);
    expect(chain.eqCalls).toContainEqual(["listing_id", "listing-42"]);
  });

  it("throws when not authenticated", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useToggleFavorite(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ listing_id: "listing-42", isFavorited: true })
      ).rejects.toThrow("Must be logged in");
    });
  });
});
