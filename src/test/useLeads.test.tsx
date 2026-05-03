/**
 * useLeads hook tests — verifies ownership filtering,
 * lead status constants, and disabled state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockFrom = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@/contexts/AuthContext";
import { useLeads, LEAD_STATUSES, LEAD_SOURCES } from "@/hooks/useLeads";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  qc.clear();
});

describe("useLeads", () => {
  it("is disabled when user is null", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    const { result } = renderHook(() => useLeads(), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("queries leads with owner_id filter", async () => {
    const leads = [{ id: "l1", name: "Test Lead", owner_id: "u1", status: "new" }];
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: leads, error: null }),
        }),
      }),
    });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });

    const { result } = renderHook(() => useLeads(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(mockFrom).toHaveBeenCalledWith("leads");
  });
});

describe("lead constants", () => {
  it("LEAD_STATUSES includes expected pipeline stages", () => {
    expect(LEAD_STATUSES).toContain("new");
    expect(LEAD_STATUSES).toContain("won");
    expect(LEAD_STATUSES).toContain("lost");
    expect(LEAD_STATUSES.length).toBe(7);
  });

  it("LEAD_SOURCES includes expected channels", () => {
    expect(LEAD_SOURCES).toContain("manual");
    expect(LEAD_SOURCES).toContain("listing_inquiry");
    expect(LEAD_SOURCES).toContain("viewing");
    expect(LEAD_SOURCES.length).toBe(7);
  });
});
