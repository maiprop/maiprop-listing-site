import { useState, useEffect } from "react";
import { getCookieConsent, saveCookieConsent, type CookieConsent } from "@/components/CookieConsentBanner";

const defaults: CookieConsent = {
  accepted: false,
  functional: true,
  analytics: false,
  mapping: false,
  timestamp: 0,
};

/**
 * Returns the current cookie consent state.
 * Use `consent.mapping` before loading Mapbox.
 * Use `consent.analytics` before firing analytics events.
 */
export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsent>(() => getCookieConsent() ?? defaults);

  useEffect(() => {
    // Poll for changes (set by CookieConsentBanner or manual accept)
    const id = setInterval(() => {
      const latest = getCookieConsent();
      if (latest && latest.timestamp !== consent.timestamp) {
        setConsent(latest);
      }
    }, 500);
    return () => clearInterval(id);
  }, [consent.timestamp]);

  const accept = (overrides?: Partial<CookieConsent>) => {
    const updated = { ...defaults, accepted: true, functional: true, ...overrides, timestamp: Date.now() };
    saveCookieConsent(updated);
    setConsent(updated);
  };

  return { consent, accept };
}
