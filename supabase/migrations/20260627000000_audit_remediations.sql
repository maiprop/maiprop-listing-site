-- =============================================================================
-- 20260627000000_audit_remediations.sql
--
-- Comprehensive remediation for the deep-audit findings:
--   BUG A: public.is_pro() RPC so the client can check listing-owner Pro
--          status without exposing the underlying subscription tables.
--   BUG H: Tighten storage INSERT policies on listing-images, project-media,
--          firesale-photos, and message-attachments so authenticated users
--          can only upload into their own folder. Restrict message-attachments
--          SELECT to the uploader (per-conversation gating is handled by the
--          app layer using signed URLs).
--   BUG I: Cap anonymous contact_submissions inserts via a per-email rate
--          limit and field-length constraints to prevent DB-spam abuse.
--   BUG J: Make realtime publication an explicit, reproducible part of the
--          schema instead of relying on dashboard config.
--   BUG M: Realtime authorization policies for the `typing:<convId>` private
--          presence channel so non-participants cannot subscribe.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- BUG A — is_pro(p_user_id uuid) RPC
-- Returns true if the user has any one of: admin role, an active or trialing
-- Stripe subscription (profiles.subscription_product_id IS NOT NULL), or an
-- active/trial investor_subscriptions row. Mirrors useSubscription's three
-- truth sources so client code converges on a single canonical reader.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    -- Admin always Pro
    public.has_platform_admin(p_user_id)
    -- Stripe subscription via profiles
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = p_user_id
        AND p.subscription_product_id IS NOT NULL
    )
    -- Investor subscription (private / institutional / developer tiers, active or trial)
    OR EXISTS (
      SELECT 1 FROM public.investor_subscriptions s
      WHERE s.user_id = p_user_id
        AND s.status IN ('active', 'trial')
    )
$$;

REVOKE EXECUTE ON FUNCTION public.is_pro(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_pro(uuid) TO authenticated, anon;
COMMENT ON FUNCTION public.is_pro(uuid) IS
  'Canonical Pro-status reader. Returns true if user is admin, has an active Stripe subscription_product_id, or has an active/trial investor_subscriptions row.';


-- ─────────────────────────────────────────────────────────────────────────────
-- BUG H — storage INSERT policies must enforce folder ownership.
-- The DELETE policies on these buckets already gate on
-- (storage.foldername(name))[1] = auth.uid() ::text, but the INSERT side was
-- only checking authentication, allowing any logged-in user to upload poison
-- files into another user's folder.
-- ─────────────────────────────────────────────────────────────────────────────

-- listing-images: tighten INSERT to own folder
DROP POLICY IF EXISTS "Authenticated users can upload listing images" ON storage.objects;
CREATE POLICY "Authenticated users can upload listing images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- project-media: tighten INSERT to own folder
DROP POLICY IF EXISTS "project_media_insert" ON storage.objects;
CREATE POLICY "project_media_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- firesale-photos: paths are `${firesale_request.id}/<file>` (NOT prefixed by
-- user.id), so we cannot reuse the simple folder-name check. Instead we JOIN
-- to firesale_requests to confirm the uploader owns the request.
-- Reference: src/components/firesale/FiresaleQuickSaleForm.tsx ~line 233.
DROP POLICY IF EXISTS "Authenticated can upload firesale photos" ON storage.objects;
CREATE POLICY "Authenticated can upload firesale photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'firesale-photos'
    AND EXISTS (
      SELECT 1 FROM public.firesale_requests fr
      WHERE fr.id::text = (storage.foldername(name))[1]
        AND fr.user_id = auth.uid()
    )
  );

-- message-attachments: paths are `${user.id}/${conversation.id}/<file>`, so
-- user.id is the FIRST path segment. Tighten INSERT to require both:
--   (a) the uploader owns the user_id segment (folder[1])
--   (b) the uploader is a participant in the conversation (folder[2])
-- Reference: src/pages/Messages.tsx ~line 174 (current upload helper).
DROP POLICY IF EXISTS "Authenticated can upload message attachments" ON storage.objects;
CREATE POLICY "Authenticated can upload message attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[2]
        AND auth.uid() IN (c.participant_a, c.participant_b)
    )
  );

-- Restrict SELECT to participants of the conversation (was public-readable, so
-- anyone who knew/guessed a path could fetch the attachment). Both participants
-- must be able to view their own thread's attachments — this is what the
-- SignedAttachment component (Messages.tsx) relies on via createSignedUrl().
DROP POLICY IF EXISTS "Message attachments are publicly readable" ON storage.objects;
CREATE POLICY "Message attachments are participant-readable"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[2]
        AND auth.uid() IN (c.participant_a, c.participant_b)
    )
  );

-- Add a DELETE policy on message-attachments so users can clean up their own
-- uploads. Only the uploader (user_id at folder[1]) — never the other participant —
-- can remove an attachment.
DROP POLICY IF EXISTS "Owners can delete their message attachments" ON storage.objects;
CREATE POLICY "Owners can delete their message attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- BUG I — contact_submissions anonymous spam protection.
-- The INSERT policy is intentionally open (TO public WITH CHECK true) so the
-- public contact form works without auth. We add (a) length constraints to
-- bound row size and (b) a per-email-per-hour rate limit trigger so a single
-- email cannot flood the table.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_message_len;
ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_email_len;
ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_listing_title_len;
ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_company_len;

ALTER TABLE public.contact_submissions
  ADD CONSTRAINT contact_submissions_message_len       CHECK (length(coalesce(message, ''))       <= 2000),
  ADD CONSTRAINT contact_submissions_email_len         CHECK (length(coalesce(email, ''))         <= 320),
  ADD CONSTRAINT contact_submissions_listing_title_len CHECK (length(coalesce(listing_title, '')) <= 500),
  ADD CONSTRAINT contact_submissions_company_len       CHECK (length(coalesce(company, ''))       <= 200);

-- Per-email rate limit: max 5 submissions / 60 minutes. Email-rotation can
-- defeat this, but it stops casual single-script floods and matches the
-- "soft anti-spam" tier appropriate for a public contact form.
CREATE OR REPLACE FUNCTION public.contact_submissions_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NEW.email IS NULL OR length(NEW.email) = 0 THEN
    RAISE EXCEPTION 'contact_submissions: email required'
      USING HINT = 'Email is required to submit the contact form';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.contact_submissions
   -- Case-insensitive match so attackers cannot defeat the cap with
   -- Foo@bar.com / foo@bar.com / FOO@BAR.COM rotation.
   WHERE lower(email) = lower(NEW.email)
     AND created_at > now() - interval '1 hour';

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'contact_submissions: rate limit exceeded'
      USING HINT = 'Please wait up to an hour before sending another message';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contact_submissions_rate_limit ON public.contact_submissions;
CREATE TRIGGER contact_submissions_rate_limit
  BEFORE INSERT ON public.contact_submissions
  FOR EACH ROW EXECUTE FUNCTION public.contact_submissions_rate_limit();


-- ─────────────────────────────────────────────────────────────────────────────
-- BUG J — make realtime publication explicit & reproducible.
-- Previously the supabase_realtime publication was configured via Dashboard,
-- which caused stage/prod drift and broke fresh-clone reproducibility. Add the
-- tables we actually rely on to the publication idempotently.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'public.messages',
    'public.conversations',
    'public.notifications',
    'public.viewings'
  ];
BEGIN
  -- Ensure the publication exists (Supabase creates it by default but a
  -- self-hosted clone may not have it).
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', v_table);
    EXCEPTION
      WHEN duplicate_object THEN
        NULL; -- already in the publication
      WHEN undefined_table THEN
        RAISE NOTICE 'realtime publication: skipping non-existent table %', v_table;
    END;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- BUG M — Realtime Authorization for `typing:<convId>` channels.
-- The Messages.tsx page opens `supabase.channel("typing:" || convId, { config:
-- { presence, private: true } })`. With private=true, Realtime evaluates RLS on
-- realtime.messages — we add a SELECT policy that requires the caller to be a
-- participant of the conversation referenced by the topic suffix.
--
-- realtime.topic() returns the channel name. We slice off the "typing:" prefix
-- and parse the suffix as a uuid to look up conversations.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Realtime Authorization requires the realtime.messages table to exist.
  -- It is provisioned by the Supabase platform; on self-hosted clones without
  -- realtime, this whole block becomes a no-op via the inner exception.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'realtime' AND table_name = 'messages'
  ) THEN
    -- Enable RLS on the realtime broker table (idempotent).
    BEGIN
      EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXCEPTION WHEN OTHERS THEN
      -- Already enabled — ignore.
      NULL;
    END;

    -- SELECT (subscribe) policy for typing:<convId> channels.
    EXECUTE 'DROP POLICY IF EXISTS "typing_channel_participant_select" ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY "typing_channel_participant_select"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
          realtime.topic() LIKE 'typing:%'
          AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = NULLIF(SUBSTRING(realtime.topic() FROM 8), '')::uuid
              AND ((SELECT auth.uid()) IN (c.participant_a, c.participant_b))
          )
        )
    $POL$;

    -- INSERT (broadcast/presence-track) policy mirroring the SELECT gating.
    EXECUTE 'DROP POLICY IF EXISTS "typing_channel_participant_insert" ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY "typing_channel_participant_insert"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
          realtime.topic() LIKE 'typing:%'
          AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = NULLIF(SUBSTRING(realtime.topic() FROM 8), '')::uuid
              AND ((SELECT auth.uid()) IN (c.participant_a, c.participant_b))
          )
        )
    $POL$;
  ELSE
    RAISE NOTICE 'realtime.messages not present — skipping typing-channel RLS policies (Realtime Authorization not enabled on this project)';
  END IF;
END $$;
