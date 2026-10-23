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

let activeFetch: typeof fetch =
  (() =>
    Promise.reject(new Error("Unmocked external request"))) as typeof fetch;
globalThis.fetch =
  ((...args: Parameters<typeof fetch>) => activeFetch(...args)) as typeof fetch;

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  { MAIPROP_EDGE_TEST_AUTH_BYPASS: "false" },
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
  const originalFetch = activeFetch;
  activeFetch = (() =>
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
    activeFetch = originalFetch;
  }
};

const withQuotaAndProviderMock = async (
  providerResponse: Response,
  run: () => Promise<void>,
): Promise<void> => {
  const originalFetch = activeFetch;
  activeFetch = ((input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        okJson({ id: "test-user-id", email: "user@test.local" }),
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
    if (url.endsWith("/auth/login")) {
      return Promise.resolve(okJson({ token: "os-token" }));
    }
    if (url.endsWith("/municipalities")) {
      return Promise.resolve(okJson({ data: [] }));
    }
    throw new Error(`Unexpected external request: ${url}`);
  }) as typeof fetch;
  try {
    await run();
  } finally {
    activeFetch = originalFetch;
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
  const previousFetch = activeFetch;
  activeFetch = (() =>
    Promise.resolve(
      okJson({ message: "Invalid token" }, 401),
    )) as typeof fetch;
  try {
    const res = await handler(authedReq("POST", { city: "Athens" }));
    assertEquals(res.status, 401);
  } finally {
    activeFetch = previousFetch;
  }
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
      responseVersion: 2,
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
        req(
          "POST",
          { responseVersion: 2, city: "Athens", address: "Syntagma" },
          {
            authorization: "Bearer test-valid-token",
          },
        ),
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
  const originalFetch = activeFetch;
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
  activeFetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        okJson({ id: "test-user-id", email: "user@test.local" }),
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
    throw new Error(`Unexpected external request: ${url}`);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      responseVersion: 2,
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
      pricePerSqmTrend?: {
        current?: number;
        oneYearAgo?: number | null;
        changeYoY?: number | null;
      };
      areaHighlights?: string[];
    };

    assertEquals(res.status, 200);
    assertEquals(marketReportCalled, true);
    assertEquals(body.generatedBy, "fallback_maiprop_os");
    assertEquals(body.osMunicipalityStatus, "ok");
    assertEquals(body.osMunicipalityName, "Agios Dimitrios");
    assertEquals(body.pricePerSqmTrend?.current, 1819);
    assertEquals(body.pricePerSqmTrend?.oneYearAgo, null);
    assertEquals(body.pricePerSqmTrend?.changeYoY, null);
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
    activeFetch = originalFetch;
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
  const originalFetch = activeFetch;
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
  activeFetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        okJson({ id: "test-user-id", email: "user@test.local" }),
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
    if (url.endsWith("/auth/login")) {
      return Promise.resolve(okJson({ token: "os-token" }));
    }
    if (url.endsWith("/municipalities")) {
      return Promise.resolve(okJson({ data: [] }));
    }
    throw new Error(`Unexpected external request: ${url}`);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      responseVersion: 2,
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
      pricePerSqmTrend?: {
        current?: number;
        oneYearAgo?: number | null;
        changeYoY?: number | null;
      };
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
    assertEquals(body.pricePerSqmTrend?.oneYearAgo, null);
    assertEquals(body.pricePerSqmTrend?.changeYoY, null);
  } finally {
    activeFetch = originalFetch;
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

Deno.test("clamps and labels AI estimates without persisting unsupported scores", async () => {
  const originalFetch = activeFetch;
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");

  let updatePayload: Record<string, unknown> | null = null;
  activeFetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = input instanceof Request ? input.method : init?.method;
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        okJson({ id: "test-user-id", email: "user@test.local" }),
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
      responseVersion: 2,
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
    assertEquals(persistedScores, null);
  } finally {
    activeFetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
  }
});

// All provider/configuration paths use test doubles, never live services.
const scenario = async (options: {
  raw?: string;
  failure?: boolean;
  noConfig?: boolean;
  noOsConfig?: boolean;
  denied?: boolean;
  deniedReason?: string;
  auth?: "missing" | "invalid";
  ip?: string;
  version?: number;
  marketText?: string;
}) => {
  const previousFetch = activeFetch;
  const keys = [
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "MAIPROP_OS_API_URL",
    "MAIPROP_OS_URL",
    "MAIPROP_OS_EMAIL",
    "MAIPROP_OS_PASSWORD",
  ];
  const previous = keys.map((key) => Deno.env.get(key));
  let reservations = 0,
    providerCalls = 0,
    listingWrites = 0,
    authCalls = 0,
    osCalls = 0;
  Deno.env.set("OPENAI_API_KEY", "test-key");
  Deno.env.delete("GEMINI_API_KEY");
  if (options.noConfig) Deno.env.delete("OPENAI_API_KEY");
  Deno.env.set("MAIPROP_OS_API_URL", "https://os.test");
  Deno.env.set("MAIPROP_OS_EMAIL", "test@example.test");
  Deno.env.set("MAIPROP_OS_PASSWORD", "test-password");
  if (options.noOsConfig) Deno.env.delete("MAIPROP_OS_PASSWORD");
  activeFetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      authCalls++;
      return Promise.resolve(
        options.auth === "invalid"
          ? okJson({ message: "Invalid token" }, 401)
          : okJson({ id: "test-user-id" }),
      );
    }
    if (url.includes("/reserve_ai_quota_for_user")) {
      reservations++;
      return Promise.resolve(
        okJson({
          allowed: !options.denied,
          reason: options.denied
            ? options.deniedReason ?? "monthly_limit_reached"
            : null,
          used: 1,
          limit: 5,
        }),
      );
    }
    if (url.startsWith("https://os.test")) {
      osCalls++;
      assertEquals(reservations, 1);
      if (url.endsWith("/auth/login")) {
        return Promise.resolve(okJson({ token: "token" }));
      }
      if (url.endsWith("/municipalities")) {
        return Promise.resolve(okJson({
          data: options.marketText
            ? [{ municipalityId: 7, municipalityName: "Fictionopolis" }]
            : [],
        }));
      }
      return Promise.resolve(new Response(options.marketText));
    }
    if (url.includes("api.openai.com")) {
      assertEquals(reservations, 1);
      providerCalls++;
      return Promise.resolve(
        options.failure ? okJson({ error: "unavailable" }, 503) : okJson({
          choices: [{ message: { content: options.raw ?? "not json" } }],
        }),
      );
    }
    if (url.includes("/listings")) {
      if (init?.method === "PATCH") listingWrites++;
      return Promise.resolve(okJson({ owner_id: "test-user-id" }));
    }
    throw new Error(`Unexpected external request: ${url}`);
  }) as typeof fetch;
  try {
    validationRequestNumber++;
    const res = await handler(req("POST", {
      city: "Fictionopolis",
      listingId: "11111111-1111-4111-8111-111111111111",
      ...(options.version ? { responseVersion: options.version } : {}),
    }, {
      ...(options.auth === "missing"
        ? {}
        : { authorization: "Bearer test-valid-token" }),
      "x-forwarded-for": options.ip ?? `10.2.0.${validationRequestNumber}`,
    }));
    return {
      status: res.status,
      body: await jsonBody(res) as Record<string, unknown> & {
        pricePerSqmTrend: Record<string, number | null>;
        provenance: {
          analysis: { source: string };
          pricePerSqmTrend: Record<
            string,
            {
              source?: string;
              method?: string;
              year?: number;
              privateSalesAverage?: number;
            }
          >;
        };
      },
      reservations,
      providerCalls,
      listingWrites,
      authCalls,
      osCalls,
    };
  } finally {
    activeFetch = previousFetch;
    keys.forEach((key, i) =>
      previous[i] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, previous[i]!)
    );
  }
};

for (
  const mode of [
    "provider failure",
    "malformed JSON",
    "missing configuration",
    "wrong JSON shape",
  ] as const
) {
  Deno.test(`${mode}: fictional city has no invented facts or persisted scores`, async () => {
    const result = await scenario({
      version: 2,
      failure: mode === "provider failure",
      noConfig: mode === "missing configuration",
      raw: mode === "wrong JSON shape" ? "[]" : undefined,
    });
    assertEquals(result.status, 200);
    assertEquals(result.body.responseVersion, 2);
    assertEquals(result.body.pricePerSqmTrend, {
      current: null,
      oneYearAgo: null,
      threeYearsAgo: null,
      fiveYearsAgo: null,
      changeYoY: null,
      change5Y: null,
    });
    assertEquals(result.body.walkabilityScore, null);
    assertEquals(result.body.noiseLevel, null);
    assertEquals(result.body.safetyScore, null);
    assertEquals(result.body.demographics, null);
    assertEquals(result.body.investmentOutlook, null);
    assertEquals(result.body.developmentProjects, []);
    assertEquals(result.body.areaHighlights, []);
    assertEquals(result.reservations, 1);
    assertEquals(result.listingWrites, 0);
    assertEquals(
      result.providerCalls,
      mode === "missing configuration" ? 0 : 1,
    );
  });
}

Deno.test("legacy unavailable response uses the handled error envelope before numeric rendering", async () => {
  const { status, body } = await scenario({ failure: true });
  assertEquals(status, 503);
  assertEquals<unknown>(body, {
    error: "Neighbourhood report data is unavailable. Please try again later.",
    code: "neighbourhood_data_unavailable",
  });
});

Deno.test("denied quota performs no OS or AI work and no listing writes", async () => {
  const result = await scenario({ version: 2, denied: true });
  assertEquals(result.status, 429);
  assertEquals(result.reservations, 1);
  assertEquals(result.providerCalls, 0);
  assertEquals(result.listingWrites, 0);
});

Deno.test("independently dated OS history survives AI failure without invented intermediate observations", async () => {
  const year = new Date().getFullYear();
  const { body } = await scenario({
    version: 2,
    failure: true,
    marketText:
      `Private Sales Municipality - average price 2,000 EUR / sq.m. Private Sales Municipality ${
        year - 1
      } - average price 1,600 EUR / sq.m. Private Sales Municipality ${
        year - 5
      } - average price 1,000 EUR / sq.m.`,
  });
  assertEquals(body.pricePerSqmTrend, {
    current: 2000,
    oneYearAgo: 1600,
    threeYearsAgo: null,
    fiveYearsAgo: 1000,
    changeYoY: 25,
    change5Y: 100,
  });
  assertEquals(
    body.provenance.pricePerSqmTrend.oneYearAgo.source,
    "maiprop_os",
  );
  assertEquals(body.provenance.pricePerSqmTrend.oneYearAgo.year, year - 1);
});

Deno.test("provider cannot claim trusted fallback provenance to bypass normalization", async () => {
  const { body } = await scenario({
    version: 2,
    raw: JSON.stringify({
      generatedBy: "fallback",
      pricePerSqmTrend: { current: 98765 },
      developmentProjects: [{ name: "Invented mall" }],
    }),
  });
  assertEquals(body.pricePerSqmTrend.current, null);
  assertEquals(body.developmentProjects, []);
  assertEquals(body.provenance.analysis.source, "ai_estimate");
});

Deno.test("OS current asks and dated private sales have distinct provenance and comparable changes", async () => {
  const year = new Date().getFullYear();
  const { body } = await scenario({
    version: 2,
    noConfig: true,
    marketText:
      `Private Sales Municipality - average price 2,000 EUR / sq.m. Public Listings Municipality - average price 4,000 EUR / sq.m. Private Sales Municipality ${
        year - 1
      } - average price 1,600 EUR / sq.m.`,
  });
  assertEquals(body.pricePerSqmTrend.current, 2600);
  assertEquals(body.pricePerSqmTrend.oneYearAgo, 1600);
  assertEquals(body.pricePerSqmTrend.changeYoY, 25);
  assertEquals(
    body.provenance.pricePerSqmTrend.current.privateSalesAverage,
    2000,
  );
  assertEquals(
    body.provenance.pricePerSqmTrend.changeYoY.method,
    "private_sales_comparison",
  );
});

Deno.test("missing OS configuration leaves every market observation unavailable", async () => {
  const { body } = await scenario({
    version: 2,
    noOsConfig: true,
    raw: JSON.stringify({
      pricePerSqmTrend: { current: 1234, oneYearAgo: 1000 },
      demographics: "malformed",
      noiseLevel: { score: "bogus" },
      areaHighlights: [42],
    }),
  });
  assertEquals(body.osMunicipalityStatus, "missing_config");
  assertEquals(body.pricePerSqmTrend.current, null);
  assertEquals(body.pricePerSqmTrend.oneYearAgo, null);
  assertEquals(body.noiseLevel, null);
  assertEquals(body.demographics, null);
  assertEquals(body.areaHighlights, []);
});

Deno.test("legacy requests authenticate but do not reserve quota or call configured successful providers", async () => {
  const result = await scenario({
    raw: JSON.stringify({
      areaName: "Fictionopolis",
      safetyScore: {
        score: 82,
        label: "Good",
        trend: "Stable",
        notes: "Estimate",
      },
    }),
    marketText: "Private Sales Municipality - average price 2,000 EUR / sq.m.",
  });
  assertEquals(result.status, 503);
  assertEquals(result.body.code, "neighbourhood_data_unavailable");
  assertEquals(result.authCalls, 1);
  assertEquals(result.reservations, 0);
  assertEquals(result.providerCalls, 0);
  assertEquals(result.osCalls, 0);
  assertEquals(result.listingWrites, 0);
});

for (const auth of ["missing", "invalid"] as const) {
  Deno.test(`legacy ${auth} authentication remains denied without quota or provider work`, async () => {
    const result = await scenario({ auth, raw: "{}" });
    assertEquals(result.status, 401);
    assertEquals(result.authCalls, auth === "missing" ? 0 : 1);
    assertEquals(result.reservations, 0);
    assertEquals(result.providerCalls, 0);
    assertEquals(result.osCalls, 0);
  });
}

Deno.test("legacy retries remain rate limited before authentication without quota charges", async () => {
  const ip = "10.9.7.1";
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await scenario({ ip, raw: "{}" });
    assertEquals(result.status, 503);
    assertEquals(result.reservations, 0);
  }
  const result = await scenario({ ip, raw: "{}" });
  assertEquals(result.status, 429);
  assertEquals(result.authCalls, 0);
  assertEquals(result.reservations, 0);
  assertEquals(result.providerCalls, 0);
  assertEquals(result.osCalls, 0);
});

Deno.test({
  name: "stalled OS leg exceeds budget and degrades to AI-only report",
  // The stalled mock never settles, abandoning fetchWithTimeout's abort
  // timer by design; in production that timer fires and cleans up.
  sanitizeOps: false,
  fn: async () => {
    const originalFetch = activeFetch;
    const prevOsUrl = Deno.env.get("MAIPROP_OS_API_URL");
    const prevOsEmail = Deno.env.get("MAIPROP_OS_EMAIL");
    const prevOsPassword = Deno.env.get("MAIPROP_OS_PASSWORD");
    const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
    const prevGemini = Deno.env.get("GEMINI_API_KEY");
    const prevBudget = Deno.env.get("MAIPROP_OS_WAIT_BUDGET_MS");
    Deno.env.set("MAIPROP_OS_API_URL", "https://os.test");
    Deno.env.set("MAIPROP_OS_EMAIL", "os@test.local");
    Deno.env.set("MAIPROP_OS_PASSWORD", "os-password");
    Deno.env.set("OPENAI_API_KEY", "openai-test");
    Deno.env.delete("GEMINI_API_KEY");
    Deno.env.set("MAIPROP_OS_WAIT_BUDGET_MS", "50");
    activeFetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/auth/v1/user")) {
        return Promise.resolve(okJson({ id: "test-user-id", email: "user@test.local" }));
      }
      if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
        return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
      }
      if (url === "https://os.test/auth/login") {
        return new Promise<Response>(() => {});
      }
      if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
        return Promise.resolve(okJson({
          choices: [{
            message: {
              content: JSON.stringify({
                areaName: "Athens",
                walkabilityScore: 72,
                pricePerSqmTrend: { current: 3000, oneYearAgo: 2900, threeYearsAgo: 2500, fiveYearsAgo: 2200, changeYoY: 3.4, change5Y: 36.4 },
                noiseLevel: { score: 60, label: "Busy", notes: "Central estimate." },
                safetyScore: { score: 70, label: "Good", trend: "Stable", notes: "Central estimate." },
                developmentProjects: [],
                demographics: { primaryResidents: "Mixed", avgAge: 40, tourismImpact: "Moderate" },
                investmentOutlook: { rating: "Good", summary: "Cautious report." },
                areaHighlights: ["Central urban market"],
              }),
            },
          }],
        }));
      }
      throw new Error(`Unexpected external request: ${url}`);
    }) as typeof fetch;
    try {
      const res = await handler(req("POST", {
        responseVersion: 2,
        city: "Athens",
        address: "Syntagma",
      }, {
        authorization: "Bearer [REDACTED]",
        "x-forwarded-for": "10.9.9.9",
      }));
      const body = await jsonBody(res) as {
        areaName?: string;
        osMunicipalityStatus?: string;
        pricePerSqmTrend?: { current?: number | null };
      };
      assertEquals(res.status, 200);
      // Same normalization as an OS outage: no invented market figures,
      // non-market AI content preserved, existing "error" status reused.
      assertEquals(body.osMunicipalityStatus, "error");
      assertEquals(body.pricePerSqmTrend?.current, null);
      assertEquals(body.areaName, "Athens");
    } finally {
      activeFetch = originalFetch;
      if (prevOsUrl === undefined) Deno.env.delete("MAIPROP_OS_API_URL");
      else Deno.env.set("MAIPROP_OS_API_URL", prevOsUrl);
      if (prevOsEmail === undefined) Deno.env.delete("MAIPROP_OS_EMAIL");
      else Deno.env.set("MAIPROP_OS_EMAIL", prevOsEmail);
      if (prevOsPassword === undefined) Deno.env.delete("MAIPROP_OS_PASSWORD");
      else Deno.env.set("MAIPROP_OS_PASSWORD", prevOsPassword);
      if (prevOpenAI === undefined) Deno.env.delete("OPENAI_API_KEY");
      else Deno.env.set("OPENAI_API_KEY", prevOpenAI);
      if (prevGemini === undefined) Deno.env.delete("GEMINI_API_KEY");
      else Deno.env.set("GEMINI_API_KEY", prevGemini);
      if (prevBudget === undefined) Deno.env.delete("MAIPROP_OS_WAIT_BUDGET_MS");
      else Deno.env.set("MAIPROP_OS_WAIT_BUDGET_MS", prevBudget);
    }
  },
});

Deno.test("version 2 still enforces plan permissions before provider work", async () => {
  const result = await scenario({
    version: 2,
    denied: true,
    deniedReason: "plan_does_not_include_feature",
  });
  assertEquals(result.status, 402);
  assertEquals(result.reservations, 1);
  assertEquals(result.providerCalls, 0);
  assertEquals(result.osCalls, 0);
});

restore();
