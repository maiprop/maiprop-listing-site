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

CREATE OR REPLACE FUNCTION public.can_review_professional(
  p_professional_id uuid,
  p_reviewer_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_professional_id IS NOT NULL
    AND p_reviewer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = p_professional_id
        AND p.user_id = p_reviewer_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.consultation_requests cr
      WHERE cr.professional_id = p_professional_id
        AND cr.requester_id = p_reviewer_id
        AND cr.status = 'completed'
    );
$$;

REVOKE ALL ON FUNCTION public.can_review_professional(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_review_professional(uuid, uuid) TO authenticated, service_role;

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

DROP POLICY IF EXISTS "reviews_admin_update" ON public.professional_reviews;
CREATE POLICY "reviews_admin_update"
  ON public.professional_reviews FOR UPDATE
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())))
  WITH CHECK (public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "reviews_admin_delete" ON public.professional_reviews;
CREATE POLICY "reviews_admin_delete"
  ON public.professional_reviews FOR DELETE
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())));

-- Index for fast lookups by professional
CREATE INDEX idx_prof_reviews_professional ON public.professional_reviews (professional_id, created_at DESC);

-- Trigger to keep professionals.rating + reviews_count in sync
CREATE OR REPLACE FUNCTION public.sync_professional_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_professional_id uuid := COALESCE(NEW.professional_id, OLD.professional_id);
BEGIN
  UPDATE public.professionals
  SET
    rating        = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM public.professional_reviews WHERE professional_id = v_professional_id), 0),
    reviews_count = (SELECT COUNT(*) FROM public.professional_reviews WHERE professional_id = v_professional_id),
    updated_at    = now()
  WHERE id = v_professional_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_professional_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_reviews
  FOR EACH ROW EXECUTE FUNCTION public.sync_professional_rating();

CREATE OR REPLACE FUNCTION public.guard_professional_review_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF public.has_platform_admin(v_actor) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.professional_id IS DISTINCT FROM OLD.professional_id
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id THEN
      RAISE EXCEPTION 'review_identity_fields_are_immutable';
    END IF;
  END IF;

  IF NEW.reviewer_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'reviewer_must_match_authenticated_user';
  END IF;

  IF NOT public.can_review_professional(NEW.professional_id, NEW.reviewer_id) THEN
    RAISE EXCEPTION 'completed_consultation_required_for_review';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_professional_review_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_professional_review_write ON public.professional_reviews;
CREATE TRIGGER guard_professional_review_write
  BEFORE INSERT OR UPDATE ON public.professional_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_professional_review_write();

CREATE OR REPLACE FUNCTION private.notify_professional_review_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_professional_user_id uuid;
BEGIN
  SELECT user_id INTO v_professional_user_id
  FROM public.professionals
  WHERE id = NEW.professional_id;

  PERFORM private.insert_interaction_notification(
    v_professional_user_id,
    NEW.reviewer_id,
    'New professional review',
    'A client left a new review on your professional profile.',
    'professional_review',
    '/dashboard/profile'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_professional_review_created() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_professional_review_created ON public.professional_reviews;
CREATE TRIGGER notify_professional_review_created
  AFTER INSERT ON public.professional_reviews
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_professional_review_created();

CREATE TABLE IF NOT EXISTS public.professional_review_responses (
  review_id uuid PRIMARY KEY REFERENCES public.professional_reviews(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_review_responses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_professional_review_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_professional_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT professional_id INTO v_professional_id
  FROM public.professional_reviews
  WHERE id = NEW.review_id;

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'review_not_found';
  END IF;

  IF NEW.professional_id IS DISTINCT FROM v_professional_id THEN
    RAISE EXCEPTION 'review_response_professional_mismatch';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.review_id IS DISTINCT FROM OLD.review_id
       OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
       OR NEW.responder_id IS DISTINCT FROM OLD.responder_id THEN
      RAISE EXCEPTION 'review_response_identity_fields_are_immutable';
    END IF;
  END IF;

  IF NOT public.has_platform_admin(v_actor)
     AND NOT EXISTS (
       SELECT 1
       FROM public.professionals p
       WHERE p.id = v_professional_id
         AND p.user_id = v_actor
     ) THEN
    RAISE EXCEPTION 'only_reviewed_professional_can_respond';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.responder_id := v_actor;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_professional_review_response() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_professional_review_response ON public.professional_review_responses;
CREATE TRIGGER guard_professional_review_response
  BEFORE INSERT OR UPDATE ON public.professional_review_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_professional_review_response();

DROP POLICY IF EXISTS "professional_review_responses_public_read" ON public.professional_review_responses;
CREATE POLICY "professional_review_responses_public_read"
  ON public.professional_review_responses FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "professional_review_responses_owner_insert" ON public.professional_review_responses;
CREATE POLICY "professional_review_responses_owner_insert"
  ON public.professional_review_responses FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_platform_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_review_responses.professional_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "professional_review_responses_owner_update" ON public.professional_review_responses;
CREATE POLICY "professional_review_responses_owner_update"
  ON public.professional_review_responses FOR UPDATE
  TO authenticated
  USING (
    public.has_platform_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_review_responses.professional_id
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.has_platform_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_review_responses.professional_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "professional_review_responses_owner_delete" ON public.professional_review_responses;
CREATE POLICY "professional_review_responses_owner_delete"
  ON public.professional_review_responses FOR DELETE
  TO authenticated
  USING (
    public.has_platform_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_review_responses.professional_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_professional_review_responses_professional
  ON public.professional_review_responses (professional_id, updated_at DESC);
