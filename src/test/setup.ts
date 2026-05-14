import "@testing-library/jest-dom";
import type React from "react";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { changeLanguage: vi.fn(), language: "en" },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

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

// scrollTo - jsdom exposes a warning-only implementation.
Object.defineProperty(window, "scrollTo", { writable: true, value: vi.fn() });

// Canvas export APIs are missing unless jsdom is paired with the optional
// native canvas package. Tests only need deterministic, non-throwing output.
HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,test";

// Download links created during export tests should not trigger jsdom's
// "navigation to another Document" warning.
HTMLAnchorElement.prototype.click = vi.fn();
