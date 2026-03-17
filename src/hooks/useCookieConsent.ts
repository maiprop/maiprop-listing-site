import { useState, useEffect, useCallback } from "react";
import { getCookieConsent, saveCookieConsent, type CookieConsent } from "@/components/CookieConsentBanner";

const STORAGE_KEY = "maiprop_cookie_consent";

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
 * Reacts to changes from other tabs via the storage event.
 */
export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsent>(() => getCookieConsent() ?? defaults);

  useEffect(() => {
    // React to changes from the CookieConsentBanner (same tab via custom event)
    const handleCustom = () => {
      const latest = getCookieConsent();
      if (latest) setConsent(latest);
    };

    // React to changes from other tabs via storage event
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const latest = getCookieConsent();
        if (latest) setConsent(latest);
      }
    };

    window.addEventListener("maiprop_consent_updated", handleCustom);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("maiprop_consent_updated", handleCustom);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const accept = useCallback((overrides?: Partial<CookieConsent>) => {
    const updated: CookieConsent = {
      ...defaults,
      accepted: true,
      functional: true,
      ...overrides,
      timestamp: Date.now(),
    };
    saveCookieConsent(updated);
    setConsent(updated);
    // Notify other components in the same tab
    window.dispatchEvent(new Event("maiprop_consent_updated"));
  }, []);

  return { consent, accept };
}

