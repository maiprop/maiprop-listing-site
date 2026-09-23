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
import { renderHook, act, waitFor } from "@testing-library/react";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import {
  useProfessionalsAdmin,
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

describe("useProfessionalsAdmin()", () => {
  it("fetches pending applications separately so resolved rows cannot hide the queue", async () => {
    const pendingRows = [
      {
        id: "pending-old",
        display_name: "Older Pending",
        category: "legal",
        title: "Lawyer",
        avatar_url: null,
        created_at: "2026-01-01T00:00:00.000Z",
        license_number: null,
        specialties: ["contracts"],
        verified: false,
        rejection_reason: null,
        verified_at: null,
      },
    ];
    const resolvedRows = [
      {
        id: "verified-new",
        display_name: "New Verified",
        category: "legal",
        title: "Lawyer",
        avatar_url: null,
        created_at: "2026-06-01T00:00:00.000Z",
        license_number: "LIC-1",
        specialties: [],
        verified: true,
        rejection_reason: null,
        verified_at: "2026-06-01T00:00:00.000Z",
      },
    ];
    const builders: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
    const makeBuilder = (data: unknown[]) => {
      const builder: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(() => builder),
        is: vi.fn(() => builder),
        or: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn().mockResolvedValue({ data, error: null }),
      };
      builders.push(builder);
      return builder;
    };
    fromMock
      .mockReturnValueOnce(makeBuilder(pendingRows))
      .mockReturnValueOnce(makeBuilder(resolvedRows));

    const { result } = renderHookWithQuery(() => useProfessionalsAdmin());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(builders[0].is).toHaveBeenCalledWith("rejection_reason", null);
    expect(builders[0].or).toHaveBeenCalledWith("verified.is.false,verified.is.null");
    expect(builders[0].limit).toHaveBeenCalledWith(250);
    expect(builders[1].or).toHaveBeenCalledWith("verified.eq.true,rejection_reason.not.is.null");
    expect(result.current.data?.map((row) => row.id)).toEqual(["pending-old", "verified-new"]);
    expect(result.current.data?.find((row) => row.id === "pending-old")?.status).toBe("pending");
  });
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
  it("rejects a zero-row update instead of acknowledging an unsaved internal note", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });

    const { result } = renderHookWithQuery(() => useUpdateProfessionalNotes());
    await expect(
      act(async () => {
        await result.current.mutateAsync({ id: "missing-pro", notes: "Private follow-up" });
      }),
    ).rejects.toThrow(/not saved/i);

    expect(select).toHaveBeenCalledWith("id");
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("nulls notes when an empty string is passed", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });

    const { result } = renderHookWithQuery(() => useUpdateProfessionalNotes());
    await act(async () => {
      await result.current.mutateAsync({ id: "p1", notes: "" });
    });

    expect(update).toHaveBeenCalledWith({ notes: null });
    expect(select).toHaveBeenCalledWith("id");
  });
});
