/**
 * useAiTranslation — fetches AI-translated strings for non-static locales
 * and loads them into i18next at runtime.
 *
 * Translations are cached in localStorage (persists across sessions) with
 * LRU eviction to stay within the 5 MB quota. Static locales ("en", "el")
 * are skipped — they're bundled as JSON.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
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

/** djb2 hash of source strings — cache auto-invalidates when en.json changes. */
function hashSource(obj: Record<string, string>): string {
  const str = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
const EN_HASH = hashSource(FLAT_EN);

const I18N_PREFIX = "maiprop_i18n_";
const MAX_CACHED_LOCALES = 10;

/** Evict oldest cached locale when we exceed the limit. */
function evictOldestLocale(): void {
  try {
    const entries: { key: string; ts: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(I18N_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { ts?: number };
        entries.push({ key, ts: parsed.ts ?? 0 });
      } catch { entries.push({ key, ts: 0 }); }
    }
    if (entries.length < MAX_CACHED_LOCALES) return;
    entries.sort((a, b) => a.ts - b.ts);
    const toRemove = entries.slice(0, entries.length - MAX_CACHED_LOCALES + 1);
    for (const { key } of toRemove) localStorage.removeItem(key);
  } catch { /* storage unavailable */ }
}

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

    // Check localStorage cache (persists across sessions)
    const cacheKey = `${I18N_PREFIX}${EN_HASH}_${locale}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { strings: Record<string, string>; ts: number; v?: string };
        if (parsed.strings && parsed.v === EN_HASH) {
          i18n.addResourceBundle(locale, "translation", parsed.strings, true, true);
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ ...parsed, ts: Date.now() }));
          } catch { /* quota full — cache entry remains valid */ }
          setStatus("ready");
          return;
        }
      } catch (_err: unknown) {
        localStorage.removeItem(cacheKey);
      }
    }

    // Fetch from AI edge function. Non-static AI generation is authenticated
    // server-side, so anonymous visitors keep the fallback language instead of
    // burning an unauthenticated 401 on every locale change.
    setStatus("loading");
    setError(null);

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!data.session) {
          setError("Sign in to generate AI translations");
          setStatus("ready");
          return null;
        }
        return supabase.functions.invoke("ai-translate", {
          body: { locale, strings: FLAT_EN },
        });
      })
      .then((result) => {
        if (!result) return;
        const { data, error: fnErr } = result;
        if (fnErr || !data?.strings) {
          logger.warn("ai-translate error:", fnErr ?? "no strings returned");
          setError("Translation unavailable");
          setStatus("error");
          return;
        }
        const strings = data.strings as Record<string, string>;
        i18n.addResourceBundle(locale, "translation", strings, true, true);
        try {
          evictOldestLocale();
          localStorage.setItem(cacheKey, JSON.stringify({ strings, ts: Date.now(), v: EN_HASH }));
        } catch (_err: unknown) { /* quota full */ }
        setStatus("ready");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Unknown error";
        logger.warn("ai-translate fetch failed:", msg);
        setError(msg);
        setStatus("error");
      });
  }, [locale, i18n]);

  return { status, error, locale };
}
