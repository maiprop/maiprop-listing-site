import "@testing-library/jest-dom";
import type React from "react";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import process from "node:process";

declare global {
  // Test-only language knob used by coverage smoke tests.
  var __MAIPROP_TEST_I18N_LANGUAGE__: string | undefined;
}

const originalConsoleError = console.error.bind(console);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ ??= "en";

const intentionalTestErrorPatterns = [
  "useAuth must be used within AuthProvider",
  "BottomNav exploded",
  "Test explosion",
];

let suppressIntentionalErrorStackLines = 0;

console.error = (...args: unknown[]) => {
  const message = args.map((arg) => {
    if (arg instanceof Error) return `${arg.message}\n${arg.stack ?? ""}`;
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(" ");
  if (
    message.includes("A suspended resource finished loading inside a test") ||
    intentionalTestErrorPatterns.some((pattern) => message.includes(pattern))
  ) {
    return;
  }
  originalConsoleError(...args);
};

process.stderr.write = ((chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | ((err?: Error) => void), callback?: (err?: Error) => void) => {
  const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;

  if (intentionalTestErrorPatterns.some((pattern) => text.includes(pattern))) {
    suppressIntentionalErrorStackLines = 30;
    done?.();
    return true;
  }

  if (suppressIntentionalErrorStackLines > 0) {
    const trimmed = text.trim();
    const isStackLine =
      trimmed === "" ||
      trimmed.startsWith("at ") ||
      trimmed.startsWith("+") ||
      trimmed.startsWith("CategoryInfo") ||
      trimmed.startsWith("FullyQualifiedErrorId") ||
      text.includes("react-dom") ||
      text.includes("jsdom") ||
      text.includes("testing-library");
    if (isStackLine) {
      suppressIntentionalErrorStackLines -= 1;
      done?.();
      return true;
    }
    suppressIntentionalErrorStackLines = 0;
  }

  return originalStderrWrite(chunk, encodingOrCallback as BufferEncoding, callback);
}) as typeof process.stderr.write;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) =>
      typeof fallback === "string" ? fallback : fallback?.defaultValue ?? key,
    i18n: {
      changeLanguage: vi.fn((language: string) => {
        globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = language;
        return Promise.resolve(language);
      }),
      get language() {
        return globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ ?? "en";
      },
    },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// React Testing Library v16 removed auto-cleanup-via-test-runner-globals.
// Without this, rendered DOM persists across `it()` blocks within a file,
// causing duplicate-element matches in queries like getByTestId.
afterEach(() => {
  cleanup();
  globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "en";
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
