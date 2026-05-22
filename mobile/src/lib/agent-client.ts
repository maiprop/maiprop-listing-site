import { supabase } from '@/lib/supabase';
import type { Listing } from '@/types/domain';

export type AgentSuggestion = {
  listingId: string;
  title: string;
  city: string | null;
  score: number;
  reason: string;
};

export type AgentAdvice = {
  answer: string;
  suggestions: AgentSuggestion[];
  nextActions: string[];
  source: 'openai-agent' | 'fallback' | 'demo';
};

type AskAgentInput = {
  message: string;
  sessionId?: string | null;
  role?: string | null;
  listings?: Listing[];
  activeListing?: Listing | null;
};

const agentBaseUrl = process.env.EXPO_PUBLIC_MAIPROP_AGENT_URL?.replace(/\/$/, '') ?? '';

function compactListing(listing: Listing) {
  return {
    id: listing.id,
    title: listing.title,
    city: listing.city,
    region: listing.region,
    price: listing.price,
    sqm: listing.sqm,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    listing_type: listing.listing_type,
    property_type: listing.property_type,
    description: listing.description,
    ai_score: listing.ai_score,
    open_house_date: listing.open_house_date,
    auction_date: listing.auction_date,
    auction_starting_bid: listing.auction_starting_bid,
  };
}

function localSuggestions(listings: Listing[] = []): AgentSuggestion[] {
  return listings
    .slice()
    .sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0))
    .slice(0, 3)
    .map((listing) => ({
      listingId: listing.id,
      title: listing.title,
      city: listing.city ?? null,
      score: Math.min(99, Math.max(50, listing.ai_score ?? 72)),
      reason: listing.auction_date
        ? 'Auction timing and starting price need review.'
        : listing.open_house_date
          ? 'Open house is available for a quick visit.'
          : 'Strong fit based on the current MaiProp score.',
    }));
}

function demoAdvice(input: AskAgentInput): AgentAdvice {
  const suggestions = localSuggestions(input.listings);
  return {
    answer:
      suggestions.length > 0
        ? 'Start with the strongest match, then compare timing, price per sqm, and visit availability before contacting the owner or professional.'
        : 'Share a city, budget, and property type to get a tighter recommendation.',
    suggestions,
    nextActions: ['Compare price per sqm', 'Check viewing or auction date', 'Contact a verified professional'],
    source: 'demo',
  };
}

export async function askMaiPropAgent(input: AskAgentInput): Promise<AgentAdvice> {
  if (!agentBaseUrl) return demoAdvice(input);

  const session = await supabase?.auth.getSession().then(({ data }) => data.session).catch(() => null);
  const response = await fetch(`${agentBaseUrl}/api/assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      message: input.message,
      sessionId: input.sessionId ?? session?.user.id ?? 'guest',
      role: input.role ?? 'buyer',
      listings: input.listings?.slice(0, 12).map(compactListing) ?? [],
      activeListing: input.activeListing ? compactListing(input.activeListing) : null,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `MaiProp agent failed with ${response.status}`);
  }

  return (await response.json()) as AgentAdvice;
}
