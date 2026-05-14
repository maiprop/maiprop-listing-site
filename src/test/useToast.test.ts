/**
 * Tests for the global toast store + useToast hook (shadcn pattern).
 *
 * The module exports a singleton in-memory state (`memoryState`) plus a
 * global `toast()` enqueue function and a `useToast()` hook that subscribes.
 * Tests cover: enqueue, TOAST_LIMIT cap, update, dismiss (single and all),
 * and the subscriber lifecycle.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { toast, useToast, reducer } from "@/hooks/use-toast";

describe("use-toast reducer", () => {
  it("ADD_TOAST inserts the new toast at the head and respects TOAST_LIMIT=1", () => {
    const initial = { toasts: [] };
    const after = reducer(initial, {
      type: "ADD_TOAST",
      toast: { id: "1", title: "first", open: true },
    });
    expect(after.toasts).toEqual([{ id: "1", title: "first", open: true }]);

    const next = reducer(after, {
      type: "ADD_TOAST",
      toast: { id: "2", title: "second", open: true },
    });
    // TOAST_LIMIT is 1, so only the newest survives.
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe("2");
  });

  it("UPDATE_TOAST patches the matching toast by id", () => {
    const initial = {
      toasts: [
        { id: "1", title: "a", open: true },
        { id: "2", title: "b", open: true },
      ],
    };
    const after = reducer(initial, {
      type: "UPDATE_TOAST",
      toast: { id: "2", title: "B" },
    });
    expect(after.toasts.find((t) => t.id === "2")?.title).toBe("B");
    expect(after.toasts.find((t) => t.id === "1")?.title).toBe("a");
  });

  it("DISMISS_TOAST(id) flips open=false on that toast only", () => {
    const initial = {
      toasts: [
        { id: "1", title: "a", open: true },
        { id: "2", title: "b", open: true },
      ],
    };
    const after = reducer(initial, { type: "DISMISS_TOAST", toastId: "1" });
    expect(after.toasts.find((t) => t.id === "1")?.open).toBe(false);
    expect(after.toasts.find((t) => t.id === "2")?.open).toBe(true);
  });

  it("DISMISS_TOAST() with no id flips open=false on every toast", () => {
    const initial = {
      toasts: [
        { id: "1", title: "a", open: true },
        { id: "2", title: "b", open: true },
      ],
    };
    const after = reducer(initial, { type: "DISMISS_TOAST" });
    expect(after.toasts.every((t) => t.open === false)).toBe(true);
  });

  it("REMOVE_TOAST(id) drops a single entry; REMOVE_TOAST() empties the queue", () => {
    const initial = {
      toasts: [
        { id: "1", title: "a", open: true },
        { id: "2", title: "b", open: true },
      ],
    };
    expect(reducer(initial, { type: "REMOVE_TOAST", toastId: "1" }).toasts).toEqual([
      { id: "2", title: "b", open: true },
    ]);
    expect(reducer(initial, { type: "REMOVE_TOAST" }).toasts).toEqual([]);
  });
});

describe("toast() + useToast() store", () => {
  // The store is a module-level singleton, so we drain it before each test
  // by REMOVE_TOASTing everything (via the public dismiss + microtask) to
  // avoid bleed between tests.
  beforeEach(() => {
    // dismiss with no id then advance fake timers to drain
    vi.useFakeTimers();
    act(() => {
      toast({ title: "drain-prep" }); // ensure something exists
    });
    const { result: drain, unmount } = renderHook(() => useToast());
    act(() => drain.current.dismiss());
    // The remove timeout is 1_000_000ms; jump past it.
    act(() => vi.advanceTimersByTime(1_000_001));
    unmount();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("returns a token with id/dismiss/update from toast()", () => {
    const t = toast({ title: "hello" });
    expect(typeof t.id).toBe("string");
    expect(typeof t.dismiss).toBe("function");
    expect(typeof t.update).toBe("function");
  });

  it("the useToast hook reflects the current queue (subscriber path)", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      toast({ title: "live" });
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe("live");
    expect(result.current.toasts[0].open).toBe(true);
  });

  it("calling token.dismiss() flips open=false on that toast", () => {
    const { result } = renderHook(() => useToast());
    let token!: ReturnType<typeof toast>;
    act(() => {
      token = toast({ title: "x" });
    });
    expect(result.current.toasts[0].open).toBe(true);
    act(() => token.dismiss());
    expect(result.current.toasts[0].open).toBe(false);
  });

  it("calling token.update() patches the toast in place", () => {
    const { result } = renderHook(() => useToast());
    let token!: ReturnType<typeof toast>;
    act(() => {
      token = toast({ title: "first" });
    });
    act(() => token.update({ id: token.id, title: "patched", open: true }));
    expect(result.current.toasts[0].title).toBe("patched");
  });

  it("hook.dismiss() with no id flips every toast to open=false", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      toast({ title: "a" });
    });
    act(() => result.current.dismiss());
    expect(result.current.toasts.every((t) => t.open === false)).toBe(true);
  });

  it("hook.dismiss(id) only affects the matching toast", () => {
    const { result } = renderHook(() => useToast());
    let firstId = "";
    act(() => {
      const t = toast({ title: "alpha" });
      firstId = t.id;
    });
    act(() => result.current.dismiss(firstId));
    expect(result.current.toasts[0].open).toBe(false);
  });
});
