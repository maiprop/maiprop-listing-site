/**
 * ai-translate
 * ─────────────────────────────────────────────────────────────────────────────
 * Translates a flat key→value JSON object from English into any target language
 * using OpenAI (fast, cheap, excellent for UI strings).
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

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  hasAIProviderCredentials,
  openAIChatCompletion,
  readOpenAITextContent,
} from "../_shared/openai.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("ai-translate");

const ALLOWED_ORIGINS = [
  "https://maiprop.co",
  "https://www.maiprop.co",
  "https://app.maiprop.co",
  "https://portal.maiprop.co",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:8083",
  "http://localhost:5173",
  "http://localhost:3000",
];

const LOCALE_NAMES: Record<string, string> = {
  fr: "French",
  de: "German",
  ar: "Arabic",
  zh: "Simplified Chinese",
  ru: "Russian",
  tr: "Turkish",
  it: "Italian",
  es: "Spanish",
  pt: "Portuguese",
  nl: "Dutch",
  pl: "Polish",
  ro: "Romanian",
  bg: "Bulgarian",
  cs: "Czech",
  hu: "Hungarian",
  sk: "Slovak",
  hr: "Croatian",
  sr: "Serbian",
  uk: "Ukrainian",
  he: "Hebrew",
  ja: "Japanese",
  ko: "Korean",
};

// Static locales never need AI translation
const STATIC_LOCALES = new Set(["en", "el"]);
const MAX_TRANSLATION_KEYS = 500;
const MAX_TRANSLATION_CHARS = 50_000;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Rate limit: 10 req/min per IP — cross-region, DB-backed.
// The previous in-memory Map was per-isolate and would let the same IP burst
// 10 × N regions / minute (audit BUG F).
const translateLimiter = makeRateLimiter({
  bucket: "ai-translate",
  maxRequests: 10,
  windowMs: 60_000,
  failClosed: true,
});

function jsonError(
  error: string,
  status: number,
  hdrs: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...hdrs, "Content-Type": "application/json" },
  });
}

async function requireAuthenticatedUser(
  req: Request,
  hdrs: Record<string, string>,
): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return jsonError("Authentication required for AI translation", 401, hdrs);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return jsonError("Translation auth service not configured", 503, hdrs);
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return jsonError("Authentication required for AI translation", 401, hdrs);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return jsonError("Invalid or expired token", 401, hdrs);
  }
  return null;
}

Deno.serve(async (req) => {
  const hdrs = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: hdrs });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  let body: { locale?: string; strings?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  const { locale, strings } = body;

  if (!locale || typeof locale !== "string") {
    return new Response(JSON.stringify({ error: "locale is required" }), {
      status: 400,
      headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  if (STATIC_LOCALES.has(locale)) {
    // Passthrough: en/el bundles ship statically, no AI translation needed.
    // We still return 200 with the original strings so the caller can use a
    // single code-path for every locale ("ask the API for the translation,
    // get back what it should render"), instead of having to special-case
    // static locales on the client.
    return new Response(
      JSON.stringify({ locale, strings: strings ?? {} }),
      { status: 200, headers: { ...hdrs, "Content-Type": "application/json" } },
    );
  }

  const targetLanguage = LOCALE_NAMES[locale];
  if (!targetLanguage) {
    return new Response(
      JSON.stringify({ error: `Unsupported locale: ${locale}` }),
      {
        status: 400,
        headers: { ...hdrs, "Content-Type": "application/json" },
      },
    );
  }

  if (
    !strings || typeof strings !== "object" || Object.keys(strings).length === 0
  ) {
    return new Response(
      JSON.stringify({ error: "strings must be a non-empty object" }),
      {
        status: 400,
        headers: { ...hdrs, "Content-Type": "application/json" },
      },
    );
  }

  const authError = await requireAuthenticatedUser(req, hdrs);
  if (authError) return authError;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  if (await translateLimiter.isLimited(ip)) {
    return tooManyRequestsResponse(hdrs);
  }

  const entries = Object.entries(strings);
  if (entries.length > MAX_TRANSLATION_KEYS) {
    return jsonError(
      `Too many strings; maximum is ${MAX_TRANSLATION_KEYS}`,
      413,
      hdrs,
    );
  }
  const totalChars = entries.reduce(
    (sum, [key, value]) => sum + key.length + String(value).length,
    0,
  );
  if (totalChars > MAX_TRANSLATION_CHARS) {
    return jsonError(
      `Translation payload too large; maximum is ${MAX_TRANSLATION_CHARS} characters`,
      413,
      hdrs,
    );
  }
  const inputJson = JSON.stringify(Object.fromEntries(entries), null, 2);

  if (!hasAIProviderCredentials()) {
    return new Response(
      JSON.stringify({ error: "Translation service not configured" }),
      {
        status: 503,
        headers: { ...hdrs, "Content-Type": "application/json" },
      },
    );
  }

  const prompt =
    `You are a professional translator for a Greek real estate SaaS platform called maiProp.

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
    const response = await openAIChatCompletion({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 4096,
    }, Deno.env.get("OPENAI_TRANSLATION_MODEL") ?? "gpt-4.1-mini");

    if (!response.ok) {
      const err = await response.text();
      log.error("AI provider API error", {
        status: response.status,
        body: err?.slice(0, 500),
      });
      return new Response(
        JSON.stringify({
          error: "Translation API error",
          detail: response.status,
        }),
        {
          status: 502,
          headers: { ...hdrs, "Content-Type": "application/json" },
        },
      );
    }

    const payload = await response.json();
    const raw = readOpenAITextContent(payload);

    // Parse the JSON — strip any accidental markdown fences
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "")
      .trim();
    let translated: Record<string, string>;
    try {
      translated = JSON.parse(cleaned);
    } catch {
      log.error("failed to parse AI provider output", {
        sample: cleaned.slice(0, 200),
      });
      return new Response(
        JSON.stringify({
          error: "Translation parsing failed",
        }),
        {
          status: 502,
          headers: { ...hdrs, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ locale, strings: translated }),
      { headers: { ...hdrs, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("translate error", { err: msg });
    return new Response(JSON.stringify({ error: "Translation failed" }), {
      status: 500,
      headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }
});
