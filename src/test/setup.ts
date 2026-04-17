import "@testing-library/jest-dom";

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
