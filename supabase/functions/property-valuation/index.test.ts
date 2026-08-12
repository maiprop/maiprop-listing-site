/**
 * Tests for property-valuation edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq, jsonBody } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

const okJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type ValidationErrorBody = {
  code?: string;
  issues?: Array<{ code?: string; path?: Array<string | number> }>;
};

let validationRequestNumber = 50;

const expectValidationError = async (
  body: Record<string, unknown>,
  expectedPath: string | null,
): Promise<void> => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.reject(new Error("request validation reached an external dependency"))) as typeof fetch;
  try {
    validationRequestNumber += 1;
    const res = await handler(req("POST", body, {
      authorization: "Bearer test-valid-token",
      "x-forwarded-for": `10.0.2.${validationRequestNumber}`,
    }));
    const responseBody = await jsonBody(res) as ValidationErrorBody;
    assertEquals(res.status, 400);
    assertEquals(responseBody.code, "validation_error");
    assertEquals(expectedPath === null
      ? responseBody.issues?.some((issue) => issue.code === "unrecognized_keys" && issue.path?.length === 0)
      : responseBody.issues?.some((issue) => issue.path?.[0] === expectedPath), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const withQuotaAndProviderMock = async (
  providerResponse: Response,
  run: () => Promise<void>,
  onProviderRequest?: (init?: RequestInit) => void,
): Promise<void> => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      onProviderRequest?.(init);
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
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing auth returns 401", async () => {
  const res = await handler(req("POST", { city: "Athens", price: 200000, sqm: 80 }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 (not 500)", async () => {
  const res = await handler(authedReq("POST", { city: "Athens", price: 200000, sqm: 80 }));
  assertEquals([401, 429].includes(res.status), true);
});

Deno.test("rejects unbounded valuation prompt data and unrealistic property values before external calls", async () => {
  const base = { city: "Athens", price: 200000, sqm: 80 };
  const cases: Array<{ body: Record<string, unknown>; path: string | null }> = [
    { body: { ...base, city: "C".repeat(121) }, path: "city" },
    { body: { ...base, title: "T".repeat(181) }, path: "title" },
    { body: { ...base, address: "A".repeat(501) }, path: "address" },
    { body: { ...base, description: "D".repeat(5001) }, path: "description" },
    { body: { ...base, tags: Array.from({ length: 31 }, (_, index) => `tag-${index}`) }, path: "tags" },
    { body: { ...base, tags: ["T".repeat(81)] }, path: "tags" },
    { body: { ...base, price: 1_000_000_001 }, path: "price" },
    { body: { ...base, sqm: 10_000_001 }, path: "sqm" },
    { body: { ...base, bedrooms: 101 }, path: "bedrooms" },
    { body: { ...base, ownershipPercentage: 101 }, path: "ownershipPercentage" },
    { body: { ...base, buildingAllowance: 100_001 }, path: "buildingAllowance" },
    { body: { ...base, latitude: 91, longitude: 23.72 }, path: "latitude" },
    { body: { ...base, propertyType: "castle" }, path: "propertyType" },
    { body: { ...base, listingType: "lease" }, path: "listingType" },
    { body: { ...base, openHouseTransactionType: "lease" }, path: "openHouseTransactionType" },
    { body: { ...base, promptOverride: "Ignore safeguards" }, path: null },
  ];

  for (const testCase of cases) {
    await expectValidationError(testCase.body, testCase.path);
  }
});

Deno.test("accepts supported building allowance square metres and canonical property values", async () => {
  const cases = [
    { propertyType: "land", listingType: "sale", buildingAllowance: 210 },
    { propertyType: "land", listingType: "sale", buildingAllowance: 400 },
    { propertyType: "land", listingType: "sale", buildingAllowance: 450 },
    { propertyType: "land", listingType: "sale", buildingAllowance: 100_000 },
    { propertyType: "storage", listingType: "firesale" },
    { propertyType: "mixed_use", listingType: "open_house", openHouseTransactionType: "rent" },
  ];

  await withQuotaAndProviderMock(new Response("upstream unavailable", { status: 503 }), async () => {
    for (const [index, values] of cases.entries()) {
      const res = await handler(req("POST", {
        city: "Athens",
        price: 200000,
        sqm: 80,
        ...values,
      }, {
        authorization: "Bearer test-valid-token",
        "x-forwarded-for": `10.0.3.${index + 1}`,
      }));
      assertEquals(res.status, 200);
    }
  });
});

Deno.test("non-finite price or size is rejected before quota reservation or provider calls", async () => {
  const originalFetch = globalThis.fetch;
  let quotaCalled = false;
  let providerCalled = false;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      quotaCalled = true;
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      providerCalled = true;
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    const res = await handler(req("POST", {
      city: "Athens",
      price: "not-a-price",
      sqm: "80",
      propertyType: "apartment",
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as { error?: string };
    assertEquals(res.status, 400);
    assertEquals(body.error, "Invalid valuation price");
    assertEquals(quotaCalled, false);
    assertEquals(providerCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("provider usage limit returns fallback valuation instead of an unavailable error", async () => {
  await withQuotaAndProviderMock(okJson({ error: "quota" }, 429), async () => {
    const res = await handler(req("POST", {
      city: "Athens",
      price: 200000,
      sqm: 80,
      propertyType: "apartment",
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as { error?: string; generatedBy?: string; estimatedValue?: number };
    assertEquals(res.status, 200);
    assertEquals(typeof body.error, "undefined");
    assertEquals(body.generatedBy, "fallback");
    assertEquals(body.estimatedValue, 208000);
  });
});

Deno.test("provider server errors return fallback valuation instead of failing the module", async () => {
  await withQuotaAndProviderMock(new Response("upstream unavailable", { status: 503 }), async () => {
    const res = await handler(req("POST", {
      city: "Athens",
      price: 300000,
      sqm: 100,
      propertyType: "apartment",
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as { error?: string; generatedBy?: string; estimatedValue?: number };
    assertEquals(res.status, 200);
    assertEquals(typeof body.error, "undefined");
    assertEquals(body.generatedBy, "fallback");
    assertEquals(body.estimatedValue, 260000);
  });
});

Deno.test("provider transport failures return fallback valuation instead of a 500", async () => {
  const originalFetch = globalThis.fetch;
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.delete("OPENAI_API_KEY");
  Deno.env.set("GEMINI_API_KEY", "gemini-test");

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url.includes("generativelanguage.googleapis.com")) {
      return Promise.reject(new TypeError("network down"));
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      city: "Glyfada",
      address: "11 Dimitarchou Aggelou Metaxa",
      price: 275000,
      sqm: 39,
      propertyType: "apartment",
      listingType: "new_build",
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as { error?: string; generatedBy?: string; estimatedValue?: number };
    assertEquals(res.status, 200);
    assertEquals(typeof body.error, "undefined");
    assertEquals(body.generatedBy, "fallback");
    assertEquals(body.estimatedValue, 243360);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
  }
});

Deno.test("fallback valuation uses location benchmarks instead of copying the listed price", async () => {
  await withQuotaAndProviderMock(new Response("upstream unavailable", { status: 503 }), async () => {
    const res = await handler(req("POST", {
      city: "Δήμος Γλυφάδας",
      region: "Δήμος Γλυφάδας",
      address: "11 Δημάρχου Άγγελου Μεταξά",
      price: 275000,
      sqm: 39,
      propertyType: "apartment",
      listingType: "new_build",
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as {
      generatedBy?: string;
      estimatedValue?: number;
      marketComparisonPct?: number;
      methodUsed?: string;
      summary?: string;
      redFlags?: string[];
    };
    assertEquals(res.status, 200);
    assertEquals(body.generatedBy, "fallback");
    assertEquals(body.estimatedValue, 243360);
    assertEquals(body.marketComparisonPct, -12);
    assertEquals(body.methodUsed, "Deterministic fallback using 2026 Greece location/type benchmark ranges");
    assertEquals(body.summary?.includes("copying the listed price"), true);
    assertEquals(body.redFlags?.some((flag) => /provider|fallback/i.test(flag)), false);
  });
});

Deno.test("rental listings reject sale-style provider values and remain on monthly-rent units", async () => {
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");

  let providerPrompt = "";
  await withQuotaAndProviderMock(okJson({
    choices: [{
      message: {
        content: JSON.stringify({
          estimatedValue: 178000,
          rangeLow: 168000,
          rangeHigh: 188000,
          executionValue: 158000,
          pricePerSqmEstimate: 4564,
          confidence: 62,
          confidenceLabel: "Medium",
          liquidityScore: 74,
          marketComparison: "below_market",
          marketComparisonPct: -99,
          pricingPosition: "underpriced",
          methodUsed: "Rental listing capital-value benchmark",
          valuationMode: "MODE_1_LISTING_ONLY",
          summary: "Capital estimate for a rental open house.",
          keyFactors: [],
          legalCleanliness: 65,
          planningCertainty: 70,
          taxFriction: 30,
          transferReadiness: 62,
          legalSummary: "Standard rental listing.",
          taxSummary: "Standard Greek transaction friction.",
          objectiveValueProxy: null,
          renovationPotential: null,
          rentalYieldEstimate: 0.047,
          highestBestUseHint: "Long-term rental",
          redFlags: [],
          auctionAdjustedValue: null,
          listingQualityScore: 70,
        }),
      },
    }],
  }), async () => {
    try {
      const res = await handler(req("POST", {
        listingId: "rent-open-house-1",
        title: "Glyfada Loft rental open house",
        city: "Glyfada",
        address: "11 Dimitarchou Aggelou Metaxa",
        price: 950,
        sqm: 39,
        propertyType: "apartment",
        listingType: "rent",
      }, { authorization: "Bearer test-valid-token" }));
      const body = await jsonBody(res) as {
        estimatedValue?: number;
        rangeLow?: number;
        rangeHigh?: number;
        executionValue?: number;
        pricePerSqmEstimate?: number;
        confidenceLabel?: string;
        methodUsed?: string;
        marketComparison?: string;
        marketComparisonPct?: number;
        pricingPosition?: string;
        rentalYieldEstimate?: number;
      };

      assertEquals(res.status, 200);
      assertEquals(body.estimatedValue, 950);
      assertEquals(body.rangeLow, 855);
      assertEquals(body.rangeHigh, 1045);
      assertEquals(body.executionValue, 950);
      assertEquals(body.pricePerSqmEstimate, 24.36);
      assertEquals(body.confidenceLabel, "Low");
      assertEquals(body.methodUsed, "Low-confidence monthly-rent fallback using the current asking rent");
      assertEquals(body.marketComparison, "at_market");
      assertEquals(body.marketComparisonPct, 0);
      assertEquals(body.pricingPosition, "fair");
      assertEquals(body.rentalYieldEstimate, 0);
      assertEquals(providerPrompt.includes("RENTAL VALUATION OVERRIDE"), true);
      assertEquals(providerPrompt.includes("monthly rent, not sale value"), true);
      assertEquals(providerPrompt.includes("EUR/sqm/month"), true);
    } finally {
      if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
      else Deno.env.delete("OPENAI_API_KEY");
      if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
      else Deno.env.delete("GEMINI_API_KEY");
    }
  }, (init) => {
    const requestBody = JSON.parse(String(init?.body ?? "{}"));
    providerPrompt = String(requestBody.messages?.[0]?.content ?? "");
  });
});

Deno.test("rental listings reject sale-only OS predictions as lease evidence", async () => {
  const originalFetch = globalThis.fetch;
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  const prevOsUrl = Deno.env.get("MAIPROP_OS_API_URL");
  const prevOsEmail = Deno.env.get("MAIPROP_OS_EMAIL");
  const prevOsPassword = Deno.env.get("MAIPROP_OS_PASSWORD");
  Deno.env.delete("OPENAI_API_KEY");
  Deno.env.delete("GEMINI_API_KEY");
  Deno.env.set("MAIPROP_OS_API_URL", "https://os-sale-only.test");
  Deno.env.set("MAIPROP_OS_EMAIL", "os-sale-only@test.local");
  Deno.env.set("MAIPROP_OS_PASSWORD", "os-password");

  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url === "https://os-sale-only.test/auth/login") {
      return Promise.resolve(okJson({ data: { token: "os-sale-only-token" } }));
    }
    if (url === "https://os-sale-only.test/api/v1/property/valuation") {
      return Promise.resolve(okJson({
        data: {
          propertyPredictedPrice: 440000,
          saleValuationOverviews: [{ similarListings: [{ id: "sale-comp" }], propertyEurPerSqm: 5200 }],
          rentalValuationOverviews: [],
        },
      }));
    }
    return originalFetch(input);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      listingId: "rental-sale-only-os-1",
      title: "Glyfada rental",
      city: "Glyfada",
      address: "Angelou Metaxa 11",
      price: 1200,
      sqm: 80,
      propertyType: "apartment",
      listingType: "rent",
      latitude: 37.86,
      longitude: 23.75,
      yearBuilt: 2022,
    }, {
      authorization: "Bearer test-valid-token",
      "x-forwarded-for": "198.51.100.39",
    }));
    const body = await jsonBody(res) as {
      estimatedValue?: number;
      confidenceLabel?: string;
      methodUsed?: string;
      generatedBy?: string;
      osEstimatedValue?: number;
      osValuationStatus?: string;
    };

    assertEquals(res.status, 200);
    assertEquals(body.estimatedValue, 1200);
    assertEquals(body.confidenceLabel, "Low");
    assertEquals(body.methodUsed, "Low-confidence monthly-rent fallback using the current asking rent");
    assertEquals(body.generatedBy, "fallback");
    assertEquals(body.osEstimatedValue, undefined);
    assertEquals(body.osValuationStatus, "no_prediction");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
    if (prevOsUrl) Deno.env.set("MAIPROP_OS_API_URL", prevOsUrl);
    else Deno.env.delete("MAIPROP_OS_API_URL");
    if (prevOsEmail) Deno.env.set("MAIPROP_OS_EMAIL", prevOsEmail);
    else Deno.env.delete("MAIPROP_OS_EMAIL");
    if (prevOsPassword) Deno.env.set("MAIPROP_OS_PASSWORD", prevOsPassword);
    else Deno.env.delete("MAIPROP_OS_PASSWORD");
  }
});

Deno.test("rental listings use OS lease prices and rental comparables", async () => {
  const originalFetch = globalThis.fetch;
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  const prevOsUrl = Deno.env.get("MAIPROP_OS_API_URL");
  const prevOsEmail = Deno.env.get("MAIPROP_OS_EMAIL");
  const prevOsPassword = Deno.env.get("MAIPROP_OS_PASSWORD");
  Deno.env.delete("OPENAI_API_KEY");
  Deno.env.delete("GEMINI_API_KEY");
  Deno.env.set("MAIPROP_OS_API_URL", "https://os.test");
  Deno.env.set("MAIPROP_OS_EMAIL", "os@test.local");
  Deno.env.set("MAIPROP_OS_PASSWORD", "os-password");

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url === "https://os.test/auth/login") {
      return Promise.resolve(okJson({ data: { token: "os-token" } }));
    }
    if (url === "https://os.test/api/v1/property/valuation") {
      const requestBody = JSON.parse(String(init?.body ?? "{}"));
      assertEquals(requestBody.propertyCategory, "RESIDENCE");
      assertEquals(requestBody.propertySquareMeters, 80);
      return Promise.resolve(okJson({
        data: {
          propertyPredictedPrice: 440000,
          propertyPredictedLeasePrice: 1500,
          annualYieldPrc: 0.043,
          saleValuationOverviews: [{ similarListings: [{ id: "sale-comp" }], propertyEurPerSqm: 5200 }],
          rentalValuationOverviews: [{ similarRentals: [{ id: "rent-comp" }], propertyEurPerSqm: 18.75 }],
        },
      }));
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      listingId: "rental-os-1",
      title: "Glyfada rental",
      city: "Glyfada",
      address: "Angelou Metaxa 11",
      price: 1200,
      sqm: 80,
      propertyType: "apartment",
      listingType: "rent",
      latitude: 37.86,
      longitude: 23.75,
      yearBuilt: 2022,
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as {
      estimatedValue?: number;
      rangeLow?: number;
      rangeHigh?: number;
      executionValue?: number;
      pricePerSqmEstimate?: number;
      methodUsed?: string;
      osEstimatedValue?: number;
      osComparableCounts?: { sale?: number; rental?: number };
    };

    assertEquals(res.status, 200);
    assertEquals(body.estimatedValue, 1500);
    assertEquals(body.rangeLow, 1350);
    assertEquals(body.rangeHigh, 1650);
    assertEquals(body.executionValue, 1500);
    assertEquals(body.pricePerSqmEstimate, 18.75);
    assertEquals(body.methodUsed, "Monthly rental valuation using lease evidence and rental comparables");
    assertEquals(body.osEstimatedValue, 1500);
    assertEquals(body.osComparableCounts?.rental, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
    if (prevOsUrl) Deno.env.set("MAIPROP_OS_API_URL", prevOsUrl);
    else Deno.env.delete("MAIPROP_OS_API_URL");
    if (prevOsEmail) Deno.env.set("MAIPROP_OS_EMAIL", prevOsEmail);
    else Deno.env.delete("MAIPROP_OS_EMAIL");
    if (prevOsPassword) Deno.env.set("MAIPROP_OS_PASSWORD", prevOsPassword);
    else Deno.env.delete("MAIPROP_OS_PASSWORD");
  }
});

Deno.test("uses OpenAI enriched with structured OS valuation when listing coordinates are available", async () => {
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
  let providerCalled = false;
  let providerPrompt = "";
  let providerModel = "";
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url === "https://os.test/auth/login") {
      return Promise.resolve(okJson({ data: { token: "os-token" } }));
    }
    if (url === "https://os.test/api/v1/property/valuation") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assertEquals(body.propertyLatitude, 37.981);
      assertEquals(body.propertyLongitude, 23.735);
      assertEquals(body.propertySquareMeters, 95);
      assertEquals(body.propertyCategory, "RESIDENCE");
      return Promise.resolve(okJson({
        data: {
          propertyPredictedPrice: 470000,
          propertyPredictedLeasePrice: 1500,
          annualYieldPrc: 0.038,
          saleValuationOverviews: [{
            radius: 1,
            avgEurPerSqm: 4900,
            propertyEurPerSqm: 4947,
            similarListings: [{ id: "comp-1" }],
          }],
          rentalValuationOverviews: [{ radius: 1, similarRentals: [{ id: "rent-1" }] }],
        },
      }));
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      providerCalled = true;
      const body = JSON.parse(String(init?.body ?? "{}"));
      providerModel = String(body.model ?? "");
      providerPrompt = String(body.messages?.[0]?.content ?? "");
      return Promise.resolve(okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              estimatedValue: 468000,
              rangeLow: 430000,
              rangeHigh: 505000,
              executionValue: 420000,
              pricePerSqmEstimate: 4926,
              confidence: 82,
              confidenceLabel: "High",
              liquidityScore: 78,
              marketComparison: "above_market",
              marketComparisonPct: 4,
              pricingPosition: "fair",
              methodUsed: "OpenAI enriched valuation with mAI Prop OS data",
              valuationMode: "MODE_2_PUBLIC_ENRICHED",
              summary: "OS valuation data supports a resilient Athens estimate with good liquidity.",
              keyFactors: [{ factor: "OS comparables", impact: "positive", note: "1 sale comp" }],
              legalCleanliness: 68,
              planningCertainty: 72,
              taxFriction: 30,
              transferReadiness: 60,
              legalSummary: "No cadastre data, outside city and settlement plan, no buildability.",
              taxSummary: "Normal transfer friction assumed.",
              objectiveValueProxy: null,
              renovationPotential: null,
              rentalYieldEstimate: 3.9,
              highestBestUseHint: null,
              redFlags: [
                "No cadastre registration",
                "Outside city and settlement plan",
                "No buildability rights",
              ],
              auctionAdjustedValue: null,
              listingQualityScore: 82,
            }),
          },
        }],
      }));
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    const res = await handler(req("POST", {
      listingId: "listing-1",
      title: "Athens 3-bed",
      city: "Athens",
      address: "Kolonaki 12",
      price: 450000,
      sqm: 95,
      propertyType: "apartment",
      listingType: "sale",
      latitude: 37.981,
      longitude: 23.735,
      floor: 4,
      yearBuilt: 2010,
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as {
      estimatedValue?: number;
      rentalYieldEstimate?: number;
      generatedBy?: string;
      marketComparison?: string;
      osEstimatedValue?: number;
      osValuation?: unknown;
      osDataSources?: string[];
      osComparableCounts?: { sale?: number; rental?: number };
      redFlags?: string[];
      legalSummary?: string;
    };
    assertEquals(res.status, 200);
    assertEquals(providerCalled, true);
    assertEquals(providerModel, "gpt-5.4-mini");
    assertEquals(providerPrompt.includes("MAIPROP OS STRUCTURED VALUATION DATA"), true);
    assertEquals(providerPrompt.includes("propertyPredictedPrice"), true);
    assertEquals(body.generatedBy, "openai_maiprop_os");
    assertEquals(body.estimatedValue, 468000);
    assertEquals(body.osEstimatedValue, 470000);
    assertEquals(Object.prototype.hasOwnProperty.call(body, "osValuation"), false);
    assertEquals(body.osDataSources?.includes("mAI Prop OS structured valuation API"), true);
    assertEquals(body.osComparableCounts?.sale, 1);
    assertEquals(body.osComparableCounts?.rental, 1);
    assertEquals(body.rentalYieldEstimate, 3.9);
    assertEquals(body.marketComparison, "at_market");
    assertEquals(body.redFlags?.some((flag) => /no cadastre|outside city|no buildability/i.test(flag)), false);
    assertEquals(/outside|no cadastre|buildability|buildable/i.test(body.legalSummary ?? ""), false);
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

Deno.test("reuses the structured OS auth token across warm valuation requests", async () => {
  const originalFetch = globalThis.fetch;
  const prevOsUrl = Deno.env.get("MAIPROP_OS_API_URL");
  const prevOsEmail = Deno.env.get("MAIPROP_OS_EMAIL");
  const prevOsPassword = Deno.env.get("MAIPROP_OS_PASSWORD");
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("MAIPROP_OS_API_URL", "https://os-cache.test");
  Deno.env.set("MAIPROP_OS_EMAIL", "os-cache@test.local");
  Deno.env.set("MAIPROP_OS_PASSWORD", "os-password");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");

  let authCalls = 0;
  let valuationCalls = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url === "https://os-cache.test/auth/login") {
      authCalls += 1;
      return Promise.resolve(okJson({ data: { token: "os-cache-token" } }));
    }
    if (url === "https://os-cache.test/api/v1/property/valuation") {
      valuationCalls += 1;
      assertEquals((init?.headers as Record<string, string>)?.Authorization, "Bearer os-cache-token");
      return Promise.resolve(okJson({
        data: {
          propertyPredictedPrice: 300000 + valuationCalls,
          saleValuationOverviews: [{ radius: 1, similarListings: [{ id: `comp-${valuationCalls}` }] }],
          rentalValuationOverviews: [],
        },
      }));
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      return Promise.resolve(okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              estimatedValue: 300000 + valuationCalls,
              rangeLow: 280000,
              rangeHigh: 320000,
              executionValue: 270000,
              pricePerSqmEstimate: 3000,
              confidence: 75,
              confidenceLabel: "High",
              liquidityScore: 70,
              marketComparison: "at_market",
              marketComparisonPct: 0,
              pricingPosition: "fair",
              methodUsed: "OpenAI enriched valuation with mAI Prop OS data",
              valuationMode: "MODE_2_PUBLIC_ENRICHED",
              summary: "OS-backed warm request.",
              keyFactors: [],
              legalCleanliness: 70,
              planningCertainty: 72,
              taxFriction: 25,
              transferReadiness: 68,
              legalSummary: "Standard transfer assumptions.",
              taxSummary: "Normal transfer friction assumed.",
              objectiveValueProxy: null,
              renovationPotential: null,
              rentalYieldEstimate: 4,
              highestBestUseHint: null,
              redFlags: [],
              auctionAdjustedValue: null,
              listingQualityScore: 75,
            }),
          },
        }],
      }));
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    for (const listingId of ["warm-1", "warm-2"]) {
      const res = await handler(req("POST", {
        listingId,
        title: "Warm OS listing",
        city: "Athens",
        address: "Warm 1",
        price: 300000,
        sqm: 100,
        propertyType: "apartment",
        listingType: "sale",
        latitude: 37.981,
        longitude: 23.735,
      }, {
        authorization: "Bearer test-valid-token",
        "x-forwarded-for": "2.2.2.2",
      }));
      const body = await jsonBody(res) as { generatedBy?: string };
      assertEquals(res.status, 200);
      assertEquals(body.generatedBy, "openai_maiprop_os");
    }

    assertEquals(authCalls, 1);
    assertEquals(valuationCalls, 2);
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

Deno.test("new-build valuations skip mAI Prop OS and ask AI for similar-property reasoning", async () => {
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
  let providerModel = "";
  let providerReasoningEffort = "";
  let osCalled = false;

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url.startsWith("https://os.test")) {
      osCalled = true;
      return Promise.resolve(okJson({ data: { token: "os-token" } }));
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      const requestBody = JSON.parse(String(init?.body ?? "{}"));
      providerModel = String(requestBody.model ?? "");
      providerReasoningEffort = String(requestBody.reasoning_effort ?? "");
      providerPrompt = String(requestBody.messages?.[0]?.content ?? "");
      return Promise.resolve(okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              estimatedValue: 310000,
              rangeLow: 292000,
              rangeHigh: 333000,
              executionValue: 276000,
              pricePerSqmEstimate: 7100,
              confidence: 72,
              confidenceLabel: "Medium",
              liquidityScore: 76,
              marketComparison: "below_market",
              marketComparisonPct: -11,
              pricingPosition: "underpriced",
              methodUsed: "AI-only new-build similar-property benchmark",
              valuationMode: "MODE_1_LISTING_ONLY",
              summary: "New-build estimate based on similar off-plan apartments and unit attributes.",
              keyFactors: [{ factor: "Similar new-build units", impact: "positive", note: "Comparable unit class" }],
              legalCleanliness: 68,
              planningCertainty: 72,
              taxFriction: 30,
              transferReadiness: 62,
              legalSummary: "New-build permit and title review still required.",
              taxSummary: "Normal transfer friction assumed.",
              objectiveValueProxy: null,
              renovationPotential: null,
              rentalYieldEstimate: 4.1,
              highestBestUseHint: null,
              redFlags: [],
              auctionAdjustedValue: null,
              listingQualityScore: 72,
            }),
          },
        }],
      }));
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      listingId: "new-build-1",
      title: "Glifada new-build selected unit",
      city: "Glyfada",
      address: "11 Dimitarchou Aggelou Metaxa",
      price: 350000,
      sqm: 48.75,
      pricePerSqm: 7179,
      propertyType: "apartment",
      listingType: "new_build",
      latitude: 37.8636122,
      longitude: 23.7503394,
      floor: 1,
      yearBuilt: 2026,
      energyClass: "B+",
      hasParking: true,
      hasPool: true,
      tags: ["penthouse", "parking", "pool"],
      description: "Penthouse-style new-build unit with private parking, pool access, balcony, premium finishes, and sea-view potential.",
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as {
      generatedBy?: string;
      estimatedValue?: number;
      osValuationStatus?: string;
      osDataSources?: string[];
    };

    assertEquals(res.status, 200);
    assertEquals(osCalled, false);
    assertEquals(providerModel, "gpt-5.4");
    assertEquals(providerReasoningEffort, "medium");
    assertEquals(providerPrompt.includes("MAIPROP OS STRUCTURED VALUATION DATA"), false);
    assertEquals(providerPrompt.includes("NEW-BUILD AI-ONLY COMPARABLE VALUATION"), true);
    assertEquals(providerPrompt.includes("most similar new-build, off-plan, or recently completed properties"), true);
    assertEquals(providerPrompt.includes("nearby"), true);
    assertEquals(providerPrompt.includes("parking"), true);
    assertEquals(providerPrompt.includes("pool"), true);
    assertEquals(providerPrompt.includes("penthouse"), true);
    assertEquals(providerPrompt.includes("adjust premium or discount"), true);
    assertEquals(body.generatedBy, "openai");
    assertEquals(body.estimatedValue, 310000);
    assertEquals(body.osValuationStatus, "skipped_new_build_ai_only");
    assertEquals(body.osDataSources, undefined);
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

Deno.test("normalizes auction comparison against clean market value and softens unknown legal fields", async () => {
  const originalFetch = globalThis.fetch;
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      return Promise.resolve(okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              estimatedValue: 130000,
              rangeLow: 120000,
              rangeHigh: 140000,
              executionValue: 115000,
              pricePerSqmEstimate: 1450,
              confidence: 45,
              confidenceLabel: "Low",
              liquidityScore: 50,
              marketComparison: "below_market",
              marketComparisonPct: -15,
              pricingPosition: "underpriced",
              methodUsed: "Comparable hedonic model with auction overlay",
              valuationMode: "MODE_1_LISTING_ONLY",
              summary: "Auction valuation with limited listing data.",
              keyFactors: [],
              legalCleanliness: 25,
              planningCertainty: 30,
              taxFriction: 60,
              transferReadiness: 30,
              legalSummary: "No cadastre data, outside city and settlement plan, no buildability.",
              taxSummary: "Auction transfer friction applies.",
              objectiveValueProxy: null,
              renovationPotential: null,
              rentalYieldEstimate: 4,
              highestBestUseHint: null,
              redFlags: [
                "No cadastre registration",
                "Outside city and settlement plan",
                "No buildability rights",
                "Auction sale with legal/title uncertainty",
              ],
              auctionAdjustedValue: "EUR154.000",
              listingQualityScore: 5,
            }),
          },
        }],
      }));
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      title: "Auction apartment",
      city: "Agios Dimitrios",
      address: "Arpis 44",
      price: 154000,
      sqm: 90,
      propertyType: "apartment",
      listingType: "auction",
      latitude: 37.94,
      longitude: 23.73,
      floor: 1,
      yearBuilt: 1975,
    }, { authorization: "Bearer test-valid-token" }));

    const body = await jsonBody(res) as {
      marketComparison?: string;
      marketComparisonPct?: number;
      pricingPosition?: string;
      legalCleanliness?: number;
      planningCertainty?: number;
      taxFriction?: number;
      transferReadiness?: number;
      redFlags?: string[];
      listingQualityScore?: number;
    };

    assertEquals(res.status, 200);
    assertEquals(body.marketComparison, "at_market");
    assertEquals(body.marketComparisonPct, 0);
    assertEquals(body.pricingPosition, "fair");
    assertEquals((body.legalCleanliness ?? 0) >= 50, true);
    assertEquals((body.planningCertainty ?? 0) >= 60, true);
    assertEquals((body.taxFriction ?? 100) <= 55, true);
    assertEquals((body.transferReadiness ?? 0) >= 45, true);
    assertEquals(body.redFlags?.some((flag) => /no cadastre|outside city|no buildability/i.test(flag)), false);
    assertEquals((body.listingQualityScore ?? 0) >= 60, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
  }
});

Deno.test("caps legal scores when listing data confirms planning/buildability defects", async () => {
  const originalFetch = globalThis.fetch;
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");

  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      return Promise.resolve(okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              estimatedValue: 210000,
              rangeLow: 190000,
              rangeHigh: 225000,
              executionValue: 185000,
              pricePerSqmEstimate: 2100,
              confidence: 80,
              confidenceLabel: "High",
              liquidityScore: 82,
              marketComparison: "at_market",
              marketComparisonPct: 0,
              pricingPosition: "fair",
              methodUsed: "AI valuation",
              valuationMode: "MODE_1_LISTING_ONLY",
              summary: "Good data but confirmed planning defects exist.",
              keyFactors: [],
              legalCleanliness: 95,
              planningCertainty: 98,
              taxFriction: 10,
              transferReadiness: 97,
              legalSummary: "Listing explicitly states it is outside plan and not buildable.",
              taxSummary: "Transfer friction elevated by confirmed planning risk.",
              objectiveValueProxy: null,
              renovationPotential: null,
              rentalYieldEstimate: 4.2,
              highestBestUseHint: null,
              redFlags: [
                "Outside city and settlement plan",
                "No buildability rights",
              ],
              auctionAdjustedValue: null,
              listingQualityScore: 80,
            }),
          },
        }],
      }));
    }
    return originalFetch(input);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      title: "Planning risk apartment",
      city: "Athens",
      price: 210000,
      sqm: 100,
      propertyType: "apartment",
      listingType: "sale",
      withinCityPlan: false,
      withinSettlement: false,
      isBuildable: false,
    }, { authorization: "Bearer test-valid-token" }));

    const body = await jsonBody(res) as {
      legalCleanliness?: number;
      planningCertainty?: number;
      taxFriction?: number;
      transferReadiness?: number;
      redFlags?: string[];
    };

    assertEquals(res.status, 200);
    assertEquals((body.legalCleanliness ?? 100) <= 50, true);
    assertEquals((body.planningCertainty ?? 100) <= 55, true);
    assertEquals((body.transferReadiness ?? 100) <= 60, true);
    assertEquals((body.taxFriction ?? 0) >= 50, true);
    assertEquals(body.redFlags?.some((flag) => /outside city|buildability/i.test(flag)), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
  }
});

Deno.test("uses separate clean-listing valuation instructions for non-auction ads", async () => {
  const originalFetch = globalThis.fetch;
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");
  let providerPrompt = "";

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      const requestBody = JSON.parse(String(init?.body ?? "{}"));
      providerPrompt = String(requestBody.messages?.[0]?.content ?? "");
      return Promise.resolve(okJson({
        choices: [{ message: { content: JSON.stringify({
          estimatedValue: 260000,
          rangeLow: 240000,
          rangeHigh: 280000,
          executionValue: 230000,
          pricePerSqmEstimate: 2600,
          confidence: 72,
          confidenceLabel: "Medium",
          liquidityScore: 76,
          marketComparison: "at_market",
          marketComparisonPct: 0,
          pricingPosition: "fair",
          methodUsed: "Clean listing valuation",
          valuationMode: "MODE_1_LISTING_ONLY",
          summary: "Clean listing market valuation.",
          keyFactors: [],
          legalCleanliness: 72,
          planningCertainty: 75,
          taxFriction: 28,
          transferReadiness: 70,
          legalSummary: "Clean listing assumption.",
          taxSummary: "Standard transfer friction.",
          objectiveValueProxy: null,
          renovationPotential: null,
          rentalYieldEstimate: 4.2,
          highestBestUseHint: null,
          redFlags: [],
          auctionAdjustedValue: null,
          listingQualityScore: 72,
        }) } }],
      }));
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      title: "Clean listing apartment",
      city: "Athens",
      price: 260000,
      sqm: 100,
      propertyType: "apartment",
      listingType: "sale",
    }, { authorization: "Bearer test-valid-token" }));
    assertEquals(res.status, 200);
    assertEquals(providerPrompt.includes("CLEAN LISTING ASSUMPTION"), true);
    assertEquals(providerPrompt.includes("ready to transact"), true);
    assertEquals(providerPrompt.includes("AUCTION-SPECIFIC RISK MODEL"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
  }
});

Deno.test("uses auction-specific valuation instructions for legal risk and limited observability", async () => {
  const originalFetch = globalThis.fetch;
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");
  let providerPrompt = "";

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      const requestBody = JSON.parse(String(init?.body ?? "{}"));
      providerPrompt = String(requestBody.messages?.[0]?.content ?? "");
      return Promise.resolve(okJson({
        choices: [{ message: { content: JSON.stringify({
          estimatedValue: 130000,
          rangeLow: 115000,
          rangeHigh: 142000,
          executionValue: 112000,
          pricePerSqmEstimate: 1450,
          confidence: 52,
          confidenceLabel: "Medium",
          liquidityScore: 46,
          marketComparison: "below_market",
          marketComparisonPct: -10,
          pricingPosition: "overpriced",
          methodUsed: "Auction valuation with legal and observability overlay",
          valuationMode: "MODE_1_LISTING_ONLY",
          summary: "Auction-specific valuation.",
          keyFactors: [],
          legalCleanliness: 50,
          planningCertainty: 60,
          taxFriction: 55,
          transferReadiness: 45,
          legalSummary: "Auction legal risk requires review.",
          taxSummary: "Auction transfer friction.",
          objectiveValueProxy: null,
          renovationPotential: null,
          rentalYieldEstimate: 4,
          highestBestUseHint: null,
          redFlags: ["Auction due diligence required"],
          auctionAdjustedValue: 154000,
          listingQualityScore: 60,
        }) } }],
      }));
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      title: "Auction apartment",
      city: "Agios Dimitrios",
      price: 154000,
      sqm: 90,
      propertyType: "apartment",
      listingType: "auction",
      auctionCourt: "Athens Court",
    }, { authorization: "Bearer test-valid-token" }));
    assertEquals(res.status, 200);
    assertEquals(providerPrompt.includes("AUCTION-SPECIFIC RISK MODEL"), true);
    assertEquals(providerPrompt.includes("legal risk"), true);
    assertEquals(providerPrompt.includes("limited observability"), true);
    assertEquals(providerPrompt.includes("CLEAN LISTING ASSUMPTION"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
  }
});

restore();
