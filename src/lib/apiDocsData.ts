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
    title: "AI & Valuations",
    icon: BarChart2,
    endpoints: [
      {
        id: "property-valuation",
        method: "POST",
        path: "/property-valuation",
        description:
          "Generate an AI-powered automated valuation model (AVM) estimate for a Greek property based on address, size, condition, and recent comparable sales data.",
        auth: false,
        rateLimit: "10 requests / minute per IP",
        requestBody: JSON.stringify(
          {
            address: "Akadimias 32, 106 72, Athens, Greece",
            area_sqm: 95,
            bedrooms: 3,
            floor: 2,
            year_built: 2005,
            condition: "good",
            listing_type: "sale",
          },
          null,
          2
        ),
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              estimated_value: 320000,
              price_per_sqm: 3368,
              confidence: "high",
              range: { low: 295000, high: 345000 },
              comparable_sales: 12,
              generated_at: "2026-03-23T10:00:00Z",
            },
          },
          null,
          2
        ),
      },
      {
        id: "neighbourhood-report",
        method: "POST",
        path: "/neighbourhood-report",
        description:
          "Generate a comprehensive neighbourhood intelligence report including demographics, schools, transport, crime index, and investment outlook.",
        auth: false,
        rateLimit: "5 requests / minute per IP",
        requestBody: JSON.stringify(
          {
            address: "Glyfada, Attica",
            lat: 37.8794,
            lon: 23.7543,
            radius_km: 1.5,
          },
          null,
          2
        ),
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              area_name: "Glyfada",
              overall_score: 87,
              categories: {
                transport: 82,
                schools: 90,
                amenities: 95,
                safety: 85,
                investment_potential: 88,
              },
              avg_price_per_sqm_sale: 3800,
              avg_price_per_sqm_rent: 14,
              summary: "Premium southern suburb with excellent amenities...",
            },
          },
          null,
          2
        ),
      },
      {
        id: "ai-search",
        method: "POST",
        path: "/ai-search",
        description:
          "Natural language property search. Converts a free-text query into structured filters and returns matching listings from the maiProp database.",
        auth: false,
        rateLimit: "20 requests / minute per IP",
        requestBody: JSON.stringify(
          {
            query: "3 bedroom apartment near the sea in Athens under 400k with parking",
            limit: 10,
            offset: 0,
          },
          null,
          2
        ),
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              parsed_filters: {
                bedrooms_min: 3,
                listing_type: "sale",
                price_max: 400000,
                has_parking: true,
                location: "Athens coastal",
              },
              total: 24,
              listings: [{ id: "uuid", title: "Sea-view apartment...", price: 385000 }],
            },
          },
          null,
          2
        ),
      },
    ],
  },
  {
    id: "listings",
    title: "Listings",
    icon: Layers,
    endpoints: [
      {
        id: "listings-browse",
        method: "GET",
        path: "/listings",
        description:
          "Browse property listings with optional filters. Supports pagination, sorting, and structured query parameters.",
        auth: false,
        rateLimit: "60 requests / minute",
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              total: 1842,
              page: 1,
              per_page: 20,
              listings: [
                {
                  id: "uuid",
                  title: "Modern apartment in Kolonaki",
                  price: 450000,
                  area_sqm: 110,
                  bedrooms: 3,
                  listing_type: "sale",
                  status: "active",
                },
              ],
            },
          },
          null,
          2
        ),
      },
      {
        id: "listing-ai-assist",
        method: "POST",
        path: "/listing-ai-assist",
        description:
          "Generate AI-assisted listing content (title, description, key features) from raw property data. Requires an active Pro subscription.",
        auth: true,
        rateLimit: "20 requests / minute",
        requestBody: JSON.stringify(
          {
            property_type: "apartment",
            bedrooms: 3,
            bathrooms: 2,
            area_sqm: 95,
            city: "Athens",
            neighbourhood: "Kolonaki",
            features: ["parking", "storage", "garden_access"],
            year_built: 2018,
          },
          null,
          2
        ),
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              title: "Bright 3-Bedroom Apartment in Prime Kolonaki Location",
              description:
                "Spacious and well-maintained apartment offering 95 sq m of living space...",
              key_features: ["South-facing balcony", "Secure underground parking", "Storage room"],
            },
          },
          null,
          2
        ),
      },
    ],
  },
  {
    id: "professionals",
    title: "Professionals",
    icon: Database,
    endpoints: [
      {
        id: "ai-service-match",
        method: "POST",
        path: "/ai-service-match",
        description:
          "Match a buyer or seller with verified professional service providers (lawyers, notaries, engineers, agents) based on location, budget, and service type.",
        auth: false,
        rateLimit: "15 requests / minute per IP",
        requestBody: JSON.stringify(
          {
            service_type: "legal",
            location: "Athens",
            property_value: 350000,
            language_preference: "en",
          },
          null,
          2
        ),
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              matches: [
                {
                  id: "prof-uuid",
                  name: "Stavros Papadopoulos",
                  category: "lawyer",
                  rating: 4.9,
                  reviews: 48,
                  languages: ["en", "el"],
                  price_range: "€800–€1,500",
                },
              ],
            },
          },
          null,
          2
        ),
      },
    ],
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
        description:
          "Create a Stripe Checkout session for upgrading to a Pro or Investor subscription plan. Redirects to Stripe's hosted payment page.",
        auth: true,
        rateLimit: "10 requests / minute",
        requestBody: JSON.stringify(
          {
            price_id: "price_1RCgMK...",
            success_url: "/dashboard?upgrade=success",
            cancel_url: "/dashboard",
          },
          null,
          2
        ),
        responseExample: JSON.stringify(
          {
            success: true,
            data: { checkout_url: "https://checkout.stripe.com/pay/cs_test_..." },
          },
          null,
          2
        ),
      },
      {
        id: "check-subscription",
        method: "POST",
        path: "/check-subscription",
        description:
          "Check the authenticated user's durable subscription state. Feature limits are resolved separately from the plan contract.",
        auth: true,
        rateLimit: "30 requests / minute",
        responseExample: JSON.stringify(
          {
            subscribed: true,
            product_id: "prod_U8SJbk3fZQ3xgD",
            subscription_end: "2026-04-23T00:00:00Z",
            source: "billing_state",
            plan_key: "pro",
            audience: "participant",
            billing_cycle: "monthly",
            status: "active",
            sync_status: "synced",
          },
          null,
          2
        ),
      },
    ],
  },
  {
    id: "documents",
    title: "Documents & Templates",
    icon: FileText,
    endpoints: [
      {
        id: "property-chat",
        method: "POST",
        path: "/property-chat",
        description:
          "AI-powered document Q&A. Upload a property contract or legal document and ask natural language questions about its contents.",
        auth: true,
        rateLimit: "10 requests / minute",
        requestBody: JSON.stringify(
          {
            document_text: "ΣΥΜΒΟΛΑΙΟ ΠΩΛΗΣΗΣ... (full document text)",
            question: "What are the payment terms and handover date?",
            language: "en",
          },
          null,
          2
        ),
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              answer:
                "The payment terms require 30% deposit on signing and the remaining 70% on handover. The handover date is set for 30 June 2026.",
              confidence: "high",
              relevant_clauses: ["Article 4.1 - Payment Schedule", "Article 7.3 - Handover"],
            },
          },
          null,
          2
        ),
      },
    ],
  },
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
