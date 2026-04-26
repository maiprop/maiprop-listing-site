/**
 * Tests for usePrivateOwnerAdAlert — a flag-style hook with a query for the
 * current state and a mutation that toggles it via upsert/delete.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

// Hoisted with vi.hoisted so the factory bodies below see them \u2014 vi.mock
// is lifted above import statements, so top-level `const`s declared the
// usual way are not yet initialised when the factory runs.
const { fromMock, useAuthMock, toastSuccess, toastError } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  useAuthMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { usePrivateOwnerAdAlert } from "@/hooks/usePrivateOwnerAdAlert";

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
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("usePrivateOwnerAdAlert query", () => {
  it("waits for an authenticated user", () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHookWithQuery(() => usePrivateOwnerAdAlert());
    expect(result.current.isLoading).toBe(false); // disabled
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns isEnabled=true when a row exists", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "row" }, error: null }),
    });
    const { result } = renderHookWithQuery(() => usePrivateOwnerAdAlert());
    await waitFor(() => expect(result.current.isEnabled).toBe(true));
  });

  it("returns isEnabled=false when no row exists", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const { result } = renderHookWithQuery(() => usePrivateOwnerAdAlert());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEnabled).toBe(false);
  });
});

describe("usePrivateOwnerAdAlert.toggle mutation", () => {
  it("upserts when enabling", async () => {
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ upsert });
    const { result } = renderHookWithQuery(() => usePrivateOwnerAdAlert());
    await act(async () => {
      await result.current.toggle.mutateAsync(true);
    });
    expect(upsert).toHaveBeenCalledWith({ user_id: "u-1" }, { onConflict: "user_id" });
    expect(toastSuccess).toHaveBeenCalledWith("Private Owner Ad alerts enabled");
  });

  it("deletes when disabling", async () => {
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "x" }, error: null }),
    });
    const eq = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({
      delete: vi.fn().mockReturnValue({ eq }),
    });
    const { result } = renderHookWithQuery(() => usePrivateOwnerAdAlert());
    await act(async () => {
      await result.current.toggle.mutateAsync(false);
    });
    expect(eq).toHaveBeenCalledWith("user_id", "u-1");
    expect(toastSuccess).toHaveBeenCalledWith("Private Owner Ad alerts disabled");
  });

  it("rejects (and surfaces toast.error via onError) when not signed in", async () => {
    useAuthMock.mockReturnValue({ user: null });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const { result } = renderHookWithQuery(() => usePrivateOwnerAdAlert());
    await expect(
      act(async () => {
        await result.current.toggle.mutateAsync(true);
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});
