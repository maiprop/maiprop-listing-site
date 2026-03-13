-- =============================================================================
-- Security fixes: PII, subscriptions, storage, sync_log, consultation
-- =============================================================================

-- ── 1. Profiles: restrict phone (and other PII) to own profile only ──────────
-- Create a public view with only safe-to-show columns for "other" users.
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = false)
AS
SELECT user_id, display_name, avatar_url, first_name, last_name, role
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;

-- Replace "Profiles are viewable by everyone" with own-profile or agent-only for full PII
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Agents can view all profiles for admin"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'agent'::public.user_role));


-- ── 2. Investor subscriptions: no self-assign tier ──────────────────────────
-- Only admins (and Stripe webhook via service_role) can insert/update.
DROP POLICY IF EXISTS "Users can create their own subscription" ON public.investor_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscription" ON public.investor_subscriptions;

CREATE POLICY "Admins can insert investor subscriptions"
  ON public.investor_subscriptions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'agent'::public.user_role));

-- Service role (e.g. Stripe webhook) bypasses RLS, so no policy needed for it.


-- ── 3. Professionals: prevent self-upgrade of subscription_tier ─────────────
-- Only agent or service_role can change subscription_tier.
CREATE OR REPLACE FUNCTION public.professionals_guard_subscription_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'agent'::public.user_role) THEN
      NEW.subscription_tier := OLD.subscription_tier;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS professionals_guard_subscription_tier ON public.professionals;
CREATE TRIGGER professionals_guard_subscription_tier
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW
  EXECUTE FUNCTION public.professionals_guard_subscription_tier();


-- ── 4. Firesale-photos storage: require authenticated upload ─────────────────
DROP POLICY IF EXISTS "Anyone can upload firesale photos" ON storage.objects;
CREATE POLICY "Authenticated can upload firesale photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'firesale-photos');


-- ── 5. Sync log: only service role can insert (edge functions) ──────────────
-- Removes client-side insert; edge functions use service_role and bypass RLS.
DROP POLICY IF EXISTS "Allow sync log inserts" ON public.sync_log;


-- ── 6. Consultation requests: prevent spoofed requester identity ─────────────
-- Guests (anon) can submit only with requester_id NULL. Authenticated can set
-- requester_id only to their own uid.
DROP POLICY IF EXISTS "Anyone can create consultation requests" ON public.consultation_requests;
CREATE POLICY "Consultation requests with identity check"
  ON public.consultation_requests FOR INSERT
  WITH CHECK (
    (auth.role() = 'anon' AND requester_id IS NULL)
    OR (auth.role() = 'authenticated' AND (requester_id IS NULL OR requester_id = auth.uid()))
  );
