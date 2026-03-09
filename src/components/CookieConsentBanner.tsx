import { useState, useEffect } from "react";
import { Cookie, ChevronDown, ChevronUp, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const STORAGE_KEY = "maiprop_cookie_consent";

export type CookieConsent = {
  accepted: boolean;
  functional: boolean;
  analytics: boolean;
  mapping: boolean;
  timestamp: number;
};

export function getCookieConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCookieConsent(consent: CookieConsent) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [functional, setFunctional] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [mapping, setMapping] = useState(true);

  useEffect(() => {
    const existing = getCookieConsent();
    if (!existing) {
      // Show after a short delay so it doesn't flash immediately
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  const handleAcceptAll = () => {
    saveCookieConsent({ accepted: true, functional: true, analytics: true, mapping: true, timestamp: Date.now() });
    setVisible(false);
  };

  const handleRejectAll = () => {
    saveCookieConsent({ accepted: true, functional: true, analytics: false, mapping: false, timestamp: Date.now() });
    setVisible(false);
  };

  const handleSavePreferences = () => {
    saveCookieConsent({ accepted: true, functional, analytics, mapping, timestamp: Date.now() });
    setVisible(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 animate-slide-up">
      <div className="max-w-4xl mx-auto bg-card border border-border rounded-2xl shadow-elevated overflow-hidden">
        {/* Main row */}
        <div className="flex items-start gap-4 p-5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Cookie className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-sm mb-1">We use cookies to improve your experience</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              We use essential cookies to make our site work, plus optional cookies for analytics and mapping features.
              Read our{" "}
              <a href="/cookie-policy" className="text-primary underline underline-offset-2 hover:text-primary/80">Cookie Policy</a>
              {" "}for details.
            </p>
          </div>
          <button onClick={() => setVisible(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors shrink-0 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Expandable preferences */}
        {expanded && (
          <div className="px-5 pb-4 border-t border-border pt-4 space-y-4">
            {/* Essential — always on */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Essential Cookies</p>
                <p className="text-xs text-muted-foreground mt-0.5">Required for authentication, security, and core site functionality. Cannot be disabled.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-brand-emerald font-semibold">Always on</span>
                <Switch checked={true} disabled className="data-[state=checked]:bg-brand-emerald" />
              </div>
            </div>

            {/* Functional */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Functional Cookies</p>
                <p className="text-xs text-muted-foreground mt-0.5">Remember your preferences, saved searches, and personalization settings.</p>
              </div>
              <Switch
                checked={functional}
                onCheckedChange={setFunctional}
                className="shrink-0 data-[state=checked]:bg-primary"
              />
            </div>

            {/* Analytics */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Analytics Cookies</p>
                <p className="text-xs text-muted-foreground mt-0.5">Help us understand how visitors use the site so we can improve it. Data is aggregated and anonymised.</p>
              </div>
              <Switch
                checked={analytics}
                onCheckedChange={setAnalytics}
                className="shrink-0 data-[state=checked]:bg-primary"
              />
            </div>

            {/* Mapping */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Mapping Cookies</p>
                <p className="text-xs text-muted-foreground mt-0.5">Required for interactive maps (Mapbox). May set third-party cookies for tile delivery and usage tracking.</p>
              </div>
              <Switch
                checked={mapping}
                onCheckedChange={setMapping}
                className="shrink-0 data-[state=checked]:bg-primary"
              />
            </div>
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 bg-secondary/40 border-t border-border flex-wrap">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? "Hide preferences" : "Manage preferences"}
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="text-xs h-8 border-border" onClick={handleRejectAll}>
              Reject optional
            </Button>
            {expanded && (
              <Button size="sm" variant="outline" className="text-xs h-8 border-primary/40 text-primary hover:bg-primary/10" onClick={handleSavePreferences}>
                <Check className="w-3 h-3 mr-1" /> Save preferences
              </Button>
            )}
            <Button size="sm" className="text-xs h-8 bg-gradient-primary border-0 text-primary-foreground font-semibold" onClick={handleAcceptAll}>
              Accept all
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
