import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fallbackConversations, fallbackListings, fallbackMetrics, fallbackProfessionals } from '@/data/fallback';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { ConversationPreview, DashboardMetric, Listing, Professional } from '@/types/domain';

export type ListingFilters = {
  city?: string;
  listingType?: string;
  ownerId?: string | null;
  search?: string;
  limit?: number;
};

const listingSelect = `
  id,
  title,
  city,
  address,
  region,
  price,
  sqm,
  bedrooms,
  bathrooms,
  latitude,
  longitude,
  cover_image_url,
  listing_type,
  property_type,
  status,
  owner_id,
  is_featured,
  priority_placement,
  created_at,
  description,
  ai_score,
  views_count,
  open_house_date,
  auction_date,
  auction_starting_bid,
  listing_images(url, sort_order)
`;

function applyFallbackFilters(rows: Listing[], filters: ListingFilters) {
  return rows
    .filter((listing) => {
      if (filters.city && !listing.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
      if (filters.ownerId && listing.owner_id !== filters.ownerId) return false;
      if (filters.listingType && filters.listingType !== 'all' && listing.listing_type !== filters.listingType) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const haystack = [listing.title, listing.city, listing.address, listing.region].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .slice(0, filters.limit ?? rows.length);
}

function normalizeListing(row: unknown): Listing {
  return row as Listing;
}

export function useListings(filters: ListingFilters = {}) {
  return useQuery({
    queryKey: ['mobile-listings', filters],
    queryFn: async () => {
      if (!supabase) return applyFallbackFilters(fallbackListings, filters);

      let query = supabase
        .from('listings')
        .select(listingSelect)
        .eq('status', 'active')
        .order('priority_placement', { ascending: false, nullsFirst: false })
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(filters.limit ?? 24);

      if (filters.city) query = query.ilike('city', `%${filters.city}%`);
      if (filters.ownerId) query = query.eq('owner_id', filters.ownerId);
      if (filters.listingType && filters.listingType !== 'all') query = query.eq('listing_type', filters.listingType);
      if (filters.search) {
        const search = filters.search.replace(/[%(),]/g, '').trim();
        if (search) query = query.or(`title.ilike.%${search}%,city.ilike.%${search}%,address.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(normalizeListing);
    },
  });
}

export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: ['mobile-listing', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const fallback = fallbackListings.find((listing) => listing.id === id) ?? null;
      if (!id || !supabase) return fallback;

      const { data, error } = await supabase
        .from('listings')
        .select(listingSelect)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data ? normalizeListing(data) : fallback;
    },
  });
}

export function useDashboardMetrics(userId: string | undefined | null) {
  return useQuery({
    queryKey: ['mobile-dashboard-metrics', userId],
    queryFn: async (): Promise<DashboardMetric[]> => {
      if (!supabase || !userId) return fallbackMetrics;

      const [favorites, listings, conversations, viewings, leads] = await Promise.all([
        supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('listings').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .or(`participant_a.eq.${userId},participant_b.eq.${userId}`),
        supabase
          .from('viewings')
          .select('id', { count: 'exact', head: true })
          .or(`requester_id.eq.${userId},owner_id.eq.${userId}`),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
      ]);

      return [
        { label: 'Saved homes', value: String(favorites.count ?? 0), tone: 'accent' },
        { label: 'My listings', value: String(listings.count ?? 0), tone: 'primary' },
        { label: 'Conversations', value: String(conversations.count ?? 0), tone: 'neutral' },
        { label: 'Viewings', value: String(viewings.count ?? 0), tone: 'success' },
        { label: 'Leads', value: String(leads.count ?? 0), tone: 'primary' },
      ];
    },
  });
}

export function useConversations(userId: string | undefined | null) {
  return useQuery({
    queryKey: ['mobile-conversations', userId],
    queryFn: async (): Promise<ConversationPreview[]> => {
      if (!supabase || !userId) return fallbackConversations;

      const { data, error } = await supabase
        .from('conversations')
        .select('id, listing_id, participant_a, participant_b, last_message_at')
        .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(20);

      if (error) throw error;
      return (data ?? []) as ConversationPreview[];
    },
  });
}

export function useMarketSummary(listings: Listing[] | undefined) {
  return useMemo(() => {
    const rows = listings ?? [];
    const cities = new Set(rows.map((listing) => listing.city).filter(Boolean));
    const featured = rows.filter((listing) => listing.is_featured || (listing.priority_placement ?? 0) > 0);
    const averagePrice = rows.length
      ? Math.round(rows.reduce((sum, listing) => sum + listing.price, 0) / rows.length)
      : 0;

    return {
      cityCount: cities.size,
      featuredCount: featured.length,
      averagePrice,
      isLive: isSupabaseConfigured,
    };
  }, [listings]);
}

export function useProfessionals(filters: { search?: string; categoryGroup?: string | null; limit?: number } = {}) {
  return useQuery({
    queryKey: ['mobile-professionals', filters],
    queryFn: async (): Promise<Professional[]> => {
      if (!supabase) {
        const q = filters.search?.trim().toLowerCase();
        return fallbackProfessionals
          .filter((professional) => {
            if (!q) return true;
            const haystack = [
              professional.display_name,
              professional.title,
              professional.city,
              professional.category,
              ...(professional.specialties ?? []),
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return haystack.includes(q);
          })
          .slice(0, filters.limit ?? fallbackProfessionals.length);
      }

      let query = supabase
        .from('professionals')
        .select(
          'id, display_name, title, category, city, avatar_url, verified, rating, reviews_count, projects_count, experience_years, hourly_rate, specialties, subscription_tier',
        )
        .limit(filters.limit ?? 30);

      if (filters.search) {
        const search = filters.search.replace(/[%(),]/g, '').trim();
        if (search) query = query.or(`display_name.ilike.%${search}%,title.ilike.%${search}%,city.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Professional[];
    },
  });
}
