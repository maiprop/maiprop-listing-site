/**
 * useContacts hook tests — verifies query structure, ownership filtering,
 * and disabled state when no user is logged in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import { useAuth } from "@/contexts/AuthContext";
import {
  useContactTasks,
  useContacts,
  useCreateContact,
  useCreateContactTask,
  useDeleteContact,
  useUpdateContact,
  useUpdateContactTask,
} from "@/hooks/useContacts";

let qc: QueryClient;
let wrapper: ({ children }: { children: React.ReactNode }) => React.ReactElement;

beforeEach(() => {
  vi.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
});

describe("useContacts", () => {
  it("is disabled when user is null", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    const { result } = renderHook(() => useContacts(), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("queries contacts table with user_id filter", async () => {
    const contacts = [{ id: "c1", name: "Test Contact", user_id: "u1" }];
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: contacts, error: null }),
        }),
      }),
    });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });

    const { result } = renderHook(() => useContacts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(mocks.from).toHaveBeenCalledWith("contacts");
  });

  it("creates, updates, and deletes contacts with ownership checks and toast callbacks", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "c1", user_id: "u1", name: "Ada" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eqUser = vi.fn().mockReturnValue({ select });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const insert = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
    mocks.from.mockReturnValue({ insert, update, delete: del });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });

    const create = renderHook(() => useCreateContact(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({ name: "Ada", deal_stage: "", follow_up_at: null });
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1", name: "Ada", deal_stage: "new" }));
    expect(mocks.toast.success).toHaveBeenCalledWith("Contact added");

    const updateHook = renderHook(() => useUpdateContact(), { wrapper });
    await act(async () => {
      await updateHook.result.current.mutateAsync({ id: "c1", updates: { deal_stage: "won" } });
    });
    expect(update).toHaveBeenCalledWith({ deal_stage: "won" });
    expect(eqId).toHaveBeenCalledWith("id", "c1");
    expect(eqUser).toHaveBeenCalledWith("user_id", "u1");
    expect(mocks.toast.success).toHaveBeenCalledWith("Contact updated");

    const deleteHook = renderHook(() => useDeleteContact(), { wrapper });
    await act(async () => {
      await deleteHook.result.current.mutateAsync("c1");
    });
    expect(mocks.from).toHaveBeenCalledWith("contacts");
    expect(mocks.toast.success).toHaveBeenCalledWith("Contact deleted");
  });

  it("surfaces contact mutation errors and unauthenticated guards", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    const create = renderHook(() => useCreateContact(), { wrapper });
    await expect(create.result.current.mutateAsync({ name: "Ada" })).rejects.toThrow("Not authenticated");
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Could not add contact. Please try again."));

    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    mocks.from.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: new Error("db") }),
            }),
          }),
        }),
      }),
    });
    const updateHook = renderHook(() => useUpdateContact(), { wrapper });
    await expect(updateHook.result.current.mutateAsync({ id: "c1", updates: { name: "Bad" } })).rejects.toThrow("db");
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Could not update contact. Please try again."));
  });

  it("queries, creates, and updates contact tasks, including disabled and error branches", async () => {
    const tasks = [{ id: "t1", contact_id: "c1", user_id: "u1", title: "Call", due_at: null }];
    const order = vi.fn().mockResolvedValue({ data: tasks, error: null });
    const eqUser = vi.fn().mockReturnValue({ order });
    const eqContact = vi.fn().mockReturnValue({ eq: eqUser });
    const selectTasks = vi.fn().mockReturnValue({ eq: eqContact });
    const single = vi.fn().mockResolvedValue({ data: tasks[0], error: null });
    const selectSingle = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: selectSingle });
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ select: selectSingle }),
      }),
    });
    mocks.from.mockImplementation((table: string) => (
      table === "contact_tasks"
        ? { select: selectTasks, insert, update }
        : {}
    ));
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });

    const disabled = renderHook(() => useContactTasks(null), { wrapper });
    expect(disabled.result.current.data).toBeUndefined();

    const list = renderHook(() => useContactTasks("c1"), { wrapper });
    await waitFor(() => expect(list.result.current.data).toEqual(tasks));
    expect(eqContact).toHaveBeenCalledWith("contact_id", "c1");

    const createTask = renderHook(() => useCreateContactTask(), { wrapper });
    await act(async () => {
      await createTask.result.current.mutateAsync({ contactId: "c1", title: "Call", notes: "", dueAt: undefined });
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ contact_id: "c1", user_id: "u1", due_at: null, notes: null }));
    expect(mocks.toast.success).toHaveBeenCalledWith("Task added");

    const updateTask = renderHook(() => useUpdateContactTask(), { wrapper });
    await act(async () => {
      await updateTask.result.current.mutateAsync({ id: "t1", updates: { completed_at: "2026-05-16" } });
    });
    expect(update).toHaveBeenCalledWith({ completed_at: "2026-05-16" });

    mocks.from.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: new Error("task db") }),
        }),
      }),
    });
    await expect(createTask.result.current.mutateAsync({ contactId: "c1", title: "Bad" })).rejects.toThrow("task db");
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Failed to add task. Please try again."));
  });
});
