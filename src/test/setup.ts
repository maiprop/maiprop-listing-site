import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library v16 removed auto-cleanup-via-test-runner-globals.
// Without this, rendered DOM persists across `it()` blocks within a file,
// causing duplicate-element matches in queries like getByTestId.
afterEach(() => {
  cleanup();
});

// ── Browser API stubs required by jsdom ─────────────────────────────────────

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ResizeObserver — used by Radix UI and charting libraries
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", { writable: true, value: ResizeObserverStub });

// IntersectionObserver — used by lazy-load / infinite-scroll
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "IntersectionObserver", { writable: true, value: IntersectionObserverStub });

// scrollIntoView — not implemented in jsdom
Element.prototype.scrollIntoView = () => {};
