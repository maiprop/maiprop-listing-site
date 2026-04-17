/**
 * LanguageSwitcher — globe icon dropdown in the Navbar.
 *
 * Static locales (English, Greek) switch instantly.
 * Other locales trigger AI translation via the ai-translate edge function
 * and show a spinner while loading. Translations are cached in sessionStorage.
 */

import { useState } from "react";
import { Globe, Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { STATIC_LOCALES } from "@/hooks/useAiTranslation";

const STATIC_LOCALE_LIST = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "el", label: "Ελληνικά", flag: "🇬🇷" },
];

const AI_LOCALE_LIST = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
];

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [pendingLocale, setPendingLocale] = useState<string | null>(null);

  const currentLocale = i18n.language?.slice(0, 2) ?? "en";
  const isTranslating = pendingLocale !== null;

  const switchLocale = async (code: string) => {
    if (code === currentLocale) return;

    if (STATIC_LOCALES.includes(code)) {
      i18n.changeLanguage(code);
      return;
    }

    // AI locale — check if already cached/loaded
    if (i18n.hasResourceBundle(code, "translation")) {
      i18n.changeLanguage(code);
      return;
    }

    setPendingLocale(code);
    // changeLanguage triggers useAiTranslation effect via locale change
    await i18n.changeLanguage(code);
    // Explicitly persist — guards against async timing with the bundle load
    try { localStorage.setItem("maiprop_lang", code); } catch (_e: unknown) { /* quota */ }
    setPendingLocale(null);
  };

  const currentFlag =
    STATIC_LOCALE_LIST.find((l) => l.code === currentLocale)?.flag ??
    AI_LOCALE_LIST.find((l) => l.code === currentLocale)?.flag ??
    "🌐";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          aria-label={t("language.select")}
        >
          {isTranslating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Globe className="w-4 h-4" />
          )}
          <span className="text-sm hidden sm:inline">{currentFlag}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal uppercase tracking-wider">
          {t("language.select")}
        </DropdownMenuLabel>

        {/* Static locales */}
        {STATIC_LOCALE_LIST.map(({ code, label, flag }) => (
          <DropdownMenuItem
            key={code}
            onClick={() => switchLocale(code)}
            className="flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span>{flag}</span>
              <span>{label}</span>
            </span>
            {currentLocale === code && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* AI-translated locales */}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center gap-1 pb-1">
          <span>✨</span> {t("language.translatedBy")}
        </DropdownMenuLabel>

        {AI_LOCALE_LIST.map(({ code, label, flag }) => (
          <DropdownMenuItem
            key={code}
            onClick={() => switchLocale(code)}
            className="flex items-center justify-between gap-2 cursor-pointer"
            disabled={pendingLocale === code}
          >
            <span className="flex items-center gap-2">
              <span>{flag}</span>
              <span>{label}</span>
              {pendingLocale === code && (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              )}
            </span>
            {currentLocale === code && !pendingLocale && (
              <Check className="w-3.5 h-3.5 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
