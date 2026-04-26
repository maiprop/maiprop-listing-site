/**
 * Tests for the `useIsMobile` hook. Drives matchMedia + window.innerWidth
 * to assert the breakpoint transitions return the right boolean.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";

type Listener = (e: MediaQueryListEvent) => void;

let mqlListeners: Listener[] = [];
const originalInnerWidth = window.innerWidth;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  mqlListeners = [];
  // Stub matchMedia: capture listeners so the test can fire change events.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: window.innerWidth < 768,
    media: query,
    onchange: null,
    addEventListener: (_type: string, cb: Listener) => mqlListeners.push(cb),
    removeEventListener: (_type: string, cb: Listener) => {
      mqlListeners = mqlListeners.filter((l) => l !== cb);
    },
    addListener: vi.fn(), // legacy
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
});

function setInnerWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
}

describe("useIsMobile", () => {
  it("returns true when innerWidth is below the 768 breakpoint", () => {
    setInnerWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false when innerWidth is at or above the breakpoint", () => {
    setInnerWidth(1280);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns false initially when innerWidth=undefined and flips on the first effect run", () => {
    setInnerWidth(800);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("re-renders when matchMedia fires a change event after a width transition", () => {
    setInnerWidth(1280);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => {
      setInnerWidth(500);
      mqlListeners.forEach((l) => l({} as MediaQueryListEvent));
    });
    expect(result.current).toBe(true);
  });

  it("removes its listener on unmount", () => {
    const { unmount } = renderHook(() => useIsMobile());
    expect(mqlListeners.length).toBe(1);
    unmount();
    expect(mqlListeners.length).toBe(0);
  });
});
