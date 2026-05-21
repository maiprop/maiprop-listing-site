import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { installChunkLoadRecovery } from "@/lib/chunkLoadRecovery";
import { installWebVitalsMonitoring } from "@/lib/webVitals";

installChunkLoadRecovery();

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    // Performance: sample 10% of page loads as transactions
    tracesSampleRate: 0.1,
    // Instrument browser navigation + fetch/XHR automatically
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // Propagate trace headers to Supabase edge functions for distributed tracing
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/[a-z]+\.supabase\.co\/functions/,
    ],
  });
  // Expose to ErrorBoundary's zero-dependency hook
  (window as unknown as Record<string, unknown>).__sentryClient = Sentry;
  installWebVitalsMonitoring();
}

// Plausible analytics — only fires when cookie consent includes analytics
// and VITE_PLAUSIBLE_DOMAIN is set. Zero cookies, GDPR-compliant.
const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined;
if (plausibleDomain) {
  const script = document.createElement("script");
  script.defer = true;
  script.dataset.domain = plausibleDomain;
  // data-api is proxied through the site's own origin (Cloudflare Pages Function
  // at /api/event, once configured) to avoid adblocker interference.
  script.dataset.api = "/api/event";
  script.src = "https://plausible.io/js/script.js";
  // Only inject script after user accepts analytics consent
  const inject = () => {
    try {
      const raw = localStorage.getItem("maiprop_cookie_consent");
      if (raw) {
        const consent = JSON.parse(raw) as { analytics?: boolean };
        if (consent.analytics) document.head.appendChild(script);
      }
    } catch (_e) { /* ignore */ }
  };
  inject();
  window.addEventListener("maiprop_consent_updated", inject, { once: true });
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing root element");

createRoot(rootElement).render(<App />);
