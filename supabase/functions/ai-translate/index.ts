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
  readOpenAITextContent,
} from "../_shared/openai.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import {
  mapConcurrentFailClosed,
  TranslationDeadlineError,
} from "./translationPipeline.ts";

const log = createLogger("ai-translate");
const AI_TRANSLATE_BUCKET = "ai-translate";
const MAX_REQUEST_BODY_BYTES = 192 * 1_024;
const MAX_PROVIDER_OUTPUT_TOKENS = 8_192;
const MAX_PROVIDER_RESPONSE_BODY_BYTES = 256 * 1_024;
const MAX_TRANSLATED_OUTPUT_BYTES = 64 * 1_024;
const MAX_PROVIDER_CHUNKS = 64;
const TRANSLATION_PROVIDER_CONCURRENCY = 8;
const DEFAULT_TRANSLATION_REQUEST_DEADLINE_MS = 110_000;
const DEFAULT_TRANSLATION_PROVIDER_TIMEOUT_MS = 25_000;
const TEST_TRANSLATION_REQUEST_DEADLINE_MS = 500;
const TEST_TRANSLATION_PROVIDER_TIMEOUT_MS = 40;
const PROVIDER_OUTPUT_JSON_HEADROOM_BYTES = 64;
const MIN_PROVIDER_VALUE_EXPANSION_BYTES = 8;
const textEncoder = new TextEncoder();
const edgeTestMode = Deno.env.get("MAIPROP_EDGE_TEST_AUTH_BYPASS") === "true";
const TRANSLATION_REQUEST_DEADLINE_MS = edgeTestMode
  ? TEST_TRANSLATION_REQUEST_DEADLINE_MS
  : DEFAULT_TRANSLATION_REQUEST_DEADLINE_MS;
const TRANSLATION_PROVIDER_TIMEOUT_MS = edgeTestMode
  ? TEST_TRANSLATION_PROVIDER_TIMEOUT_MS
  : DEFAULT_TRANSLATION_PROVIDER_TIMEOUT_MS;

const STATIC_LOCALES = new Set(["en", "el"]);

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

const MAX_TRANSLATION_KEYS = 2_500;
const MAX_TRANSLATION_JSON_CHARS = 200_000;
const MAX_TRANSLATION_KEY_CHARS = 200;
const MAX_TRANSLATION_VALUE_CHARS = 10_000;

function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

// A text token always consumes at least one UTF-8 byte. This byte estimate is
// therefore a provider-neutral token upper bound while allowing each value to
// expand to roughly twice its serialized source size.
function providerOutputTokenBudget(strings: Record<string, string>): number {
  const compactJsonBytes = utf8ByteLength(JSON.stringify(strings));
  const valueExpansionBytes = Object.values(strings).reduce(
    (total, value) =>
      total + Math.max(
        utf8ByteLength(JSON.stringify(value)),
        MIN_PROVIDER_VALUE_EXPANSION_BYTES,
      ),
    0,
  );
  return PROVIDER_OUTPUT_JSON_HEADROOM_BYTES + compactJsonBytes +
    valueExpansionBytes;
}

const translationStringsSchema = z.record(
  z.string().min(1).max(MAX_TRANSLATION_KEY_CHARS),
  z.string().max(MAX_TRANSLATION_VALUE_CHARS),
).superRefine((strings, ctx) => {
  const keyCount = Object.keys(strings).length;
  if (keyCount === 0) {
    ctx.addIssue({
      code: "custom",
      path: [],
      message: "strings must be a non-empty object",
    });
  }
  if (keyCount > MAX_TRANSLATION_KEYS) {
    ctx.addIssue({
      code: "custom",
      path: [],
      message: `Too many strings; maximum is ${MAX_TRANSLATION_KEYS}`,
    });
  }
  if (JSON.stringify(strings, null, 2).length > MAX_TRANSLATION_JSON_CHARS) {
    ctx.addIssue({
      code: "custom",
      path: [],
      message:
        `Translation payload too large; maximum is ${MAX_TRANSLATION_JSON_CHARS} characters`,
    });
  }
  for (const [key, value] of Object.entries(strings)) {
    if (key.trim() !== key) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message:
          "Translation keys must not have leading or trailing whitespace",
      });
    }
    if (
      providerOutputTokenBudget({ [key]: value }) >
        MAX_PROVIDER_OUTPUT_TOKENS
    ) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: "String is too large for one translation provider request",
      });
    }
  }
});
const translationRequestSchema = z.object({
  locale: z.string()
    .min(2, "locale is required")
    .max(5, "Unsupported locale")
    .refine(
      (locale) =>
        STATIC_LOCALES.has(locale) || Object.hasOwn(LOCALE_NAMES, locale),
      "Unsupported locale",
    ),
  strings: translationStringsSchema,
}).strict();

function chunkTranslationStrings(
  strings: Record<string, string>,
): Array<Record<string, string>> {
  const sortedEntries = Object.entries(strings).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  const chunks: Array<Record<string, string>> = [];
  let currentEntries: Array<[string, string]> = [];

  for (const entry of sortedEntries) {
    const candidateEntries = [...currentEntries, entry];
    const candidate = Object.fromEntries(candidateEntries);
    if (
      currentEntries.length > 0 &&
      providerOutputTokenBudget(candidate) > MAX_PROVIDER_OUTPUT_TOKENS
    ) {
      chunks.push(Object.fromEntries(currentEntries));
      currentEntries = [entry];
    } else {
      currentEntries = candidateEntries;
    }
  }

  if (currentEntries.length > 0) {
    chunks.push(Object.fromEntries(currentEntries));
  }
  return chunks;
}

function validateTranslationObject(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== expectedKeys.length) return null;

  const validatedEntries: Array<[string, string]> = [];
  for (const key of expectedKeys) {
    if (
      !Object.hasOwn(candidate, key) ||
      typeof candidate[key] !== "string" ||
      candidate[key].trim().length === 0
    ) {
      return null;
    }
    validatedEntries.push([key, candidate[key]]);
  }
  return Object.fromEntries(validatedEntries);
}

class TranslationFailure extends Error {
  constructor(
    readonly publicMessage: string,
    readonly status: number,
    readonly providerStatus?: number,
  ) {
    super(publicMessage);
    this.name = "TranslationFailure";
  }
}

function signalReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Translation aborted", "AbortError");
}

async function awaitWithAbort<T>(
  operation: PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw signalReason(signal);

  let removeAbortListener = () => {};
  const abortPromise = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(signalReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", onAbort);
  });

  try {
    return await Promise.race([Promise.resolve(operation), abortPromise]);
  } finally {
    removeAbortListener();
  }
}

function fetchBoundToSignal(signal: AbortSignal): typeof fetch {
  return (input, init) => {
    const operationSignal =
      (init as { signal?: AbortSignal | null } | undefined)
        ?.signal;
    const combinedSignal = operationSignal && operationSignal !== signal
      ? AbortSignal.any([signal, operationSignal])
      : signal;
    return globalThis.fetch(input, { ...init, signal: combinedSignal });
  };
}

type ProviderHttpResponse = {
  ok: boolean;
  status: number;
  bodyText: string;
};

async function readBoundedProviderBody(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > MAX_PROVIDER_RESPONSE_BODY_BYTES
  ) {
    await response.body?.cancel("provider response body too large").catch(
      () => {},
    );
    throw new TranslationFailure("Translation API response too large", 502);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const onAbort = () => {
    void reader.cancel(signalReason(signal)).catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      const { done, value } = await awaitWithAbort(reader.read(), signal);
      if (signal.aborted) throw signalReason(signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PROVIDER_RESPONSE_BODY_BYTES) {
        await reader.cancel("provider response body too large").catch(() => {});
        throw new TranslationFailure("Translation API response too large", 502);
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function usesOpenAICompletionTokenLimit(model: string): boolean {
  return /^(o[1-9]|o\d|gpt-5)(?:[.-]|$)/i.test(model);
}

function supportsDisabledOpenAIReasoning(model: string): boolean {
  const match = /^gpt-5\.(\d+)(?:[.-]|$)/i.exec(model);
  if (!match || /-(?:chat|codex|pro)(?:[.-]|$)/i.test(model)) return false;
  return Number(match[1]) >= 1;
}

function supportsDisabledGeminiThinking(model: string): boolean {
  return /^gemini-2\.5-flash(?:$|-(?:lite|preview|\d))/i.test(model);
}

async function fetchProviderWithTimeout(
  url: string,
  init: RequestInit,
  requestSignal: AbortSignal,
): Promise<ProviderHttpResponse> {
  if (requestSignal.aborted) throw signalReason(requestSignal);

  const controller = new AbortController();
  const timeoutError = new TranslationFailure(
    "Translation provider timed out",
    504,
  );
  const onRequestAbort = () => controller.abort(signalReason(requestSignal));
  requestSignal.addEventListener("abort", onRequestAbort, { once: true });
  const timeout = setTimeout(
    () => controller.abort(timeoutError),
    TRANSLATION_PROVIDER_TIMEOUT_MS,
  );

  try {
    const response = await awaitWithAbort(
      fetch(url, { ...init, signal: controller.signal }),
      controller.signal,
    );
    const bodyText = await readBoundedProviderBody(
      response,
      controller.signal,
    );
    return { ok: response.ok, status: response.status, bodyText };
  } catch (error) {
    if (controller.signal.aborted) {
      throw controller.signal.reason ?? error;
    }
    if (error instanceof TranslationFailure) throw error;
    throw new TranslationFailure("Translation API error", 502);
  } finally {
    clearTimeout(timeout);
    requestSignal.removeEventListener("abort", onRequestAbort);
  }
}

async function requestTranslationCompletion(
  prompt: string,
  maxOutputTokens: number,
  signal: AbortSignal,
): Promise<ProviderHttpResponse> {
  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  if (openAIKey) {
    const model = Deno.env.get("OPENAI_TRANSLATION_MODEL") ?? "gpt-5.4-mini";
    const tokenLimit = usesOpenAICompletionTokenLimit(model)
      ? { max_completion_tokens: maxOutputTokens }
      : { max_tokens: maxOutputTokens };
    return await fetchProviderWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAIKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          ...(!usesOpenAICompletionTokenLimit(model)
            ? { temperature: 0.2 }
            : {}),
          ...(supportsDisabledOpenAIReasoning(model)
            ? { reasoning_effort: "none" }
            : {}),
          response_format: { type: "json_object" },
          ...tokenLimit,
        }),
      },
      signal,
    );
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    throw new TranslationFailure("Translation service not configured", 503);
  }
  const model = Deno.env.get("GEMINI_TRANSLATION_MODEL") ??
    Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens,
    responseMimeType: "application/json",
    ...(supportsDisabledGeminiThinking(model)
      ? { thinkingConfig: { thinkingBudget: 0 } }
      : {}),
  };

  return await fetchProviderWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": geminiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
    },
    signal,
  );
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

function buildTranslationPrompt(
  chunk: Record<string, string>,
  targetLanguage: string,
): string {
  return `You are a professional translator for a Greek real estate SaaS platform called maiProp.

Translate the following UI strings from English to ${targetLanguage}.

Rules:
- Return ONLY one compact valid JSON object, no markdown, no code fences, no explanation
- Preserve every key exactly as-is
- Keep {{variable}} placeholders unchanged (e.g., {{count}}, {{year}}, {{lang}})
- Use natural, professional language appropriate for a property marketplace
- For technical terms (API, Pro, Beta, KYC, NDA, ROI) keep them in English unless there is a widely accepted local equivalent
- Maintain the same tone: professional but approachable

Input:
${JSON.stringify(chunk)}

Output (JSON only):`;
}

async function translateChunk(
  chunk: Record<string, string>,
  targetLanguage: string,
  signal: AbortSignal,
): Promise<Record<string, string>> {
  const outputTokenBudget = providerOutputTokenBudget(chunk);
  const response = await requestTranslationCompletion(
    buildTranslationPrompt(chunk, targetLanguage),
    outputTokenBudget,
    signal,
  );

  if (!response.ok) {
    log.error("AI provider API error", {
      status: response.status,
      body: response.bodyText.slice(0, 500),
    });
    throw new TranslationFailure(
      "Translation API error",
      502,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(response.bodyText);
  } catch {
    throw new TranslationFailure("Translation parsing failed", 502);
  }
  const raw = readOpenAITextContent(payload);

  if (utf8ByteLength(raw) > MAX_TRANSLATED_OUTPUT_BYTES) {
    log.error("AI provider output exceeded translation budget", {
      output_bytes: utf8ByteLength(raw),
      output_byte_budget: MAX_TRANSLATED_OUTPUT_BYTES,
    });
    throw new TranslationFailure("Translation output exceeded budget", 502);
  }

  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "")
    .trim();
  let parsedTranslation: unknown;
  try {
    parsedTranslation = JSON.parse(cleaned);
  } catch {
    log.error("failed to parse AI provider output", {
      sample: cleaned.slice(0, 200),
    });
    throw new TranslationFailure("Translation parsing failed", 502);
  }

  const expectedChunkKeys = Object.keys(chunk);
  const translated = validateTranslationObject(
    parsedTranslation,
    expectedChunkKeys,
  );
  if (!translated) {
    log.error("AI provider output failed translation validation", {
      expected_keys: expectedChunkKeys.length,
      actual_keys: parsedTranslation && typeof parsedTranslation === "object" &&
          !Array.isArray(parsedTranslation)
        ? Object.keys(parsedTranslation).length
        : null,
    });
    throw new TranslationFailure("Translation validation failed", 502);
  }

  return translated;
}

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

function requestTooLargeResponse(hdrs: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "Request body too large",
      code: "request_too_large",
    }),
    {
      status: 413,
      headers: { ...hdrs, "Content-Type": "application/json" },
    },
  );
}

async function readBoundedRequestBody(
  req: Request,
  signal: AbortSignal,
): Promise<ArrayBuffer | null> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES
  ) {
    return null;
  }

  if (!req.body) return new ArrayBuffer(0);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const onAbort = () => {
    void reader.cancel(signalReason(signal)).catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw signalReason(signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        try {
          await reader.cancel("request body too large");
        } catch {
          // The size violation still wins if the producer rejects cancellation.
        }
        return null;
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

function schemaErrorResponse(
  error: SchemaValidationError,
  hdrs: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: error.message,
      code: error.code,
      issues: error.issues,
    }),
    {
      status: 400,
      headers: { ...hdrs, "Content-Type": "application/json" },
    },
  );
}

type QuotaReservation = {
  allowed: boolean;
  reason: string | null;
  used: number;
  limit: number;
};

type ReserveAiQuotaRpc = (
  fn: "reserve_ai_quota_for_user",
  args: { _user_id: string; p_bucket: string },
) => PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>;

function quotaUnavailableResponse(hdrs: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "AI quota service unavailable. Please retry shortly.",
    }),
    {
      status: 503,
      headers: { ...hdrs, "Content-Type": "application/json" },
    },
  );
}

function validQuotaReservation(value: unknown): value is QuotaReservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const quota = value as Record<string, unknown>;
  return typeof quota.allowed === "boolean" &&
    (quota.reason === null || typeof quota.reason === "string") &&
    typeof quota.used === "number" && Number.isFinite(quota.used) &&
    typeof quota.limit === "number" && Number.isFinite(quota.limit);
}

async function reserveTranslationQuota(
  userId: string,
  hdrs: Record<string, string>,
  signal: AbortSignal,
): Promise<Response | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    log.error("AI quota service is not configured");
    return quotaUnavailableResponse(hdrs);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchBoundToSignal(signal) },
  });
  const reserveQuota = supabase.rpc.bind(
    supabase,
  ) as unknown as ReserveAiQuotaRpc;
  const { data, error } = await awaitWithAbort(
    reserveQuota("reserve_ai_quota_for_user", {
      _user_id: userId,
      p_bucket: AI_TRANSLATE_BUCKET,
    }),
    signal,
  );

  if (error || !validQuotaReservation(data)) {
    log.error("AI quota reservation failed", {
      error: error?.message ?? "invalid quota response",
    });
    return quotaUnavailableResponse(hdrs);
  }
  if (data.allowed) return null;

  const reason = data.reason ?? "monthly_limit_reached";
  return new Response(
    JSON.stringify({
      error: reason === "plan_does_not_include_feature"
        ? "This AI feature is not included in your plan. Please upgrade."
        : "Monthly AI usage limit reached. Resets on the 1st of next month.",
      reason,
      used: data.used,
      limit: data.limit,
    }),
    {
      status: reason === "plan_does_not_include_feature" ? 402 : 429,
      headers: { ...hdrs, "Content-Type": "application/json" },
    },
  );
}

async function requireAuthenticatedUser( // skipcq: JS-R1005 - Auth parsing must cover missing, malformed, invalid, and valid bearer token states.
  req: Request,
  hdrs: Record<string, string>,
  signal: AbortSignal,
): Promise<{ userId: string | null; errorResponse: Response | null }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return {
      userId: null,
      errorResponse: jsonError(
        "Authentication required for AI translation",
        401,
        hdrs,
      ),
    };
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return {
      userId: null,
      errorResponse: jsonError(
        "Translation auth service not configured",
        503,
        hdrs,
      ),
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      userId: null,
      errorResponse: jsonError(
        "Authentication required for AI translation",
        401,
        hdrs,
      ),
    };
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: authHeader },
      fetch: fetchBoundToSignal(signal),
    },
  });
  const { data, error } = await awaitWithAbort(
    supabase.auth.getUser(token),
    signal,
  );
  if (error || !data.user) {
    return {
      userId: null,
      errorResponse: jsonError("Invalid or expired token", 401, hdrs),
    };
  }
  return { userId: data.user.id, errorResponse: null };
}

function createRequestDeadline(upstreamSignal: AbortSignal): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const onUpstreamAbort = () => controller.abort(signalReason(upstreamSignal));
  if (upstreamSignal.aborted) {
    onUpstreamAbort();
  } else {
    upstreamSignal.addEventListener("abort", onUpstreamAbort, { once: true });
  }
  const deadlineTimer = setTimeout(
    () => controller.abort(new TranslationDeadlineError()),
    TRANSLATION_REQUEST_DEADLINE_MS,
  );
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(deadlineTimer);
      upstreamSignal.removeEventListener("abort", onUpstreamAbort);
    },
  };
}

async function handleTranslationRequest(
  req: Request,
  hdrs: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  const rawBody = await readBoundedRequestBody(req, signal);
  if (!rawBody) return requestTooLargeResponse(hdrs);
  const parseRequest = new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: rawBody,
    signal,
  });

  let body: z.infer<typeof translationRequestSchema>;
  try {
    body = await parseJsonBody(parseRequest, translationRequestSchema);
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      return schemaErrorResponse(error, hdrs);
    }
    throw error;
  }

  const { locale, strings } = body;
  if (STATIC_LOCALES.has(locale)) {
    return new Response(
      JSON.stringify({ locale, strings }),
      { headers: { ...hdrs, "Content-Type": "application/json" } },
    );
  }

  const targetLanguage = LOCALE_NAMES[locale];
  if (!targetLanguage) {
    return jsonError(`Unsupported locale: ${locale}`, 400, hdrs);
  }
  const chunks = chunkTranslationStrings(strings);
  if (chunks.length > MAX_PROVIDER_CHUNKS) {
    return jsonError(
      `Translation payload requires too many provider requests; maximum is ${MAX_PROVIDER_CHUNKS}`,
      400,
      hdrs,
    );
  }

  const auth = await requireAuthenticatedUser(req, hdrs, signal);
  if (auth.errorResponse) return auth.errorResponse;
  if (!auth.userId) {
    return jsonError("Translation authentication failed", 500, hdrs);
  }

  const rateLimitKey = `user:${auth.userId}`;
  if (await awaitWithAbort(translateLimiter.isLimited(rateLimitKey), signal)) {
    return tooManyRequestsResponse(hdrs);
  }

  if (!hasAIProviderCredentials()) {
    return new Response(
      JSON.stringify({ error: "Translation service not configured" }),
      {
        status: 503,
        headers: { ...hdrs, "Content-Type": "application/json" },
      },
    );
  }

  const quotaError = await reserveTranslationQuota(auth.userId, hdrs, signal);
  if (quotaError) return quotaError;

  const translatedChunks = await mapConcurrentFailClosed({
    items: chunks,
    concurrency: TRANSLATION_PROVIDER_CONCURRENCY,
    signal,
    task: (chunk, _index, workerSignal) =>
      translateChunk(chunk, targetLanguage, workerSignal),
  });

  const expectedKeys = chunks.flatMap((chunk) => Object.keys(chunk));
  const translatedEntries = translatedChunks.flatMap((chunk) =>
    Object.entries(chunk)
  );
  const translated = validateTranslationObject(
    Object.fromEntries(translatedEntries),
    expectedKeys,
  );
  if (!translated) {
    log.error("merged translation failed final key validation", {
      expected_keys: expectedKeys.length,
      actual_keys: translatedEntries.length,
    });
    return jsonError("Translation validation failed", 502, hdrs);
  }

  return new Response(
    JSON.stringify({ locale, strings: translated }),
    { headers: { ...hdrs, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates CORS, auth, quota, provider calls, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const hdrs = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  const requestDeadline = createRequestDeadline(req.signal);
  try {
    return await handleTranslationRequest(req, hdrs, requestDeadline.signal);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("translate error", { err: msg });
    if (err instanceof TranslationDeadlineError) {
      return jsonError("Translation deadline exceeded", 504, hdrs);
    }
    if (err instanceof TranslationFailure) {
      return new Response(
        JSON.stringify({
          error: err.publicMessage,
          ...(err.providerStatus !== undefined
            ? { detail: err.providerStatus }
            : {}),
        }),
        {
          status: err.status,
          headers: { ...hdrs, "Content-Type": "application/json" },
        },
      );
    }
    return new Response(JSON.stringify({ error: "Translation failed" }), {
      status: 500,
      headers: { ...hdrs, "Content-Type": "application/json" },
    });
  } finally {
    requestDeadline.dispose();
  }
});
