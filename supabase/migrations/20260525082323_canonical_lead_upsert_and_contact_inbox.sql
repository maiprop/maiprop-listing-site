-- Canonical lead capture and platform contact inbox.
--
-- Business model:
--   * public.leads is the sell-side CRM source of truth.
--   * project_leads and new_building_leads remain workflow/audit tables.
--   * contact_submissions is platform-admin intake, not seller CRM.
--   * browser clients never write notifications or bypass CRM RLS.

CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- Contact submissions: make the platform inbox explicit for admins.
-- This bootstraps the table for fresh replays because the original table
-- migration is dated later than the May interaction migrations.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type           TEXT        NOT NULL DEFAULT 'contact',
  name           TEXT,
  email          TEXT        NOT NULL,
  company        TEXT,
  message        TEXT,
  document_type  TEXT,
  listing_title  TEXT,
  share_to_email TEXT,
  status         TEXT        NOT NULL DEFAULT 'new',
  handled_at     TIMESTAMPTZ,
  handled_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_notes    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_type_check;

ALTER TABLE public.contact_submissions
  ADD CONSTRAINT contact_submissions_type_check
  CHECK (type IN ('contact', 'document_share', 'enterprise'));

ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_status_check;

ALTER TABLE public.contact_submissions
  ADD CONSTRAINT contact_submissions_status_check
  CHECK (status IN ('new', 'in_review', 'handled', 'spam'));

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admin can update submissions" ON public.contact_submissions;
CREATE POLICY "Platform admin can update submissions"
  ON public.contact_submissions
  FOR UPDATE
  USING (public.has_platform_admin((SELECT auth.uid())))
  WITH CHECK (public.has_platform_admin((SELECT auth.uid())));

CREATE INDEX IF NOT EXISTS idx_contact_submissions_status_created
  ON public.contact_submissions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_handled_by
  ON public.contact_submissions (handled_by)
  WHERE handled_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Lead dedupe: merge existing auto-captured duplicates before installing
-- unique indexes. Manual leads stay intentionally flexible.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.merge_duplicate_auto_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  WITH keyed AS (
    SELECT
      id,
      owner_id,
      COALESCE(
        'listing:' || listing_id::text,
        'professional:' || professional_id::text,
        'project:' || project_id::text,
        'general'
      ) AS context_key,
      lower(btrim(email)) AS contact_key,
      created_at
    FROM public.leads
    WHERE source <> 'manual'
      AND NULLIF(btrim(COALESCE(email, '')), '') IS NOT NULL
  ),
  ranked AS (
    SELECT
      *,
      first_value(id) OVER (
        PARTITION BY owner_id, context_key, contact_key
        ORDER BY created_at, id
      ) AS keep_id,
      row_number() OVER (
        PARTITION BY owner_id, context_key, contact_key
        ORDER BY created_at, id
      ) AS rn
    FROM keyed
  ),
  merged AS (
    SELECT
      r.keep_id,
      NULLIF(
        string_agg(
          DISTINCT NULLIF(btrim(concat_ws(E'\n', l.message, l.notes)), ''),
          E'\n\n'
        ) FILTER (WHERE r.rn > 1),
        ''
      ) AS duplicate_notes,
      min(l.follow_up_at) FILTER (WHERE r.rn > 1 AND l.follow_up_at IS NOT NULL) AS follow_up_at
    FROM ranked r
    JOIN public.leads l ON l.id = r.id
    GROUP BY r.keep_id
  )
  UPDATE public.leads keep
     SET notes = CASE
           WHEN merged.duplicate_notes IS NULL THEN keep.notes
           WHEN NULLIF(btrim(COALESCE(keep.notes, '')), '') IS NULL THEN merged.duplicate_notes
           WHEN position(merged.duplicate_notes in keep.notes) > 0 THEN keep.notes
           ELSE concat_ws(E'\n\n', keep.notes, merged.duplicate_notes)
         END,
         follow_up_at = COALESCE(keep.follow_up_at, merged.follow_up_at),
         updated_at = now()
    FROM merged
   WHERE keep.id = merged.keep_id
     AND (merged.duplicate_notes IS NOT NULL OR merged.follow_up_at IS NOT NULL);

  WITH keyed AS (
    SELECT
      id,
      owner_id,
      COALESCE(
        'listing:' || listing_id::text,
        'professional:' || professional_id::text,
        'project:' || project_id::text,
        'general'
      ) AS context_key,
      lower(btrim(email)) AS contact_key,
      created_at
    FROM public.leads
    WHERE source <> 'manual'
      AND NULLIF(btrim(COALESCE(email, '')), '') IS NOT NULL
  ),
  ranked AS (
    SELECT
      *,
      row_number() OVER (
        PARTITION BY owner_id, context_key, contact_key
        ORDER BY created_at, id
      ) AS rn
    FROM keyed
  )
  DELETE FROM public.leads l
  USING ranked r
  WHERE l.id = r.id
    AND r.rn > 1;

  WITH keyed AS (
    SELECT
      id,
      owner_id,
      COALESCE(
        'listing:' || listing_id::text,
        'professional:' || professional_id::text,
        'project:' || project_id::text,
        'general'
      ) AS context_key,
      regexp_replace(COALESCE(phone, ''), '\D', '', 'g') AS contact_key,
      created_at
    FROM public.leads
    WHERE source <> 'manual'
      AND NULLIF(btrim(COALESCE(email, '')), '') IS NULL
      AND NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '') IS NOT NULL
  ),
  ranked AS (
    SELECT
      *,
      first_value(id) OVER (
        PARTITION BY owner_id, context_key, contact_key
        ORDER BY created_at, id
      ) AS keep_id,
      row_number() OVER (
        PARTITION BY owner_id, context_key, contact_key
        ORDER BY created_at, id
      ) AS rn
    FROM keyed
  ),
  merged AS (
    SELECT
      r.keep_id,
      NULLIF(
        string_agg(
          DISTINCT NULLIF(btrim(concat_ws(E'\n', l.message, l.notes)), ''),
          E'\n\n'
        ) FILTER (WHERE r.rn > 1),
        ''
      ) AS duplicate_notes,
      min(l.follow_up_at) FILTER (WHERE r.rn > 1 AND l.follow_up_at IS NOT NULL) AS follow_up_at
    FROM ranked r
    JOIN public.leads l ON l.id = r.id
    GROUP BY r.keep_id
  )
  UPDATE public.leads keep
     SET notes = CASE
           WHEN merged.duplicate_notes IS NULL THEN keep.notes
           WHEN NULLIF(btrim(COALESCE(keep.notes, '')), '') IS NULL THEN merged.duplicate_notes
           WHEN position(merged.duplicate_notes in keep.notes) > 0 THEN keep.notes
           ELSE concat_ws(E'\n\n', keep.notes, merged.duplicate_notes)
         END,
         follow_up_at = COALESCE(keep.follow_up_at, merged.follow_up_at),
         updated_at = now()
    FROM merged
   WHERE keep.id = merged.keep_id
     AND (merged.duplicate_notes IS NOT NULL OR merged.follow_up_at IS NOT NULL);

  WITH keyed AS (
    SELECT
      id,
      owner_id,
      COALESCE(
        'listing:' || listing_id::text,
        'professional:' || professional_id::text,
        'project:' || project_id::text,
        'general'
      ) AS context_key,
      regexp_replace(COALESCE(phone, ''), '\D', '', 'g') AS contact_key,
      created_at
    FROM public.leads
    WHERE source <> 'manual'
      AND NULLIF(btrim(COALESCE(email, '')), '') IS NULL
      AND NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '') IS NOT NULL
  ),
  ranked AS (
    SELECT
      *,
      row_number() OVER (
        PARTITION BY owner_id, context_key, contact_key
        ORDER BY created_at, id
      ) AS rn
    FROM keyed
  )
  DELETE FROM public.leads l
  USING ranked r
  WHERE l.id = r.id
    AND r.rn > 1;
END;
$$;

REVOKE ALL ON FUNCTION private.merge_duplicate_auto_leads() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.merge_duplicate_auto_leads() FROM anon, authenticated;

SELECT private.merge_duplicate_auto_leads();

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_auto_unique_email_context
  ON public.leads (
    owner_id,
    COALESCE(
      'listing:' || listing_id::text,
      'professional:' || professional_id::text,
      'project:' || project_id::text,
      'general'
    ),
    lower(btrim(email))
  )
  WHERE source <> 'manual'
    AND NULLIF(btrim(COALESCE(email, '')), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_auto_unique_phone_context
  ON public.leads (
    owner_id,
    COALESCE(
      'listing:' || listing_id::text,
      'professional:' || professional_id::text,
      'project:' || project_id::text,
      'general'
    ),
    regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
  )
  WHERE source <> 'manual'
    AND NULLIF(btrim(COALESCE(email, '')), '') IS NULL
    AND NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '') IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Canonical helper used by all server-side interaction capture.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.upsert_owner_lead(
  p_owner_id uuid,
  p_source text,
  p_listing_id uuid DEFAULT NULL,
  p_professional_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_status text DEFAULT 'new',
  p_notes text DEFAULT NULL,
  p_follow_up_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_source text;
  v_status text;
  v_name text;
  v_email text;
  v_phone text;
  v_phone_key text;
  v_context_key text;
  v_lead_id uuid;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_source := CASE
    WHEN p_source IN ('manual', 'listing_inquiry', 'consultation', 'callback', 'project_inquiry', 'viewing', 'message')
      THEN p_source
    ELSE 'manual'
  END;

  v_status := CASE
    WHEN p_status IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')
      THEN p_status
    ELSE 'new'
  END;

  v_name := COALESCE(NULLIF(btrim(p_name), ''), NULLIF(btrim(p_email), ''), NULLIF(btrim(p_phone), ''), 'Inbound lead');
  v_email := lower(NULLIF(btrim(p_email), ''));
  v_phone := NULLIF(btrim(p_phone), '');
  v_phone_key := NULLIF(regexp_replace(COALESCE(v_phone, ''), '\D', '', 'g'), '');
  v_context_key := COALESCE(
    'listing:' || p_listing_id::text,
    'professional:' || p_professional_id::text,
    'project:' || p_project_id::text,
    'general'
  );

  IF v_source <> 'manual' AND (v_email IS NOT NULL OR v_phone_key IS NOT NULL) THEN
    WITH matched AS (
      SELECT l.id
        FROM public.leads l
       WHERE l.owner_id = p_owner_id
         AND l.source <> 'manual'
         AND COALESCE(
               'listing:' || l.listing_id::text,
               'professional:' || l.professional_id::text,
               'project:' || l.project_id::text,
               'general'
             ) = v_context_key
         AND (
           (v_email IS NOT NULL AND lower(btrim(COALESCE(l.email, ''))) = v_email)
           OR (v_phone_key IS NOT NULL AND regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') = v_phone_key)
         )
       ORDER BY l.created_at, l.id
       LIMIT 1
    )
    UPDATE public.leads existing
       SET source = CASE
             WHEN v_source = 'project_inquiry' THEN 'project_inquiry'
             ELSE existing.source
           END,
           listing_id = COALESCE(existing.listing_id, p_listing_id),
           professional_id = COALESCE(existing.professional_id, p_professional_id),
           project_id = COALESCE(existing.project_id, p_project_id),
           name = CASE
             WHEN existing.name IN ('Inbound lead', 'Message inquiry', 'Viewing request', 'Consultation request', 'New-build inquiry')
               THEN v_name
             ELSE existing.name
           END,
           email = COALESCE(NULLIF(existing.email, ''), v_email),
           phone = COALESCE(NULLIF(existing.phone, ''), v_phone),
           message = COALESCE(existing.message, NULLIF(btrim(p_message), '')),
           notes = CASE
             WHEN NULLIF(btrim(p_notes), '') IS NULL THEN existing.notes
             WHEN NULLIF(btrim(COALESCE(existing.notes, '')), '') IS NULL THEN btrim(p_notes)
             WHEN position(btrim(p_notes) in existing.notes) > 0 THEN existing.notes
             ELSE concat_ws(E'\n\n', existing.notes, btrim(p_notes))
           END,
           follow_up_at = COALESCE(existing.follow_up_at, p_follow_up_at),
           updated_at = now()
      FROM matched
     WHERE existing.id = matched.id
     RETURNING existing.id INTO v_lead_id;
  END IF;

  IF v_lead_id IS NOT NULL THEN
    RETURN v_lead_id;
  END IF;

  BEGIN
    INSERT INTO public.leads (
      owner_id,
      source,
      listing_id,
      professional_id,
      project_id,
      name,
      email,
      phone,
      message,
      status,
      notes,
      follow_up_at
    )
    VALUES (
      p_owner_id,
      v_source,
      p_listing_id,
      p_professional_id,
      p_project_id,
      v_name,
      v_email,
      v_phone,
      NULLIF(btrim(p_message), ''),
      v_status,
      NULLIF(btrim(p_notes), ''),
      p_follow_up_at
    )
    RETURNING id INTO v_lead_id;
  EXCEPTION WHEN unique_violation THEN
    WITH matched AS (
      SELECT l.id
        FROM public.leads l
       WHERE l.owner_id = p_owner_id
         AND l.source <> 'manual'
         AND COALESCE(
               'listing:' || l.listing_id::text,
               'professional:' || l.professional_id::text,
               'project:' || l.project_id::text,
               'general'
             ) = v_context_key
         AND (
           (v_email IS NOT NULL AND lower(btrim(COALESCE(l.email, ''))) = v_email)
           OR (v_phone_key IS NOT NULL AND regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') = v_phone_key)
         )
       ORDER BY l.created_at, l.id
       LIMIT 1
    )
    UPDATE public.leads existing
       SET source = CASE
             WHEN v_source = 'project_inquiry' THEN 'project_inquiry'
             ELSE existing.source
           END,
           listing_id = COALESCE(existing.listing_id, p_listing_id),
           professional_id = COALESCE(existing.professional_id, p_professional_id),
           project_id = COALESCE(existing.project_id, p_project_id),
           email = COALESCE(NULLIF(existing.email, ''), v_email),
           phone = COALESCE(NULLIF(existing.phone, ''), v_phone),
           updated_at = now()
      FROM matched
     WHERE existing.id = matched.id
     RETURNING existing.id INTO v_lead_id;
  END;

  RETURN v_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION private.upsert_owner_lead(
  uuid, text, uuid, uuid, uuid, text, text, text, text, text, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.upsert_owner_lead(
  uuid, text, uuid, uuid, uuid, text, text, text, text, text, text, timestamptz
) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Replace public trigger functions with private trigger functions.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.capture_viewing_owner_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_requester_email text;
  v_listing_title text;
  v_name text;
BEGIN
  BEGIN
    SELECT p.display_name, p.first_name, p.last_name, p.phone
      INTO v_display_name, v_first_name, v_last_name, v_phone
      FROM public.profiles p
     WHERE p.user_id = NEW.requester_id
     LIMIT 1;

    SELECT u.email
      INTO v_requester_email
      FROM auth.users u
     WHERE u.id = NEW.requester_id
     LIMIT 1;

    SELECT l.title
      INTO v_listing_title
      FROM public.listings l
     WHERE l.id = NEW.listing_id
     LIMIT 1;

    v_name := COALESCE(
      NULLIF(v_display_name, ''),
      NULLIF(trim(concat_ws(' ', v_first_name, v_last_name)), ''),
      NULLIF(v_requester_email, ''),
      'Viewing request'
    );

    PERFORM private.upsert_owner_lead(
      NEW.owner_id,
      'viewing',
      NEW.listing_id,
      NULL,
      NULL,
      v_name,
      v_requester_email,
      v_phone,
      concat_ws(
        ' ',
        'Viewing request for',
        COALESCE(NULLIF(v_listing_title, ''), 'listing'),
        concat('(', replace(NEW.viewing_type::text, '_', '-'), ')')
      ),
      'new',
      NULL,
      NEW.scheduled_at
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not auto-create viewing lead for viewing %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_viewing_owner_lead() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.capture_viewing_owner_lead() FROM anon, authenticated;

DROP TRIGGER IF EXISTS viewings_create_owner_lead ON public.viewings;
CREATE TRIGGER viewings_create_owner_lead
  AFTER INSERT ON public.viewings
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_viewing_owner_lead();

DROP FUNCTION IF EXISTS public.create_viewing_owner_lead();

CREATE OR REPLACE FUNCTION private.capture_consultation_owner_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
  v_source text;
  v_follow_up_at timestamptz;
BEGIN
  BEGIN
    SELECT p.user_id
      INTO v_owner_id
      FROM public.professionals p
     WHERE p.id = NEW.professional_id
     LIMIT 1;

    IF v_owner_id IS NULL THEN
      RETURN NEW;
    END IF;

    v_source := CASE NEW.request_type
      WHEN 'callback' THEN 'callback'
      WHEN 'message' THEN 'message'
      ELSE 'consultation'
    END;

    BEGIN
      IF NEW.preferred_date IS NOT NULL THEN
        v_follow_up_at := (
          NEW.preferred_date::date + COALESCE(NULLIF(NEW.preferred_time, '')::time, time '09:00')
        )::timestamptz;
      END IF;
    EXCEPTION WHEN others THEN
      v_follow_up_at := NULL;
    END;

    PERFORM private.upsert_owner_lead(
      v_owner_id,
      v_source,
      NULL,
      NEW.professional_id,
      NULL,
      COALESCE(NULLIF(NEW.requester_name, ''), 'Consultation request'),
      NULLIF(NEW.requester_email, ''),
      NULLIF(NEW.requester_phone, ''),
      NEW.message,
      'new',
      NULL,
      v_follow_up_at
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not auto-create consultation lead for request %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_consultation_owner_lead() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.capture_consultation_owner_lead() FROM anon, authenticated;

DROP TRIGGER IF EXISTS consultation_requests_create_owner_lead ON public.consultation_requests;
CREATE TRIGGER consultation_requests_create_owner_lead
  AFTER INSERT ON public.consultation_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_consultation_owner_lead();

DROP FUNCTION IF EXISTS public.create_consultation_owner_lead();

CREATE OR REPLACE FUNCTION private.capture_conversation_owner_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_listing_owner_id uuid;
  v_owner_id uuid;
  v_requester_id uuid;
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_requester_email text;
  v_listing_title text;
  v_name text;
  v_source text;
BEGIN
  BEGIN
    IF NEW.participant_a IS NULL OR NEW.participant_b IS NULL THEN
      RETURN NEW;
    END IF;

    IF NEW.listing_id IS NOT NULL THEN
      SELECT l.owner_id, l.title
        INTO v_listing_owner_id, v_listing_title
        FROM public.listings l
       WHERE l.id = NEW.listing_id
       LIMIT 1;

      IF v_listing_owner_id = NEW.participant_a THEN
        v_owner_id := NEW.participant_a;
        v_requester_id := NEW.participant_b;
      ELSIF v_listing_owner_id = NEW.participant_b THEN
        v_owner_id := NEW.participant_b;
        v_requester_id := NEW.participant_a;
      ELSE
        RETURN NEW;
      END IF;
      v_source := 'listing_inquiry';
    ELSE
      v_owner_id := NEW.participant_b;
      v_requester_id := NEW.participant_a;
      v_source := 'message';
    END IF;

    IF v_owner_id IS NULL OR v_requester_id IS NULL OR v_owner_id = v_requester_id THEN
      RETURN NEW;
    END IF;

    SELECT p.display_name, p.first_name, p.last_name, p.phone
      INTO v_display_name, v_first_name, v_last_name, v_phone
      FROM public.profiles p
     WHERE p.user_id = v_requester_id
     LIMIT 1;

    SELECT u.email
      INTO v_requester_email
      FROM auth.users u
     WHERE u.id = v_requester_id
     LIMIT 1;

    v_name := COALESCE(
      NULLIF(v_display_name, ''),
      NULLIF(trim(concat_ws(' ', v_first_name, v_last_name)), ''),
      NULLIF(v_requester_email, ''),
      'Message inquiry'
    );

    PERFORM private.upsert_owner_lead(
      v_owner_id,
      v_source,
      NEW.listing_id,
      NULL,
      NULL,
      v_name,
      v_requester_email,
      v_phone,
      CASE
        WHEN NEW.listing_id IS NULL THEN 'New message inquiry'
        ELSE concat('New listing inquiry for ', COALESCE(NULLIF(v_listing_title, ''), 'listing'))
      END,
      'new',
      NULL,
      NULL
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not auto-create conversation lead for conversation %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_conversation_owner_lead() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.capture_conversation_owner_lead() FROM anon, authenticated;

DROP TRIGGER IF EXISTS conversations_create_owner_lead ON public.conversations;
CREATE TRIGGER conversations_create_owner_lead
  AFTER INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_conversation_owner_lead();

DROP FUNCTION IF EXISTS public.create_conversation_owner_lead();

-- ---------------------------------------------------------------------------
-- New-build raw registrations still write to project_leads and public.leads.
-- The helper keeps the CRM row idempotent even when Register Interest first
-- opens a listing conversation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.create_new_build_project_leads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
  v_project_id uuid;
  v_listing_title text;
  v_name text;
  v_email text;
  v_phone text;
  v_notes text;
  v_budget numeric;
  v_metadata jsonb;
BEGIN
  BEGIN
    SELECT l.owner_id, l.project_id, l.title
      INTO v_owner_id, v_project_id, v_listing_title
      FROM public.listings l
     WHERE l.id = NEW.new_building_id
     LIMIT 1;

    IF v_owner_id IS NULL THEN
      RETURN NEW;
    END IF;

    v_name := COALESCE(
      NULLIF(NEW.full_name, ''),
      NULLIF(NEW.email, ''),
      'New-build inquiry'
    );
    v_email := NULLIF(NEW.email, '');
    v_phone := NULLIF(NEW.phone, '');
    v_notes := NULLIF(NEW.notes, '');
    v_budget := NULLIF(NEW.investment_budget, 0);
    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'new_building_lead_id', NEW.id,
      'new_building_id', NEW.new_building_id,
      'user_id', NEW.user_id,
      'listing_title', v_listing_title,
      'investment_budget', v_budget,
      'utm_source', NEW.utm_source
    ));

    PERFORM private.upsert_owner_lead(
      v_owner_id,
      'project_inquiry',
      NEW.new_building_id,
      NULL,
      v_project_id,
      v_name,
      v_email,
      v_phone,
      concat('New-build registration for ', COALESCE(NULLIF(v_listing_title, ''), 'listing')),
      'new',
      v_notes,
      NULL
    );

    IF v_project_id IS NOT NULL THEN
      INSERT INTO public.project_leads (
        project_id,
        name,
        email,
        phone,
        source,
        status,
        notes,
        metadata
      )
      SELECT
        v_project_id,
        v_name,
        v_email,
        v_phone,
        'project_inquiry',
        'new',
        v_notes,
        v_metadata
      WHERE NOT EXISTS (
        SELECT 1
          FROM public.project_leads existing
         WHERE existing.project_id = v_project_id
           AND (
             existing.metadata->>'new_building_lead_id' = NEW.id::text
             OR (v_email IS NOT NULL AND lower(existing.email) = lower(v_email))
             OR (v_email IS NULL AND v_phone IS NOT NULL AND existing.phone = v_phone)
           )
      );
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not auto-create new-build project lead for new_building_lead %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.create_new_build_project_leads() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.create_new_build_project_leads() FROM anon, authenticated;

DROP TRIGGER IF EXISTS new_building_leads_create_project_leads ON public.new_building_leads;
CREATE TRIGGER new_building_leads_create_project_leads
  AFTER INSERT ON public.new_building_leads
  FOR EACH ROW
  EXECUTE FUNCTION private.create_new_build_project_leads();

-- ---------------------------------------------------------------------------
-- Project leads entered manually in the developer dashboard should also show in
-- the canonical CRM, but deleting a project lead does not erase CRM history.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.sync_project_lead_to_owner_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
  v_listing_id uuid;
  v_status text;
  v_lead_id uuid;
  v_notes text;
BEGIN
  BEGIN
    SELECT p.owner_id
      INTO v_owner_id
      FROM public.projects p
     WHERE p.id = NEW.project_id
     LIMIT 1;

    IF v_owner_id IS NULL THEN
      RETURN NEW;
    END IF;

    BEGIN
      v_listing_id := NULLIF(NEW.metadata->>'new_building_id', '')::uuid;
    EXCEPTION WHEN others THEN
      v_listing_id := NULL;
    END;

    v_status := CASE NEW.status
      WHEN 'converted' THEN 'won'
      WHEN 'lost' THEN 'lost'
      WHEN 'qualified' THEN 'qualified'
      WHEN 'contacted' THEN 'contacted'
      ELSE 'new'
    END;

    v_notes := NULLIF(btrim(concat_ws(
      E'\n',
      NULLIF(NEW.notes, ''),
      CASE
        WHEN NULLIF(NEW.source, '') IS NULL THEN NULL
        ELSE concat('Project source: ', NEW.source)
      END,
      CASE
        WHEN NULLIF(NEW.unit_id, '') IS NULL THEN NULL
        ELSE concat('Unit interest: ', NEW.unit_id)
      END
    )), '');

    v_lead_id := private.upsert_owner_lead(
      v_owner_id,
      'project_inquiry',
      v_listing_id,
      NULL,
      NEW.project_id,
      NEW.name,
      NEW.email,
      NEW.phone,
      'Project lead',
      v_status,
      v_notes,
      NULL
    );

    IF v_lead_id IS NOT NULL THEN
      UPDATE public.leads
         SET status = v_status,
             updated_at = now()
       WHERE id = v_lead_id
         AND owner_id = v_owner_id
         AND source = 'project_inquiry';
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not sync project lead % into CRM: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_project_lead_to_owner_lead() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_project_lead_to_owner_lead() FROM anon, authenticated;

DROP TRIGGER IF EXISTS project_leads_sync_owner_lead ON public.project_leads;
CREATE TRIGGER project_leads_sync_owner_lead
  AFTER INSERT OR UPDATE OF name, email, phone, source, status, notes, unit_id, project_id
  ON public.project_leads
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_project_lead_to_owner_lead();
