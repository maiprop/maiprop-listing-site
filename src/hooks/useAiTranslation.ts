/**
 * useAiTranslation — fetches AI-translated strings for non-static locales
 * and loads them into i18next at runtime.
 *
 * Translations are cached in sessionStorage to avoid repeat API calls.
 * Static locales ("en", "el") are skipped — they're bundled as JSON.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import en from "@/locales/en.json";

export const STATIC_LOCALES = ["en", "el"];

function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [key, val]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "object" && val !== null) {
      Object.assign(acc, flattenObject(val as Record<string, unknown>, fullKey));
    } else {
      acc[fullKey] = String(val);
    }
    return acc;
  }, {});
}

const FLAT_EN = flattenObject(en as Record<string, unknown>);

export type TranslationStatus = "idle" | "loading" | "ready" | "error";

export function useAiTranslation() {
  const { i18n } = useTranslation();
  const [status, setStatus] = useState<TranslationStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const locale = i18n.language?.slice(0, 2) ?? "en";

  useEffect(() => {
    if (STATIC_LOCALES.includes(locale)) {
      setStatus("ready");
      return;
    }

    // Already loaded for this locale?
    if (i18n.hasResourceBundle(locale, "translation")) {
      setStatus("ready");
      return;
    }

    // Check sessionStorage cache
    const cacheKey = `maiprop_i18n_${locale}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Record<string, string>;
        i18n.addResourceBundle(locale, "translation", parsed, true, true);
        setStatus("ready");
        return;
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    // Fetch from AI edge function
    setStatus("loading");
    setError(null);

    supabase.functions
      .invoke("ai-translate", { body: { locale, strings: FLAT_EN } })
      .then(({ data, error: fnErr }) => {
        if (fnErr || !data?.strings) {
          console.warn("ai-translate error:", fnErr ?? "no strings returned");
          setError("Translation unavailable");
          setStatus("error");
          return;
        }
        const strings = data.strings as Record<string, string>;
        i18n.addResourceBundle(locale, "translation", strings, true, true);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(strings)); } catch { /* quota full */ }
        setStatus("ready");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.warn("ai-translate fetch failed:", msg);
        setError(msg);
        setStatus("error");
      });
  }, [locale, i18n]);

  return { status, error, locale };
}
