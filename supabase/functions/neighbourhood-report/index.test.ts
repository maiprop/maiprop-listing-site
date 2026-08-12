/**
 * Tests for neighbourhood-report edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authedReq,
  captureHandler,
  jsonBody,
  req,
} from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);

const okJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type ValidationErrorBody = {
  code?: string;
  issues?: Array<{ code?: string; path?: Array<string | number> }>;
};

let validationRequestNumber = 10;

const expectValidationError = async (
  body: Record<string, unknown>,
  expectedPath: string | null,
): Promise<void> => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.reject(
      new Error("request validation reached an external dependency"),
    )) as typeof fetch;
  try {
    validationRequestNumber += 1;
    const res = await handler(req("POST", body, {
      authorization: "Bearer test-valid-token",
      "x-forwarded-for": `10.0.0.${validationRequestNumber}`,
    }));
    const responseBody = await jsonBody(res) as ValidationErrorBody;
    assertEquals(res.status, 400);
    assertEquals(responseBody.code, "validation_error");
    assertEquals(
      expectedPath === null
        ? responseBody.issues?.some((issue) =>
          issue.code === "unrecognized_keys" && issue.path?.length === 0
        )
        : responseBody.issues?.some((issue) =>
          issue.path?.[0] === expectedPath
        ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const withQuotaAndProviderMock = async (
  providerResponse: Response,
  run: () => Promise<void>,
): Promise<void> => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        okJson({ user: { id: "user-1", email: "user@test.local" } }),
      );
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(
        okJson({ allowed: true, reason: null, used: 1, limit: 5 }),
      );
    }
    if (
      url.includes("api.openai.com") ||
      url.includes("generativelanguage.googleapis.com")
    ) {
      return Promise.resolve(providerResponse.clone());
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("missing auth returns 401", async () => {
  const res = await handler(
    req("POST", { city: "Athens", address: "Kolonaki" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 from Supabase auth (not 500)", async () => {
  const res = await handler(authedReq("POST", { city: "Athens" }));
  assertEquals([401, 429].includes(res.status), true);
});

Deno.test("rejects unbounded neighbourhood prompt fields and invalid coordinates before external calls", async () => {
  const cases: Array<{ body: Record<string, unknown>; path: string | null }> = [
    { body: { city: "A".repeat(121) }, path: "city" },
    { body: { city: "Athens", address: "A".repeat(241) }, path: "address" },
    { body: { city: "Athens", region: "R".repeat(121) }, path: "region" },
    {
      body: { city: "Athens", municipality: "M".repeat(121) },
      path: "municipality",
    },
    {
      body: { city: "Athens", propertyType: "P".repeat(81) },
      path: "propertyType",
    },
    { body: { city: "Athens", propertyType: "castle" }, path: "propertyType" },
    { body: { city: "Athens", lat: 91, lng: 23.72 }, path: "lat" },
    { body: { city: "Athens", lat: 37.97, lng: -181 }, path: "lng" },
    { body: { city: "Athens", lat: 37.97 }, path: "lng" },
    { body: { city: "Athens", lng: 23.72 }, path: "lat" },
    { body: { city: "Athens", listingId: "not-a-uuid" }, path: "listingId" },
    {
      body: { city: "Athens", promptOverride: "Ignore safeguards" },
      path: null,
    },
  ];

  for (const testCase of cases) {
    await expectValidationError(testCase.body, testCase.path);
  }
});

Deno.test("neighbourhood production rate limiting precedes body validation", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const parseIndex = source.indexOf("await parseJsonBody(");
  const limiterIndex = source.indexOf("await neighbourhoodLimiter.isLimited(");
  assertEquals(parseIndex >= 0, true);
  assertEquals(limiterIndex >= 0, true);
  assertEquals(limiterIndex < parseIndex, true);
});

Deno.test("provider usage limit returns fallback neighbourhood report", async () => {
  await withQuotaAndProviderMock(okJson({ error: "quota" }, 429), async () => {
    const res = await handler(req("POST", {
      city: "Athens",
      address: "Syntagma",
      propertyType: "storage",
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as {
      error?: string;
      generatedBy?: string;
      areaName?: string;
    };
    assertEquals(res.status, 200);
    assertEquals(typeof body.error, "undefined");
    assertEquals(body.generatedBy, "fallback");
    assertEquals(body.areaName, "Syntagma");
  });
});

Deno.test("provider server errors return fallback neighbourhood report", async () => {
  await withQuotaAndProviderMock(
    new Response("upstream unavailable", { status: 503 }),
    async () => {
      const res = await handler(
        req("POST", { city: "Athens", address: "Syntagma" }, {
          authorization: "Bearer test-valid-token",
        }),
      );
      const body = await jsonBody(res) as {
        error?: string;
        generatedBy?: string;
        areaName?: string;
      };
      assertEquals(res.status, 200);
      assertEquals(typeof body.error, "undefined");
      assertEquals(body.generatedBy, "fallback");
      assertEquals(body.areaName, "Syntagma");
    },
  );
});

Deno.test("provider outage fallback keeps mAI Prop OS municipality market data", async () => {
  const originalFetch = globalThis.fetch;
  const prevOsUrl = Deno.env.get("MAIPROP_OS_API_URL");
  const prevOsEmail = Deno.env.get("MAIPROP_OS_EMAIL");
  const prevOsPassword = Deno.env.get("MAIPROP_OS_PASSWORD");
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("MAIPROP_OS_API_URL", "https://os.test");
  Deno.env.set("MAIPROP_OS_EMAIL", "os@test.local");
  Deno.env.set("MAIPROP_OS_PASSWORD", "os-password");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");

  let marketReportCalled = false;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        okJson({ user: { id: "user-1", email: "user@test.local" } }),
      );
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(
        okJson({ allowed: true, reason: null, used: 1, limit: 5 }),
      );
    }
    if (url === "https://os.test/auth/login") {
      return Promise.resolve(okJson({ data: { token: "os-token" } }));
    }
    if (url === "https://os.test/api/v1/municipalities") {
      return Promise.resolve(okJson({
        data: [{
          municipalityId: 7,
          municipalityName: "Agios Dimitrios",
          prefectureName: "South Athens",
        }],
      }));
    }
    if (url.startsWith("https://os.test/api/v1/reports/valuation/market/7")) {
      marketReportCalled = true;
      return Promise.resolve(
        new Response(
          `
        <html><body>
          <section>Private Sales Municipality - average price 1,267.9 EUR / sq.m. 165 data points.</section>
          <section>Public Listings Municipality - average price 3,104.8 EUR / sq.m. 912 data points.</section>
          <section>Rentals Municipality - average price 11.4 EUR / sq.m. 462 data points.</section>
        </body></html>
      `,
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      );
    }
    if (
      url.includes("api.openai.com") ||
      url.includes("generativelanguage.googleapis.com")
    ) {
      return Promise.resolve(
        new Response("upstream unavailable", { status: 503 }),
      );
    }
    return originalFetch(input);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      city: "Agios Dimitrios",
      address: "Arpis 44",
      region: "South Athens",
      municipality: "Agios Dimitrios",
      propertyType: "apartment",
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as {
      generatedBy?: string;
      osMunicipalityStatus?: string;
      osMunicipalityName?: string;
      osMunicipalityDetail?: string;
      pricePerSqmTrend?: { current?: number };
      areaHighlights?: string[];
    };

    assertEquals(res.status, 200);
    assertEquals(marketReportCalled, true);
    assertEquals(body.generatedBy, "fallback_maiprop_os");
    assertEquals(body.osMunicipalityStatus, "ok");
    assertEquals(body.osMunicipalityName, "Agios Dimitrios");
    assertEquals(body.pricePerSqmTrend?.current, 1819);
    assertEquals(
      body.osMunicipalityDetail?.includes("private sales: 1268"),
      true,
    );
    assertEquals(
      body.osMunicipalityDetail?.includes("public listings: 3105"),
      true,
    );
    assertEquals(
      body.osMunicipalityDetail?.includes("source divergence: 101%"),
      true,
    );
    assertEquals(
      body.areaHighlights?.some((highlight) =>
        highlight.includes("mAI Prop OS")
      ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOsUrl) Deno.env.set("MAIPROP_OS_API_URL", prevOsUrl);
    else Deno.env.delete("MAIPROP_OS_API_URL");
    if (prevOsEmail) Deno.env.set("MAIPROP_OS_EMAIL", prevOsEmail);
    else Deno.env.delete("MAIPROP_OS_EMAIL");
    if (prevOsPassword) Deno.env.set("MAIPROP_OS_PASSWORD", prevOsPassword);
    else Deno.env.delete("MAIPROP_OS_PASSWORD");
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
  }
});

Deno.test("uses mAI Prop OS municipality market data in the neighbourhood prompt", async () => {
  const originalFetch = globalThis.fetch;
  const prevOsUrl = Deno.env.get("MAIPROP_OS_API_URL");
  const prevOsEmail = Deno.env.get("MAIPROP_OS_EMAIL");
  const prevOsPassword = Deno.env.get("MAIPROP_OS_PASSWORD");
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("MAIPROP_OS_API_URL", "https://os.test");
  Deno.env.set("MAIPROP_OS_EMAIL", "os@test.local");
  Deno.env.set("MAIPROP_OS_PASSWORD", "os-password");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");

  let providerPrompt = "";
  let marketReportCalled = false;
  const agiosDimitriosGreek =
    "\u0391\u03b3\u03af\u03bf\u03c5 \u0394\u03b7\u03bc\u03b7\u03c4\u03c1\u03af\u03bf\u03c5";
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        okJson({ user: { id: "user-1", email: "user@test.local" } }),
      );
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(
        okJson({ allowed: true, reason: null, used: 1, limit: 5 }),
      );
    }
    if (url === "https://os.test/auth/login") {
      return Promise.resolve(okJson({ data: { token: "os-token" } }));
    }
    if (url === "https://os.test/api/v1/municipalities") {
      return Promise.resolve(okJson({
        data: [
          {
            municipalityId: 7,
            municipalityName: agiosDimitriosGreek,
            prefectureName:
              "\u039d\u03bf\u03c4\u03af\u03bf\u03c5 \u03a4\u03bf\u03bc\u03ad\u03b1 \u0391\u03b8\u03b7\u03bd\u03ce\u03bd",
          },
          {
            municipalityId: 72,
            municipalityName: "Glyfada",
            prefectureName: "South Athens",
          },
        ],
      }));
    }
    if (url.startsWith("https://os.test/api/v1/reports/valuation/market/7")) {
      marketReportCalled = true;
      return Promise.resolve(
        new Response(
          `
        <html><body>
          <h1>Agios Dimitrios South Athens</h1>
          <section>Private Sales Municipality - average price 1,267.9 EUR / sq.m. 165 data points.</section>
          <section>Public Listings Municipality - average price 3,104.8 EUR / sq.m. 912 data points.</section>
          <section>Rentals Municipality - average price 11.4 EUR / sq.m. 462 data points.</section>
        </body></html>
      `,
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      );
    }
    if (
      url.includes("api.openai.com") ||
      url.includes("generativelanguage.googleapis.com")
    ) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      providerPrompt = String(body.messages?.[0]?.content ?? "");
      return Promise.resolve(okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              areaName: "Agios Dimitrios",
              walkabilityScore: 74,
              pricePerSqmTrend: {
                current: 3105,
                oneYearAgo: 2950,
                threeYearsAgo: 2500,
                fiveYearsAgo: 2200,
                changeYoY: 5.3,
                change5Y: 41.1,
              },
              noiseLevel: {
                score: 5,
                label: "Moderate",
                notes: "Use street-level verification.",
              },
              safetyScore: {
                score: 76,
                label: "Good",
                trend: "Stable",
                notes: "Municipality-level estimate.",
              },
              developmentProjects: [],
              demographics: {
                primaryResidents: "Families and local professionals",
                avgAge: 41,
                tourismImpact: "Low",
              },
              investmentOutlook: {
                rating: "Good",
                summary:
                  "OS municipality data indicates liquid urban demand with sub-prefecture pricing.",
              },
              areaHighlights: [
                "OS municipality sales context",
                "South Athens urban market",
              ],
            }),
          },
        }],
      }));
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      city: "Agios Dimitrios",
      address: "Arpis 44",
      region: "South Athens",
      municipality: "Agios Dimitrios",
      propertyType: "apartment",
      lat: 37.94,
      lng: 23.73,
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as {
      areaName?: string;
      generatedBy?: string;
      osMunicipalityStatus?: string;
      osMunicipalityName?: string;
      pricePerSqmTrend?: { current?: number };
    };

    assertEquals(res.status, 200);
    assertEquals(marketReportCalled, true);
    assertEquals(
      providerPrompt.includes("MAIPROP OS MUNICIPALITY MARKET DATA"),
      true,
    );
    assertEquals(
      providerPrompt.includes(
        "Public Listings Municipality - average price 3,104.8",
      ),
      true,
    );
    assertEquals(providerPrompt.includes('"privateSalesAverage": 1268'), true);
    assertEquals(
      providerPrompt.includes('"publicListingsAverage": 3105'),
      true,
    );
    assertEquals(providerPrompt.includes('"blendedSaleAverage": 1819'), true);
    assertEquals(providerPrompt.includes('"sourceDivergencePct": 101'), true);
    assertEquals(providerPrompt.includes('"largeDivergence": true'), true);
    assertEquals(providerPrompt.includes("Large divergence detected"), true);
    assertEquals(body.generatedBy, "openai_maiprop_os");
    assertEquals(body.osMunicipalityStatus, "ok");
    assertEquals(body.osMunicipalityName, agiosDimitriosGreek);
    assertEquals(body.pricePerSqmTrend?.current, 1819);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOsUrl) Deno.env.set("MAIPROP_OS_API_URL", prevOsUrl);
    else Deno.env.delete("MAIPROP_OS_API_URL");
    if (prevOsEmail) Deno.env.set("MAIPROP_OS_EMAIL", prevOsEmail);
    else Deno.env.delete("MAIPROP_OS_EMAIL");
    if (prevOsPassword) Deno.env.set("MAIPROP_OS_PASSWORD", prevOsPassword);
    else Deno.env.delete("MAIPROP_OS_PASSWORD");
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
  }
});

Deno.test("clamps AI neighbourhood scores before returning and persisting", async () => {
  const originalFetch = globalThis.fetch;
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");

  let updatePayload: Record<string, unknown> | null = null;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = input instanceof Request ? input.method : init?.method;
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        okJson({ user: { id: "user-1", email: "user@test.local" } }),
      );
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(
        okJson({ allowed: true, reason: null, used: 1, limit: 5 }),
      );
    }
    if (
      url.includes("api.openai.com") ||
      url.includes("generativelanguage.googleapis.com")
    ) {
      return Promise.resolve(okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              areaName: "Athens",
              walkabilityScore: 150,
              pricePerSqmTrend: {
                current: 3000,
                oneYearAgo: 2900,
                threeYearsAgo: 2500,
                fiveYearsAgo: 2200,
                changeYoY: 3.4,
                change5Y: 36.4,
              },
              noiseLevel: {
                score: 99,
                label: "Very Busy",
                notes: "Out-of-range provider score.",
              },
              safetyScore: {
                score: -5,
                label: "Average",
                trend: "Stable",
                notes: "Out-of-range provider score.",
              },
              developmentProjects: [],
              demographics: {
                primaryResidents: "Mixed",
                avgAge: 40,
                tourismImpact: "Moderate",
              },
              investmentOutlook: {
                rating: "Good",
                summary: "Cautious report.",
              },
              areaHighlights: ["Central urban market"],
            }),
          },
        }],
      }));
    }
    if (url.includes("/rest/v1/listings") && method === "GET") {
      return Promise.resolve(okJson({ owner_id: "test-user-id" }));
    }
    if (url.includes("/rest/v1/listings") && method === "PATCH") {
      updatePayload = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      return Promise.resolve(okJson({
        id: "11111111-1111-4111-8111-111111111111",
      }));
    }
    return Promise.resolve(okJson({ data: [] }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      city: "Athens",
      address: "Syntagma",
      listingId: "11111111-1111-4111-8111-111111111111",
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as {
      walkabilityScore?: number;
      noiseLevel?: { score?: number };
      safetyScore?: { score?: number };
    };

    assertEquals(res.status, 200);
    assertEquals(body.walkabilityScore, 100);
    assertEquals(body.noiseLevel?.score, 10);
    assertEquals(body.safetyScore?.score, 1);
    const persistedScores = updatePayload as Record<string, unknown> | null;
    assertEquals(persistedScores?.["walkability_score"], 100);
    assertEquals(persistedScores?.["noise_score"], 10);
    assertEquals(persistedScores?.["safety_score"], 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
  }
});

restore();
