/**
 * Unit tests for the validateStep logic inside useListingForm.
 *
 * These tests verify the per-step validation rules without needing
 * to mount a full React component or touch Supabase.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn() },
    functions: { invoke: vi.fn() },
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { useAuth } from "@/contexts/AuthContext";
import { useListingForm } from "@/hooks/useListingForm";

const TEST_USER = { id: "user-abc", email: "test@example.com" };

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(
    MemoryRouter,
    { future: { v7_startTransition: true, v7_relativeSplatPath: true } },
    React.createElement(QueryClientProvider, { client: qc }, children)
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useListingForm.validateStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: TEST_USER,
      profile: null,
    } as ReturnType<typeof useAuth>);
  });

  it("details step: errors when title is empty", async () => {
    const { result } = renderHook(() => useListingForm(), { wrapper });

    let errors: Record<string, string> = {};
    act(() => {
      errors = result.current.validateStep("details");
    });

    expect(errors.title).toBeDefined();
    expect(errors.title).toMatch(/required/i);
  });

  it("details step: errors when sqm is empty", async () => {
    const { result } = renderHook(() => useListingForm(), { wrapper });

    act(() => {
      result.current.set("title", "Test property");
    });

    let errors: Record<string, string> = {};
    act(() => {
      errors = result.current.validateStep("details");
    });

    expect(errors.sqm).toBeDefined();
  });

  it("details step: no errors when title and sqm are set", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper });

    act(() => {
      result.current.set("title", "Test property");
      result.current.set("sqm", "100");
    });

    let errors: Record<string, string> = {};
    act(() => {
      errors = result.current.validateStep("details");
    });

    expect(Object.keys(errors).length).toBe(0);
  });

  it("location step: errors when city is empty", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper });

    let errors: Record<string, string> = {};
    act(() => {
      errors = result.current.validateStep("location");
    });

    expect(errors.city).toBeDefined();
  });

  it("location step: no errors when city is set", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper });

    act(() => {
      result.current.set("city", "Athens");
    });

    let errors: Record<string, string> = {};
    act(() => {
      errors = result.current.validateStep("location");
    });

    expect(Object.keys(errors).length).toBe(0);
  });

  it("pricing step: errors when price is empty", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper });

    let errors: Record<string, string> = {};
    act(() => {
      errors = result.current.validateStep("pricing");
    });

    expect(errors.price).toBeDefined();
  });

  it("pricing step: errors on auction when starting bid is missing", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper });

    act(() => {
      result.current.set("price", "300000");
      result.current.set("listing_type", "auction");
    });

    let errors: Record<string, string> = {};
    act(() => {
      errors = result.current.validateStep("pricing");
    });

    expect(errors.auction_starting_bid).toBeDefined();
  });

  it("pricing step: errors on open_house when date is missing", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper });

    act(() => {
      result.current.set("price", "250000");
      result.current.set("listing_type", "open_house");
    });

    let errors: Record<string, string> = {};
    act(() => {
      errors = result.current.validateStep("pricing");
    });

    expect(errors.open_house_date).toBeDefined();
  });

  it("pricing step: no errors for sale listing with price set", () => {
    const { result } = renderHook(() => useListingForm(), { wrapper });

    act(() => {
      result.current.set("price", "200000");
      result.current.set("listing_type", "sale");
    });

    let errors: Record<string, string> = {};
    act(() => {
      errors = result.current.validateStep("pricing");
    });

    expect(Object.keys(errors).length).toBe(0);
  });
});
