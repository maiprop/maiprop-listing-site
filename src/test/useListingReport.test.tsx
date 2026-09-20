import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null },
  insert: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: (...args: unknown[]) => mocks.insert(...args) }) },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import { useListingReport } from "@/hooks/useListingReport";

const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const options = (onSignInRequired = vi.fn()) => ({
  messages: {
    signIn: "Sign in to report",
    error: "Could not submit report",
    success: "Report submitted",
  },
  onSignInRequired,
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  mocks.auth.user = null;
  mocks.insert.mockResolvedValue({ data: null, error: null, status: 201 });
});

describe("useListingReport", () => {
  it("guides anonymous users to sign in without attempting a write", () => {
    const onSignInRequired = vi.fn();
    const { result } = renderHook(() => useListingReport(options(onSignInRequired)), { wrapper });

    act(() => result.current.submit({ entityType: "listing", entityId: "listing-1" }));

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith("Sign in to report");
    expect(onSignInRequired).toHaveBeenCalledTimes(1);
  });

  it("persists the existing entity contract and accepts a successful minimal-return insert", async () => {
    mocks.auth.user = { id: "reporter-1" };
    const { result } = renderHook(() => useListingReport(options()), { wrapper });

    act(() => result.current.submit({ entityType: "firesale_request", entityId: "listing-1" }));

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Report submitted"));
    expect(mocks.insert).toHaveBeenCalledWith({
      entity_type: "firesale_request",
      entity_id: "listing-1",
      reporter_id: "reporter-1",
    });
  });

  it("shows failure and never success when the report write is denied", async () => {
    mocks.auth.user = { id: "reporter-1" };
    mocks.insert.mockResolvedValue({ data: null, error: new Error("denied"), status: 403 });
    const { result } = renderHook(() => useListingReport(options()), { wrapper });

    act(() => result.current.submit({ entityType: "listing", entityId: "listing-1" }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Could not submit report"));
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("keeps an in-flight report bound to the account that initiated it", async () => {
    let finishWrite!: (value: { data: null; error: null; status: number }) => void;
    mocks.auth.user = { id: "reporter-a" };
    mocks.insert.mockReturnValue(new Promise((resolve) => {
      finishWrite = resolve;
    }));
    const { result, rerender } = renderHook(() => useListingReport(options()), { wrapper });

    act(() => result.current.submit({ entityType: "listing", entityId: "listing-1" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    mocks.auth.user = { id: "reporter-b" };
    rerender();
    finishWrite({ data: null, error: null, status: 201 });

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Report submitted"));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ reporter_id: "reporter-a" }));
  });
});
