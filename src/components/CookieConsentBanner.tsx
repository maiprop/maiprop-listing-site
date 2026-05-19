/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  } catch (_err: unknown) {
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

  const { t } = useTranslation();

  if (!visible) return null;

  const save = (c: CookieConsent) => {
    saveCookieConsent(c);
    window.dispatchEvent(new Event("maiprop_consent_updated"));
    setVisible(false);
  };

  const handleAcceptAll = () =>
    save({ accepted: true, functional: true, analytics: true, mapping: true, timestamp: Date.now() });

  const handleRejectAll = () =>
    save({ accepted: true, functional: true, analytics: false, mapping: false, timestamp: Date.now() });

  const handleSavePreferences = () =>
    save({ accepted: true, functional, analytics, mapping, timestamp: Date.now() });

  return (
    <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 z-[100] p-2 sm:p-4 animate-slide-up">
      <div className="max-w-4xl mx-auto bg-card border border-border rounded-xl sm:rounded-2xl shadow-elevated overflow-hidden">
        {/* Main row */}
        <div className="flex items-start gap-2 sm:gap-4 p-3 sm:p-5">
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-primary/10 items-center justify-center shrink-0 mt-0.5">
            <Cookie className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-sm mb-1">{t("cookie.title")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 sm:line-clamp-none">
              {t("cookie.description")}{" "}
              <a href="/cookie-policy" className="text-primary underline underline-offset-2 hover:text-primary/80">{t("cookie.policyLinkText")}</a>
            </p>
          </div>
          <button onClick={() => setVisible(false)} aria-label={t("cookie.hidePreferences")} className="p-1.5 rounded-lg hover:bg-secondary transition-colors shrink-0 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Expandable preferences */}
        {expanded && (
          <div className="px-3 sm:px-5 pb-3 sm:pb-4 border-t border-border pt-3 sm:pt-4 space-y-3 sm:space-y-4 max-h-[40vh] overflow-y-auto">
            {/* Essential — always on */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{t("cookie.essential.title")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("cookie.essential.description")}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-brand-emerald font-semibold">{t("cookie.essential.alwaysOn")}</span>
                <Switch checked={true} disabled className="data-[state=checked]:bg-brand-emerald" />
              </div>
            </div>

            {/* Functional */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{t("cookie.functional.title")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("cookie.functional.description")}</p>
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
                <p className="text-sm font-semibold text-foreground">{t("cookie.analytics.title")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("cookie.analytics.description")}</p>
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
                <p className="text-sm font-semibold text-foreground">{t("cookie.mapping.title")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("cookie.mapping.description")}</p>
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
        <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-4 bg-secondary/40 border-t border-border flex-wrap">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
            {expanded ? t("cookie.hidePreferences") : t("cookie.managePreferences")}
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="text-xs h-8 border-border" onClick={handleRejectAll}>
              {t("cookie.rejectOptional")}
            </Button>
            {expanded && (
              <Button size="sm" variant="outline" className="text-xs h-8 border-primary/40 text-primary hover:bg-primary/10" onClick={handleSavePreferences}>
                <Check className="w-3 h-3 mr-1" aria-hidden="true" /> {t("cookie.savePreferences")}
              </Button>
            )}
            <Button size="sm" className="text-xs h-8 bg-gradient-primary border-0 text-primary-foreground font-semibold" onClick={handleAcceptAll}>
              {t("cookie.acceptAll")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
