-- Scope professional video consultations to an individual consultation request,
-- and align the admin contact-submissions schema with the admin inbox UI.

-- Professional consultations need a structured modality so room access is not
-- inferred from free-text notes.
ALTER TABLE public.consultation_requests
  ADD COLUMN IF NOT EXISTS meeting_type TEXT;

UPDATE public.consultation_requests
SET meeting_type = CASE
  WHEN message ILIKE 'Video consultation requested%' THEN 'video'
  WHEN message ILIKE 'In-person consultation requested%' THEN 'in_person'
  ELSE meeting_type
END
WHERE request_type = 'consultation'
  AND meeting_type IS NULL;

ALTER TABLE public.consultation_requests
  DROP CONSTRAINT IF EXISTS consultation_requests_meeting_type_check;

ALTER TABLE public.consultation_requests
  ADD CONSTRAINT consultation_requests_meeting_type_check
  CHECK (meeting_type IS NULL OR meeting_type IN ('in_person', 'video'));

CREATE INDEX IF NOT EXISTS idx_consultation_requests_video_room_access
  ON public.consultation_requests (id, professional_id, requester_id)
  WHERE request_type = 'consultation'
    AND status = 'confirmed'
    AND meeting_type = 'video';

-- Admin contact inbox workflow fields used by AdminContactSubmissions.tsx.
ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handled_by UUID,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_status_check;

ALTER TABLE public.contact_submissions
  ADD CONSTRAINT contact_submissions_status_check
  CHECK (status IN ('new', 'in_review', 'handled', 'spam'));

CREATE INDEX IF NOT EXISTS idx_contact_submissions_status_created_at
  ON public.contact_submissions (status, created_at DESC);

DROP POLICY IF EXISTS "Platform admin can update submissions" ON public.contact_submissions;
CREATE POLICY "Platform admin can update submissions"
  ON public.contact_submissions
  FOR UPDATE
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())))
  WITH CHECK (public.has_platform_admin((SELECT auth.uid())));

-- Supabase Realtime private channel authorization. The scoped consultation
-- topic is video:consultation:{consultation_request_id}. The legacy
-- video:professional:{professional_id} topic remains available only to the
-- professional owner for backwards compatibility and setup checks.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'realtime' AND table_name = 'messages'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      EXECUTE 'GRANT USAGE ON SCHEMA realtime TO authenticated';
      EXECUTE 'GRANT SELECT, INSERT ON realtime.messages TO authenticated';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    EXECUTE 'DROP POLICY IF EXISTS "video_room_channel_select" ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY "video_room_channel_select"
        ON realtime.messages
        FOR SELECT
        TO public
        USING (
          COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated'
          AND realtime.messages.extension IN ('broadcast', 'presence')
          AND COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND (
            (
              (
                (SELECT realtime.topic()) LIKE 'video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:viewing:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.viewings v
                WHERE v.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                    ''
                  )::uuid
                  AND v.viewing_type = 'video'
                  AND v.status = 'confirmed'
                  AND (
                    COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                  ) IN (v.owner_id, v.requester_id)
              )
            )
            OR (
              (
                (SELECT realtime.topic()) LIKE 'video:consultation:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:consultation:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:consultation:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:consultation:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.consultation_requests cr
                JOIN public.professionals p ON p.id = cr.professional_id
                WHERE cr.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:consultation:', ''),
                    ''
                  )::uuid
                  AND cr.request_type = 'consultation'
                  AND cr.status = 'confirmed'
                  AND cr.meeting_type = 'video'
                  AND (
                    p.user_id = COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                    OR cr.requester_id = COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                  )
              )
            )
            OR (
              (
                (SELECT realtime.topic()) LIKE 'video:professional:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:professional:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:professional:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:professional:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.professionals p
                WHERE p.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:professional:', ''),
                    ''
                  )::uuid
                  AND p.user_id = COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
              )
            )
          )
        )
    $POL$;

    EXECUTE 'DROP POLICY IF EXISTS "video_room_channel_insert" ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY "video_room_channel_insert"
        ON realtime.messages
        FOR INSERT
        TO public
        WITH CHECK (
          COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated'
          AND realtime.messages.extension IN ('broadcast', 'presence')
          AND COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND (
            (
              (
                (SELECT realtime.topic()) LIKE 'video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:viewing:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.viewings v
                WHERE v.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                    ''
                  )::uuid
                  AND v.viewing_type = 'video'
                  AND v.status = 'confirmed'
                  AND (
                    COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                  ) IN (v.owner_id, v.requester_id)
              )
            )
            OR (
              (
                (SELECT realtime.topic()) LIKE 'video:consultation:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:consultation:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:consultation:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:consultation:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.consultation_requests cr
                JOIN public.professionals p ON p.id = cr.professional_id
                WHERE cr.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:consultation:', ''),
                    ''
                  )::uuid
                  AND cr.request_type = 'consultation'
                  AND cr.status = 'confirmed'
                  AND cr.meeting_type = 'video'
                  AND (
                    p.user_id = COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                    OR cr.requester_id = COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                  )
              )
            )
            OR (
              (
                (SELECT realtime.topic()) LIKE 'video:professional:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:professional:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:professional:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:professional:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.professionals p
                WHERE p.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:professional:', ''),
                    ''
                  )::uuid
                  AND p.user_id = COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
              )
            )
          )
        )
    $POL$;
  ELSE
    RAISE NOTICE 'realtime.messages not present - skipping scoped video-room policies';
  END IF;
END $$;
