-- Mirror new-build registrations into the unified CRM and project dashboard.
-- This keeps the existing buyer flow unchanged: registration still writes to
-- new_building_leads, while owners get searchable CRM/project lead records.

CREATE SCHEMA IF NOT EXISTS private;

-- Fresh migration replays reach this file before the later schema-alignment
-- migration that originally introduced new_building_leads. Bootstrap the table
-- here so the trigger can be attached safely; the later migration keeps its
-- CREATE TABLE IF NOT EXISTS, indexes, and RLS policies idempotent.
CREATE TABLE IF NOT EXISTS public.new_building_leads (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  new_building_id    UUID        NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email              TEXT        NOT NULL,
  full_name          TEXT        NOT NULL DEFAULT '',
  phone              TEXT,
  investment_budget  NUMERIC     NOT NULL DEFAULT 0,
  notes              TEXT        NOT NULL DEFAULT '',
  utm_source         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  v_updated_count integer := 0;
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

    -- Register Interest starts a listing conversation first. If that just
    -- created a generic listing lead, reclassify it instead of duplicating it.
    UPDATE public.leads existing
       SET source = 'project_inquiry',
           project_id = COALESCE(existing.project_id, v_project_id),
           name = COALESCE(NULLIF(existing.name, ''), v_name),
           phone = COALESCE(existing.phone, v_phone),
           message = COALESCE(
             v_notes,
             existing.message,
             concat('New-build registration for ', COALESCE(NULLIF(v_listing_title, ''), 'listing'))
           ),
           updated_at = now()
     WHERE existing.owner_id = v_owner_id
       AND existing.listing_id = NEW.new_building_id
       AND existing.source = 'listing_inquiry'
       AND existing.created_at >= now() - interval '15 minutes'
       AND (
         (v_email IS NOT NULL AND lower(existing.email) = lower(v_email))
         OR (v_email IS NULL AND v_phone IS NOT NULL AND existing.phone = v_phone)
       );

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
      INSERT INTO public.leads (
        owner_id,
        source,
        listing_id,
        project_id,
        name,
        email,
        phone,
        message,
        status,
        notes
      )
      SELECT
        v_owner_id,
        'project_inquiry',
        NEW.new_building_id,
        v_project_id,
        v_name,
        v_email,
        v_phone,
        concat('New-build registration for ', COALESCE(NULLIF(v_listing_title, ''), 'listing')),
        'new',
        v_notes
      WHERE NOT EXISTS (
        SELECT 1
          FROM public.leads existing
         WHERE existing.owner_id = v_owner_id
           AND existing.listing_id = NEW.new_building_id
           AND existing.source = 'project_inquiry'
           AND (
             (v_email IS NOT NULL AND lower(existing.email) = lower(v_email))
             OR (v_email IS NULL AND v_phone IS NOT NULL AND existing.phone = v_phone)
           )
      );
    END IF;

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
