type WebVitalsMetricName = "fcp" | "lcp" | "cls" | "inp";

export type WebVitalsSnapshot = Record<WebVitalsMetricName, number> & {
  route: string;
  durationMs: number;
  inpSamples: number;
};

type SentryLike = {
  captureMessage?: (message: string, context?: unknown) => void;
  addBreadcrumb?: (breadcrumb: unknown) => void;
};

type WebVitalsState = {
  fcp: number;
  lcp: number;
  cls: number;
  inp: number;
  inpSamples: number;
  route: string;
  startedAt: number;
  reported: boolean;
};

type InstallWebVitalsOptions = {
  force?: boolean;
  sampleRate?: number;
  reportDelayMs?: number;
  random?: () => number;
  sentry?: SentryLike | null;
  now?: () => number;
};

const DEFAULT_SAMPLE_RATE = 0.1;
const DEFAULT_REPORT_DELAY_MS = 9_000;

const DYNAMIC_SEGMENT_PATTERNS = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  /^[0-9a-f]{16,}$/i,
  /^\d{5,}$/,
];

declare global {
  interface Window {
    __maipropWebVitalsInstalled?: boolean;
    __sentryClient?: SentryLike;
  }
}

function getConfiguredSampleRate(): number {
  const raw = import.meta.env.VITE_WEB_VITALS_SAMPLE_RATE;
  const parsed = typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_SAMPLE_RATE;
}

export function normalizeRouteForVitals(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] || "/";
  if (path === "/") return "/";
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => DYNAMIC_SEGMENT_PATTERNS.some((pattern) => pattern.test(segment)) ? ":id" : segment)
    .join("/")
    .replace(/^/, "/");
}

export function shouldSampleWebVitals(sampleRate: number, random = Math.random): boolean {
  if (sampleRate <= 0) return false;
  if (sampleRate >= 1) return true;
  return random() < sampleRate;
}

function getSentryClient(override?: SentryLike | null): SentryLike | null {
  if (override !== undefined) return override;
  return window.__sentryClient ?? null;
}

function getSnapshot(state: WebVitalsState, now: () => number): WebVitalsSnapshot {
  return {
    route: state.route,
    fcp: Math.round(state.fcp),
    lcp: Math.round(state.lcp),
    cls: Number(state.cls.toFixed(4)),
    inp: Math.round(state.inp),
    inpSamples: state.inpSamples,
    durationMs: Math.round(now() - state.startedAt),
  };
}

function observePerformanceEntry(
  options: PerformanceObserverInit & { durationThreshold?: number },
  callback: (entry: PerformanceEntry) => void,
): PerformanceObserver | null {
  if (typeof PerformanceObserver === "undefined") return null;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) callback(entry);
    });
    observer.observe(options);
    return observer;
  } catch {
    return null;
  }
}

function reportWebVitals(state: WebVitalsState, sentry: SentryLike, now: () => number): void {
  if (state.reported) return;
  state.reported = true;
  const snapshot = getSnapshot(state, now);
  sentry.addBreadcrumb?.({
    category: "web-vitals",
    level: "info",
    message: `Web vitals ${snapshot.route}`,
    data: snapshot,
  });
  sentry.captureMessage?.("web-vitals-route", {
    level: "info",
    tags: {
      source: "web-vitals",
      route: snapshot.route,
    },
    extra: snapshot,
  });
}

export function installWebVitalsMonitoring(options: InstallWebVitalsOptions = {}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__maipropWebVitalsInstalled) return;
  if (!options.force && !import.meta.env.PROD) return;

  const sampleRate = options.sampleRate ?? getConfiguredSampleRate();
  if (!shouldSampleWebVitals(sampleRate, options.random)) return;

  const sentry = getSentryClient(options.sentry);
  if (!sentry?.captureMessage && !sentry?.addBreadcrumb) return;

  window.__maipropWebVitalsInstalled = true;

  const now = options.now ?? (() => performance.now());
  const state: WebVitalsState = {
    fcp: 0,
    lcp: 0,
    cls: 0,
    inp: 0,
    inpSamples: 0,
    route: normalizeRouteForVitals(window.location.pathname),
    startedAt: now(),
    reported: false,
  };

  const observers = [
    observePerformanceEntry({ type: "paint", buffered: true }, (entry) => {
      if (entry.name === "first-contentful-paint") state.fcp = entry.startTime;
    }),
    observePerformanceEntry({ type: "largest-contentful-paint", buffered: true }, (entry) => {
      state.lcp = entry.startTime;
    }),
    observePerformanceEntry({ type: "layout-shift", buffered: true }, (entry) => {
      const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
      if (!shift.hadRecentInput) state.cls += shift.value ?? 0;
    }),
    observePerformanceEntry({ type: "event", buffered: true, durationThreshold: 16 }, (entry) => {
      const event = entry as PerformanceEntry & { duration?: number; interactionId?: number };
      if ((event.interactionId ?? 0) <= 0) return;
      state.inp = Math.max(state.inp, event.duration ?? 0);
      state.inpSamples += 1;
    }),
  ].filter((observer): observer is PerformanceObserver => Boolean(observer));

  const report = () => {
    reportWebVitals(state, sentry, now);
    observers.forEach((observer) => observer.disconnect());
  };

  const timer = window.setTimeout(report, options.reportDelayMs ?? DEFAULT_REPORT_DELAY_MS);
  const onPageHidden = () => {
    if (document.visibilityState === "hidden") {
      window.clearTimeout(timer);
      report();
    }
  };
  const onPageHide = () => {
    window.clearTimeout(timer);
    report();
  };

  document.addEventListener("visibilitychange", onPageHidden, { once: true });
  window.addEventListener("pagehide", onPageHide, { once: true });
}
