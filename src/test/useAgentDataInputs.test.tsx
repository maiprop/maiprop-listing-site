/**
 * Tests for useAgentDataInputs / useAgentDataInputQuota / useSubmitAgentDataInput.
 * Previously at 0% function coverage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@/contexts/AuthContext";
import {
  useAgentDataInputs,
  useAgentDataInputQuota,
  useSubmitAgentDataInput,
} from "@/hooks/useAgentDataInputs";

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return {
    qc,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAgentDataInputs", () => {
  it("is disabled when user is null", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentDataInputs(), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("queries agent_data_inputs for the authenticated user", async () => {
    const rows = [{ id: "d1", user_id: "u1", status: "pending" }];
    const chainMock = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
    };
    mockFrom.mockReturnValue(chainMock);
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentDataInputs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

describe("useAgentDataInputQuota", () => {
  it("is disabled when user is null", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentDataInputQuota(), { wrapper });
    expect(result.current.data).toBeUndefined();
  });

  it("calls the quota RPC when user is present", async () => {
    const quotaData = { monthly_count: 3, monthly_limit: 20, is_banned: false };
    mockRpc.mockResolvedValue({ data: quotaData, error: null });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentDataInputQuota(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalled();
  });
});

describe("useSubmitAgentDataInput", () => {
  it("exposes a mutate function", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSubmitAgentDataInput(), { wrapper });
    expect(typeof result.current.mutate).toBe("function");
  });
});
