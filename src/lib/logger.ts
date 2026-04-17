/**
 * Thin logger that:
 * - Always logs in development
 * - Forwards warn/error to Sentry in production (as exceptions or string captures)
 * - critical() always logs + captures regardless of environment
 */

const isDev = import.meta.env.DEV;

function sentryCapture(err: unknown): void {
  const sentry = (window as unknown as Record<string, unknown>).__sentryClient;
  if (!sentry) return;
  const client = sentry as { captureException: (e: unknown) => void; captureMessage: (m: string, level: string) => void };
  if (typeof client.captureException !== "function") return;
  if (err instanceof Error) {
    client.captureException(err);
  } else {
    client.captureMessage(String(err), "error");
  }
}

export const logger = {
  warn(...args: unknown[]): void {
    if (isDev) console.warn(...args);
    // Forward non-trivial warnings to Sentry in production
    if (!isDev) {
      const first = args[0];
      if (first instanceof Error) sentryCapture(first);
    }
  },
  error(...args: unknown[]): void {
    if (isDev) console.error(...args);
    // Always forward to Sentry — captures both Error instances and plain strings
    sentryCapture(args[0]);
  },
  /** Always logs — use for invariant violations that indicate a code bug */
  critical(label: string, err: unknown): void {
    console.error(`[CRITICAL] ${label}`, err);
    sentryCapture(err instanceof Error ? err : new Error(`${label}: ${String(err)}`));
  },
};
