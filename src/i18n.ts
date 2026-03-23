/**
 * i18n configuration for maiProp.
 *
 * Static locales: "en" (English) and "el" (Greek).
 * Other locales are translated on-demand via the ai-translate edge function
 * and cached in sessionStorage to avoid repeat API calls.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "@/locales/en.json";
import el from "@/locales/el.json";

export const STATIC_LOCALES = ["en", "el"] as const;
export type StaticLocale = (typeof STATIC_LOCALES)[number];

export const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  el: "Ελληνικά",
  fr: "Français",
  de: "Deutsch",
  ar: "العربية",
  zh: "中文",
  ru: "Русский",
  tr: "Türkçe",
  it: "Italiano",
  es: "Español",
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      el: { translation: el },
    },
    fallbackLng: "en",
    defaultNS: "translation",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "maiprop_lang",
    },
  });

export default i18n;
