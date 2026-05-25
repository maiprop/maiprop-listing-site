/**
 * Tests for the admin professionals queue hooks. The behavioural anchor here
 * is the mutual invariant between `useProfessionalsAdmin`'s status derivation
 * (`rejection_reason ? 'rejected' : verified ? 'verified' : 'pending'`) and
 * the writer hooks: a "rejected" professional must always have a non-null
 * `rejection_reason`, and a re-approved professional must clear it.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import {
  useApproveProfessional,
  useRejectProfessional,
  useUpdateProfessionalNotes,
} from "@/hooks/useAdminProfessionals";

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
});

describe("useRejectProfessional()", () => {
  it("writes the trimmed note as rejection_reason", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });

    const { result } = renderHookWithQuery(() => useRejectProfessional());
    await act(async () => {
      await result.current.mutateAsync({ id: "p1", notes: "  not a real CV  " });
    });

    expect(update).toHaveBeenCalledWith({
      verified: false,
      rejection_reason: "not a real CV",
      verified_at: null,
    });
    expect(eq).toHaveBeenCalledWith("id", "p1");
  });

  it("falls back to a sentinel string when notes are empty so the row stays in the rejected bucket", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });

    const { result } = renderHookWithQuery(() => useRejectProfessional());
    await act(async () => {
      await result.current.mutateAsync({ id: "p1", notes: "" });
    });

    const call = update.mock.calls[0][0];
    expect(call.verified).toBe(false);
    // Critical: rejection_reason must be a non-empty truthy string,
    // otherwise useProfessionalsAdmin's status derivation puts the row
    // back in the pending bucket. See hook docstring.
    expect(call.rejection_reason).toBeTruthy();
    expect(typeof call.rejection_reason).toBe("string");
    expect((call.rejection_reason as string).length).toBeGreaterThan(0);
  });

  it("treats whitespace-only notes the same as empty", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });

    const { result } = renderHookWithQuery(() => useRejectProfessional());
    await act(async () => {
      await result.current.mutateAsync({ id: "p1", notes: "   \n\t  " });
    });

    const call = update.mock.calls[0][0];
    expect(call.rejection_reason).toBeTruthy();
    expect((call.rejection_reason as string).trim().length).toBeGreaterThan(0);
  });

  it("propagates Supabase errors", async () => {
    const eq = vi.fn().mockResolvedValue({ error: new Error("rls") });
    fromMock.mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) });

    const { result } = renderHookWithQuery(() => useRejectProfessional());
    await expect(
      act(async () => {
        await result.current.mutateAsync({ id: "p1", notes: "bad" });
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe("useApproveProfessional()", () => {
  it("clears rejection_reason on approval so a re-approved row can't stay in the rejected bucket", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });

    const { result } = renderHookWithQuery(() => useApproveProfessional());
    await act(async () => {
      await result.current.mutateAsync({ id: "p1", licenseNumber: "LIC-1" });
    });

    expect(update).toHaveBeenCalledWith({
      verified: true,
      license_number: "LIC-1",
      rejection_reason: null,
      verified_at: expect.any(String),
    });
  });

  it("nulls license_number when an empty string is passed", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });

    const { result } = renderHookWithQuery(() => useApproveProfessional());
    await act(async () => {
      await result.current.mutateAsync({ id: "p1", licenseNumber: "" });
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ license_number: null }),
    );
  });
});

describe("useUpdateProfessionalNotes()", () => {
  it("nulls notes when an empty string is passed", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });

    const { result } = renderHookWithQuery(() => useUpdateProfessionalNotes());
    await act(async () => {
      await result.current.mutateAsync({ id: "p1", notes: "" });
    });

    expect(update).toHaveBeenCalledWith({ notes: null });
  });
});
