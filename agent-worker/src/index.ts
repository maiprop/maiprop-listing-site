import { Agent as CloudflareAgent, getAgentByName, routeAgentRequest } from "agents";
import { Agent as OpenAIAgent, run, setDefaultOpenAIKey, setTracingDisabled, tool } from "@openai/agents";
import { z } from "zod";

type ListingInput = {
  id: string;
  title: string;
  city?: string | null;
  region?: string | null;
  price?: number | null;
  sqm?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  listing_type?: string | null;
  property_type?: string | null;
  description?: string | null;
  ai_score?: number | null;
  open_house_date?: string | null;
  auction_date?: string | null;
  auction_starting_bid?: number | null;
};

type AdvisorRequest = {
  message?: string;
  sessionId?: string;
  role?: string | null;
  locale?: string | null;
  listings?: ListingInput[];
  activeListing?: ListingInput | null;
};

type AdvisorState = {
  turns: number;
  lastMessage: string | null;
  lastUpdatedAt: string | null;
};

type Env = {
  MaiPropAdvisor: DurableObjectNamespace<MaiPropAdvisor>;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  CORS_ORIGIN?: string;
};

const DEFAULT_STATE: AdvisorState = {
  turns: 0,
  lastMessage: null,
  lastUpdatedAt: null,
};

const suggestionSchema = z.object({
  city: z.string().optional(),
  maxBudget: z.number().optional(),
  listingType: z.string().optional(),
  mustHave: z.array(z.string()).optional(),
});

function corsHeaders(env: Env, request?: Request) {
  const configuredOrigin = env.CORS_ORIGIN || "*";
  const requestOrigin = request?.headers.get("origin") || "";
  const allowOrigin = configuredOrigin === "*" ? "*" : configuredOrigin.split(",").map((s) => s.trim()).includes(requestOrigin) ? requestOrigin : configuredOrigin;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data: unknown, env: Env, request?: Request, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...corsHeaders(env, request),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function normalizeSessionId(input: unknown) {
  const raw = typeof input === "string" && input.trim() ? input.trim() : "guest";
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 96) || "guest";
}

function compactListing(listing: ListingInput) {
  const facts = [
    listing.city,
    listing.region,
    listing.listing_type,
    listing.property_type,
    typeof listing.price === "number" ? `EUR ${listing.price}` : null,
    typeof listing.sqm === "number" ? `${listing.sqm} sqm` : null,
    typeof listing.bedrooms === "number" ? `${listing.bedrooms} beds` : null,
  ].filter(Boolean);

  return `${listing.id}: ${listing.title} (${facts.join(", ")})`;
}

function shortlistListings(listings: ListingInput[], criteria: z.infer<typeof suggestionSchema>) {
  const queryCity = criteria.city?.toLowerCase();
  const queryType = criteria.listingType?.toLowerCase();
  const maxBudget = criteria.maxBudget;

  return listings
    .map((listing) => {
      let score = listing.ai_score ?? 50;
      if (queryCity && [listing.city, listing.region].some((value) => value?.toLowerCase().includes(queryCity))) score += 18;
      if (queryType && listing.listing_type?.toLowerCase() === queryType) score += 14;
      if (typeof maxBudget === "number" && typeof listing.price === "number" && listing.price <= maxBudget) score += 12;
      if (listing.open_house_date || listing.auction_date) score += 6;
      return { listing, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ listing, score }) => ({
      listingId: listing.id,
      title: listing.title,
      city: listing.city ?? null,
      score: Math.min(99, Math.round(score)),
      reason: buildReason(listing),
    }));
}

function buildReason(listing: ListingInput) {
  if (listing.auction_date) return "Auction timing and pricing deserve a closer look.";
  if (listing.open_house_date) return "Open house is available for quick viewing.";
  if (typeof listing.ai_score === "number" && listing.ai_score >= 85) return "Strong MaiProp score for this search.";
  return "Good fit based on location, type, and available details.";
}

function fallbackAdvice(payload: AdvisorRequest, state: AdvisorState) {
  const listings = payload.listings ?? [];
  const picks = shortlistListings(listings, {});
  const role = payload.role ? ` for a ${payload.role}` : "";
  const answer =
    picks.length > 0
      ? `I found ${picks.length} practical next step${picks.length === 1 ? "" : "s"}${role}. Start with the strongest match, then compare timing, price per sqm, and visit availability.`
      : `Tell me your preferred city, budget, and property type, and I will narrow the next step${role}.`;

  return {
    answer,
    suggestions: picks,
    nextActions: ["Compare price per sqm", "Check viewing or auction date", "Save the best match"],
    source: "fallback",
    state,
  };
}

export class MaiPropAdvisor extends CloudflareAgent<Env, AdvisorState> {
  initialState = DEFAULT_STATE;

  async onRequest(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(this.env, request) });
    if (request.method === "GET") return json({ ok: true, agent: "MaiPropAdvisor", state: this.state }, this.env, request);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, this.env, request, { status: 405 });

    const payload = (await request.json().catch(() => ({}))) as AdvisorRequest;
    const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 1200) : "";
    const listings = Array.isArray(payload.listings) ? payload.listings.slice(0, 12) : [];
    const nextState = {
      turns: (this.state?.turns ?? 0) + 1,
      lastMessage: message || null,
      lastUpdatedAt: new Date().toISOString(),
    };
    this.setState(nextState);

    if (!message) {
      return json({ error: "Message is required" }, this.env, request, { status: 400 });
    }

    if (!this.env.OPENAI_API_KEY) {
      return json(fallbackAdvice({ ...payload, listings }, nextState), this.env, request);
    }

    setDefaultOpenAIKey(this.env.OPENAI_API_KEY);
    setTracingDisabled(true);

    const shortlistTool = tool({
      name: "shortlist_listings",
      description: "Score and shortlist the best listings from the mobile app inventory.",
      parameters: suggestionSchema,
      async execute(criteria) {
        return JSON.stringify(shortlistListings(listings, criteria));
      },
    });

    const advisor = new OpenAIAgent({
      name: "MaiProp mobile advisor",
      model: this.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions: [
        "You are MaiProp's senior Greek real estate advisor inside a mobile app.",
        "Help users decide what to do next across listings, auctions, open houses, and professionals.",
        "Be direct, practical, and concise. Do not invent facts outside the provided listings.",
        "If the user asks for legal, tax, or investment certainty, recommend speaking with a verified professional.",
        "Use the shortlist_listings tool when the user asks what to view, buy, rent, bid on, or compare.",
        "Return a short answer with 2-4 bullets and a clear next step.",
      ].join("\n"),
      tools: [shortlistTool],
    });

    const inventory = listings.length ? listings.map(compactListing).join("\n") : "No live listing inventory was provided.";
    const activeListing = payload.activeListing ? `\nActive listing:\n${compactListing(payload.activeListing)}` : "";
    const prompt = [
      `User role: ${payload.role || "buyer"}`,
      `Locale: ${payload.locale || "en"}`,
      `Prior turns with this agent: ${this.state?.turns ?? 0}`,
      activeListing,
      `Available mobile inventory:\n${inventory}`,
      `User message:\n${message}`,
    ].filter(Boolean).join("\n\n");

    const result = await run(advisor, prompt);
    const suggestions = shortlistListings(listings, {});

    return json({
      answer: String(result.finalOutput ?? "").trim(),
      suggestions,
      nextActions: ["Open the best match", "Book or register interest", "Ask a verified professional"],
      source: "openai-agent",
      state: nextState,
    }, this.env, request);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(env, request) });
    if (url.pathname === "/health") return json({ ok: true, service: "maiprop-agent" }, env, request);

    if (url.pathname === "/api/assistant") {
      const preview = (await request.clone().json().catch(() => ({}))) as AdvisorRequest;
      const advisor = await getAgentByName(env.MaiPropAdvisor, normalizeSessionId(preview.sessionId));
      return advisor.fetch(request);
    }

    const routed = await routeAgentRequest(request, env, { cors: true });
    return routed ?? json({ error: "Not found" }, env, request, { status: 404 });
  },
};
