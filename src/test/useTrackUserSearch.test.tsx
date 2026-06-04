import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackUserSearch } from "@/hooks/useTrackUserSearch";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  rpc: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => mocks.warn(...args) },
}));

describe("useTrackUserSearch", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.user = null;
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.warn.mockReset();
  });

  it("does not write anonymous or too-short searches", async () => {
    const { result, rerender } = renderHook(() => useTrackUserSearch());

    await act(async () => {
      await result.current({ surface: "listings", query: "Athens" });
    });
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.user = { id: "user-1" };
    rerender();
    await act(async () => {
      await result.current({ surface: "listings", query: " A " });
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("normalizes, compacts, and dedupes repeated search events", async () => {
    vi.useFakeTimers();
    mocks.user = { id: "user-1" };
    const { result } = renderHook(() => useTrackUserSearch());

    await act(async () => {
      await result.current({
        surface: "ai_search",
        query: "  Athens    Auctions  ",
        route: "/auctions",
        resultCount: 12,
        filters: { city: "Athens", empty: "", skipped: undefined },
        metadata: { target: "auctions", missing: null },
      });
    });

    expect(mocks.rpc).toHaveBeenCalledWith("track_user_search", {
      p_surface: "ai_search",
      p_query: "Athens Auctions",
      p_route: "/auctions",
      p_result_count: 12,
      p_filters: { city: "Athens" },
      p_metadata: { target: "auctions" },
    });

    await act(async () => {
      await result.current({
        surface: "ai_search",
        query: "Athens Auctions",
        route: "/auctions",
        resultCount: 12,
        filters: { city: "Athens" },
        metadata: { target: "auctions" },
      });
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(60_001));
    await act(async () => {
      await result.current({
        surface: "ai_search",
        query: "Athens Auctions",
        route: "/auctions",
        resultCount: 12,
        filters: { city: "Athens" },
        metadata: { target: "auctions" },
      });
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("logs RPC failures without breaking the user flow", async () => {
    mocks.user = { id: "user-1" };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    const { result } = renderHook(() => useTrackUserSearch());

    await act(async () => {
      await result.current({ surface: "listings", query: "Athens" });
    });

    expect(mocks.warn).toHaveBeenCalledWith("[search telemetry] track_user_search failed", "permission denied");
  });
});
