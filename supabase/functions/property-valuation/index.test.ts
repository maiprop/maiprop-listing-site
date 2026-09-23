import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, jsonBody } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts", {
  MAIPROP_EDGE_TEST_AUTH_BYPASS: "false",
});
restore();
const nativeFetch = globalThis.fetch;
let activeProviderFetch: typeof fetch = nativeFetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => activeProviderFetch(input, init)) as typeof fetch;

const okJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let requestNumber = 10;
let providerUserNumber = 1;
const request = (body: Record<string, unknown>, auth = true) => {
  const sequence = requestNumber++;
  return req("POST", body, {
    ...(auth ? { authorization: `Bearer test-valid-token-${sequence}` } : {}),
    "x-forwarded-for": `10.77.0.${sequence}`,
  });
};
const base = (overrides: Record<string, unknown> = {}) => ({
  responseVersion: 2,
  city: "Athens",
  price: 320000,
  sqm: 80,
  propertyType: "apartment",
  listingType: "sale",
  ...overrides,
});

type Calls = {
  auth: number; quota: number; osAuth: number; osValuation: number; ai: number;
  order: string[];
  osBody?: Record<string, unknown>;
  aiBody?: Record<string, unknown>;
};
const withProviders = async (options: {
  os?: Record<string, unknown> | Response;
  ai?: unknown | Response;
  quota?: { allowed: boolean; reason?: string | null };
  quotaResponse?: Response;
  osConfigured?: boolean;
  aiConfigured?: boolean;
  osUrl?: string;
  userId?: string;
}, run: (calls: Calls) => Promise<void>) => {
  const saved = new Map<string, string | undefined>();
  for (const name of ["MAIPROP_OS_API_URL", "MAIPROP_OS_EMAIL", "MAIPROP_OS_PASSWORD", "OPENAI_API_KEY", "GEMINI_API_KEY"]) saved.set(name, Deno.env.get(name));
  if (options.osConfigured) {
    Deno.env.set("MAIPROP_OS_API_URL", options.osUrl ?? "https://os.test");
    Deno.env.set("MAIPROP_OS_EMAIL", "os@test.local");
    Deno.env.set("MAIPROP_OS_PASSWORD", "secret");
  } else {
    Deno.env.delete("MAIPROP_OS_API_URL"); Deno.env.delete("MAIPROP_OS_EMAIL"); Deno.env.delete("MAIPROP_OS_PASSWORD");
  }
  if (options.aiConfigured) Deno.env.set("OPENAI_API_KEY", "openai-test");
  else Deno.env.delete("OPENAI_API_KEY");
  Deno.env.delete("GEMINI_API_KEY");
  const userId = options.userId ?? `user-${providerUserNumber++}`;
  const calls: Calls = { auth: 0, quota: 0, osAuth: 0, osValuation: 0, ai: 0, order: [] };
  activeProviderFetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) { calls.auth += 1; calls.order.push("auth"); return Promise.resolve(okJson({ id: userId, email: `${userId}@test.local` })); }
    if (url.includes("reserve_ai_quota_for_user")) {
      calls.quota += 1; calls.order.push("quota");
      return Promise.resolve(options.quotaResponse?.clone() ?? okJson({ allowed: options.quota?.allowed ?? true, reason: options.quota?.reason ?? null, used: 1, limit: 5 }));
    }
    if (url === `${options.osUrl ?? "https://os.test"}/auth/login`) { calls.osAuth += 1; calls.order.push("os-auth"); return Promise.resolve(okJson({ data: { token: "os-token" } })); }
    if (url.includes("/api/v1/property/valuation")) {
      calls.osValuation += 1; calls.order.push("os");
      calls.osBody = JSON.parse(String(init?.body ?? "{}"));
      return Promise.resolve(options.os instanceof Response ? options.os.clone() : okJson({ data: options.os ?? {} }));
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      calls.ai += 1; calls.order.push("ai");
      calls.aiBody = JSON.parse(String(init?.body ?? "{}"));
      if (options.ai instanceof Response) return Promise.resolve(options.ai.clone());
      return Promise.resolve(okJson({ choices: [{ message: { content: JSON.stringify(options.ai ?? {}) } }] }));
    }
    return nativeFetch(input, init);
  }) as typeof fetch;
  try { await run(calls); } finally {
    activeProviderFetch = nativeFetch;
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
    assertEquals({ auth: calls.auth, quota: calls.quota, osAuth: calls.osAuth, osValuation: calls.osValuation, ai: calls.ai, order: calls.order },
      { auth: 0, quota: 0, osAuth: 0, osValuation: 0, ai: 0, order: [] });
  });
});

Deno.test("request boundaries reject unknown, nonfinite, oversized, and unrealistic inputs before quota", async () => {
  const invalidBodies = [
    base({ unexpectedField: true }),
    base({ city: "x".repeat(121) }),
    base({ title: "x".repeat(181) }),
    base({ price: "Infinity" }),
    base({ price: 1_000_000_001 }),
    base({ sqm: 10_000_001 }),
    base({ yearBuilt: 999 }),
  ];
  await withProviders({ osConfigured: true, aiConfigured: true }, async (calls) => {
    for (const body of invalidBodies) assertEquals((await handler(request(body))).status, 400);
    assertEquals({ auth: calls.auth, quota: calls.quota, osValuation: calls.osValuation, ai: calls.ai }, { auth: 0, quota: 0, osValuation: 0, ai: 0 });
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
    assertEquals(calls.auth, 1); assertEquals(calls.quota, 1); assertEquals(calls.ai, 0); assertEquals(calls.osValuation, 0);
    assertEquals(calls.order, ["auth", "quota"]);
    assertEquals(body.error, "Valuation evidence unavailable");
  });
});

Deno.test("quota denial reserves exactly once and performs no paid provider work", async () => {
  await withProviders({ osConfigured: true, aiConfigured: true, quota: { allowed: false, reason: "monthly_limit_reached" } }, async (calls) => {
    const res = await handler(request(base({ latitude: 37.98, longitude: 23.72, floor: 1, yearBuilt: 2000 })));
    assertEquals(res.status, 429);
    assertEquals(calls.auth, 1); assertEquals(calls.quota, 1);
    assertEquals(calls.osAuth, 0); assertEquals(calls.osValuation, 0); assertEquals(calls.ai, 0);
    assertEquals(calls.order, ["auth", "quota"]);
  });
});

Deno.test("failed reservation is one attempt with no retry or provider work", async () => {
  await withProviders({ osConfigured: true, aiConfigured: true, quotaResponse: okJson({ error: "quota backend unavailable" }, 503) }, async (calls) => {
    const res = await handler(request(base({ latitude: 37.98, longitude: 23.72, floor: 1, yearBuilt: 2000 })));
    assertEquals(res.status, 503);
    assertEquals(calls.auth, 1); assertEquals(calls.quota, 1);
    assertEquals(calls.osAuth, 0); assertEquals(calls.osValuation, 0); assertEquals(calls.ai, 0);
    assertEquals(calls.order, ["auth", "quota"]);
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

Deno.test("open-house rent prompt and response use the same monthly transaction contract", async () => {
  await withProviders({ aiConfigured: true, ai: { estimatedValue: 1700, rangeLow: 1600, rangeHigh: 1800, summary: "Monthly rental analysis." } }, async (calls) => {
    const res = await handler(request(base({ listingType: "open_house", openHouseTransactionType: "rent", price: 1600, askingMonthlyRent: 1600 })));
    const body = await jsonBody(res) as Record<string, unknown>;
    const prompt = String(((calls.aiBody?.messages as Array<Record<string, unknown>> | undefined)?.[0]?.content) ?? "");
    assertEquals(res.status, 200); assertEquals(body.transaction, "rent"); assertEquals(body.valueUnit, "EUR/month");
    assertEquals(body.estimateBasis, "monthly_rent"); assertEquals(body.estimatedValue, 1700);
    assertMatch(prompt, /Transaction: rent/); assertMatch(prompt, /monthly rent in EUR/);
  });
});

Deno.test("OS lease remains unknown-period context while a distinct AI monthly estimate is allowed", async () => {
  await withProviders({ osConfigured: true, aiConfigured: true, os: { propertyPredictedLeasePrice: 1800 }, ai: { estimatedValue: 1700, rangeLow: 1600, rangeHigh: 1800, summary: "Separate monthly model analysis." } }, async (calls) => {
    const res = await handler(request(base({ listingType: "rent", price: 1600, latitude: 37.98, longitude: 23.72, floor: 2, yearBuilt: 2005 })));
    const body = await jsonBody(res) as Record<string, unknown>;
    const prompt = String(((calls.aiBody?.messages as Array<Record<string, unknown>> | undefined)?.[0]?.content) ?? "");
    assertEquals(res.status, 200); assertEquals(body.estimatedValue, 1700); assertEquals(body.valueUnit, "EUR/month");
    assertEquals(body.providerPrediction, { value: 1800, field: "propertyPredictedLeasePrice", model: "market", unit: null });
    assertMatch(prompt, /period is unavailable/i); assertMatch(prompt, /do not use.*monthly/i);
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

Deno.test("OS authentication token is reused for a warm second valuation", async () => {
  await withProviders({ osConfigured: true, osUrl: "https://os-warm-cache.test", os: { propertyPredictedPrice: 400000 } }, async (calls) => {
    const input = base({ latitude: 37.98, longitude: 23.72, floor: 1, yearBuilt: 2005 });
    assertEquals((await handler(request(input))).status, 200);
    assertEquals((await handler(request(input))).status, 200);
    assertEquals(calls.osAuth, 1); assertEquals(calls.osValuation, 2);
    assertEquals(calls.quota, 2);
  });
});

Deno.test("new-build requests retain the selected model, reasoning effort, and property context", async () => {
  await withProviders({ aiConfigured: true, ai: { renovationPotential: "Inspect finishes and services." } }, async (calls) => {
    const res = await handler(request(base({ listingType: "new_build", title: "Project Alpha", energyClass: "A+", hasParking: true, hasPool: true })));
    assertEquals(res.status, 200); assertEquals(calls.ai, 1); assertEquals(calls.osValuation, 0);
    assertEquals(calls.aiBody?.model, "gpt-5.4"); assertEquals(calls.aiBody?.reasoning_effort, "medium");
    const prompt = String(((calls.aiBody?.messages as Array<Record<string, unknown>> | undefined)?.[0]?.content) ?? "");
    assertMatch(prompt, /Project Alpha/); assertMatch(prompt, /Energy class: A\+/); assertMatch(prompt, /parking/i); assertMatch(prompt, /pool/i);
  });
});

Deno.test("empty, malformed, scalar, or auth-looking upstream failures are sanitized unavailable responses", async () => {
  for (const ai of [{}, new Response("not-json", { status: 200 }), new Response("JWT expired upstream", { status: 401 })]) {
    await withProviders({ aiConfigured: true, ai }, async (calls) => {
      const res = await handler(request(base({ listingType: "new_build" })));
      const body = await jsonBody(res) as { error?: string; code?: string };
      assertEquals(res.status, 503); assertEquals(body.code, "valuation_unavailable"); assertEquals(body.error, "Valuation evidence unavailable");
      assertEquals(calls.auth, 1); assertEquals(calls.quota, 1); assertEquals(calls.ai, 1);
      assertEquals(calls.order, ["auth", "quota", "ai"]);
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
