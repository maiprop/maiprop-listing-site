/**
 * Tests for the useProfessionals / useProfessional / useProfessionalByUserId
 * hooks. Each hook drives Supabase table reads, so we mock the client module
 * and assert happy/error paths.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { useProfessionals, useProfessional, useProfessionalByUserId, useRelatedProfessionals } from "@/hooks/useProfessionals";

const publicProfessional = {
  id: "p1",
  user_id: "u1",
  title: "Architect",
  display_name: "Alice",
  category: "architect" as const,
  city: "Athens",
  bio: null,
  avatar_url: null,
  rating: 5,
  reviews_count: 2,
  verified: true,
  verified_at: "2026-01-01T00:00:00Z",
  hourly_rate: 100,
  experience_years: 10,
  specialties: ["residential"],
  languages: ["el", "en"],
  license_number: "TEE-1",
  website_url: null,
  video_link: null,
  projects_count: 3,
  average_deal_size: null,
  average_portfolio_asset_size: null,
  subscription_tier: "pro",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function wrap(children: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderHookWithQuery<T>(hook: () => T) {
  return renderHook(hook, {
    wrapper: ({ children }) => wrap(children),
  });
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("useProfessionals", () => {
  it("returns professionals ordered by subscription tier and rating", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
        resolve({ data: [publicProfessional], error: null });
        return this;
      },
    };
    fromMock.mockReturnValue(query);
    const { result } = renderHookWithQuery(() => useProfessionals("legal"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fromMock).toHaveBeenCalledWith("public_professionals");
    expect(query.is).not.toHaveBeenCalled();
    expect(query.order).toHaveBeenCalledWith("subscription_tier", { ascending: false, nullsFirst: false });
    expect(query.order).toHaveBeenCalledWith("rating", { ascending: false, nullsFirst: false });
    expect(query.eq).toHaveBeenCalledWith("category", "legal");
    expect(result.current.data).toEqual([publicProfessional]);
  });

  it("re-throws if the table query errors", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      then(resolve: (v: { data: null; error: unknown }) => unknown) {
        resolve({ data: null, error: new Error("db down") });
        return this;
      },
    };
    fromMock.mockReturnValue(query);
    const { result } = renderHookWithQuery(() => useProfessionals());
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useProfessional(id)", () => {
  it("waits for the id before firing the query", () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    fromMock.mockReturnValue(builder);
    const { result } = renderHookWithQuery(() => useProfessional(""));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("fetches a single professional row by id", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        ...publicProfessional,
        id: "p2",
        user_id: "u2",
        display_name: "Bob",
      },
      error: null,
    });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single,
    });
    const { result } = renderHookWithQuery(() => useProfessional("p2"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fromMock).toHaveBeenCalledWith("public_professionals");
    expect(result.current.data).toEqual({
      ...publicProfessional,
      id: "p2",
      user_id: "u2",
      display_name: "Bob",
    });
    expect(single).toHaveBeenCalled();
  });
});

describe("useRelatedProfessionals", () => {
  it("waits for a loaded profile id and category", () => {
    const { result } = renderHookWithQuery(() => useRelatedProfessionals("", undefined));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("waits for category even when the current id is known", () => {
    const { result } = renderHookWithQuery(() => useRelatedProfessionals("p1", undefined));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("requests only three same-category peers in stable priority order", async () => {
    const peers = [{ id: "p2", display_name: "Bob", avatar_url: null, city: "Athens" }];
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: peers, error: null }),
    };
    fromMock.mockReturnValue(query);
    const { result } = renderHookWithQuery(() => useRelatedProfessionals("p1", "architect"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fromMock).toHaveBeenCalledWith("public_professionals");
    expect(query.select).toHaveBeenCalledWith("id, display_name, avatar_url, city");
    expect(query.eq).toHaveBeenCalledWith("category", "architect");
    expect(query.neq).toHaveBeenCalledWith("id", "p1");
    expect(query.order.mock.calls).toEqual([
      ["subscription_tier", { ascending: false, nullsFirst: false }],
      ["rating", { ascending: false, nullsFirst: false }],
      ["id", { ascending: true }],
    ]);
    expect(query.limit).toHaveBeenCalledWith(3);
    expect(result.current.data).toEqual(peers);
  });

  it("keeps an empty result distinct from a failed request", async () => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: null, error: new Error("db down") }),
    };
    fromMock.mockReturnValue(query);
    const empty = renderHookWithQuery(() => useRelatedProfessionals("p1", "architect"));
    await waitFor(() => expect(empty.result.current.isSuccess).toBe(true));
    expect(empty.result.current.data).toEqual([]);
    empty.unmount();
    const failed = renderHookWithQuery(() => useRelatedProfessionals("p1", "architect"));
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
  });

  it("refetches for a different profile category instead of reusing prior peers", async () => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn()
        .mockResolvedValueOnce({ data: [{ id: "architect-peer", display_name: "A", avatar_url: null, city: null }], error: null })
        .mockResolvedValueOnce({ data: [{ id: "lawyer-peer", display_name: "L", avatar_url: null, city: null }], error: null }),
    };
    fromMock.mockReturnValue(query);
    let category: "architect" | "lawyer" = "architect";
    const view = renderHookWithQuery(() => useRelatedProfessionals("p1", category));
    await waitFor(() => expect(view.result.current.data?.[0]?.id).toBe("architect-peer"));
    category = "lawyer";
    view.rerender();
    await waitFor(() => expect(view.result.current.data?.[0]?.id).toBe("lawyer-peer"));
    expect(query.eq.mock.calls).toEqual([["category", "architect"], ["category", "lawyer"]]);
  });
});

describe("useProfessionalByUserId(userId)", () => {
  it("returns null and skips the query when userId is undefined", () => {
    const { result } = renderHookWithQuery(() => useProfessionalByUserId(undefined));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns the professional record matching a user id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "p3" }, error: null });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    });
    const { result } = renderHookWithQuery(() => useProfessionalByUserId("u1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "p3" });
  });
});
