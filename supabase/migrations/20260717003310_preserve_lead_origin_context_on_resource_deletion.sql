-- Auto-captured CRM leads retain their original business context after a
-- listing, professional, or project is deleted. Without a durable key,
-- ON DELETE SET NULL collapses distinct leads into the shared "general"
-- context and can violate the canonical dedupe indexes.

CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS origin_context_key text;

UPDATE public.leads
SET origin_context_key = COALESCE(
  'listing:' || listing_id::text,
  'professional:' || professional_id::text,
  'project:' || project_id::text,
  'general'
)
WHERE origin_context_key IS NULL
   OR btrim(origin_context_key) = '';

ALTER TABLE public.leads
  ALTER COLUMN origin_context_key SET DEFAULT 'general',
  ALTER COLUMN origin_context_key SET NOT NULL;

CREATE OR REPLACE FUNCTION private.set_lead_origin_context_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.origin_context_key := COALESCE(
      'listing:' || NEW.listing_id::text,
      'professional:' || NEW.professional_id::text,
      'project:' || NEW.project_id::text,
      'general'
    );
  ELSE
    NEW.origin_context_key := OLD.origin_context_key;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.set_lead_origin_context_key()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS leads_set_origin_context_key ON public.leads;
CREATE TRIGGER leads_set_origin_context_key
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION private.set_lead_origin_context_key();

DROP TRIGGER IF EXISTS leads_preserve_origin_context_key ON public.leads;
CREATE TRIGGER leads_preserve_origin_context_key
  BEFORE UPDATE OF origin_context_key ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION private.set_lead_origin_context_key();

DROP INDEX IF EXISTS public.idx_leads_auto_unique_email_context;
DROP INDEX IF EXISTS public.idx_leads_auto_unique_phone_context;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_auto_unique_email_context
  ON public.leads (
    owner_id, origin_context_key, lower(btrim(email))
  )
  WHERE source <> 'manual'
    AND NULLIF(btrim(COALESCE(email, '')), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_auto_unique_phone_context
  ON public.leads (
    owner_id, origin_context_key,
    regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
  )
  WHERE source <> 'manual'
    AND NULLIF(btrim(COALESCE(email, '')), '') IS NULL
    AND NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '') IS NOT NULL;

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
    WHEN p_source IN (
      'manual', 'listing_inquiry', 'consultation', 'callback',
      'project_inquiry', 'viewing', 'message'
    ) THEN p_source
    ELSE 'manual'
  END;

  v_status := CASE
    WHEN p_status IN (
      'new', 'contacted', 'qualified', 'proposal',
      'negotiation', 'won', 'lost'
    ) THEN p_status
    ELSE 'new'
  END;

  v_name := COALESCE(
    NULLIF(btrim(p_name), ''),
    NULLIF(btrim(p_email), ''),
    NULLIF(btrim(p_phone), ''),
    'Inbound lead'
  );
  v_email := lower(NULLIF(btrim(p_email), ''));
  v_phone := NULLIF(btrim(p_phone), '');
  v_phone_key := NULLIF(
    regexp_replace(COALESCE(v_phone, ''), '\D', '', 'g'),
    ''
  );
  v_context_key := COALESCE(
    'listing:' || p_listing_id::text,
    'professional:' || p_professional_id::text,
    'project:' || p_project_id::text,
    'general'
  );

  IF v_source <> 'manual' AND (v_email IS NOT NULL OR v_phone_key IS NOT NULL) THEN
    WITH matched AS (
      SELECT lead.id
      FROM public.leads AS lead
      WHERE lead.owner_id = p_owner_id
        AND lead.source <> 'manual'
        AND lead.origin_context_key = v_context_key
        AND (
          (
            v_email IS NOT NULL
            AND lower(btrim(COALESCE(lead.email, ''))) = v_email
          )
          OR (
            v_phone_key IS NOT NULL
            AND regexp_replace(COALESCE(lead.phone, ''), '\D', '', 'g') = v_phone_key
          )
        )
      ORDER BY lead.created_at, lead.id
      LIMIT 1
    )
    UPDATE public.leads AS existing
    SET source = CASE
          WHEN v_source = 'project_inquiry' THEN 'project_inquiry'
          ELSE existing.source
        END,
        listing_id = COALESCE(existing.listing_id, p_listing_id),
        professional_id = COALESCE(existing.professional_id, p_professional_id),
        project_id = COALESCE(existing.project_id, p_project_id),
        name = CASE
          WHEN existing.name IN (
            'Inbound lead', 'Message inquiry', 'Viewing request',
            'Consultation request', 'New-build inquiry'
          ) THEN v_name
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
      SELECT lead.id
      FROM public.leads AS lead
      WHERE lead.owner_id = p_owner_id
        AND lead.source <> 'manual'
        AND lead.origin_context_key = v_context_key
        AND (
          (
            v_email IS NOT NULL
            AND lower(btrim(COALESCE(lead.email, ''))) = v_email
          )
          OR (
            v_phone_key IS NOT NULL
            AND regexp_replace(COALESCE(lead.phone, ''), '\D', '', 'g') = v_phone_key
          )
        )
      ORDER BY lead.created_at, lead.id
      LIMIT 1
    )
    UPDATE public.leads AS existing
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
  uuid, text, uuid, uuid, uuid, text, text, text,
  text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.leads.origin_context_key IS
  'Immutable resource context used for auto-lead dedupe and retained after linked-resource deletion.';
