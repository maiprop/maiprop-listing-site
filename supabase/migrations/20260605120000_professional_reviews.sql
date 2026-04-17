-- Professional reviews submitted by verified users after a transaction.
-- Linked to professionals.id (not user_id) for portability.

CREATE TABLE IF NOT EXISTS public.professional_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  reviewer_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title          text,
  body           text,
  -- transaction context
  service_type   text,            -- e.g. "Bought", "Sold", "Rented", "Consulted"
  property_city  text,
  transaction_year smallint,
  recommended    boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (professional_id, reviewer_id)   -- one review per reviewer per professional
);

ALTER TABLE public.professional_reviews ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "reviews_public_read"
  ON public.professional_reviews FOR SELECT
  USING (true);

-- Authenticated users can insert their own review
CREATE POLICY "reviews_insert_own"
  ON public.professional_reviews FOR INSERT
  WITH CHECK ((select auth.uid()) = reviewer_id);

-- Reviewer can update their own review
CREATE POLICY "reviews_update_own"
  ON public.professional_reviews FOR UPDATE
  USING ((select auth.uid()) = reviewer_id);

-- Reviewer can delete their own review
CREATE POLICY "reviews_delete_own"
  ON public.professional_reviews FOR DELETE
  USING ((select auth.uid()) = reviewer_id);

-- Index for fast lookups by professional
CREATE INDEX idx_prof_reviews_professional ON public.professional_reviews (professional_id, created_at DESC);

-- Trigger to keep professionals.rating + reviews_count in sync
CREATE OR REPLACE FUNCTION public.sync_professional_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.professionals
  SET
    rating        = (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.professional_reviews WHERE professional_id = COALESCE(NEW.professional_id, OLD.professional_id)),
    reviews_count = (SELECT COUNT(*) FROM public.professional_reviews WHERE professional_id = COALESCE(NEW.professional_id, OLD.professional_id)),
    updated_at    = now()
  WHERE id = COALESCE(NEW.professional_id, OLD.professional_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_professional_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_reviews
  FOR EACH ROW EXECUTE FUNCTION public.sync_professional_rating();
