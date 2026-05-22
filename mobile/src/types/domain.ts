import type { Session, User } from '@supabase/supabase-js';

export type AppRole = 'buyer' | 'seller' | 'agent' | 'developer' | 'professional' | 'investor' | 'admin';

export type ListingType = 'sale' | 'rent' | 'auction' | 'firesale' | 'open_house';

export type Listing = {
  id: string;
  title: string;
  city: string;
  address: string | null;
  region?: string | null;
  price: number;
  sqm: number;
  bedrooms: number | null;
  bathrooms: number | null;
  latitude?: number | null;
  longitude?: number | null;
  cover_image_url: string | null;
  listing_type: ListingType | string;
  property_type: string;
  status: string;
  owner_id?: string | null;
  is_featured?: boolean | null;
  priority_placement?: number | null;
  created_at?: string | null;
  description?: string | null;
  ai_score?: number | null;
  views_count?: number | null;
  open_house_date?: string | null;
  auction_date?: string | null;
  auction_starting_bid?: number | null;
  listing_images?: Array<{
    url: string;
    sort_order: number | null;
  }> | null;
};

export type Profile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
  participant_type: string | null;
  city: string | null;
  phone: string | null;
  verified: boolean | null;
  investor_mode?: boolean | null;
  is_platform_admin?: boolean | null;
};

export type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
};

export type DashboardMetric = {
  label: string;
  value: string;
  tone?: 'neutral' | 'primary' | 'accent' | 'success';
};

export type ConversationPreview = {
  id: string;
  listing_id: string | null;
  last_message_at: string | null;
  participant_a: string;
  participant_b: string;
  latest_message?: string | null;
};

export type Professional = {
  id: string;
  display_name: string | null;
  title: string | null;
  category: string;
  city: string | null;
  avatar_url: string | null;
  verified: boolean | null;
  rating: number | null;
  reviews_count: number | null;
  projects_count: number | null;
  experience_years: number | null;
  hourly_rate: number | null;
  specialties: string[] | null;
  subscription_tier?: string | null;
};
