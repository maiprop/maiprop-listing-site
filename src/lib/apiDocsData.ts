import { BarChart2, Database, CreditCard, FileText, Layers } from "lucide-react";
// ── Types ──────────────────────────────────────────────────────────────────────
export type HttpMethod = "GET" | "POST" | "DELETE" | "PATCH";
export interface Endpoint {
    id: string;
    method: HttpMethod;
    path: string;
    description: string;
    auth: boolean;
    rateLimit: string;
    requestBody?: string;
    responseExample: string;
    responseLabel?: string;
}
export interface ApiSection {
    id: string;
    title: string;
    icon: React.ElementType;
    endpoints: Endpoint[];
}
// ── Constants ──────────────────────────────────────────────────────────────────
export const PROJECT_ID = "[project-id]";
export const SECTIONS: ApiSection[] = [
    {
        id: "ai-valuations",
        title: "AI & Market Analysis",
        icon: BarChart2,
        endpoints: [
            {
                id: "property-valuation",
                method: "POST",
                path: "/property-valuation",
                description: "Signed-in, quota-metered v2 valuation. Synthetic partial example: unavailable fields stay null; model/provider observations are not independently verified appraisals. A complete lack of evidence returns 503.",
                auth: true,
                rateLimit: "15 requests / minute per IP; monthly actor quota",
                requestBody: JSON.stringify({
                    responseVersion: 2,
                    city: "Athens",
                    price: 250000,
                    sqm: 80,
                    propertyType: "apartment",
                    listingType: "sale"
                }, null, 2),
                responseExample: JSON.stringify({
                    responseVersion: 2,
                    status: "partial",
                    transaction: "sale",
                    valueUnit: "EUR",
                    estimateBasis: "market_value",
                    providerPrediction: null,
                    estimatedValue: null,
                    auctionAdjustedValue: null,
                    rangeLow: null,
                    rangeHigh: null,
                    rangeBasis: null,
                    executionValue: null,
                    pricePerSqmEstimate: null,
                    rentalYieldEstimate: null,
                    objectiveValueProxy: null,
                    confidence: null,
                    confidenceLabel: null,
                    liquidityScore: null,
                    legalCleanliness: null,
                    planningCertainty: null,
                    taxFriction: null,
                    transferReadiness: null,
                    listingQualityScore: null,
                    marketComparison: null,
                    marketComparisonPct: null,
                    pricingPosition: null,
                    legalSummary: null,
                    taxSummary: null,
                    renovationPotential: null,
                    highestBestUseHint: null,
                    summary: "Insufficient comparable evidence for a numeric estimate.",
                    keyFactors: [],
                    redFlags: [],
                    methodUsed: "Unverified AI valuation analysis",
                    evidence: {
                        independentlyVerified: false,
                        fields: {
                            estimatedValue: "unavailable",
                            auctionAdjustedValue: "unavailable",
                            rangeLow: "unavailable",
                            rangeHigh: "unavailable",
                            executionValue: "unavailable",
                            pricePerSqmEstimate: "unavailable",
                            rentalYieldEstimate: "unavailable",
                            objectiveValueProxy: "unavailable",
                            confidence: "unavailable",
                            liquidityScore: "unavailable",
                            legalCleanliness: "unavailable",
                            planningCertainty: "unavailable",
                            taxFriction: "unavailable",
                            transferReadiness: "unavailable",
                            listingQualityScore: "unavailable",
                            marketComparisonPct: "unavailable"
                        },
                        analysis: "ai_estimate",
                        limitations: [
                            "No legal documents, live comparable transactions, or formal appraisal were independently verified.",
                            "Model estimates and qualitative assessments are unverified."
                        ]
                    }
                }, null, 2)
            },
            {
                id: "neighbourhood-report",
                method: "POST",
                path: "/neighbourhood-report",
                description: "Signed-in v2 area report. Source-qualified nullable market history and qualitative model analysis; not verified safety or walkability. Synthetic fallback response shows unavailable evidence as null.",
                auth: true,
                rateLimit: "15 requests / minute per IP; monthly actor quota",
                requestBody: JSON.stringify({
                    responseVersion: 2,
                    city: "Athens",
                    address: "Synthetic example street"
                }, null, 2),
                responseExample: JSON.stringify({
                    responseVersion: 2,
                    areaName: "Synthetic example street",
                    walkabilityScore: null,
                    pricePerSqmTrend: {
                        current: null,
                        oneYearAgo: null,
                        threeYearsAgo: null,
                        fiveYearsAgo: null,
                        changeYoY: null,
                        change5Y: null
                    },
                    noiseLevel: null,
                    safetyScore: null,
                    developmentProjects: [],
                    demographics: null,
                    investmentOutlook: null,
                    areaHighlights: [],
                    generatedBy: "fallback",
                    osMunicipalityStatus: "missing_config",
                    osMunicipalityDetail: "",
                    provenance: {
                        pricePerSqmTrend: {
                            current: null,
                            oneYearAgo: null,
                            threeYearsAgo: null,
                            fiveYearsAgo: null,
                            changeYoY: null,
                            change5Y: null
                        },
                        analysis: null,
                        developmentProjects: null
                    }
                }, null, 2)
            },
            {
                id: "ai-search",
                method: "POST",
                path: "/ai-search",
                description: "Converts natural language into filters; does not retrieve listing records. Model interpretation should be checked by the caller.",
                auth: true,
                rateLimit: "20 requests / minute per IP (actor fallback); monthly actor quota",
                requestBody: JSON.stringify({
                    query: "Apartment in Athens under 250000 euros"
                }, null, 2),
                responseExample: JSON.stringify({
                    city: "Athens",
                    listing_type: "sale",
                    property_type: "apartment",
                    price_min: null,
                    price_max: 250000,
                    beds_min: null,
                    beds_max: null,
                    sqm_min: null,
                    sqm_max: null,
                    features: [],
                    energy: [],
                    heating: null,
                    summary: "Apartment for sale in Athens under €250k"
                }, null, 2)
            }
        ]
    },
    {
        id: "listings",
        title: "Listings",
        icon: Database,
        endpoints: [
            {
                id: "listings-browse",
                method: "GET",
                path: "/api/public/listings?city=Athens&pageSize=24",
                description: "Website API: use your website origin, not the Supabase base. Public active catalogue; optional listing_type/property_type, price_min/price_max and cursor. Reuse nextCursor with the same filters; expired/invalid cursors return 400. Empty synthetic page shown.",
                auth: false,
                rateLimit: "No numeric handler limit advertised",
                responseExample: JSON.stringify({
                    data: [],
                    hasMore: false,
                    nextCursor: null,
                    page: 1,
                    pageSize: 24,
                    offset: 0,
                    publicationId: 1
                }, null, 2)
            },
            {
                id: "listing-ai-assist",
                method: "POST",
                path: "/listing-ai-assist",
                description: "Generate unverified description or price-assistance text from supplied property facts (type description or price). The separate type:ping availability operation does not test authenticated generation.",
                auth: true,
                rateLimit: "20 requests / minute per IP (actor fallback); monthly actor quota",
                requestBody: JSON.stringify({
                    type: "description",
                    property: {
                        property_type: "apartment",
                        listing_type: "sale",
                        city: "Athens",
                        sqm: 80
                    }
                }, null, 2),
                responseExample: JSON.stringify({
                    content: "An 80 m² apartment in Athens. Further details require confirmation."
                }, null, 2)
            }
        ]
    },
    {
        id: "professionals",
        title: "Professionals",
        icon: Layers,
        endpoints: [
            {
                id: "ai-service-match",
                method: "POST",
                path: "/ai-service-match",
                description: "Suggests a professional category and services from your need. Does not return verified professionals, fees, ratings or availability.",
                auth: true,
                rateLimit: "20 requests / minute per IP (actor fallback); monthly actor quota",
                requestBody: JSON.stringify({
                    need: "I need help reviewing a property purchase contract."
                }, null, 2),
                responseExample: JSON.stringify({
                    category: "lawyer",
                    services: [
                        "Contract review"
                    ],
                    explanation: "A lawyer can review the proposed contract.",
                    urgency: "medium",
                    follow_up_question: null
                }, null, 2)
            }
        ]
    },
    {
        id: "payments",
        title: "Payments & Subscriptions",
        icon: CreditCard,
        endpoints: [
            {
                id: "create-checkout",
                method: "POST",
                path: "/create-checkout",
                description: "Create an eligible subscription Checkout session using a server-resolved plan. Add-ons, trials and existing subscriptions have separate response branches. Redirect only to the returned URL; this is not payment confirmation.",
                auth: true,
                rateLimit: "10 requests / minute per verified user",
                requestBody: JSON.stringify({
                    plan: "pro",
                    billing_cycle: "monthly",
                    success_url: "/dashboard",
                    cancel_url: "/pricing"
                }, null, 2),
                responseExample: JSON.stringify({
                    url: "https://checkout.stripe.com/c/pay/cs_test_synthetic",
                    session_id: "cs_test_synthetic",
                    checkout_type: "subscription",
                    mode: "test"
                }, null, 2)
            },
            {
                id: "check-subscription",
                method: "POST",
                path: "/check-subscription",
                description: "Refresh durable subscription state with no body or {}. Optional checkout_session_id requests exact-session reconciliation; only a matching verified_checkout receipt confirms that session. A pending reconciliation may return 202.",
                auth: true,
                rateLimit: "30 requests / minute per IP; limiter outage is logged and allowed",
                requestBody: JSON.stringify({}, null, 2),
                responseExample: JSON.stringify({
                    subscribed: true,
                    product_id: "prod_synthetic",
                    subscription_end: "2026-10-27T00:00:00Z",
                    source: "billing_state",
                    plan_key: "pro",
                    audience: "participant",
                    billing_cycle: "monthly",
                    status: "active",
                    sync_status: "synced"
                }, null, 2)
            }
        ]
    },
    {
        id: "documents",
        title: "Property Q&A",
        icon: FileText,
        endpoints: [
            {
                id: "property-chat",
                method: "POST",
                path: "/property-chat",
                description: "Ask about supplied property context. This endpoint does not upload documents. Success streams text/event-stream; errors are JSON. Answers are model-generated and require verification.",
                auth: true,
                rateLimit: "20 requests / minute per IP (actor fallback); monthly actor quota",
                requestBody: JSON.stringify({
                    messages: [
                        {
                            role: "user",
                            content: "Which property details should I confirm?"
                        }
                    ],
                    propertyContext: {
                        city: "Athens",
                        sqm: 80
                    }
                }, null, 2),
                responseExample: "data: {\"choices\":[{\"delta\":{\"content\":\"Confirm the property details with the responsible professional.\"}}]}\n\ndata: [DONE]\n\n",
                responseLabel: "Success stream example (200, text/event-stream)"
            }
        ]
    }
];
// ── Method badge colours ───────────────────────────────────────────────────────
export const METHOD_STYLES: Record<HttpMethod, string> = {
    GET: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    POST: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    DELETE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    PATCH: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
};
// ── Auth code snippet ──────────────────────────────────────────────────────────
export const AUTH_SNIPPET = `// 1. Sign in with Supabase
const { data: { session } } = await supabase.auth.signInWithPassword({
  email: "user@example.com",
  password: "<your-password>",
});

const token = session?.access_token;

// 2. Call a protected edge function
const response = await fetch(
  \`https://${PROJECT_ID}.supabase.co/functions/v1/check-subscription\`,
  {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${token}\`,
      "Content-Type": "application/json",
    },
  }
);

const data = await response.json();`;
