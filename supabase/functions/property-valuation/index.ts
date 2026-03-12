const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Greece 2026 market benchmarks (Bank of Greece / REDS data) ─────────────────
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
- Volos: €1,100–2,000/sqm; Kavala: €800–1,600/sqm; Alexandroupoli: €900–1,700/sqm

ISLANDS — RESIDENTIAL (€/sqm, Q1 2026):
- Mykonos (town/beach): €9,000–25,000+/sqm
- Santorini (Caldera rim): €12,000–30,000+/sqm; other areas €5,000–10,000/sqm
- Paros/Antiparos: €3,500–9,000/sqm
- Naxos: €2,500–6,000/sqm
- Rhodes (tourist/coastal): €2,500–6,000/sqm; town: €1,800–3,500/sqm
- Corfu (sea view): €3,000–7,000/sqm; inland: €1,500–3,000/sqm
- Cephalonia/Zakynthos: €2,000–5,000/sqm
- Lefkada: €2,000–4,500/sqm
- Skiathos/Skopelos: €2,500–5,500/sqm
- Thassos: €1,500–3,500/sqm
- Lesvos/Chios: €1,000–2,800/sqm

VILLAS — PREMIUM LOCATIONS (€/sqm, Q1 2026):
- Attica (Kifissia/Ekali): €4,000–10,000/sqm; major premiuim for plot size
- South Attica (Saronida/Anavissos): €3,000–7,000/sqm
- Halkidiki (Kassandra/Sithonia): €2,000–5,500/sqm
- Peloponnese (coastal): €2,000–5,000/sqm
- Luxury island villas (Mykonos/Santorini): €8,000–35,000/sqm for turnkey

COMMERCIAL (€/sqm, yield bands, Q1 2026):
- Prime Athens retail (Ermou/Kolonaki): €4,000–9,000/sqm; yield 4.5–6.5%
- Secondary Athens retail: €1,500–3,500/sqm; yield 7–10%
- Athens CBD Grade-A office: €2,500–5,000/sqm; yield 5.5–7.5%
- Athens suburban office: €1,200–2,500/sqm; yield 7–10%
- Thessaloniki prime retail: €2,500–5,500/sqm; yield 5.5–8%
- Regional city retail: €600–2,000/sqm; yield 8–12%

INDUSTRIAL / WAREHOUSE (€/sqm, Q1 2026):
- Attica industrial zone (Aspropyrgos/Elefsina): €400–900/sqm; yield 7–9%
- Modern logistics (BREEAM/spec-built): €600–1,200/sqm; yield 6–8%
- Secondary industrial: €200–500/sqm; yield 9–13%
- Cold storage/specialised: €800–1,500/sqm; yield 7–10%

LAND / PLOTS (€/sqm):
- Athens urban buildable plot: €500–3,000+/sqm depending on SD and location
- Athens suburb buildable plot: €200–1,500/sqm
- Agricultural land: €1–15/sqm depending on region/access
- Tourist coastal (Greece): €5–120/sqm depending on sea distance/island
- Outside plan rural (Attica): €15–80/sqm

MARKET DYNAMICS 2026 (Bank of Greece):
- Residential price trend: Athens +5–8% YoY; islands +7–12% YoY; regional +2–5% YoY
- PACE IS DECELERATING from 2022–2024 peaks — do not extrapolate past rates
- Commercial market behaves DIFFERENTLY from residential — separate logic required
- Auction properties represent a distinct execution channel; significant discount to clean market
- New builds: 25–40% premium over resale of same area/floor
- Renovation discount: poor condition -15 to -35%; luxury finish +10–25%
- Transaction costs buyer: ~8–11% total (FMA 3%, notary 1–1.5%, legal 0.5–1%, agent 2–3%)
- Capital gains tax: 15% on profit (currently suspended — monitor policy)
- Golden Visa threshold 2026: €800k Athens/Thess/islands >3,100 residents; €400k elsewhere

RENTAL YIELDS 2026 (gross, asking):
- Athens center long-term: 3.5–5.5% gross
- Athens center short-term (Airbnb zones): 6–9% gross
- South suburbs: 3–4.5% gross
- Thessaloniki: 4–6% gross
- Tourist islands seasonal: 7–14% gross
- Regional cities: 4.5–7% gross
`;

// ── Property-type specific methodology instructions ────────────────────────────
function getTypeInstructions(propertyType: string, listingType: string): string {
  const isAuction = listingType === "auction";

  const base: Record<string, string> = {
    apartment: `
METHODOLOGY: RESIDENTIAL APARTMENT — Comparable hedonic model (primary) + rental yield sense-check (secondary).

VALUATION STEPS:
1. Extract micro-location from district/address clues. Locate on the benchmark table above.
2. Compute baseline €/sqm from nearest comparable band.
3. Apply adjustments:
   - Floor: ground floor -8 to -15% (semi-basement -20 to -35%), floors 2-4 neutral, floors 5+ +3-8% with elevator
   - Elevator: absence above floor 2 = -5 to -10%
   - Year built pre-1980 without renovation = -10 to -25%; post-2010 = +5 to +15%; new build = +25-40%
   - Condition: poor -20 to -30%; fair -10 to -15%; good ±0; very good +5 to +10%; luxury +15 to +30%
   - Parking: +4-8% in urban, +2-5% in suburbs
   - Storage: +1-3%
   - Balcony/terrace: +2-6% depending on size
   - Sea view: +10-40% depending on clarity and distance
   - Open horizon: +5-15%
   - Noisy main road: -5 to -12%
4. Run rental yield sanity check: if implied yield deviates >2pp from local benchmark, flag.
5. Output range: narrow (±6-10%) for urban with strong comps; wider (±12-20%) for atypical/sparse.

CONFIDENCE BOOST: exact floor, condition, year built, multiple comps, clear photos.
CONFIDENCE PENALTY: missing floor, unclear location, no year built, no condition data.`,

    house: `
METHODOLOGY: DETACHED/SEMI-DETACHED HOUSE — Comparable model + cost support check.

VALUATION STEPS:
1. Separate building value from land value contribution.
2. Building: comparable €/sqm for house subtype in same municipality.
3. Land: garden size — small garden (<200sqm) low premium; large garden (+500sqm) significant premium especially suburban.
4. Apply condition, year built, parking, view, and access adjustments (same as apartment).
5. For semi-basement/split-level: apply floor distribution adjustments.
6. Corner, double frontage: +3-8% premium.
7. Cost support: estimate replacement cost (€900-1,600/sqm depending on spec) as floor check.
8. Range: ±8-14% typical; wider for unusual properties.`,

    villa: `
METHODOLOGY: VILLA — Premium feature nearest-neighbor model (primary) + STR support (secondary if tourism area).

DO NOT rely only on €/sqm for villas. Villas are highly heterogeneous.

VALUATION STEPS:
1. Build feature premium score:
   - Sea view (direct): +20-60%
   - Pool: +8-25% depending on size/quality
   - Private land >1,000sqm: +10-30%
   - Luxury finish inferred from photos/description: +15-35%
   - Privacy/gate/compound: +5-15%
   - Sunset/caldera/horizon view: +20-50% (island only)
   - Guesthouse/annexe: +5-20%
   - Architecture quality: premium for notable design
2. Use nearest-neighbor comps with high feature matching, NOT area averages.
3. If tourism area: estimate STR gross yield (Mykonos/Santorini €120-500k/year; Crete/Rhodes €40-150k/year). Cross-check capitalization.
4. Range: ±12-25% for villas — they are illiquid and heterogeneous.
5. Liquidity: typically 0.3-0.6 for non-prime; 0.6-0.8 for prime island with international buyers.`,

    land: `
METHODOLOGY: AGRICULTURAL/NON-URBAN LAND — Conservative comparable model with optional development scenario.

CRITICAL: DO NOT assume buildability from seller language alone.

VALUATION STEPS:
1. Classify: agricultural | speculative | coastal/tourism | forest/mountain | non-buildable rural.
2. If outside settlement (εκτός σχεδίου): assume max 200sqm buildable unless SD clearly stated.
3. Comparable land €/sqm from similar land in same municipality/region.
4. Premiums: sea/lake proximity, access, flat terrain, panoramic view, utilities connected.
5. If tourism positioning: require map/access/view evidence before applying premium.
6. If buildability uncertain: use conservative scenario, lower confidence.
7. Range: WIDE (±20-40%) for land — planning uncertainty is high.
8. Liquidity: low (0.2-0.4) unless prime coastal or urban-fringe.

NEVER estimate development value from asking price or seller description alone.`,

    commercial: `
METHODOLOGY: COMMERCIAL — Income-capitalization-informed comparable model.

VALUATION STEPS:
1. Classify subtype: retail | office | mixed small commercial | service unit.
2. RETAIL:
   - Estimate market rent/sqm/month from location (prime Athens €20-50/sqm; secondary €8-18/sqm; regional €4-12/sqm).
   - Stabilized annual ERV = area sqm × monthly rent × 12.
   - Apply cap rate: prime 4.5-6.5%; secondary 7-10%; regional 9-13%.
   - Cross-check vs comparable retail €/sqm asking prices.
   - Frontage premium: +10-30% for high-footfall corner frontage.
   - Basement dependence: -15 to -30%.
3. OFFICE:
   - Grade A: €18-28/sqm/month Athens CBD; Grade B: €10-18/sqm/month.
   - Cap rate: Grade A 5.5-7.5%; Grade B 7-10%.
   - Modern condition/natural light premium; obsolete layout penalty.
4. Cross-check with sales comps.
5. Commercial NOTE 2026: commercial behaves differently from residential (Bank of Greece). Do not apply residential growth assumptions.
6. Range: ±10-18% typical; wider for income-producing with unknown lease terms.`,

    office: `
METHODOLOGY: OFFICE — Yield-informed comparable model (Grade-based).

VALUATION STEPS:
1. Grade inference: modern/renovated = likely Grade B+; old/obsolete = Grade C.
2. Estimate market rent: Athens CBD Grade A €18-28/sqm/month; Grade B €10-18/sqm/month; peripheral €7-12/sqm/month; Thessaloniki €8-15/sqm/month.
3. Cap rate: Grade A Athens 5.5-7%; Grade B 7-9.5%; Grade C / secondary 9-13%.
4. ESG / energy efficiency increasingly valued by institutional buyers.
5. Cross-check sales comps.
6. Vacancy risk: Athens CBD ~10-14% (2026 hybrid-work effect).
7. Range: ±10-15% for clear grade; wider for ambiguous.`,

    villa: `
METHODOLOGY: VILLA — see above (same as villa case)`,

  };

  const fallback = `
METHODOLOGY: GENERAL PROPERTY — Comparable model with type-specific adjustments.
Use the benchmark table above. Apply condition, location, and feature adjustments.
Output wide range (±15-25%) given limited type-specific data. Liquidity: moderate (0.3-0.5).`;

  const auctionSuffix = isAuction ? `

AUCTION OVERLAY — This is an AUCTION property. Apply auction-specific logic AFTER estimating clean market value:
- Estimate clean market value first (as if normal sale).
- Then apply total auction discount = sum of:
  * Liquidity discount: 5-15% (thin market = higher)
  * Due diligence limitation: 3-8%
  * Inspection uncertainty (no access): 3-10%
  * Occupancy/eviction risk (if unclear): 5-20%
  * Legal uncertainty (if data sparse): 3-12%
  * Repair unknown discount: 2-8%
- Total auction discount typically 15-45% from clean market value.
- Smaller discount: standard urban apartment, vacant, good photos, many comps.
- Larger discount: occupied, no photos, special asset, island, commercial/industrial complexity.
- Output both: estimated_market_value_if_clean AND auction_adjusted_value.
- auction_adjusted_value = your primary output (estimatedValue).` : "";

  return (base[propertyType] || fallback) + auctionSuffix;
}

// ── Main handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      title, city, address, price, sqm, bedrooms, bathrooms,
      propertyType, listingType, floor, totalFloors, yearBuilt,
      energyClass, pricePerSqm, hasParking, hasPool, hasElevator,
      hasGarden, hasStorage, hasBalcony, hasView, hasFurnished,
      region, description, tags,
      ownershipStatus, ownershipPercentage,
      auctionCourt, plotSurface, condition,
    } = body;

    if (!city || !sqm || !price) {
      return new Response(
        JSON.stringify({ error: "city, sqm and price are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ── Build observed features layer ──────────────────────────────────────────
    const observedFeatures = [
      floor != null && `Floor: ${floor}${totalFloors ? `/${totalFloors}` : ""}`,
      yearBuilt && `Year built: ${yearBuilt}`,
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
      condition && `Condition: ${condition}`,
      ownershipStatus && ownershipStatus !== "full" && `Ownership: ${ownershipStatus}${ownershipPercentage ? ` (${ownershipPercentage}%)` : ""}`,
      auctionCourt && `Auction court: ${auctionCourt}`,
      tags?.length && `Tags: ${tags.join(", ")}`,
    ].filter(Boolean).join(" | ") || "standard specification";

    const listingDesc = description
      ? `Description excerpt: "${String(description).slice(0, 500)}"`
      : "";

    const typeInstructions = getTypeInstructions(propertyType || "apartment", listingType || "sale");

    const prompt = `You are a senior Greek real estate valuation expert with RICS-equivalent credentials and deep knowledge of the 2026 Greek market. Your task is to produce a RIGOROUS, EVIDENCE-BASED valuation using the framework below.

${MARKET_BENCHMARKS}

=== PROPERTY TO VALUE ===
Title: ${title || "Property"}
Location: ${address ? `${address}, ` : ""}${city}${region ? `, ${region}` : ""}, Greece
Type: ${propertyType || "apartment"} | Transaction: ${listingType || "sale"}
Size: ${sqm} sqm
Listed price: €${Number(price).toLocaleString()} (€${pricePerSqm ? Math.round(Number(pricePerSqm)) : Math.round(Number(price) / Number(sqm))}/sqm)
Observed features: ${observedFeatures}
${listingDesc}

=== METHODOLOGY TO APPLY ===
${typeInstructions}

=== OUTPUT REQUIREMENTS ===
CRITICAL RULES:
1. DO NOT echo the listed price as your estimate. Cross-reference against benchmarks.
2. Output a RANGE, not false precision. Range width must reflect data quality.
3. Apply TYPE-SPECIFIC logic — one formula for all types is wrong.
4. Confidence must decrease with missing data, few comps, unclear location, special assets.
5. Price growth is DECELERATING in 2026 — do not extrapolate past growth rates.
6. Commercial behavior is DISTINCT from residential — do not conflate.

Return ONLY valid JSON, no markdown, no explanation outside the JSON:

{
  "estimatedValue": number (primary valuation in EUR — auction-adjusted if auction, clean market if normal sale),
  "rangeLow": number (conservative execution value),
  "rangeHigh": number (optimistic but supportable value),
  "pricePerSqmEstimate": number (your 2026 benchmark €/sqm for this specific submarket),
  "confidence": number (0–100 reflecting data completeness and comp quality),
  "confidenceLabel": "High" | "Medium" | "Low",
  "liquidityScore": number (0–100; how executable is this asset: 90=central small apt; 20=remote island/obsolete industrial),
  "marketComparison": "below_market" | "at_market" | "above_market",
  "marketComparisonPct": number (e.g. -12 = 12% below market; +8 = 8% above),
  "pricingPosition": "underpriced" | "fair" | "overpriced",
  "methodUsed": "string (e.g. 'Comparable hedonic model — residential Athens center')",
  "summary": "string (3–5 sentences: cite the specific €/sqm benchmark used, local 2026 trend, key premium/discount drivers, and what moves the needle most for this asset)",
  "keyFactors": [
    {
      "factor": "string (concise label)",
      "impact": "positive" | "negative" | "neutral",
      "note": "string (cite 2026 data point or reasoning — max 100 chars)"
    }
  ],
  "renovationPotential": "string (quantified 2026 estimate or null if not applicable)",
  "rentalYieldEstimate": number (2026 gross yield %, realistic for this submarket and type),
  "highestBestUseHint": "string or null (only where genuinely relevant: e.g. 'Plot viable for 3-floor residential dev at SD 1.6' or 'Hotel conversion viable' — null if standard residential)",
  "redFlags": ["string"] (array of red flags — empty array [] if none; trigger for: extreme ±30% from market, missing critical data for type, auction with no inspection, land marketed as buildable without evidence, etc.),
  "auctionAdjustedValue": number | null (clean market value before auction discounts — only populated if listingType is auction, else null),
  "listingQualityScore": number (0–100; data richness of this listing for valuation purposes: 100=all fields present; 40=basic fields only)
}

Rules for output:
- keyFactors: 4–7 items; always include a 2026 market trend factor, a transaction cost factor, and a confidence/data factor
- confidenceLabel: High = 75+, Medium = 50–74, Low = <50
- Range width: ±6-10% for urban apartment with strong data; ±15-25% for villa/land; ±20-40% for island/hotel/plot
- liquidityScore: 80-100 = standard urban apartment; 60-80 = suburban/commercial; 40-60 = villa/vacation; 20-40 = island/land/industrial; 0-20 = hotel/special assets
- Only return the JSON object. No other text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.25,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await response.json();
    const raw = (aiData.choices?.[0]?.message?.content ?? "").trim();

    // ── JSON extraction and repair ─────────────────────────────────────────────
    let jsonStr = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start !== -1 && end !== -1) jsonStr = jsonStr.slice(start, end + 1);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      const repaired = jsonStr
        .replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
        .replace(/\)\s*}/g, "}").replace(/\)\s*,/g, ",")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      try { parsed = JSON.parse(repaired); }
      catch { throw new Error("AI returned invalid JSON"); }
    }

    // ── Sanitise output ───────────────────────────────────────────────────────
    const result = {
      estimatedValue: Math.round(Number(parsed.estimatedValue) || price),
      rangeLow: Math.round(Number(parsed.rangeLow) || price * 0.88),
      rangeHigh: Math.round(Number(parsed.rangeHigh) || price * 1.12),
      pricePerSqmEstimate: Math.round(Number(parsed.pricePerSqmEstimate) || price / sqm),
      confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 55)),
      confidenceLabel: (["High","Medium","Low"].includes(parsed.confidenceLabel) ? parsed.confidenceLabel : "Medium") as "High"|"Medium"|"Low",
      liquidityScore: Math.min(100, Math.max(0, Number(parsed.liquidityScore) || 50)),
      marketComparison: (["below_market","at_market","above_market"].includes(parsed.marketComparison) ? parsed.marketComparison : "at_market") as string,
      marketComparisonPct: Number(parsed.marketComparisonPct) || 0,
      pricingPosition: (["underpriced","fair","overpriced"].includes(parsed.pricingPosition) ? parsed.pricingPosition : "fair") as string,
      methodUsed: String(parsed.methodUsed || "").slice(0, 120),
      summary: String(parsed.summary || "").slice(0, 600),
      keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.slice(0, 7).map((f: any) => ({
        factor: String(f.factor || "").slice(0, 60),
        impact: (["positive","negative","neutral"].includes(f.impact) ? f.impact : "neutral") as "positive"|"negative"|"neutral",
        note: String(f.note || "").slice(0, 120),
      })) : [],
      renovationPotential: parsed.renovationPotential ? String(parsed.renovationPotential).slice(0, 300) : null,
      rentalYieldEstimate: Math.round((Number(parsed.rentalYieldEstimate) || 4.5) * 10) / 10,
      highestBestUseHint: parsed.highestBestUseHint ? String(parsed.highestBestUseHint).slice(0, 250) : null,
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.slice(0, 5).map((s: any) => String(s).slice(0, 120)) : [],
      auctionAdjustedValue: parsed.auctionAdjustedValue ? Math.round(Number(parsed.auctionAdjustedValue)) : null,
      listingQualityScore: Math.min(100, Math.max(0, Number(parsed.listingQualityScore) || 50)),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("property-valuation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
