/**
 * Tests for ai-translate edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    RATE_LIMIT_FORCE_MEMORY: "true",
  },
);

const REQUEST_BODY_LIMIT_BYTES = 192 * 1_024;
const PROVIDER_TRANSLATION_BYTE_LIMIT = 64 * 1_024;
const textEncoder = new TextEncoder();

function flattenCatalogue(
  value: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>(
    (result, [key, child]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof child === "object" && child !== null) {
        Object.assign(
          result,
          flattenCatalogue(child as Record<string, unknown>, fullKey),
        );
      } else {
        result[fullKey] = String(child);
      }
      return result;
    },
    {},
  );
}

function expandedTokenDenseValue(value: string): string {
  return "Ω".repeat(Math.max(1, textEncoder.encode(value).length));
}

async function loadCurrentCatalogue(): Promise<Record<string, string>> {
  const source = JSON.parse(
    await Deno.readTextFile(
      new URL("../../../src/locales/en.json", import.meta.url),
    ),
  ) as Record<string, unknown>;
  return flattenCatalogue(source);
}

function readProviderRequest(init?: RequestInit): {
  maxTokens: number | undefined;
  reasoningEffort: string | undefined;
  responseFormat: unknown;
  strings: Record<string, string>;
} {
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    max_tokens?: number;
    max_completion_tokens?: number;
    reasoning_effort?: string;
    response_format?: unknown;
    messages?: Array<{ content?: string }>;
  };
  const prompt = body.messages?.[0]?.content ?? "";
  const inputMarker = "Input:\n";
  const outputMarker = "\n\nOutput (JSON only):";
  const inputStart = prompt.indexOf(inputMarker);
  const outputStart = prompt.indexOf(
    outputMarker,
    inputStart + inputMarker.length,
  );
  assert(
    inputStart >= 0 && outputStart > inputStart,
    "provider prompt must contain one JSON input",
  );

  return {
    maxTokens: body.max_completion_tokens ?? body.max_tokens,
    reasoningEffort: body.reasoning_effort,
    responseFormat: body.response_format,
    strings: JSON.parse(
      prompt.slice(inputStart + inputMarker.length, outputStart),
    ) as Record<string, string>,
  };
}

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("OPTIONS preflight supports Cloudflare previews and tracing headers", async () => {
  const previewOrigin = "https://review-123.maiprop-listing-site.pages.dev";
  const res = await handler(
    new Request("https://functions.supabase.co/fn", {
      method: "OPTIONS",
      headers: {
        origin: previewOrigin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "baggage, sentry-trace",
      },
    }),
  );

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), previewOrigin);
  const allowedHeaders = res.headers.get("Access-Control-Allow-Headers") ?? "";
  assert(allowedHeaders.includes("baggage"));
  assert(allowedHeaders.includes("sentry-trace"));
});

Deno.test("oversized Content-Length rejects a static locale without reading or downstream work", async () => {
  const originalFetch = globalThis.fetch;
  let downstreamCalls = 0;
  globalThis.fetch = (() => {
    downstreamCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  const request = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      "content-length": String(REQUEST_BODY_LIMIT_BYTES + 1),
      "content-type": "application/json",
      origin: "https://maiprop.co",
    },
    body: JSON.stringify({
      locale: "en",
      strings: { private: "do-not-read" },
    }),
  });

  try {
    const res = await handler(request);
    assertEquals(res.status, 413);
    assertEquals(request.bodyUsed, false);
    assertEquals((await res.json()).code, "request_too_large");
    assertEquals(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("chunked oversized static-locale bodies stop at the raw byte cap before downstream work", async () => {
  const originalFetch = globalThis.fetch;
  let downstreamCalls = 0;
  let bodyCancelled = false;
  globalThis.fetch = (() => {
    downstreamCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  const rawBody = textEncoder.encode(JSON.stringify({
    locale: "en",
    strings: { private: "x".repeat(REQUEST_BODY_LIMIT_BYTES) },
  }));
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= rawBody.length) {
        controller.close();
        return;
      }
      const nextOffset = Math.min(offset + 8_192, rawBody.length);
      controller.enqueue(rawBody.slice(offset, nextOffset));
      offset = nextOffset;
    },
    cancel() {
      bodyCancelled = true;
    },
  });
  const request = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://maiprop.co",
    },
    body,
  });

  try {
    const res = await handler(request);
    assertEquals(res.status, 413);
    assertEquals((await res.json()).code, "request_too_large");
    assertEquals(bodyCancelled, true);
    assertEquals(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("static locales pass through exactly after bounded parsing without downstream work", async () => {
  const originalFetch = globalThis.fetch;
  let downstreamCalls = 0;
  globalThis.fetch = (() => {
    downstreamCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    for (const locale of ["en", "el"]) {
      const marker = `private-catalogue-${locale}`;
      const res = await handler(req("POST", {
        locale,
        strings: { "private.catalogue": marker },
      }));

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body, {
        locale,
        strings: { "private.catalogue": marker },
      });
    }
    assertEquals(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("translation keys with surrounding whitespace are rejected without canonical collisions", async () => {
  const originalFetch = globalThis.fetch;
  let downstreamCalls = 0;
  globalThis.fetch = (() => {
    downstreamCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: {
        canonical: "first",
        " canonical ": "second",
      },
    }, { authorization: "Bearer test-valid-token" }));

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.code, "validation_error");
    assert(
      body.issues.some((issue: { message?: string }) =>
        issue.message?.includes("leading or trailing whitespace")
      ),
    );
    assertEquals(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("non-static locale fails closed before provider call when quota service is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(JSON.stringify({ user: { id: "user-1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (
      url.includes("generativelanguage.googleapis.com") ||
      url.includes("api.openai.com")
    ) {
      providerCalls += 1;
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, { authorization: "Bearer valid-user-token" }));
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(
      body.error,
      "AI quota service unavailable. Please retry shortly.",
    );
    assertEquals(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.set(
      "SUPABASE_SERVICE_ROLE_KEY",
      "placeholder-supabase-service-role",
    );
  }
});

Deno.test("the current catalogue is translated in multiple bounded calls and merged exactly", async () => {
  const originalFetch = globalThis.fetch;
  const strings = await loadCurrentCatalogue();
  const providerChunks: Array<Record<string, string>> = [];
  const providerTokenCaps: Array<number | undefined> = [];
  const providerOutputBytes: number[] = [];
  let quotaCalls = 0;
  let activeProviderCalls = 0;
  let maxActiveProviderCalls = 0;

  const requestBody = JSON.stringify({ locale: "fr", strings });
  assert(
    textEncoder.encode(JSON.stringify(strings)).length >
      PROVIDER_TRANSLATION_BYTE_LIMIT,
    "the current catalogue must exercise translation across multiple chunks",
  );
  assert(textEncoder.encode(requestBody).length < REQUEST_BODY_LIMIT_BYTES);

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user: { id: "catalogue-test-user" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
    if (url.includes("/rpc/reserve_ai_quota_for_user")) {
      quotaCalls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            allowed: true,
            reason: null,
            used: 1,
            limit: 10,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
    if (
      url.includes("generativelanguage.googleapis.com") ||
      url.includes("api.openai.com")
    ) {
      activeProviderCalls += 1;
      maxActiveProviderCalls = Math.max(
        maxActiveProviderCalls,
        activeProviderCalls,
      );
      const providerRequest = readProviderRequest(init);
      providerChunks.push(providerRequest.strings);
      providerTokenCaps.push(providerRequest.maxTokens);
      const translated = Object.fromEntries(
        Object.entries(providerRequest.strings).map(([key, value]) => [
          key,
          expandedTokenDenseValue(value),
        ]),
      );
      providerOutputBytes.push(
        textEncoder.encode(JSON.stringify(translated)).length,
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeProviderCalls -= 1;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(translated) } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", { locale: "fr", strings }, {
      authorization: "Bearer catalogue-test-token",
      "x-forwarded-for": crypto.randomUUID(),
    }));
    assertEquals(res.status, 200);
    const body = await res.json();

    assert(providerChunks.length > 1);
    assert(
      providerChunks.length < 49,
      "the production catalogue must use materially fewer calls",
    );
    assert(
      maxActiveProviderCalls > 1,
      "catalogue chunks must not run serially",
    );
    assert(
      maxActiveProviderCalls <= 8,
      "catalogue concurrency must remain bounded",
    );
    assertEquals(providerTokenCaps.length, providerChunks.length);
    assertEquals(
      providerTokenCaps.every((cap) => cap !== undefined && cap <= 8_192),
      true,
    );
    assert(
      new Set(providerTokenCaps).size > 1,
      "provider output budgets must be chunk-specific",
    );
    providerOutputBytes.forEach((outputBytes, index) => {
      assert(
        outputBytes <= PROVIDER_TRANSLATION_BYTE_LIMIT,
        `chunk ${index} output exceeded the defensive response byte cap`,
      );
    });
    assertEquals(quotaCalls, 1);

    const expectedKeys = Object.keys(strings).sort();
    const requestedKeys = providerChunks.flatMap((chunk) => Object.keys(chunk));
    assertEquals(requestedKeys, expectedKeys);
    assertEquals(Object.keys(body.strings).sort(), expectedKeys);
    assertEquals(
      body.strings[expectedKeys[0]],
      expandedTokenDenseValue(strings[expectedKeys[0]]),
    );
    assertEquals(
      body.strings[expectedKeys[expectedKeys.length - 1]],
      expandedTokenDenseValue(strings[expectedKeys[expectedKeys.length - 1]]),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("provider timeout remains active while the response body is stalled", async () => {
  const originalFetch = globalThis.fetch;
  let providerBodyCancelled = false;
  let providerBodyTimer: number | undefined;

  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user: { id: "stalled-provider-body-user" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
    if (url.includes("/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            allowed: true,
            reason: null,
            used: 1,
            limit: 10,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
    if (
      url.includes("generativelanguage.googleapis.com") ||
      url.includes("api.openai.com")
    ) {
      const payload = textEncoder.encode(JSON.stringify({
        choices: [{ message: { content: '{"nav.home":"Accueil"}' } }],
      }));
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          providerBodyTimer = setTimeout(() => {
            controller.enqueue(payload);
            controller.close();
          }, 80);
        },
        cancel() {
          providerBodyCancelled = true;
          if (providerBodyTimer !== undefined) clearTimeout(providerBodyTimer);
        },
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, {
      authorization: "Bearer stalled-provider-body-token",
      "x-forwarded-for": crypto.randomUUID(),
    }));

    assertEquals(res.status, 504);
    assertEquals((await res.json()).error, "Translation provider timed out");
    assertEquals(providerBodyCancelled, true);
  } finally {
    if (providerBodyTimer !== undefined) clearTimeout(providerBodyTimer);
    globalThis.fetch = originalFetch;
  }
});

Deno.test("request deadline aborts stalled authentication before quota or provider work", async () => {
  const originalFetch = globalThis.fetch;
  let authCalls = 0;
  let authAborted = false;
  let quotaCalls = 0;
  let providerCalls = 0;

  globalThis.fetch =
    ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) {
        authCalls += 1;
        if (authCalls === 1) {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              resolve(
                new Response(
                  JSON.stringify({
                    user: { id: "stalled-auth-user" },
                  }),
                  {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                  },
                ),
              );
            }, 650);
            init?.signal?.addEventListener("abort", () => {
              authAborted = true;
              clearTimeout(timer);
              reject(
                init.signal?.reason ??
                  new DOMException("Aborted", "AbortError"),
              );
            }, { once: true });
          });
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: { id: "stalled-auth-user" },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      if (url.includes("/rpc/reserve_ai_quota_for_user")) {
        quotaCalls += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              allowed: true,
              reason: null,
              used: 1,
              limit: 10,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (
        url.includes("generativelanguage.googleapis.com") ||
        url.includes("api.openai.com")
      ) {
        providerCalls += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"nav.home":"Accueil"}' } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, {
      authorization: "Bearer stalled-auth-token",
      "x-forwarded-for": crypto.randomUUID(),
    }));

    assertEquals(res.status, 504);
    assertEquals((await res.json()).error, "Translation deadline exceeded");
    assertEquals(authAborted, true);
    assertEquals(quotaCalls, 0);
    assertEquals(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("request deadline aborts a stalled quota reservation before provider work", async () => {
  const originalFetch = globalThis.fetch;
  let quotaAborted = false;
  let providerCalls = 0;

  globalThis.fetch =
    ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: { id: "stalled-quota-user" },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      if (url.includes("/rpc/reserve_ai_quota_for_user")) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve(
              new Response(
                JSON.stringify({
                  allowed: true,
                  reason: null,
                  used: 1,
                  limit: 10,
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              ),
            );
          }, 650);
          init?.signal?.addEventListener("abort", () => {
            quotaAborted = true;
            clearTimeout(timer);
            reject(
              init.signal?.reason ?? new DOMException("Aborted", "AbortError"),
            );
          }, { once: true });
        });
      }
      if (
        url.includes("generativelanguage.googleapis.com") ||
        url.includes("api.openai.com")
      ) {
        providerCalls += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"nav.home":"Accueil"}' } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, {
      authorization: "Bearer stalled-quota-token",
      "x-forwarded-for": crypto.randomUUID(),
    }));

    assertEquals(res.status, 504);
    assertEquals((await res.json()).error, "Translation deadline exceeded");
    assertEquals(quotaAborted, true);
    assertEquals(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("valid multibyte translation output uses a separate defensive byte cap", async () => {
  const originalFetch = globalThis.fetch;
  const sourceValue = "a".repeat(1_000);
  const translatedValue = "\u3042".repeat(1_000);

  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user: { id: "multibyte-output-user" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    if (url.includes("/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            allowed: true,
            reason: null,
            used: 1,
            limit: 10,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    if (
      url.includes("generativelanguage.googleapis.com") ||
      url.includes("api.openai.com")
    ) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: JSON.stringify({ "long.copy": translatedValue }),
              },
            }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "ja",
      strings: { "long.copy": sourceValue },
    }, {
      authorization: "Bearer multibyte-output-token",
      "x-forwarded-for": crypto.randomUUID(),
    }));

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.strings["long.copy"], translatedValue);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("later provider failures and malformed or mismatched chunks fail closed", async () => {
  const originalFetch = globalThis.fetch;
  const strings = await loadCurrentCatalogue();
  const failureModes = [
    "over_budget_output",
    "blank_value",
    "whitespace_value",
    "provider_error",
    "malformed_json",
    "missing_key",
    "extra_key",
    "non_string_value",
  ] as const;

  try {
    for (const failureMode of failureModes) {
      let providerCalls = 0;
      globalThis.fetch =
        ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const url = String(input);
          if (url.includes("/auth/v1/user")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  user: { id: `failure-test-${failureMode}` },
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              ),
            );
          }
          if (url.includes("/rpc/reserve_ai_quota_for_user")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  allowed: true,
                  reason: null,
                  used: 1,
                  limit: 10,
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              ),
            );
          }
          if (
            url.includes("generativelanguage.googleapis.com") ||
            url.includes("api.openai.com")
          ) {
            providerCalls += 1;
            const providerRequest = readProviderRequest(init);
            const providerStrings = providerRequest.strings;
            if (providerCalls === 2 && failureMode === "provider_error") {
              return Promise.resolve(
                new Response("provider unavailable", { status: 503 }),
              );
            }
            if (providerCalls === 2 && failureMode === "malformed_json") {
              return Promise.resolve(
                new Response(
                  JSON.stringify({
                    choices: [{ message: { content: "{not-json" } }],
                  }),
                  {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                  },
                ),
              );
            }

            const translated: Record<string, unknown> = Object.fromEntries(
              Object.entries(providerStrings).map((
                [key, value],
              ) => [key, `fr:${value}`]),
            );
            if (providerCalls === 2 && failureMode === "missing_key") {
              Reflect.deleteProperty(
                translated,
                Object.keys(providerStrings)[0],
              );
            }
            if (providerCalls === 2 && failureMode === "extra_key") {
              translated["unexpected.provider.key"] = "extra";
            }
            if (providerCalls === 2 && failureMode === "non_string_value") {
              translated[Object.keys(providerStrings)[0]] = 42;
            }
            if (providerCalls === 2 && failureMode === "blank_value") {
              translated[Object.keys(providerStrings)[0]] = "";
            }
            if (providerCalls === 2 && failureMode === "whitespace_value") {
              translated[Object.keys(providerStrings)[0]] = " \t\n ";
            }
            if (providerCalls === 2 && failureMode === "over_budget_output") {
              translated[Object.keys(providerStrings)[0]] = "Ω".repeat(
                40_000,
              );
            }
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  choices: [{
                    message: { content: JSON.stringify(translated) },
                  }],
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              ),
            );
          }
          return Promise.resolve(new Response("{}", { status: 200 }));
        }) as typeof fetch;

      const res = await handler(req("POST", { locale: "fr", strings }, {
        authorization: "Bearer test-valid-token",
        "x-forwarded-for": crypto.randomUUID(),
      }));
      assertEquals(res.status, 502, failureMode);
      const body = await res.json();
      assertEquals("strings" in body, false, failureMode);
      assert(providerCalls >= 2, failureMode);
      assert(
        providerCalls <= 16,
        `${failureMode}: failure fan-out exceeded two worker waves`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("missing locale returns 400", async () => {
  const res = await handler(req("POST", { strings: { "key": "value" } }));
  assertEquals([400, 500].includes(res.status), true);
});

Deno.test("missing strings returns 400", async () => {
  const res = await handler(req("POST", { locale: "fr" }));
  assertEquals([400, 500].includes(res.status), true);
});

Deno.test("translation request schema rejects nested, array, and unknown payloads before providers", async () => {
  const originalFetch = globalThis.fetch;
  let downstreamCalls = 0;
  globalThis.fetch = (() => {
    downstreamCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const invalidBodies = [
      { locale: "fr", strings: ["Home"] },
      { locale: "fr", strings: { home: { label: "Home" } } },
      { locale: "fr", strings: { home: "Home" }, unexpected: true },
    ];
    for (const invalidBody of invalidBodies) {
      const res = await handler(req("POST", invalidBody, {
        authorization: "Bearer test-valid-token",
        "x-forwarded-for": crypto.randomUUID(),
      }));
      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.code, "validation_error");
      assertEquals(Array.isArray(body.issues), true);
    }
    assertEquals(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("oversized raw translation payloads are rejected before auth, quota, or provider calls", async () => {
  const originalFetch = globalThis.fetch;
  let downstreamCalls = 0;
  globalThis.fetch = (() => {
    downstreamCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const strings = Object.fromEntries(
      Array.from(
        { length: 250 },
        (_, index) => [`key.${index}`, "x".repeat(1_000)],
      ),
    );
    const res = await handler(req("POST", { locale: "fr", strings }, {
      authorization: "Bearer test-valid-token",
      "x-forwarded-for": crypto.randomUUID(),
    }));
    assertEquals(res.status, 413);
    const body = await res.json();
    assertEquals(body.code, "request_too_large");
    assertEquals(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("a single entry that cannot fit a provider chunk is rejected before downstream work", async () => {
  const originalFetch = globalThis.fetch;
  let downstreamCalls = 0;
  globalThis.fetch = (() => {
    downstreamCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { oversized: "x".repeat(8_000) },
    }, {
      authorization: "Bearer oversized-entry-token",
      "x-forwarded-for": crypto.randomUUID(),
    }));

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.code, "validation_error");
    assertEquals(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("malformed translation JSON returns invalid_json before downstream calls", async () => {
  const originalFetch = globalThis.fetch;
  let downstreamCalls = 0;
  globalThis.fetch = (() => {
    downstreamCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(
      new Request("https://functions.test/ai-translate", {
        method: "POST",
        headers: {
          authorization: "Bearer test-valid-token",
          "content-type": "application/json",
          "x-forwarded-for": crypto.randomUUID(),
        },
        body: "{",
      }),
    );
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.code, "invalid_json");
    assertEquals(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("non-static locale requires auth before AI call", async () => {
  const res = await handler(req("POST", {
    locale: "fr",
    strings: { "nav.home": "Home" },
  }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Authentication required for AI translation");
});

Deno.test("oversized translation key batches return structured 400 before auth, quota, or provider", async () => {
  const originalFetch = globalThis.fetch;
  let authCalls = 0;
  let quotaCalls = 0;
  let providerCalls = 0;
  const strings = Object.fromEntries(
    Array.from({ length: 2_501 }, (_, i) => [`key.${i}`, "value"]),
  );

  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      authCalls += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ user: { id: "user-1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/rpc/reserve_ai_quota_for_user")) quotaCalls += 1;
    if (
      url.includes("generativelanguage.googleapis.com") ||
      url.includes("api.openai.com")
    ) {
      providerCalls += 1;
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings,
    }, { authorization: "Bearer valid-user-token" }));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.code, "validation_error");
    assertEquals(authCalls, 0);
    assertEquals(quotaCalls, 0);
    assertEquals(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("provider misconfiguration does not reserve quota", async () => {
  const originalFetch = globalThis.fetch;
  let quotaCalls = 0;
  Deno.env.delete("OPENAI_API_KEY");
  Deno.env.delete("GEMINI_API_KEY");

  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(JSON.stringify({ user: { id: "user-1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/rpc/reserve_ai_quota_for_user")) quotaCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, { authorization: "Bearer valid-user-token" }));
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(body.error, "Translation service not configured");
    assertEquals(quotaCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.set("OPENAI_API_KEY", "placeholder-openai");
  }
});

Deno.test("unknown origin falls back to production CORS origin", async () => {
  const r = new Request("https://functions.supabase.co/fn", {
    method: "OPTIONS",
    headers: { origin: "https://hacker.io" },
  });
  const res = await handler(r);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("translation parse failures do not expose raw model output", async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(JSON.stringify({ user: { id: "user-1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            allowed: true,
            reason: null,
            used: 1,
            limit: 10,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    if (
      url.includes("generativelanguage.googleapis.com") ||
      url.includes("api.openai.com")
    ) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "not-json-response-fragment" } }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  globalThis.fetch = fetchMock as typeof fetch;
  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, { authorization: "Bearer test-valid-token" }));
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, "Translation parsing failed");
    assert(!("raw" in body));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("non-static locale with quota reservation reaches provider", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  let providerModel = "";
  let reasoningEffort: string | undefined;
  let responseFormat: unknown;

  globalThis.fetch =
    ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) {
        return Promise.resolve(
          new Response(JSON.stringify({ user: { id: "test-user-id" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/rpc/reserve_ai_quota_for_user")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              allowed: true,
              reason: null,
              used: 1,
              limit: 10,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (
        url.includes("generativelanguage.googleapis.com") ||
        url.includes("api.openai.com")
      ) {
        providerCalls += 1;
        const providerBody = JSON.parse(String(init?.body ?? "{}"));
        providerModel = String(providerBody.model ?? "");
        reasoningEffort = providerBody.reasoning_effort;
        responseFormat = providerBody.response_format;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"nav.home":"Accueil"}' } }],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, { authorization: "Bearer test-valid-token" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.strings["nav.home"], "Accueil");
    assertEquals(providerCalls, 1);
    assertEquals(providerModel, "gpt-5.4-mini");
    assertEquals(reasoningEffort, "none");
    assertEquals(responseFormat, { type: "json_object" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Gemini 2.5 translation requests disable thinking", async () => {
  const originalFetch = globalThis.fetch;
  Deno.env.delete("OPENAI_API_KEY");
  Deno.env.set("GEMINI_API_KEY", "placeholder-gemini");
  let generationConfig: Record<string, unknown> | undefined;

  globalThis.fetch =
    ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) {
        return Promise.resolve(
          new Response(JSON.stringify({ user: { id: "gemini-user" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/rpc/reserve_ai_quota_for_user")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              allowed: true,
              reason: null,
              used: 1,
              limit: 10,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        const providerBody = JSON.parse(String(init?.body ?? "{}"));
        generationConfig = providerBody.generationConfig;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              candidates: [{
                content: { parts: [{ text: '{"nav.home":"Accueil"}' }] },
              }],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, { authorization: "Bearer gemini-token" }));

    assertEquals(res.status, 200);
    assertEquals(generationConfig?.thinkingConfig, { thinkingBudget: 0 });
    assertEquals(generationConfig?.responseMimeType, "application/json");
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("GEMINI_API_KEY");
    Deno.env.set("OPENAI_API_KEY", "placeholder-openai");
  }
});

restore();
