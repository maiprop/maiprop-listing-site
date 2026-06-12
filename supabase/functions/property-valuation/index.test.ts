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

const withQuotaAndProviderMock = async (
  providerResponse: Response,
  run: () => Promise<void>,
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
    assertEquals(body.estimatedValue, 200000);
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
    assertEquals(body.estimatedValue, 300000);
  });
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

restore();
