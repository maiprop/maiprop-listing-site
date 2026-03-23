import { useState, useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  ExternalLink,
  Lock,
  Globe,
  Zap,
  ChevronRight,
  Code2,
  Database,
  CreditCard,
  FileText,
  Layers,
  BarChart2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "DELETE" | "PATCH";

interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  description: string;
  auth: boolean;
  rateLimit: string;
  requestBody?: string;
  responseExample: string;
}

interface ApiSection {
  id: string;
  title: string;
  icon: React.ElementType;
  endpoints: Endpoint[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PROJECT_ID = "[project-id]";

const SECTIONS: ApiSection[] = [
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
            address: "Kifissias 44, Marousi, 15125",
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
          "Generate an AI-written property listing description in English and/or Greek, optimised for SEO and buyer engagement. Pro users only.",
        auth: true,
        rateLimit: "10 requests / minute (Pro users only)",
        requestBody: JSON.stringify(
          {
            listing_id: "uuid",
            property_type: "apartment",
            area_sqm: 95,
            bedrooms: 3,
            location: "Kifissia, Athens",
            highlights: ["sea view", "renovated kitchen", "underfloor heating"],
            language: "both",
          },
          null,
          2
        ),
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              description_en: "Discover this beautifully renovated 95 sqm apartment...",
              description_el: "Ανακαλύψτε αυτό το όμορφα ανακαινισμένο διαμέρισμα...",
              seo_title: "3-Bedroom Renovated Apartment | Kifissia | 390,000",
              word_count: 180,
            },
          },
          null,
          2
        ),
      },
    ],
  },
  {
    id: "os-data",
    title: "OS Data Platform",
    icon: Database,
    endpoints: [
      {
        id: "os-sales-coordinates",
        method: "POST",
        path: "/os-sales-coordinates",
        description:
          "Retrieve historical property sales data from the Hellenic Open Data platform (data.gov.gr) filtered by geographic coordinates and radius.",
        auth: true,
        rateLimit: "30 requests / minute",
        requestBody: JSON.stringify(
          {
            lat: 37.9838,
            lon: 23.7275,
            radius_km: 0.5,
            date_from: "2023-01-01",
            date_to: "2024-12-31",
            property_type: "apartment",
          },
          null,
          2
        ),
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              total_sales: 47,
              avg_price_per_sqm: 3250,
              median_price: 285000,
              sales: [
                {
                  date: "2024-06-15",
                  area_sqm: 88,
                  price: 290000,
                  price_per_sqm: 3295,
                  floor: 3,
                },
              ],
            },
          },
          null,
          2
        ),
      },
      {
        id: "poll-os-auctions",
        method: "GET",
        path: "/poll-os-auctions",
        description:
          "Fetch the latest Greek court auction listings from the official e-auction platform (eauction.gr). Data is cached for 15 minutes.",
        auth: false,
        rateLimit: "10 requests / minute",
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              fetched_at: "2026-03-23T09:00:00Z",
              total: 312,
              auctions: [
                {
                  id: "EL-ATH-2026-001234",
                  property_type: "apartment",
                  area_sqm: 72,
                  location: "Piraeus",
                  starting_price: 95000,
                  auction_date: "2026-04-15",
                  court: "Piraeus First Instance Court",
                },
              ],
            },
          },
          null,
          2
        ),
      },
      {
        id: "fetch-report-from-os",
        method: "POST",
        path: "/fetch-report-from-os",
        description:
          "Retrieve a detailed property report from the Hellenic Cadastre (Ktamatologio) or AADE property database using a KAEK or AFM reference.",
        auth: true,
        rateLimit: "5 requests / minute",
        requestBody: JSON.stringify(
          {
            kaek: "XX/XX/XX/XXXXX/X/X",
            report_type: "cadastral",
            include_ownership_history: true,
          },
          null,
          2
        ),
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              kaek: "XX/XX/XX/XXXXX/X/X",
              registered_owner: "[REDACTED - requires authorisation]",
              area_sqm: 95,
              property_type: "apartment",
              floor: 2,
              municipality: "Marousi",
              encumbrances: [],
              last_transfer_date: "2018-03-10",
              objective_value: 210000,
            },
          },
          null,
          2
        ),
      },
    ],
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    icon: CreditCard,
    endpoints: [
      {
        id: "create-checkout",
        method: "POST",
        path: "/create-checkout",
        description:
          "Create a Stripe Checkout session for a Pro plan subscription. Returns a redirect URL to the hosted Stripe payment page.",
        auth: true,
        rateLimit: "5 requests / minute",
        requestBody: JSON.stringify(
          {
            price_id: "price_xxxxxxxxxxxxx",
            success_url: "https://maiprop.co/dashboard?upgraded=true",
            cancel_url: "https://maiprop.co/pricing",
          },
          null,
          2
        ),
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              session_id: "cs_live_xxxxxxxxxxxxx",
              url: "https://checkout.stripe.com/pay/cs_live_xxxxxxxxxxxxx",
              expires_at: "2026-03-23T11:00:00Z",
            },
          },
          null,
          2
        ),
      },
      {
        id: "check-subscription",
        method: "GET",
        path: "/check-subscription",
        description:
          "Verify the current user's subscription status with Stripe. Returns plan details, renewal date, and feature entitlements.",
        auth: true,
        rateLimit: "30 requests / minute",
        responseExample: JSON.stringify(
          {
            success: true,
            data: {
              subscribed: true,
              plan: "pro",
              product_id: "prod_U8SJbk3fZQ3xgD",
              current_period_end: "2026-04-23T00:00:00Z",
              cancel_at_period_end: false,
              features: {
                ai_valuations_monthly: 5,
                neighbourhood_reports_monthly: 3,
                max_listings: 5,
                max_viewings: 10,
              },
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

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  POST: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  PATCH: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
};

// ── Auth code snippet ──────────────────────────────────────────────────────────

const AUTH_SNIPPET = `// 1. Sign in with Supabase
const { data: { session } } = await supabase.auth.signInWithPassword({
  email: "user@example.com",
  password: "yourpassword",
});

const token = session?.access_token;

// 2. Call a protected edge function
const response = await fetch(
  \`https://${PROJECT_ID}.supabase.co/functions/v1/check-subscription\`,
  {
    method: "GET",
    headers: {
      "Authorization": \`Bearer \${token}\`,
      "Content-Type": "application/json",
    },
  }
);

const data = await response.json();`;

// ── CopyButton ─────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-3 h-3 text-emerald-500" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── CodeBlock ──────────────────────────────────────────────────────────────────

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border">
        {label ? (
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
        ) : (
          <span />
        )}
        <CopyButton text={code} />
      </div>
      <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto bg-muted/30 text-foreground/85 whitespace-pre-wrap">
        {code}
      </pre>
    </div>
  );
}

// ── EndpointCard ───────────────────────────────────────────────────────────────

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" id={endpoint.id}>
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className={`text-[11px] font-bold px-2 py-1 rounded font-mono shrink-0 mt-0.5 ${METHOD_STYLES[endpoint.method]}`}
        >
          {endpoint.method}
        </span>
        <div className="flex-1 min-w-0">
          <code className="text-sm font-mono text-foreground break-all">{endpoint.path}</code>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {endpoint.description}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {endpoint.auth ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" /> Auth required
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full">
                <Globe className="w-2.5 h-2.5" /> Public
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">{endpoint.rateLimit}</span>
          </div>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4 bg-muted/10">
          {endpoint.requestBody && (
            <CodeBlock code={endpoint.requestBody} label="Request Body (JSON)" />
          )}
          {!endpoint.requestBody && endpoint.method === "GET" && (
            <p className="text-xs text-muted-foreground italic">
              No request body. Use query parameters for filtering.
            </p>
          )}
          <CodeBlock code={endpoint.responseExample} label="Response Example (200 OK)" />
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function APIDocs() {
  const _sidebarRef = useRef<HTMLDivElement>(null);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar forceScrolled />
      <div className="pt-16">
        {/* Hero */}
        <section className="py-12 border-b border-border bg-muted/30">
          <div className="container max-w-6xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Code2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">
                  Developers
                </p>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="font-display text-3xl sm:text-4xl font-bold">
                    maiProp Platform API
                  </h1>
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                    v1.0
                  </span>
                </div>
                <p className="text-muted-foreground max-w-2xl">
                  Built on Supabase Edge Functions (Deno runtime). All endpoints return JSON.
                  Protected endpoints require a valid JWT token in the{" "}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    Authorization
                  </code>{" "}
                  header.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <code className="text-xs bg-muted border border-border px-3 py-1.5 rounded-lg font-mono text-foreground/80">
                    {`https://${PROJECT_ID}.supabase.co/functions/v1/`}
                  </code>
                  <span className="text-xs text-muted-foreground">
                    Replace{" "}
                    <code className="font-mono text-primary">[project-id]</code> with your
                    Supabase project ID
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="container max-w-6xl py-10">
          <div className="flex gap-8 items-start">
            {/* Sticky sidebar navigation */}
            <aside
              ref={_sidebarRef}
              className="hidden lg:block w-52 shrink-0 sticky top-24 self-start"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                Sections
              </p>
              <nav className="space-y-1">
                <button
                  onClick={() => scrollTo("auth-section")}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-left text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" /> Authentication
                </button>
                {SECTIONS.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => scrollTo(section.id)}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-left text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" /> {section.title}
                    </button>
                  );
                })}
                <button
                  onClick={() => scrollTo("try-it")}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-left text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Zap className="w-3.5 h-3.5 shrink-0" /> Try It Out
                </button>
              </nav>
            </aside>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-12">
              {/* Authentication section */}
              <section id="auth-section">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-primary" />
                  </div>
                  <h2 className="font-display text-xl font-bold">Authentication</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  Protected endpoints use Supabase JWT authentication. Sign in via the Supabase
                  client to obtain a token, then include it in every request header.
                </p>
                <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-muted/50 border border-border">
                  <span className="font-mono text-xs text-muted-foreground">Authorization:</span>
                  <code className="font-mono text-xs text-primary">
                    Bearer &lt;your_supabase_jwt_token&gt;
                  </code>
                </div>
                <CodeBlock
                  code={AUTH_SNIPPET}
                  label="Getting a token (JavaScript / TypeScript)"
                />
              </section>

              {/* API sections */}
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                return (
                  <section key={section.id} id={section.id}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <h2 className="font-display text-xl font-bold">{section.title}</h2>
                      <span className="text-xs text-muted-foreground">
                        {section.endpoints.length} endpoint
                        {section.endpoints.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {section.endpoints.map((endpoint) => (
                        <EndpointCard key={endpoint.id} endpoint={endpoint} />
                      ))}
                    </div>
                  </section>
                );
              })}

              {/* Try it out */}
              <section
                id="try-it"
                className="rounded-xl border border-primary/20 bg-primary/5 p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h2 className="font-display text-lg font-bold mb-1">Try It Out</h2>
                    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                      The easiest way to explore the API is via the Supabase dashboard. Invoke Edge
                      Functions directly, inspect logs, and manage authentication tokens.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button asChild size="sm" className="gap-2">
                        <a
                          href="https://supabase.com/dashboard"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Supabase Dashboard
                        </a>
                      </Button>
                      <Button variant="outline" asChild size="sm" className="gap-2">
                        <a
                          href="https://docs.supabase.com/docs/guides/functions"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Edge Functions Docs
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Error codes table */}
              <section>
                <h2 className="font-display text-xl font-bold mb-4">Error Codes</h2>
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Status
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Meaning
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                          Common Cause
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        { code: "200", label: "OK", cause: "Request succeeded" },
                        {
                          code: "400",
                          label: "Bad Request",
                          cause: "Missing or invalid request body / query params",
                        },
                        {
                          code: "401",
                          label: "Unauthorized",
                          cause: "Missing or expired JWT token",
                        },
                        {
                          code: "403",
                          label: "Forbidden",
                          cause: "Valid token but insufficient permissions (e.g. non-Pro user)",
                        },
                        {
                          code: "422",
                          label: "Unprocessable",
                          cause: "Valid request format but failed business validation",
                        },
                        {
                          code: "429",
                          label: "Rate Limited",
                          cause:
                            "Too many requests — back off and retry after the Retry-After header",
                        },
                        {
                          code: "500",
                          label: "Server Error",
                          cause: "Edge function runtime error — contact support",
                        },
                      ].map((row) => (
                        <tr key={row.code} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <code
                              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                                row.code.startsWith("2")
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                  : row.code.startsWith("4")
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                              }`}
                            >
                              {row.code}
                            </code>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">{row.label}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                            {row.cause}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
