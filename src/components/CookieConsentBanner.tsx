/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
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

export const getCookieConsent = (): CookieConsent | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_err: unknown) {
    return null;
  }
};

export const saveCookieConsent = (consent: CookieConsent) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
};

type CookieTranslator = ReturnType<typeof useTranslation>["t"];

type PreferenceRowProps = {
  title: string;
  description: string;
  control: ReactNode;
};

const CookieIconBadge = () => (
  <div className="hidden sm:flex w-10 h-10 rounded-xl bg-primary/10 items-center justify-center shrink-0 mt-0.5">
    <Cookie className="w-5 h-5 text-primary" />
  </div>
);

const CookieDescription = ({ t }: { t: CookieTranslator }) => (
  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 sm:line-clamp-none">
    {t("cookie.description")}{" "}
    <a href="/cookie-policy" className="text-primary underline underline-offset-2 hover:text-primary/80">
      {t("cookie.policyLinkText")}
    </a>
  </p>
);

const CookieBannerHeader = ({ t, onDismiss }: { t: CookieTranslator; onDismiss: () => void }) => (
  <div className="flex shrink-0 items-start gap-2 p-3 sm:gap-4 sm:p-5">
    <CookieIconBadge />
    <div className="flex-1 min-w-0">
      <p className="font-display font-semibold text-sm mb-1">{t("cookie.title")}</p>
      <CookieDescription t={t} />
    </div>
    <button
      onClick={onDismiss}
      aria-label={t("cookie.hidePreferences")}
      className="p-1.5 rounded-lg hover:bg-secondary transition-colors shrink-0 text-muted-foreground hover:text-foreground"
    >
      <X className="w-4 h-4" aria-hidden="true" />
    </button>
  </div>
);

const PreferenceRow = ({ title, description, control }: PreferenceRowProps) => (
  <div className="flex min-w-0 items-start justify-between gap-2 sm:gap-4">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
    {control}
  </div>
);

const EssentialPreference = ({ t }: { t: CookieTranslator }) => {
  const control = (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs text-brand-emerald font-semibold">{t("cookie.essential.alwaysOn")}</span>
      <Switch
        checked
        disabled
        aria-label={t("cookie.essential.title")}
        className="data-[state=checked]:bg-brand-emerald"
      />
    </div>
  );

  return (
    <PreferenceRow
      title={t("cookie.essential.title")}
      description={t("cookie.essential.description")}
      control={control}
    />
  );
};

type TogglePreferenceProps = {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

const TogglePreference = ({ title, description, checked, onCheckedChange }: TogglePreferenceProps) => (
  <PreferenceRow
    title={title}
    description={description}
    control={
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={title}
        className="shrink-0 data-[state=checked]:bg-primary"
      />
    }
  />
);

type CookiePreferencesPanelProps = {
  t: CookieTranslator;
  functional: boolean;
  analytics: boolean;
  mapping: boolean;
  onFunctionalChange: (checked: boolean) => void;
  onAnalyticsChange: (checked: boolean) => void;
  onMappingChange: (checked: boolean) => void;
};

const CookiePreferencesPanel = ({
  t,
  functional,
  analytics,
  mapping,
  onFunctionalChange,
  onAnalyticsChange,
  onMappingChange,
}: CookiePreferencesPanelProps) => (
  <div
    data-testid="cookie-preferences-panel"
    className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain border-t border-border px-3 pb-3 pt-3 sm:space-y-4 sm:px-5 sm:pb-4 sm:pt-4"
  >
    <EssentialPreference t={t} />
    <TogglePreference
      title={t("cookie.functional.title")}
      description={t("cookie.functional.description")}
      checked={functional}
      onCheckedChange={onFunctionalChange}
    />
    <TogglePreference
      title={t("cookie.analytics.title")}
      description={t("cookie.analytics.description")}
      checked={analytics}
      onCheckedChange={onAnalyticsChange}
    />
    <TogglePreference
      title={t("cookie.mapping.title")}
      description={t("cookie.mapping.description")}
      checked={mapping}
      onCheckedChange={onMappingChange}
    />
  </div>
);

type CookieActionRowProps = {
  t: CookieTranslator;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRejectAll: () => void;
  onSavePreferences: () => void;
  onAcceptAll: () => void;
};

const PreferencesToggle = ({
  t,
  expanded,
  onToggleExpanded,
}: Pick<CookieActionRowProps, "t" | "expanded" | "onToggleExpanded">) => {
  const Icon = expanded ? ChevronUp : ChevronDown;

  return (
    <button
      onClick={onToggleExpanded}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {expanded ? t("cookie.hidePreferences") : t("cookie.managePreferences")}
    </button>
  );
};

const CookieActions = ({
  t,
  expanded,
  onRejectAll,
  onSavePreferences,
  onAcceptAll,
}: Omit<CookieActionRowProps, "onToggleExpanded">) => (
  <div className="grid w-full grid-cols-1 gap-1.5 min-[360px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2">
    <Button size="sm" variant="outline" className="h-8 w-full text-xs border-border sm:w-auto" onClick={onRejectAll}>
      {t("cookie.rejectOptional")}
    </Button>
    {expanded && (
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-full text-xs border-primary/40 text-primary hover:bg-primary/10 sm:w-auto"
        onClick={onSavePreferences}
      >
        <Check className="w-3 h-3 mr-1" aria-hidden="true" /> {t("cookie.savePreferences")}
      </Button>
    )}
    <Button
      size="sm"
      className="h-8 w-full text-xs bg-gradient-primary border-0 text-primary-foreground font-semibold sm:w-auto"
      onClick={onAcceptAll}
    >
      {t("cookie.acceptAll")}
    </Button>
  </div>
);

const CookieActionRow = ({
  t,
  expanded,
  onToggleExpanded,
  onRejectAll,
  onSavePreferences,
  onAcceptAll,
}: CookieActionRowProps) => (
  <div
    data-testid="cookie-actions"
    className="flex shrink-0 flex-col items-stretch gap-2 border-t border-border bg-secondary/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-4"
  >
    <PreferencesToggle t={t} expanded={expanded} onToggleExpanded={onToggleExpanded} />
    <CookieActions
      t={t}
      expanded={expanded}
      onRejectAll={onRejectAll}
      onSavePreferences={onSavePreferences}
      onAcceptAll={onAcceptAll}
    />
  </div>
);

export const CookieConsentBanner = () => {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [functional, setFunctional] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [mapping, setMapping] = useState(true);

  useEffect(() => {
    const existing = getCookieConsent();
    if (!existing) {
      // Show after a short delay so it doesn't flash immediately.
      const timeout = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timeout);
    }
  }, []);

  const { t } = useTranslation();

  if (!visible) return null;

  const save = (consent: CookieConsent) => {
    saveCookieConsent(consent);
    window.dispatchEvent(new Event("maiprop_consent_updated"));
    setVisible(false);
  };

  const handleAcceptAll = () =>
    save({ accepted: true, functional: true, analytics: true, mapping: true, timestamp: Date.now() });

  const handleRejectAll = () =>
    save({ accepted: true, functional: true, analytics: false, mapping: false, timestamp: Date.now() });

  const handleSavePreferences = () =>
    save({ accepted: true, functional, analytics, mapping, timestamp: Date.now() });

  // skipcq: JS-0415 - The banner shell delegates header, preferences, and actions to leaf components.
  return (
    <div
      data-testid="cookie-consent-banner"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+4rem)] left-2 right-2 z-[100] flex max-h-[calc(100svh-5rem)] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-elevated animate-cookie-banner-up sm:bottom-4 sm:left-4 sm:right-4 sm:mx-auto sm:max-h-[80vh] sm:max-w-4xl sm:rounded-2xl"
    >
      <CookieBannerHeader t={t} onDismiss={() => setVisible(false)} />
      {expanded && (
        <CookiePreferencesPanel
          t={t}
          functional={functional}
          analytics={analytics}
          mapping={mapping}
          onFunctionalChange={setFunctional}
          onAnalyticsChange={setAnalytics}
          onMappingChange={setMapping}
        />
      )}
      <CookieActionRow
        t={t}
        expanded={expanded}
        onToggleExpanded={() => setExpanded(expanded => !expanded)}
        onRejectAll={handleRejectAll}
        onSavePreferences={handleSavePreferences}
        onAcceptAll={handleAcceptAll}
      />
    </div>
  );
};
