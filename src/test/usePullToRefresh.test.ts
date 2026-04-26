/**
 * Tests for the touch-driven pull-to-refresh hook used by mobile dashboard
 * lists. We dispatch synthetic TouchEvents on `window` and assert that the
 * hook drives `pulling`/`pullDistance`/`refreshing` and ultimately calls
 * `onRefresh` once the threshold is exceeded.
 */
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

function fireTouch(name: "touchstart" | "touchmove" | "touchend", clientY?: number) {
  const init: TouchEventInit = {
    bubbles: true,
    cancelable: true,
    touches:
      clientY != null
        ? ([
            {
              clientY,
              clientX: 0,
              identifier: 0,
              target: window as unknown as EventTarget,
              pageX: 0,
              pageY: clientY,
              radiusX: 0,
              radiusY: 0,
              rotationAngle: 0,
              force: 0,
              screenX: 0,
              screenY: clientY,
            } as Touch,
          ] as unknown as Touch[])
        : ([] as unknown as Touch[]),
  };
  // jsdom does not implement TouchEvent in some versions; fall back to a
  // generic Event with `touches` patched on.
  let evt: Event;
  if (typeof TouchEvent === "function") {
    evt = new TouchEvent(name, init);
  } else {
    evt = new Event(name, { bubbles: true, cancelable: true });
    Object.defineProperty(evt, "touches", { value: init.touches });
  }
  window.dispatchEvent(evt);
}

describe("usePullToRefresh", () => {
  it("ignores pulls when scrollTop > 0", () => {
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      get: () => 50,
    });
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh({ onRefresh }));
    act(() => fireTouch("touchstart", 100));
    act(() => fireTouch("touchmove", 200));
    act(() => fireTouch("touchend"));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does nothing when disabled=true", async () => {
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      get: () => 0,
    });
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh, disabled: true, threshold: 50 }),
    );
    act(() => fireTouch("touchstart", 100));
    act(() => fireTouch("touchmove", 400));
    act(() => fireTouch("touchend"));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.refreshing).toBe(false);
  });

  it("does not trigger refresh when the pull is below the threshold", () => {
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      get: () => 0,
    });
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh({ onRefresh, threshold: 200 }));
    act(() => fireTouch("touchstart", 0));
    // 50 dy * 0.45 = 22.5 — under threshold of 200
    act(() => fireTouch("touchmove", 50));
    act(() => fireTouch("touchend"));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("calls onRefresh when the pull crosses the threshold and clamps state", async () => {
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      get: () => 0,
    });
    let resolve!: () => void;
    const onRefresh = vi.fn().mockImplementation(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh, threshold: 60 }),
    );
    act(() => fireTouch("touchstart", 0));
    // 200 dy * 0.45 = 90 — above 60 → triggers refresh
    act(() => fireTouch("touchmove", 200));
    expect(result.current.pulling).toBe(true);
    expect(result.current.pullDistance).toBeGreaterThan(60);

    await act(async () => {
      fireTouch("touchend");
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      resolve();
      // micro-flush
      await Promise.resolve();
    });
    expect(result.current.refreshing).toBe(false);
  });

  it("ignores upward swipes (dy <= 0)", () => {
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      get: () => 0,
    });
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, threshold: 60 }));
    act(() => fireTouch("touchstart", 100));
    act(() => fireTouch("touchmove", 50)); // upward swipe → pullDistance reset
    expect(result.current.pulling).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });

  it("rubber-band-clamps pullDistance at 1.5x the threshold", () => {
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      get: () => 0,
    });
    const { result } = renderHook(() =>
      usePullToRefresh({ onRefresh: () => {}, threshold: 100 }),
    );
    act(() => fireTouch("touchstart", 0));
    // dy = 1000 → 1000 * 0.45 = 450, but clamped to 100 * 1.5 = 150
    act(() => fireTouch("touchmove", 1000));
    expect(result.current.pullDistance).toBe(150);
    expect(result.current.progress).toBe(1);
  });

  it("removes its window listeners on unmount", () => {
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      get: () => 0,
    });
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() =>
      usePullToRefresh({ onRefresh: () => {}, threshold: 100 }),
    );
    unmount();
    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toEqual(expect.arrayContaining(["touchstart", "touchmove", "touchend"]));
    removeSpy.mockRestore();
  });
});
