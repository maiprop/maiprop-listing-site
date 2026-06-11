/**
 * Tests for `useListingAI`. The hook calls the `listing-ai-assist` edge
 * function for both description + price flows, gates on form fields, and
 * applies optimistic state updates / error toasts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { invokeMock, toastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import { useListingAI } from "@/hooks/useListingAI";

const baseForm = {
  property_type: "apartment",
  listing_type: "sale",
  city: "Athens",
  address: "1 Main",
  region: "attica",
  sqm: 90,
  bedrooms: 2,
  bathrooms: 1,
  floor: 3,
  year_built: 1995,
  energy_class: "B",
  construction_status: "renovated",
  has_elevator: true,
  has_ac: true,
  has_parking: false,
} as const;

beforeEach(() => {
  invokeMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe("useListingAI > handleAiDescription", () => {
  it("warns when property_type or sqm is missing", async () => {
    const set = vi.fn();
    const { result } = renderHook(() => useListingAI({ ...baseForm, property_type: "" } as never, set));
    await act(async () => { await result.current.handleAiDescription(); });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/property type and area/i));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("invokes the edge function with the active features list and writes the description back", async () => {
    invokeMock.mockResolvedValue({ data: { content: "A bright apartment …" }, error: null });
    const set = vi.fn();
    const { result } = renderHook(() => useListingAI(baseForm as never, set));
    await act(async () => { await result.current.handleAiDescription(); });
    expect(invokeMock).toHaveBeenCalledWith("listing-ai-assist", expect.objectContaining({
      body: expect.objectContaining({
        type: "description",
        property: expect.objectContaining({
          property_type: "apartment",
          city: "Athens",
          // active features come from has_* keys mapped to bare names
          features: expect.arrayContaining(["elevator", "ac"]),
        }),
      }),
    }));
    expect(set).toHaveBeenCalledWith("description", "A bright apartment …");
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/generated/i));
  });

  it("toasts the data.error message when the edge function returns one", async () => {
    invokeMock.mockResolvedValue({ data: { error: "rate-limited" }, error: null });
    const set = vi.fn();
    const { result } = renderHook(() => useListingAI(baseForm as never, set));
    await act(async () => { await result.current.handleAiDescription(); });
    expect(toastMock.error).toHaveBeenCalledWith("rate-limited");
    expect(set).not.toHaveBeenCalled();
  });

  it("toasts a fallback message on transport errors", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error("network") });
    const set = vi.fn();
    const { result } = renderHook(() => useListingAI(baseForm as never, set));
    await act(async () => { await result.current.handleAiDescription(); });
    expect(toastMock.error).toHaveBeenCalledWith("network");
  });

  it("toggles aiDescLoading around the call", async () => {
    let resolve!: (v: unknown) => void;
    invokeMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    const set = vi.fn();
    const { result } = renderHook(() => useListingAI(baseForm as never, set));
    act(() => { void result.current.handleAiDescription(); });
    await waitFor(() => expect(result.current.aiDescLoading).toBe(true));
    await act(async () => {
      resolve({ data: { content: "x" }, error: null });
    });
    await waitFor(() => expect(result.current.aiDescLoading).toBe(false));
  });
});

describe("useListingAI > handleAiPrice", () => {
  it("warns when property_type / sqm / city are missing", async () => {
    const set = vi.fn();
    const { result } = renderHook(() => useListingAI({ ...baseForm, city: "" } as never, set));
    await act(async () => { await result.current.handleAiPrice(); });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/property type, area, and city/i));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("parses JSON content into aiPriceSuggestion", async () => {
    invokeMock.mockResolvedValue({
      data: { content: JSON.stringify({ min: 200_000, max: 250_000, suggested: 225_000 }) },
      error: null,
    });
    const set = vi.fn();
    const { result } = renderHook(() => useListingAI(baseForm as never, set));
    await act(async () => { await result.current.handleAiPrice(); });
    expect(result.current.aiPriceSuggestion).toEqual({ min: 200_000, max: 250_000, suggested: 225_000 });
  });

  it("parses fenced JSON content into aiPriceSuggestion", async () => {
    invokeMock.mockResolvedValue({
      data: { content: "```json\n{\"min\":200000,\"max\":250000,\"suggested\":225000}\n```" },
      error: null,
    });
    const set = vi.fn();
    const { result } = renderHook(() => useListingAI(baseForm as never, set));
    await act(async () => { await result.current.handleAiPrice(); });
    expect(result.current.aiPriceSuggestion).toEqual({ min: 200_000, max: 250_000, suggested: 225_000 });
  });

  it("clears any previous suggestion before invoking", async () => {
    // First call writes a suggestion …
    invokeMock.mockResolvedValueOnce({
      data: { content: JSON.stringify({ min: 1, max: 2, suggested: 1 }) },
      error: null,
    });
    const set = vi.fn();
    const { result } = renderHook(() => useListingAI(baseForm as never, set));
    await act(async () => { await result.current.handleAiPrice(); });
    expect(result.current.aiPriceSuggestion).toBeTruthy();

    // … the second call's pending state should null it again. We capture the
    // intermediate state by deferring the resolution.
    let resolve!: (v: unknown) => void;
    invokeMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    act(() => { void result.current.handleAiPrice(); });
    await waitFor(() => expect(result.current.aiPriceSuggestion).toBeNull());
    await act(async () => {
      resolve({ data: { content: JSON.stringify({ min: 3, max: 4, suggested: 3 }) }, error: null });
    });
    await waitFor(() => expect(result.current.aiPriceSuggestion?.min).toBe(3));
  });

  it("throws an explanatory error when content isn't valid JSON", async () => {
    invokeMock.mockResolvedValue({ data: { content: "not-json" }, error: null });
    const set = vi.fn();
    const { result } = renderHook(() => useListingAI(baseForm as never, set));
    await act(async () => { await result.current.handleAiPrice(); });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/unexpected format/i));
  });

  it("propagates data.error", async () => {
    invokeMock.mockResolvedValue({ data: { error: "AI quota exhausted" }, error: null });
    const set = vi.fn();
    const { result } = renderHook(() => useListingAI(baseForm as never, set));
    await act(async () => { await result.current.handleAiPrice(); });
    expect(toastMock.error).toHaveBeenCalledWith("AI quota exhausted");
  });
});
