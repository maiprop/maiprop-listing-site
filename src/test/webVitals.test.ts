import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installWebVitalsMonitoring,
  normalizeRouteForVitals,
  shouldSampleWebVitals,
} from "@/lib/webVitals";

type ObserverCallback = (list: { getEntries: () => PerformanceEntry[] }) => void;
type RegisteredObserver = { type: string; callback: ObserverCallback };

const observerCallbacks: RegisteredObserver[] = [];
const disconnectMocks: ReturnType<typeof vi.fn>[] = [];

class PerformanceObserverMock {
  private readonly callback: ObserverCallback;
  readonly disconnect = vi.fn();

  constructor(callback: ObserverCallback) {
    this.callback = callback;
    disconnectMocks.push(this.disconnect);
  }

  observe(options: PerformanceObserverInit) {
    observerCallbacks.push({ type: String(options.type), callback: this.callback });
  }
}

function emitEntry(type: string, entry: PerformanceEntry) {
  for (const { type: observedType, callback } of observerCallbacks) {
    if (observedType !== type) continue;
    callback({ getEntries: () => [entry] });
  }
}

describe("webVitals route normalization", () => {
  it("keeps stable routes and masks dynamic ids", () => {
    expect(normalizeRouteForVitals("/")).toBe("/");
    expect(normalizeRouteForVitals("/listings?city=Athens")).toBe("/listings");
    expect(normalizeRouteForVitals("/property/00000000-0000-4000-8000-000000000101")).toBe("/property/:id");
    expect(normalizeRouteForVitals("/auctions/123456")).toBe("/auctions/:id");
    expect(normalizeRouteForVitals("/open-house/abcdef1234567890")).toBe("/open-house/:id");
  });
});

describe("webVitals sampling", () => {
  it("handles disabled, forced, and fractional sample rates", () => {
    expect(shouldSampleWebVitals(0, () => 0)).toBe(false);
    expect(shouldSampleWebVitals(1, () => 0.99)).toBe(true);
    expect(shouldSampleWebVitals(0.25, () => 0.24)).toBe(true);
    expect(shouldSampleWebVitals(0.25, () => 0.25)).toBe(false);
  });
});

describe("installWebVitalsMonitoring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    observerCallbacks.length = 0;
    disconnectMocks.length = 0;
    delete window.__maipropWebVitalsInstalled;
    Object.defineProperty(window, "PerformanceObserver", {
      configurable: true,
      writable: true,
      value: PerformanceObserverMock,
    });
    window.history.replaceState(null, "", "/property/00000000-0000-4000-8000-000000000101");
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.__maipropWebVitalsInstalled;
    vi.restoreAllMocks();
  });

  it("captures sampled route vitals to Sentry once and disconnects observers", () => {
    const sentry = {
      captureMessage: vi.fn(),
      addBreadcrumb: vi.fn(),
    };

    installWebVitalsMonitoring({
      force: true,
      sampleRate: 1,
      sentry,
      now: () => 10_500,
      reportDelayMs: 100,
    });

    emitEntry("paint", { name: "first-contentful-paint", startTime: 520 } as PerformanceEntry);
    emitEntry("largest-contentful-paint", { name: "largest-contentful-paint", startTime: 1_820 } as PerformanceEntry);
    emitEntry("layout-shift", { name: "layout-shift", startTime: 0, value: 0.04, hadRecentInput: false } as PerformanceEntry & { value: number; hadRecentInput: boolean });
    emitEntry("event", { name: "click", startTime: 0, duration: 68, interactionId: 1 } as PerformanceEntry & { duration: number; interactionId: number });

    vi.advanceTimersByTime(100);

    expect(sentry.captureMessage).toHaveBeenCalledWith(
      "web-vitals-route",
      expect.objectContaining({
        level: "info",
        tags: { source: "web-vitals", route: "/property/:id" },
        extra: expect.objectContaining({
          route: "/property/:id",
          fcp: 520,
          lcp: 1820,
          cls: 0.04,
          inp: 68,
          inpSamples: 1,
        }),
      }),
    );
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "web-vitals",
        data: expect.objectContaining({ route: "/property/:id" }),
      }),
    );
    expect(disconnectMocks.length).toBeGreaterThan(0);
    expect(disconnectMocks.every((disconnect) => disconnect.mock.calls.length === 1)).toBe(true);

    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it("does not install when the sampled request is skipped", () => {
    const sentry = { captureMessage: vi.fn(), addBreadcrumb: vi.fn() };
    installWebVitalsMonitoring({
      force: true,
      sampleRate: 0.5,
      random: () => 0.9,
      sentry,
    });

    expect(window.__maipropWebVitalsInstalled).toBeUndefined();
    expect(observerCallbacks).toHaveLength(0);
  });
});
