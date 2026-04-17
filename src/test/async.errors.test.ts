/**
 * Tests that mutation hooks surface toast.error when the Supabase call fails.
 * Verifies the onError / catch path without hitting the real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useUpdateLead, useDeleteLead, useCreateLead } from "@/hooks/useLeads";
import { useToggleFavorite } from "@/hooks/useFavorites";

const TEST_USER = { id: "user-err-test" };

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

/** Creates a Supabase mock that rejects with the given error */
function makeErrorChain(errMsg: string) {
  const error = { message: errMsg };
  const chain: Record<string, unknown> = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error }),
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error }).then(resolve),
    catch: (_r: (e: unknown) => void) =>
      Promise.resolve({ data: null, error }),
  };
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("async error surfacing — useUpdateLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: TEST_USER } as ReturnType<typeof useAuth>);
  });

  it("calls toast.error when the update fails", async () => {
    const chain = makeErrorChain("DB write failed");
    vi.mocked(supabase).from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue(chain),
    });

    const { result } = renderHook(() => useUpdateLead(), { wrapper });

    await act(async () => {
      // mutateAsync will throw; catch to avoid unhandled rejection in test
      await result.current.mutateAsync({ id: "lead-1", updates: { status: "won" } }).catch(() => {});
    });

    expect(toast.error).toHaveBeenCalled();
  });
});

describe("async error surfacing — useDeleteLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: TEST_USER } as ReturnType<typeof useAuth>);
  });

  it("calls toast.error when delete fails", async () => {
    const error = { message: "Cannot delete" };
    const chain: Record<string, unknown> = {
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error }).then(resolve),
    };
    vi.mocked(supabase).from = vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue(chain),
    });

    const { result } = renderHook(() => useDeleteLead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("lead-99").catch(() => {});
    });

    expect(toast.error).toHaveBeenCalled();
  });
});

describe("async error surfacing — useCreateLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: TEST_USER } as ReturnType<typeof useAuth>);
  });

  it("calls toast.error when insert fails", async () => {
    const error = { message: "Insert failed" };
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error }),
      then: (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error }).then(resolve),
    };
    vi.mocked(supabase).from = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue(chain),
    });

    const { result } = renderHook(() => useCreateLead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "Test Lead" }).catch(() => {});
    });

    expect(toast.error).toHaveBeenCalled();
  });
});

describe("async error surfacing — useToggleFavorite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: TEST_USER } as ReturnType<typeof useAuth>);
  });

  it("calls toast.error when favorite delete fails", async () => {
    const error = { message: "Delete failed" };
    const chain: Record<string, unknown> = {
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error }).then(resolve),
    };
    vi.mocked(supabase).from = vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue(chain),
    });

    const { result } = renderHook(() => useToggleFavorite(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ listing_id: "l-1", isFavorited: true }).catch(() => {});
    });

    expect(toast.error).toHaveBeenCalled();
  });
});
