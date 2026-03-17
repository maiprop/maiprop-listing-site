import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "el", label: "Ελληνικά", flag: "🇬🇷" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "hi", label: "हिन्दी", flag: "🇮🇳" },
  { code: "he", label: "עברית", flag: "🇮🇱" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
];

interface TranslationContextType {
  language: string;
  setLanguage: (lang: string) => void;
  t: (text: string) => string;
  isTranslating: boolean;
}

const TranslationContext = createContext<TranslationContextType>({
  language: "en",
  setLanguage: () => {},
  t: (text) => text,
  isTranslating: false,
});

export const useTranslation = () => useContext(TranslationContext);

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState("en");
  const [isTranslating, setIsTranslating] = useState(false);
  // Cache: { [lang]: { [originalText]: translatedText } }
  const cache = useRef<Record<string, Record<string, string>>>({});
  // Queue for batching
  const pendingTexts = useRef<Set<string>>(new Set());
  const batchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceRender] = useState(0);

  const translateBatch = useCallback(async (lang: string, texts: string[]) => {
    if (texts.length === 0) return;
    setIsTranslating(true);
    try {
      const BATCH_SIZE = 50;
      const targetLang = LANGUAGES.find((l) => l.code === lang)?.label || lang;
      if (!cache.current[lang]) cache.current[lang] = {};

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const chunk = texts.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase.functions.invoke("translate", {
          body: { texts: chunk, targetLang },
        });
        if (error) throw error;
        const translated: string[] = data?.translated || chunk;
        chunk.forEach((original, j) => {
          cache.current[lang][original] = translated[j] || original;
        });
      }
      forceRender((n) => n + 1);
    } catch (err) {
      console.error("Translation error:", err);
      toast.error("Translation failed. Showing original text.");
    } finally {
      setIsTranslating(false);
    }
  }, []);

  const setLanguage = useCallback(
    (lang: string) => {
      setLanguageState(lang);

      // Set RTL direction for Arabic
      document.documentElement.dir = (lang === "ar" || lang === "he") ? "rtl" : "ltr";
      document.documentElement.lang = lang;

      if (lang === "en") return;

      // Collect all registered texts that aren't cached yet
      const uncached = Array.from(pendingTexts.current).filter(
        (text) => !cache.current[lang]?.[text]
      );
      if (uncached.length > 0) {
        translateBatch(lang, uncached);
      } else {
        forceRender((n) => n + 1);
      }
    },
    [translateBatch]
  );

  const t = useCallback(
    (text: string): string => {
      if (language === "en") return text;
      // Register text for future batch translation
      pendingTexts.current.add(text);
      // Return cached translation or original
      return cache.current[language]?.[text] || text;
    },
    [language]
  );

  // When language changes and we encounter un-cached texts via t(), batch them
  // We use an effect-like approach: after render, check for uncached texts
  React.useEffect(() => {
    if (language === "en") return;
    const uncached = Array.from(pendingTexts.current).filter(
      (text) => !cache.current[language]?.[text]
    );
    if (uncached.length > 0) {
      if (batchTimeout.current) clearTimeout(batchTimeout.current);
      batchTimeout.current = setTimeout(() => {
        translateBatch(language, uncached);
      }, 100);
    }
  }, [language, translateBatch]);

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t, isTranslating }}>
      {children}
    </TranslationContext.Provider>
  );
};
