
-- =====================================================
-- maiProp Full Schema Migration
-- =====================================================

-- ── 1. ENUMS ─────────────────────────────────────────
CREATE TYPE public.user_role AS ENUM ('individual', 'agent', 'professional');
CREATE TYPE public.listing_type AS ENUM ('sale', 'rent', 'auction', 'firesale');
CREATE TYPE public.property_type AS ENUM ('apartment', 'house', 'villa', 'land', 'commercial', 'office');
CREATE TYPE public.listing_status AS ENUM ('draft', 'active', 'paused', 'sold', 'rented', 'expired');
CREATE TYPE public.viewing_type AS ENUM ('in_person', 'video');
CREATE TYPE public.viewing_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE public.message_status AS ENUM ('sent', 'read');
CREATE TYPE public.professional_category AS ENUM ('architect', 'civil_engineer', 'lawyer', 'notary', 'electrician', 'plumber', 'contractor', 'property_manager', 'valuer', 'interior_designer', 'financial_advisor');

-- ── 2. UTILITY FUNCTION ──────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ── 3. PROFILES ──────────────────────────────────────
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'individual',
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  bio TEXT,
  city TEXT,
  country TEXT DEFAULT 'Greece',
  website_url TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, display_name)
  VALUES (
    NEW.id,
    split_part(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), ' ', 1),
    split_part(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), ' ', 2),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 4. USER_ROLES ────────────────────────────────────
-- Drop the earlier app_role-based table if it exists (created by 20260216225334).
DROP TABLE IF EXISTS public.user_roles CASCADE;
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ── 5. LISTINGS ──────────────────────────────────────
CREATE TABLE public.listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  address TEXT,
  city TEXT NOT NULL,
  region TEXT,
  postal_code TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  price NUMERIC(14, 2) NOT NULL,
  price_per_sqm NUMERIC(10, 2),
  sqm NUMERIC(8, 2) NOT NULL,
  bedrooms INTEGER,
  bathrooms INTEGER,
  floor INTEGER,
  total_floors INTEGER,
  year_built INTEGER,
  energy_class TEXT,
  property_type public.property_type NOT NULL,
  listing_type public.listing_type NOT NULL DEFAULT 'sale',
  status public.listing_status NOT NULL DEFAULT 'draft',
  auction_date TIMESTAMP WITH TIME ZONE,
  auction_starting_bid NUMERIC(14, 2),
  auction_court TEXT,
  has_parking BOOLEAN DEFAULT false,
  has_pool BOOLEAN DEFAULT false,
  has_elevator BOOLEAN DEFAULT false,
  has_garden BOOLEAN DEFAULT false,
  has_storage BOOLEAN DEFAULT false,
  has_security BOOLEAN DEFAULT false,
  has_smart_home BOOLEAN DEFAULT false,
  has_video_tour BOOLEAN DEFAULT false,
  has_virtual_tour BOOLEAN DEFAULT false,
  views_count INTEGER NOT NULL DEFAULT 0,
  ai_score INTEGER,
  cadastre_number TEXT,
  enfia_zone TEXT,
  tags TEXT[],
  cover_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active listings are public"
  ON public.listings FOR SELECT
  USING (status = 'active' OR auth.uid() = owner_id);

CREATE POLICY "Owners can insert listings"
  ON public.listings FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update listings"
  ON public.listings FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete listings"
  ON public.listings FOR DELETE
  USING (auth.uid() = owner_id);

CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_listings_city ON public.listings(city);
CREATE INDEX idx_listings_status ON public.listings(status);
CREATE INDEX idx_listings_type ON public.listings(listing_type);
CREATE INDEX idx_listings_owner ON public.listings(owner_id);

-- ── 6. LISTING IMAGES ────────────────────────────────
CREATE TABLE public.listing_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Listing images are public"
  ON public.listing_images FOR SELECT USING (true);

CREATE POLICY "Listing owners can manage images"
  ON public.listing_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE id = listing_id AND owner_id = auth.uid()
    )
  );

-- ── 7. FAVORITES ─────────────────────────────────────
CREATE TABLE public.favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own favorites"
  ON public.favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add favorites"
  ON public.favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove favorites"
  ON public.favorites FOR DELETE
  USING (auth.uid() = user_id);

-- ── 8. CONVERSATIONS ─────────────────────────────────
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  participant_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid() = participant_a OR auth.uid() = participant_b);

CREATE POLICY "Authenticated users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);

CREATE INDEX idx_conversations_participant_a ON public.conversations(participant_a);
CREATE INDEX idx_conversations_participant_b ON public.conversations(participant_b);

-- ── 9. MESSAGES ──────────────────────────────────────
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status public.message_status NOT NULL DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
    )
  );

CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);

-- ── 10. VIEWINGS ─────────────────────────────────────
CREATE TABLE public.viewings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewing_type public.viewing_type NOT NULL DEFAULT 'in_person',
  status public.viewing_status NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  note TEXT,
  video_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.viewings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewings visible to requester and owner"
  ON public.viewings FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = owner_id);

CREATE POLICY "Authenticated users can request viewings"
  ON public.viewings FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can update their viewings"
  ON public.viewings FOR UPDATE
  USING (auth.uid() = owner_id OR auth.uid() = requester_id);

CREATE TRIGGER update_viewings_updated_at
  BEFORE UPDATE ON public.viewings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 11. PROFESSIONALS ────────────────────────────────
CREATE TABLE public.professionals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  category public.professional_category NOT NULL,
  title TEXT NOT NULL,
  bio TEXT,
  city TEXT,
  experience_years INTEGER,
  license_number TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  rating NUMERIC(3, 2) DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  projects_count INTEGER DEFAULT 0,
  specialties TEXT[],
  languages TEXT[],
  hourly_rate NUMERIC(10, 2),
  avatar_url TEXT,
  website_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals are publicly viewable"
  ON public.professionals FOR SELECT USING (true);

CREATE POLICY "Users can create their own professional profile"
  ON public.professionals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own professional profile"
  ON public.professionals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_professionals_updated_at
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 12. FIRESALE REQUESTS ────────────────────────────
CREATE TABLE public.firesale_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  sqm NUMERIC(8, 2) NOT NULL,
  condition TEXT NOT NULL,
  property_type public.property_type,
  bedrooms INTEGER,
  asking_price NUMERIC(14, 2),
  ai_estimate NUMERIC(14, 2),
  offer_price NUMERIC(14, 2),
  status TEXT NOT NULL DEFAULT 'pending',
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.firesale_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own firesale requests"
  ON public.firesale_requests FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Anyone can submit a firesale request"
  ON public.firesale_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own firesale requests"
  ON public.firesale_requests FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_firesale_requests_updated_at
  BEFORE UPDATE ON public.firesale_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 13. AUCTION ALERTS ───────────────────────────────
CREATE TABLE public.auction_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city TEXT,
  min_price NUMERIC(14, 2),
  max_price NUMERIC(14, 2),
  property_type public.property_type,
  court_name TEXT,
  email_notify BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.auction_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own auction alerts"
  ON public.auction_alerts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 14. STORAGE BUCKETS ──────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('listing-images', 'listing-images', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']);

CREATE POLICY "Listing images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-images');

CREATE POLICY "Authenticated users can upload listing images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'listing-images' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their listing images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'listing-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
