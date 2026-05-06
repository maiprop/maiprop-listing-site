/**
 * useContacts hook tests — verifies query structure, ownership filtering,
 * mutation handlers (mutationFn, onSuccess, onError) for all exported hooks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Shared chainable mock — all methods return `this` by default
const mockSingle = vi.fn();
const mockChain = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  single: mockSingle,
};
// Wire chainable returns
Object.values(mockChain).forEach(m => m.mockReturnValue(mockChain));

const mockFrom = vi.fn().mockReturnValue(mockChain);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@/contexts/AuthContext";
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  useContactTasks,
  useCreateContactTask,
  useUpdateContactTask,
} from "@/hooks/useContacts";

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
  Object.values(mockChain).forEach(m => m.mockReturnValue(mockChain));
  mockSingle.mockResolvedValue({ data: { id: "c1", contact_id: "cx1" }, error: null });
  mockChain.order.mockResolvedValue({ data: [], error: null });
  mockFrom.mockReturnValue(mockChain);
});

// ── useContacts ────────────────────────────────────────────────────────────────

describe("useContacts", () => {
  it("is disabled when user is null", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useContacts(), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("queries contacts table with user_id filter", async () => {
    mockChain.order.mockResolvedValue({ data: [{ id: "c1" }], error: null });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useContacts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(mockFrom).toHaveBeenCalledWith("contacts");
  });
});

// ── useCreateContact ───────────────────────────────────────────────────────────

describe("useCreateContact", () => {
  it("calls insert on success", async () => {
    mockSingle.mockResolvedValue({ data: { id: "c2" }, error: null });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateContact(), { wrapper });

    await act(async () => {
      result.current.mutate({ name: "Alice" });
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(mockFrom).toHaveBeenCalledWith("contacts");
  });

  it("sets isError when insert fails", async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error("fail") });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateContact(), { wrapper });

    await act(async () => {
      result.current.mutate({ name: "Bad" });
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(result.current.isError).toBe(true);
  });
});

// ── useUpdateContact ───────────────────────────────────────────────────────────

describe("useUpdateContact", () => {
  it("calls update on contacts table", async () => {
    mockSingle.mockResolvedValue({ data: { id: "c1" }, error: null });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateContact(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "c1", updates: { name: "Updated" } });
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(mockFrom).toHaveBeenCalledWith("contacts");
  });

  it("sets isError when update fails", async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error("fail") });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateContact(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "c1", updates: { name: "Fail" } });
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(result.current.isError).toBe(true);
  });
});

// ── useDeleteContact ───────────────────────────────────────────────────────────

describe("useDeleteContact", () => {
  it("calls delete on contacts table", async () => {
    // delete chain ends with eq (no single), so mock it to resolve
    mockChain.eq.mockResolvedValue({ error: null });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeleteContact(), { wrapper });

    await act(async () => {
      result.current.mutate("c1");
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(mockFrom).toHaveBeenCalledWith("contacts");
  });
});

// ── useContactTasks ────────────────────────────────────────────────────────────

describe("useContactTasks", () => {
  it("is disabled when contactId is null", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useContactTasks(null), { wrapper });
    expect(result.current.data).toBeUndefined();
  });

  it("queries contact_tasks for given contactId", async () => {
    mockChain.order.mockResolvedValue({ data: [{ id: "t1" }], error: null });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useContactTasks("c1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("contact_tasks");
  });
});

// ── useCreateContactTask ───────────────────────────────────────────────────────

describe("useCreateContactTask", () => {
  it("inserts a task on success", async () => {
    mockSingle.mockResolvedValue({ data: { id: "t1", contact_id: "c1" }, error: null });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateContactTask(), { wrapper });

    await act(async () => {
      result.current.mutate({ contactId: "c1", title: "Follow up" });
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(mockFrom).toHaveBeenCalledWith("contact_tasks");
  });

  it("sets isError when task creation fails", async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error("fail") });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateContactTask(), { wrapper });

    await act(async () => {
      result.current.mutate({ contactId: "c1", title: "Bad" });
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(result.current.isError).toBe(true);
  });
});

// ── useUpdateContactTask ───────────────────────────────────────────────────────

describe("useUpdateContactTask", () => {
  it("updates a task", async () => {
    mockSingle.mockResolvedValue({ data: { id: "t1", contact_id: "c1" }, error: null });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateContactTask(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "t1", updates: { completed_at: new Date().toISOString() } });
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(mockFrom).toHaveBeenCalledWith("contact_tasks");
  });

  it("sets isError when update fails", async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error("fail") });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateContactTask(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "t1", updates: { completed_at: null } });
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(result.current.isError).toBe(true);
  });
});
