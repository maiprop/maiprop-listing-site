/**
 * Tests for useAgentDataInput.ts (status + submit hooks).
 * Previously at 0% function coverage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockFunctions = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockFunctions(...args) },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@/contexts/AuthContext";
import { useAgentDataInputStatus, useSubmitDataInput } from "@/hooks/useAgentDataInput";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return {
    qc,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("useAgentDataInputStatus", () => {
  it("is disabled when user is null", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentDataInputStatus(), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(mockFunctions).not.toHaveBeenCalled();
  });

  it("calls the edge function when user is present", async () => {
    const statusData = { monthly_count: 2, monthly_limit: 20, pending_discount_pct: 1 };
    mockFunctions.mockResolvedValue({ data: { status: statusData }, error: null });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentDataInputStatus(), { wrapper });
    await waitFor(() => !result.current.isLoading);
    expect(mockFunctions).toHaveBeenCalled();
  });
});

describe("useSubmitDataInput", () => {
  it("exposes a mutate function", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSubmitDataInput(), { wrapper });
    expect(typeof result.current.mutate).toBe("function");
  });
});
