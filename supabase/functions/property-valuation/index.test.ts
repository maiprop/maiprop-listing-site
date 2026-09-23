import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, jsonBody } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");
restore();

const okJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let requestNumber = 10;
const request = (body: Record<string, unknown>, auth = true) => req("POST", body, {
  ...(auth ? { authorization: "Bearer test-valid-token" } : {}),
  "x-forwarded-for": `10.77.0.${requestNumber++}`,
});
const base = (overrides: Record<string, unknown> = {}) => ({
  responseVersion: 2,
  city: "Athens",
  price: 320000,
  sqm: 80,
  propertyType: "apartment",
  listingType: "sale",
  ...overrides,
});

type Calls = { auth: number; quota: number; osAuth: number; osValuation: number; ai: number; osBody?: Record<string, unknown> };
const withProviders = async (options: {
  os?: Record<string, unknown> | Response;
  ai?: unknown | Response;
  quota?: { allowed: boolean; reason?: string | null };
  osConfigured?: boolean;
  aiConfigured?: boolean;
}, run: (calls: Calls) => Promise<void>) => {
  const originalFetch = globalThis.fetch;
  const saved = new Map<string, string | undefined>();
  for (const name of ["MAIPROP_OS_API_URL", "MAIPROP_OS_EMAIL", "MAIPROP_OS_PASSWORD", "OPENAI_API_KEY", "GEMINI_API_KEY"]) saved.set(name, Deno.env.get(name));
  if (options.osConfigured) {
    Deno.env.set("MAIPROP_OS_API_URL", "https://os.test");
    Deno.env.set("MAIPROP_OS_EMAIL", "os@test.local");
    Deno.env.set("MAIPROP_OS_PASSWORD", "secret");
  } else {
    Deno.env.delete("MAIPROP_OS_API_URL"); Deno.env.delete("MAIPROP_OS_EMAIL"); Deno.env.delete("MAIPROP_OS_PASSWORD");
  }
  if (options.aiConfigured) Deno.env.set("OPENAI_API_KEY", "openai-test");
  else Deno.env.delete("OPENAI_API_KEY");
  Deno.env.delete("GEMINI_API_KEY");
  const calls: Calls = { auth: 0, quota: 0, osAuth: 0, osValuation: 0, ai: 0 };
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) { calls.auth += 1; return Promise.resolve(okJson({ user: { id: "user-1" } })); }
    if (url.includes("reserve_ai_quota_for_user")) { calls.quota += 1; return Promise.resolve(okJson({ allowed: options.quota?.allowed ?? true, reason: options.quota?.reason ?? null, used: 1, limit: 5 })); }
    if (url === "https://os.test/auth/login") { calls.osAuth += 1; return Promise.resolve(okJson({ data: { token: "os-token" } })); }
    if (url.includes("/api/v1/property/valuation")) {
      calls.osValuation += 1;
      calls.osBody = JSON.parse(String(init?.body ?? "{}"));
      return Promise.resolve(options.os instanceof Response ? options.os.clone() : okJson({ data: options.os ?? {} }));
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      calls.ai += 1;
      if (options.ai instanceof Response) return Promise.resolve(options.ai.clone());
      return Promise.resolve(okJson({ choices: [{ message: { content: JSON.stringify(options.ai ?? {}) } }] }));
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try { await run(calls); } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of saved) {
      if (value == null) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
};

Deno.test("OPTIONS preflight returns 200", async () => assertEquals((await handler(req("OPTIONS"))).status, 200));

Deno.test("invalid version is rejected before authentication, reservation, or providers", async () => {
  await withProviders({ osConfigured: true, aiConfigured: true }, async (calls) => {
    const res = await handler(request({ ...base(), responseVersion: 3 }));
    assertEquals(res.status, 400);
    assertEquals(calls, { auth: 0, quota: 0, osAuth: 0, osValuation: 0, ai: 0 });
  });
});

Deno.test("authenticated legacy caller receives handled unavailable without quota or provider work", async () => {
  await withProviders({ osConfigured: true, aiConfigured: true }, async (calls) => {
    const res = await handler(request({ city: "Athens", price: 320000, sqm: 80 }));
    const body = await jsonBody(res) as { code?: string };
    assertEquals(res.status, 503);
    assertEquals(body.code, "valuation_unavailable");
    assertEquals(calls.auth, 1); assertEquals(calls.quota, 0); assertEquals(calls.osValuation, 0); assertEquals(calls.ai, 0);
  });
});

Deno.test("no OS or AI evidence returns controlled unavailable after one reservation", async () => {
  await withProviders({}, async (calls) => {
    const res = await handler(request(base()));
    const body = await jsonBody(res) as { code?: string; error?: string };
    assertEquals(res.status, 503); assertEquals(body.code, "valuation_unavailable");
    assertEquals(calls.ai, 0); assertEquals(calls.osValuation, 0);
    assertEquals(body.error, "Valuation evidence unavailable");
  });
});

Deno.test("OS sale prediction produces supported primary, density, and asking comparison", async () => {
  await withProviders({ osConfigured: true, os: { propertyPredictedPrice: 400000 } }, async (calls) => {
    const res = await handler(request(base({ latitude: 37.98, longitude: 23.72, floor: 0, yearBuilt: 2005 })));
    const body = await jsonBody(res) as Record<string, unknown>;
    assertEquals(res.status, 200); assertEquals(body.responseVersion, 2); assertEquals(body.estimatedValue, 400000);
    assertEquals(body.pricePerSqmEstimate, 5000); assertEquals(body.marketComparisonPct, -20); assertEquals(body.marketComparison, "below_market");
    assertEquals(body.pricingPosition, "underpriced"); assertEquals(body.executionValue, null); assertEquals(body.legalCleanliness, null);
    assertEquals(calls.osValuation, 1); assertEquals(calls.ai, 0);
    assertEquals(calls.osBody?.constructionYear, 2005); assertEquals(calls.osBody?.propertyFloor, 0);
  });
});

Deno.test("missing OS required traits skips OS instead of inventing year, floor, coordinates, or category", async () => {
  await withProviders({ osConfigured: true }, async (calls) => {
    const res = await handler(request(base({ propertyType: undefined })));
    assertEquals(res.status, 503); assertEquals(calls.osAuth, 0); assertEquals(calls.osValuation, 0);
  });
});

Deno.test("OS lease prediction is retained as unknown-period partial and never promoted to monthly rent", async () => {
  await withProviders({ osConfigured: true, os: { propertyPredictedLeasePrice: 1800 } }, async () => {
    const res = await handler(request(base({ listingType: "rent", price: 1600, latitude: 37.98, longitude: 23.72, floor: 2, yearBuilt: 2005 })));
    const body = await jsonBody(res) as Record<string, unknown>;
    assertEquals(res.status, 200); assertEquals(body.status, "partial"); assertEquals(body.estimatedValue, null);
    assertEquals(body.marketComparisonPct, null); assertEquals(body.providerPrediction, { value: 1800, field: "propertyPredictedLeasePrice", model: "market", unit: null });
  });
});

Deno.test("OS auction prediction retains auction-model basis without clean-market comparison", async () => {
  await withProviders({ osConfigured: true, os: { propertyPredictedPrice: 250000 } }, async () => {
    const res = await handler(request(base({ listingType: "auction", latitude: 37.98, longitude: 23.72, floor: 1, yearBuilt: 1990 })));
    const body = await jsonBody(res) as Record<string, unknown>;
    assertEquals(res.status, 200); assertEquals(body.estimateBasis, "os_auction_model"); assertEquals(body.estimatedValue, 250000);
    assertEquals(body.auctionAdjustedValue, null); assertEquals(body.marketComparisonPct, null); assertEquals(body.executionValue, null);
  });
});

Deno.test("OS auction model and AI clean estimate retain separate basis, provenance, and clean range", async () => {
  await withProviders({ osConfigured: true, aiConfigured: true, os: { propertyPredictedPrice: 250000 }, ai: {
    auctionAdjustedValue: 400000, rangeLow: 380000, rangeHigh: 420000, confidence: 0,
    summary: "Modelled clean-title counterfactual; title documents were not reviewed.",
  } }, async () => {
    const res = await handler(request(base({ listingType: "auction", latitude: 37.98, longitude: 23.72, floor: 1, yearBuilt: 1990 })));
    const body = await jsonBody(res) as Record<string, unknown>;
    assertEquals(res.status, 200); assertEquals(body.estimatedValue, 250000); assertEquals(body.auctionAdjustedValue, 400000);
    assertEquals(body.rangeBasis, "auctionAdjustedValue"); assertEquals(body.marketComparisonPct, -20); assertEquals(body.confidence, 0);
    const evidence = body.evidence as { fields: Record<string, string> };
    assertEquals(evidence.fields.estimatedValue, "os_prediction"); assertEquals(evidence.fields.auctionAdjustedValue, "ai_estimate");
  });
});

Deno.test("AI-only new build can return an uncertain estimate or useful analysis-only partial", async () => {
  await withProviders({ osConfigured: true, aiConfigured: true, ai: { estimatedValue: 310000, rangeLow: 300000, rangeHigh: 330000, summary: "Representative-unit model analysis." } }, async (calls) => {
    const res = await handler(request(base({ listingType: "new_build" })));
    const body = await jsonBody(res) as Record<string, unknown>;
    assertEquals(res.status, 200); assertEquals(body.estimatedValue, 310000); assertEquals((body.evidence as { fields: Record<string, string> }).fields.estimatedValue, "ai_estimate");
    assertEquals(calls.osValuation, 0); assertEquals(calls.ai, 1);
  });
  await withProviders({ aiConfigured: true, ai: { renovationPotential: "Inspection-led renovation analysis." } }, async () => {
    const res = await handler(request(base({ listingType: "new_build" })));
    const body = await jsonBody(res) as Record<string, unknown>;
    assertEquals(res.status, 200); assertEquals(body.status, "partial"); assertEquals(body.estimatedValue, null);
    assertEquals(body.renovationPotential, "Inspection-led renovation analysis.");
  });
});

Deno.test("empty, malformed, scalar, or auth-looking upstream failures are sanitized unavailable responses", async () => {
  for (const ai of [{}, new Response("not-json", { status: 200 }), new Response("JWT expired upstream", { status: 401 })]) {
    await withProviders({ aiConfigured: true, ai }, async (calls) => {
      const res = await handler(request(base({ listingType: "new_build" })));
      const body = await jsonBody(res) as { error?: string; code?: string };
      assertEquals(res.status, 503); assertEquals(body.code, "valuation_unavailable"); assertEquals(body.error, "Valuation evidence unavailable");
      assertEquals(calls.ai, 1);
    });
  }
});

Deno.test("authentication denial performs no OS or AI work", async () => {
  await withProviders({ osConfigured: true, aiConfigured: true }, async (calls) => {
    const res = await handler(request(base({ latitude: 37.98, longitude: 23.72, floor: 1, yearBuilt: 2000 }), false));
    assertEquals(res.status, 401); assertEquals(calls.osValuation, 0); assertEquals(calls.ai, 0);
  });
});

Deno.test("conflicting open-house rental asking values fail before reservation", async () => {
  await withProviders({ aiConfigured: true }, async (calls) => {
    const res = await handler(request(base({ listingType: "open_house", openHouseTransactionType: "rent", price: 1500, askingMonthlyRent: 1600 })));
    const body = await jsonBody(res) as { error?: string };
    assertEquals(res.status, 400); assertMatch(body.error ?? "", /must match/); assertEquals(calls.quota, 0); assertEquals(calls.ai, 0);
  });
});
