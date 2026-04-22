/**
 * ai-translate
 * ─────────────────────────────────────────────────────────────────────────────
 * Translates a flat key→value JSON object from English into any target language
 * using Claude claude-haiku-4-5-20251001 (fast, cheap, excellent for UI strings).
 *
 * Request body:
 *   { locale: "fr", strings: { "nav.listings": "Listings", ... } }
 *
 * Response:
 *   { locale: "fr", strings: { "nav.listings": "Annonces", ... } }
 *
 * verify_jwt = false — called from the browser without auth headers.
 * Rate limited: 10 req/min per IP (translation is expensive).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = [
  "https://maiprop.co", "https://www.maiprop.co", "https://app.maiprop.co", "https://portal.maiprop.co",
  "http://localhost:8080", "http://localhost:8081", "http://localhost:8082",
  "http://localhost:8083", "http://localhost:5173", "http://localhost:3000",
];

const LOCALE_NAMES: Record<string, string> = {
  fr: "French", de: "German", ar: "Arabic", zh: "Simplified Chinese",
  ru: "Russian", tr: "Turkish", it: "Italian", es: "Spanish",
  pt: "Portuguese", nl: "Dutch", pl: "Polish", ro: "Romanian",
  bg: "Bulgarian", cs: "Czech", hu: "Hungarian", sk: "Slovak",
  hr: "Croatian", sr: "Serbian", uk: "Ukrainian", he: "Hebrew",
  ja: "Japanese", ko: "Korean",
};

// Static locales never need AI translation
const STATIC_LOCALES = new Set(["en", "el"]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Rate limit: 10 req/min per IP
const ipWindows = new Map<string, { count: number; reset: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const w = ipWindows.get(ip);
  if (!w || now > w.reset) { ipWindows.set(ip, { count: 1, reset: now + 60_000 }); return false; }
  if (w.count >= 10) return true;
  w.count++;
  return false;
}

serve(async (req) => {
  const hdrs = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: hdrs });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Max 10 translations/min." }), {
      status: 429, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  let body: { locale?: string; strings?: Record<string, string> };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  const { locale, strings } = body;

  if (!locale || typeof locale !== "string") {
    return new Response(JSON.stringify({ error: "locale is required" }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  if (STATIC_LOCALES.has(locale)) {
    return new Response(JSON.stringify({ error: `${locale} is a static locale — load it from the bundle` }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  const targetLanguage = LOCALE_NAMES[locale];
  if (!targetLanguage) {
    return new Response(JSON.stringify({ error: `Unsupported locale: ${locale}` }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  if (!strings || typeof strings !== "object" || Object.keys(strings).length === 0) {
    return new Response(JSON.stringify({ error: "strings must be a non-empty object" }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  // Limit to 500 keys per request to avoid runaway costs
  const entries = Object.entries(strings).slice(0, 500);
  const inputJson = JSON.stringify(Object.fromEntries(entries), null, 2);

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Translation service not configured" }), {
      status: 503, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  const prompt = `You are a professional translator for a Greek real estate SaaS platform called maiProp.

Translate the following UI strings from English to ${targetLanguage}.

Rules:
- Return ONLY valid JSON, no markdown, no code fences, no explanation
- Preserve every key exactly as-is
- Keep {{variable}} placeholders unchanged (e.g., {{count}}, {{year}}, {{lang}})
- Use natural, professional language appropriate for a property marketplace
- For technical terms (API, Pro, Beta, KYC, NDA, ROI) keep them in English unless there is a widely accepted local equivalent
- Maintain the same tone: professional but approachable

Input:
${inputJson}

Output (JSON only):`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", response.status, err);
      return new Response(JSON.stringify({ error: "Translation API error", detail: response.status }), {
        status: 502, headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    const claude = await response.json();
    const raw = claude.content?.[0]?.text ?? "";

    // Parse the JSON — strip any accidental markdown fences
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    let translated: Record<string, string>;
    try {
      translated = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Claude output:", cleaned.slice(0, 200));
      return new Response(JSON.stringify({ error: "Translation parsing failed", raw: cleaned.slice(0, 500) }), {
        status: 502, headers: { ...hdrs, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ locale, strings: translated }),
      { headers: { ...hdrs, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("ai-translate error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }
});
