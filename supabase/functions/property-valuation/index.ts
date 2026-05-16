import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { hasAIProviderCredentials, openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("property-valuation");

const BUCKET = "property-valuation";
const valuationLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 15, windowMs: 60_000, failClosed: true });

// ── Greece 2026 market benchmarks ─────────────────────────────────────────────
const MARKET_BENCHMARKS = `
GREECE 2026 — PROPERTY MARKET BENCHMARKS (Bank of Greece, REDS, AADE data):

RESIDENTIAL (€/sqm asking prices, Q1 2026):
- Athens premium (Kolonaki, Psychiko, Kifissia, Ekali): €4,800–9,500/sqm
- Athens central (Pagkrati, Mets, Koukaki, Plaka, Exarchia): €2,900–5,000/sqm
- Athens north (Marousi, Halandri, Cholargos): €2,700–4,400/sqm
- Athens south (Glyfada, Voula, Vouliagmeni): €3,800–7,500/sqm
- Athens east (Zografou, Kaesariani, Vyronas): €2,000–3,200/sqm
- Athens west (Peristeri, Ilion, Aegaleo): €1,400–2,500/sqm
- Piraeus center: €1,900–3,200/sqm
- Thessaloniki center: €2,400–3,800/sqm; suburbs: €1,500–2,600/sqm
- Heraklion Crete: €1,800–3,200/sqm; Chania: €2,200–4,200/sqm
- Patras: €900–1,900/sqm; Larissa: €900–1,800/sqm; Ioannina: €1,000–1,900/sqm

ISLANDS — RESIDENTIAL (€/sqm, Q1 2026):
- Mykonos (town/beach): €9,000–25,000+/sqm
- Santorini (Caldera rim): €12,000–30,000+/sqm; other areas €5,000–10,000/sqm
- Paros/Antiparos: €3,500–9,000/sqm; Rhodes: €2,500–6,000/sqm
- Corfu (sea view): €3,000–7,000/sqm; inland: €1,500–3,000/sqm
- Cephalonia/Zakynthos: €2,000–5,000/sqm; Lefkada: €2,000–4,500/sqm

VILLAS — PREMIUM LOCATIONS (€/sqm, Q1 2026):
- Attica (Kifissia/Ekali): €4,000–10,000/sqm; South Attica (Saronida): €3,000–7,000/sqm
- Halkidiki (Kassandra/Sithonia): €2,000–5,500/sqm
- Luxury island villas (Mykonos/Santorini): €8,000–35,000/sqm for turnkey

COMMERCIAL (€/sqm, yield bands, Q1 2026):
- Prime Athens retail (Ermou/Kolonaki): €4,000–9,000/sqm; yield 4.5–6.5%
- Secondary Athens retail: €1,500–3,500/sqm; yield 7–10%
- Athens CBD Grade-A office: €2,500–5,000/sqm; yield 5.5–7.5%
- Thessaloniki prime retail: €2,500–5,500/sqm; yield 5.5–8%

INDUSTRIAL / WAREHOUSE (€/sqm, Q1 2026):
- Attica industrial zone (Aspropyrgos/Elefsina): €400–900/sqm; yield 7–9%
- Secondary industrial: €200–500/sqm; yield 9–13%

LAND / PLOTS (€/sqm):
- Athens urban buildable plot: €500–3,000+/sqm depending on SD and location
- Agricultural land: €1–15/sqm; Tourist coastal: €5–120/sqm

MARKET DYNAMICS 2026 (Bank of Greece):
- Residential price trend: Athens +5–8% YoY; islands +7–12% YoY; regional +2–5% YoY
- PACE IS DECELERATING from 2022–2024 peaks
- Commercial market behaves DIFFERENTLY from residential
- Transaction costs buyer: ~8–11% total (FMA 3%, notary 1–1.5%, legal 0.5–1%, agent 2–3%)
- Transfer tax: 3% on objective/taxable value + municipal levy (~0.3%)
- New builds: 25–40% premium over resale same area/floor

RENTAL YIELDS 2026 (gross, asking):
- Athens center long-term: 3.5–5.5% gross
- Athens center short-term (Airbnb zones): 6–9% gross
- Tourist islands seasonal: 7–14% gross
- Regional cities: 4.5–7% gross
`;

// ── Greek legal/tax overlay framework ─────────────────────────────────────────
const LEGAL_TAX_FRAMEWORK = `
GREEK LEGAL & TAX OVERLAY — GREECE 2026 (AADE, Cadastre, e-Πολεοδομία):

SCORING MODEL (produce all four scores 0–100):

1. LEGAL_CLEANLINESS_SCORE (0–100):
   Inputs: cadastre clarity, title chain, permit status, building identity, ownership complexity, restriction risk.
   - No data on any legal field = start at 40; each unknown field costs -5
   - Co-ownership or partial ownership = -10 to -25
   - Auction property with no title info = -30
   - Signs of illegal enclosures/extensions from photos/description = -15 to -25
   - Coastal/island/neoclassical/forest proximity = -10 to -20 (protection risk)
   - Standard urban apartment, no red flags mentioned = 65–80
   - Fully documented unit (permit cited, no issues) = 85–95

2. PLANNING_CERTAINTY_SCORE (0–100):
   Inputs: inside/outside plan certainty, SD/coverage/height data, land use, change-of-use feasibility.
   - Apartment/house in established urban area = 70–85 (assumed inside plan)
   - Plot with SD stated explicitly = 75–90
   - Plot with SD unknown = 30–50
   - Land outside settlement, no buildability data = 20–40
   - Hotel/commercial conversion claimed without use permit = 30–55
   - Standard apartment, no land complexity = 70–80

3. TAX_FRICTION_SCORE (0–100, higher = MORE friction):
   Inputs: transfer tax burden, objective value divergence, transfer complexity, doc readiness.
   - Standard transfer: ~3% FMA + notary + legal + agent = total buyer cost ~8–11%
   - Auction: add eviction/legal uncertainty friction
   - Foreign buyer Golden Visa property: add process complexity
   - Inheritance/donation path: higher friction
   - Commercial/industrial: higher complexity = higher friction
   - Scale: 10–25 = normal residential transfer; 30–50 = commercial/complex; 50–70 = auction/foreign/inheritance; 70–90 = very complex

4. TRANSFER_READINESS_SCORE (0–100):
   Inputs: building identity completeness, E9 consistency, digital transfer readiness, doc completeness, auction burden.
   - Digital transfer via myPROPERTY with all docs: 85–95
   - Standard apartment with likely complete docs: 65–80
   - Auction with unknown occupancy: 20–40
   - Missing building identity / permit issues: 30–55
   - Island property with multiple ownership unknowns: 25–50

PROPERTY-TYPE LEGAL RULES:
- RESIDENCE: Check horizontal property status, building identity, illegal enclosure risk, ENFIA/objective cross-check
- COMMERCIAL: Check allowed commercial use, lease tax completeness, change-of-use feasibility
- LAND: Check inside/outside plan, forest/coastal/archaeology protection, road access legality
- PLOT: Check SD/coverage/height/frontage, demolition obligations, planning constraint consistency
- VILLA/VACATION/ISLAND: Coastal restrictions, pool/extension legality, traditional settlement restrictions, tourism-use feasibility
- HOTEL: Hospitality-use legality, room count confidence, conversion feasibility
- MIXED-USE: Legality of use split, horizontal division, change-of-use, vacant-possession difficulty
- INDUSTRIAL: Industrial use legality, fire/operational compliance, environmental constraints
- AUCTION: Title burden, occupancy, eviction risk, document completeness, inspection access

VALUATION MODES (infer from available data):
- MODE 1 (LISTING ONLY): No legal data available — use conservative defaults, note as UNKNOWN
- MODE 2 (PUBLIC-ENRICHED): Objective value proxy, planning zone clues, auction flags — use where inferable
- MODE 3 (DOC-VERIFIED): Not applicable for listing sites — do not claim

OBJECTIVE VALUE:
- Use only as cross-check / tax reference, NOT as commercial AVM answer
- If objective value >> AVM estimate: flag transfer/tax mismatch risk
- If objective value << asking price: note tax/market divergence (do not reduce market value)

EXECUTION VALUE:
execution_value = market_value MINUS transaction_friction MINUS legal_uncertainty_discount
- legal_uncertainty_discount = 0–15% of market value based on legal_cleanliness_score
- transaction_friction = 8–11% for normal; 15–25% for auction; 20–35% for complex structures
`;

// ── Property-type specific methodology ────────────────────────────────────────
function getTypeInstructions(propertyType: string, listingType: string): string {
  const isAuction = listingType === "auction";

  const base: Record<string, string> = {
    apartment: `
METHODOLOGY: RESIDENTIAL APARTMENT — Comparable hedonic model (primary) + rental yield sense-check.
1. Extract micro-location → baseline €/sqm from benchmark table.
2. Adjustments: floor (ground -8 to -15%, semi-basement -20 to -35%, 5+ with elevator +3-8%), elevator absence above floor 2 = -5 to -10%, year built pre-1980 without reno = -10 to -25%, post-2010 = +5 to +15%, new build = +25-40%, condition poor -20 to -30% / luxury +15 to +30%, parking +4-8%, storage +1-3%, balcony +2-6%, sea view +10-40%, noisy road -5 to -12%.
3. Rental yield sanity check vs benchmark.
4. Range: ±6-10% urban with strong comps; ±12-20% for atypical/sparse.
Legal check: horizontal property, building identity, illegal enclosure risk, ENFIA cross-check.`,

    house: `
METHODOLOGY: DETACHED HOUSE — Comparable + cost support.
1. Separate building from land value contribution.
2. Building €/sqm for house subtype + garden premium (small <200sqm low; >500sqm significant).
3. Apply condition, year, view, corner adjustments. Cost floor: €900-1,600/sqm replacement cost.
4. Range: ±8-14% typical.
Legal check: building identity, extension legality, horizontal property if divided.`,

    villa: `
METHODOLOGY: VILLA — Premium feature nearest-neighbor (primary) + STR support (secondary in tourism).
DO NOT rely only on €/sqm.
1. Feature premium score: sea view direct +20-60%, pool +8-25%, land >1k sqm +10-30%, luxury finish +15-35%, privacy +5-15%, caldera/horizon +20-50%, guesthouse +5-20%.
2. Nearest-neighbor comps with high feature matching.
3. STR support: Mykonos/Santorini €120-500k/year; Crete/Rhodes €40-150k/year.
4. Range: ±12-25%. Liquidity: 0.3-0.6 non-prime; 0.6-0.8 prime island.
Legal check: coastal restrictions, pool/extension legality, traditional settlement, tourism-use feasibility.`,

    land: `
METHODOLOGY: AGRICULTURAL/NON-URBAN LAND — Conservative comparable + optional development scenario.
CRITICAL: DO NOT assume buildability from seller language.
1. Classify: agricultural | speculative | coastal/tourism | non-buildable rural.
2. Outside settlement: assume max 200sqm buildable unless SD clearly stated.
3. Comparable land €/sqm + premiums (sea proximity, access, flat, utilities).
4. Range: ±20-40%. Liquidity: 0.2-0.4 unless prime coastal.
Legal check: inside/outside plan, forest/coastal/archaeology, road access legality.`,

    commercial: `
METHODOLOGY: COMMERCIAL — Income-capitalization-informed comparable.
1. Subtype: retail | office | mixed small commercial.
2. RETAIL: market rent/sqm/month (prime Athens €20-50; secondary €8-18; regional €4-12), annual ERV × cap rate (prime 4.5-6.5%, secondary 7-10%, regional 9-13%), frontage +10-30%, basement dependence -15 to -30%.
3. OFFICE: Grade A €18-28/sqm/month Athens CBD; cap rate 5.5-7.5%; vacancy ~10-14% (hybrid work effect).
4. Cross-check sales comps. Range: ±10-18%.
NOTE: commercial ≠ residential momentum (Bank of Greece).
Legal check: allowed use, lease tax completeness, change-of-use feasibility.`,

    office: `
METHODOLOGY: OFFICE — Yield-informed comparable (Grade-based).
1. Grade inference from condition/description.
2. Market rent: Athens CBD Grade A €18-28; Grade B €10-18; peripheral €7-12/sqm/month.
3. Cap rate: Grade A 5.5-7%; Grade B 7-9.5%; Grade C 9-13%.
4. Vacancy Athens CBD ~10-14% (2026 hybrid-work). Range: ±10-15%.
Legal check: allowed use, building identity.`,
  };

  const auctionSuffix = isAuction ? `

AUCTION OVERLAY — Apply AFTER estimating clean market value:
- Estimate clean market value first (as if normal sale).
- Total auction discount = sum of: liquidity 5-15%, due diligence 3-8%, inspection uncertainty 3-10%, occupancy/eviction risk 5-20%, legal uncertainty 3-12%, repair unknown 2-8%.
- Typical total: 15-45% from clean market value.
- Smaller discount: standard urban apartment, vacant, good photos, many comps.
- Larger discount: occupied, no photos, special asset, island, industrial complexity.
- Output: estimated_market_value_if_clean (= auctionAdjustedValue) AND auction-adjusted value (= estimatedValue).` : "";

  const fallback = `
METHODOLOGY: GENERAL PROPERTY — Comparable model with type-specific adjustments.
Use benchmark table. Apply condition, location, feature adjustments. Range: ±15-25%. Liquidity: moderate 0.3-0.5.`;

  return (base[propertyType] || fallback) + auctionSuffix;
}

// ── Main handler ───────────────────────────────────────────────────────────────
function fallbackValuation(input: { // skipcq: JS-R1005 - Deterministic valuation fallback keeps comparable scoring and confidence fields aligned.
  city: string;
  price: number;
  sqm: number;
  propertyType?: string;
  listingType?: string;
  reason?: string;
}) {
  const listedPrice = Number.isFinite(input.price) && input.price > 0 ? input.price : input.sqm * 2500;
  const sqm = Number.isFinite(input.sqm) && input.sqm > 0 ? input.sqm : 1;
  const pricePerSqm = Math.round(listedPrice / sqm);
  const isAuction = input.listingType === "auction";
  const estimatedValue = Math.round(listedPrice);
  const rangeLow = Math.round(estimatedValue * 0.85);
  const rangeHigh = Math.round(estimatedValue * 1.12);
  const executionValue = Math.round(estimatedValue * (1 - (isAuction ? 0.25 : 0.14)));

  return {
    estimatedValue,
    rangeLow,
    rangeHigh,
    executionValue,
    pricePerSqmEstimate: pricePerSqm,
    confidence: 35,
    confidenceLabel: "Low",
    liquidityScore: input.propertyType === "apartment" ? 70 : 45,
    marketComparison: "at_market",
    marketComparisonPct: 0,
    pricingPosition: "fair",
    methodUsed: "Conservative fallback based on submitted listing price and standard transaction friction",
    valuationMode: "MODE_1_LISTING_ONLY",
    summary: `Fallback valuation for ${input.city}: ${input.reason ?? "the AI provider returned malformed JSON"}, so this uses the submitted price as the market anchor and applies conservative transaction/legal uncertainty adjustments. Treat this as a temporary estimate until a full AI valuation can be generated.`,
    keyFactors: [
      { factor: "Submitted price anchor", impact: "neutral", note: "Used because provider output was unavailable" },
      { factor: "2026 market uncertainty", impact: "neutral", note: "Conservative confidence applied" },
      { factor: "Transaction costs", impact: "negative", note: "Execution value includes friction" },
      { factor: "Legal/planning data", impact: "negative", note: "Document status unknown" },
    ],
    legalCleanliness: 45,
    planningCertainty: input.propertyType === "apartment" ? 65 : 45,
    taxFriction: isAuction ? 55 : 30,
    transferReadiness: 50,
    legalSummary: "Legal and planning documents were not verified by this fallback valuation. Confirm title, building identity, permits, and restrictions before relying on the estimate.",
    taxSummary: "Assumes normal Greek transaction costs unless the asset is an auction or complex transfer.",
    objectiveValueProxy: null,
    renovationPotential: null,
    rentalYieldEstimate: input.propertyType === "apartment" ? 4.5 : 3.5,
    highestBestUseHint: null,
    redFlags: [`${input.reason ?? "AI provider returned malformed JSON"}; fallback valuation used`],
    auctionAdjustedValue: isAuction ? Math.round(estimatedValue / 0.8) : null,
    listingQualityScore: 40,
    generatedBy: "fallback",
  };
}

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, valuation parsing, fallback, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);
  // Enforce AI quota before processing
  const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
  if (quota.errorResponse) return quota.errorResponse;
  const quotaUserId = quota.userId;

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? quotaUserId ?? "anonymous";
  if (await valuationLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  // Signed-in access gate is handled by enforceAiQuota; free vs Pro caps live in the DB.
  try {
    const body = await req.json();
    const {
      title, city, address, price, sqm, bedrooms, bathrooms,
      propertyType, listingType, floor, totalFloors, yearBuilt,
      heatingSystem, energyClass, pricePerSqm, hasParking, hasPool, hasElevator,
      hasGarden, hasStorage, hasBalcony, hasView, hasFurnished,
      region, description, tags,
      ownershipStatus, ownershipPercentage,
      auctionCourt, plotSurface, condition,
      isNeoclassical, isPreserved, distanceFromSea, withinCityPlan,
      withinSettlement, buildingAllowance, coverageRatio, isBuildable,
      cadastreNumber, hasLandConcession, landUse,
    } = body;

    if (!city || !sqm || !price) {
      return new Response(
        JSON.stringify({ error: "city, sqm and price are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!hasAIProviderCredentials()) throw new Error("AI provider key not configured");

    // ── Key property specifics (construction year, condition, heating) for valuation ──
    const keySpecifics = [
      yearBuilt != null && yearBuilt !== "" ? `Construction year: ${yearBuilt}` : null,
      condition ? `Condition: ${String(condition).replace(/_/g, " ")}` : null,
      heatingSystem ? `Heating: ${String(heatingSystem).replace(/_/g, " ")}` : null,
    ].filter(Boolean).join(". ") || "Not specified";

    // ── Build observed features layer ──────────────────────────────────────────
    const observedFeatures = [
      floor != null && `Floor: ${floor}${totalFloors ? `/${totalFloors}` : ""}`,
      yearBuilt && `Year built: ${yearBuilt}`,
      heatingSystem && `Heating: ${String(heatingSystem).replace(/_/g, " ")}`,
      energyClass && `Energy class: ${energyClass}`,
      bedrooms != null && `Bedrooms: ${bedrooms}`,
      bathrooms != null && `Bathrooms: ${bathrooms}`,
      hasParking && "Has parking",
      hasPool && "Has pool",
      hasElevator && "Has elevator",
      hasGarden && "Has garden",
      hasStorage && "Has storage",
      hasBalcony && "Has balcony",
      hasView && "Has view",
      hasFurnished && "Furnished",
      plotSurface && `Plot area: ${plotSurface}sqm`,
      condition && `Condition: ${String(condition).replace(/_/g, " ")}`,
      ownershipStatus && ownershipStatus !== "full" && `Ownership: ${ownershipStatus}${ownershipPercentage ? ` (${ownershipPercentage}%)` : ""}`,
      auctionCourt && `Auction court: ${auctionCourt}`,
      tags?.length && `Tags: ${tags.join(", ")}`,
    ].filter(Boolean).join(" | ") || "standard specification";

    // ── Legal/planning signals from listing data ────────────────────────────────
    const legalSignals = [
      cadastreNumber ? `Cadastre number: ${cadastreNumber} (KNOWN)` : "Cadastre: UNKNOWN",
      withinCityPlan != null ? `Within city plan: ${withinCityPlan ? "YES" : "NO"}` : "City plan status: UNKNOWN",
      withinSettlement != null ? `Within settlement: ${withinSettlement ? "YES" : "NO"}` : null,
      isBuildable != null ? `Buildable: ${isBuildable ? "YES" : "NO"}` : "Buildability: UNKNOWN",
      buildingAllowance ? `Building allowance (SD): ${buildingAllowance}` : "SD: UNKNOWN",
      coverageRatio ? `Coverage ratio: ${coverageRatio}` : null,
      isNeoclassical ? "Neoclassical (preservation risk)" : null,
      isPreserved ? "Preserved building (protection constraint)" : null,
      distanceFromSea != null ? `Distance from sea: ${distanceFromSea}m (coastal zone risk if <100m)` : null,
      hasLandConcession ? "Has land concession" : null,
      landUse ? `Land use: ${landUse}` : null,
      ownershipStatus && ownershipStatus !== "full" ? `Partial/complex ownership: ${ownershipStatus}` : null,
    ].filter(Boolean).join(" | ") || "No legal/planning fields available — use MODE 1 defaults";

    const listingDesc = description
      ? `Description excerpt: "${String(description).slice(0, 500)}"`
      : "";

    const typeInstructions = getTypeInstructions(propertyType || "apartment", listingType || "sale");

    const prompt = `You are a senior Greek real estate valuation expert (RICS-equivalent) specialising in the 2026 Greek market. Produce a RIGOROUS, EVIDENCE-BASED valuation including a legal/tax overlay layer.

${MARKET_BENCHMARKS}

${LEGAL_TAX_FRAMEWORK}

=== PROPERTY TO VALUE ===
KEY PROPERTY SPECIFICS (use these in your methodology): ${keySpecifics}

Title: ${title || "Property"}
Location: ${address ? `${address}, ` : ""}${city}${region ? `, ${region}` : ""}, Greece
Type: ${propertyType || "apartment"} | Transaction: ${listingType || "sale"}
Size: ${sqm} sqm
Listed price: €${Number(price).toLocaleString()} (€${pricePerSqm ? Math.round(Number(pricePerSqm)) : Math.round(Number(price) / Number(sqm))}/sqm)
Observed features: ${observedFeatures}
Legal/planning signals: ${legalSignals}
${listingDesc}

=== METHODOLOGY TO APPLY ===
${typeInstructions}

=== OUTPUT REQUIREMENTS ===
CRITICAL RULES:
1. DO NOT echo the listed price as your estimate. Cross-reference against benchmarks only; do not invent comparable sales or addresses.
2. Output a RANGE, not false precision. Range width must reflect data quality.
3. Apply TYPE-SPECIFIC logic — one formula for all types is wrong.
4. Missing legal data = UNKNOWN; never assume clean title or invent document status.
5. Produce all four legal/tax scores using the scoring model above.
6. execution_value = market_value minus transaction_friction minus legal_uncertainty_discount.
7. Price growth is DECELERATING in 2026 — do not extrapolate past rates.
8. Commercial behavior is DISTINCT from residential.
9. All figures must be supportable from the benchmarks and methodology above; do not hallucinate local comps or unsourced premiums.

Return ONLY valid JSON, no markdown, no explanation outside the JSON:

{
  "estimatedValue": number (market value in EUR — auction-adjusted if auction),
  "rangeLow": number (conservative execution value),
  "rangeHigh": number (optimistic but supportable value),
  "executionValue": number (market_value minus transaction friction and legal uncertainty discount),
  "pricePerSqmEstimate": number (your 2026 benchmark €/sqm for this submarket),
  "confidence": number (0–100),
  "confidenceLabel": "High" | "Medium" | "Low",
  "liquidityScore": number (0–100),
  "marketComparison": "below_market" | "at_market" | "above_market",
  "marketComparisonPct": number (e.g. -12 = 12% below market; +8 = 8% above),
  "pricingPosition": "underpriced" | "fair" | "overpriced",
  "methodUsed": "string",
  "valuationMode": "MODE_1_LISTING_ONLY" | "MODE_2_PUBLIC_ENRICHED",
  "summary": "string (3–5 sentences: cite specific €/sqm benchmark, local 2026 trend, key drivers)",
  "keyFactors": [
    { "factor": "string", "impact": "positive" | "negative" | "neutral", "note": "string (max 100 chars)" }
  ],
  "legalCleanliness": number (0–100 — legal cleanliness score per framework above),
  "planningCertainty": number (0–100 — planning certainty score per framework above),
  "taxFriction": number (0–100 — tax/transfer friction score — higher = more friction),
  "transferReadiness": number (0–100 — transfer readiness score per framework above),
  "legalSummary": "string (2–3 sentences: key legal/planning signals observed, what is unknown, any red flags)",
  "taxSummary": "string (1–2 sentences: estimated transfer tax burden and key friction factors)",
  "objectiveValueProxy": number | null (rough ENFIA/objective value proxy in EUR — use for cross-check only; null if cannot estimate),
  "renovationPotential": "string or null",
  "rentalYieldEstimate": number (2026 gross yield %),
  "highestBestUseHint": "string or null",
  "redFlags": ["string"],
  "auctionAdjustedValue": number | null (clean market value before auction discounts — only if auction, else null),
  "listingQualityScore": number (0–100)
}

Rules:
- keyFactors: 4–7 items; always include a 2026 trend factor, transaction cost factor, and a legal/planning factor
- confidenceLabel: High = 75+, Medium = 50–74, Low = <50
- legalCleanliness: reflects ONLY data available in the listing — do not fabricate certainty
- Range width: ±6-10% urban apartment strong data; ±15-25% villa/land; ±20-40% island/hotel/plot
- liquidityScore: 80-100 = standard urban apartment; 60-80 = suburban/commercial; 40-60 = villa/vacation; 20-40 = island/land/industrial; 0-20 = hotel/special`;

    const response = await openAIChatCompletion({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.15,
      max_tokens: 8192,
    });

    if (!response.ok) {
      const txt = await response.text();
      log.error("AI gateway error", { status: response.status, body: txt.slice(0, 500) });
      if (response.status === 402 || response.status === 403 || response.status === 429) {
        const fallback = fallbackValuation({
          city: String(city),
          price: Number(price),
          sqm: Number(sqm),
          propertyType: typeof propertyType === "string" ? propertyType : undefined,
          listingType: typeof listingType === "string" ? listingType : undefined,
          reason: `the AI provider returned ${response.status}`,
        });
        await recordAiCall(quotaUserId, BUCKET);
        return new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    let raw = readOpenAITextContent(aiData);

    // Step 1: strip markdown code fences (greedy to capture full JSON)
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]+?)```\s*$/);
    if (fenceMatch) {
      raw = fenceMatch[1].trim();
    } else {
      // Fallback: grab first { ... } block (greedy)
      const braceMatch = raw.match(/\{[\s\S]+\}/);
      if (braceMatch) raw = braceMatch[0];
    }

    // Step 2: minimal JSON repair
    raw = raw
      .replace(/,\s*([}\]])/g, "$1")   // trailing commas
      .replace(/\)\s*\}/g, "}")          // stray closing paren
      .trim();

    let result;
    try {
      result = JSON.parse(raw);
    } catch (parseErr) {
      log.warn("property-valuation: AI returned invalid JSON; using fallback valuation", {
        err: parseErr instanceof Error ? parseErr.message : String(parseErr),
        city,
        rawLength: raw.length,
        sample: raw.slice(0, 240),
      });
      result = fallbackValuation({
        city: String(city),
        price: Number(price),
        sqm: Number(sqm),
        propertyType: typeof propertyType === "string" ? propertyType : undefined,
        listingType: typeof listingType === "string" ? listingType : undefined,
        reason: "the AI provider returned malformed JSON",
      });
    }

    // Ensure backwards-compatible fields
    if (!result.executionValue) {
      const discount = (100 - (result.legalCleanliness || 70)) / 100 * 0.1;
      result.executionValue = Math.round(result.estimatedValue * (1 - 0.09 - discount));
    }
    if (!result.legalCleanliness) result.legalCleanliness = 50;
    if (!result.planningCertainty) result.planningCertainty = 60;
    if (!result.taxFriction) result.taxFriction = 30;
    if (!result.transferReadiness) result.transferReadiness = 55;
    if (!result.valuationMode) result.valuationMode = "MODE_1_LISTING_ONLY";

    // Record usage after successful AI call
    await recordAiCall(quotaUserId, BUCKET);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log.error("valuation error", { err: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
