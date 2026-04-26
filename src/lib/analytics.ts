type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    plausible?: (eventName: string, options?: { props?: Record<string, unknown> }) => void;
  }
}

function hasAnalyticsConsent(): boolean {
  try {
    const raw = localStorage.getItem("maiprop_cookie_consent");
    if (!raw) return false;
    const consent = JSON.parse(raw) as { analytics?: boolean };
    return consent.analytics === true;
  } catch {
    return false;
  }
}

export function trackAnalyticsEvent(eventName: string, props: AnalyticsProps = {}): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  const payload = Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined));
  try {
    window.plausible?.(eventName, { props: payload });
  } catch {
    // swallow analytics errors
  }
}
