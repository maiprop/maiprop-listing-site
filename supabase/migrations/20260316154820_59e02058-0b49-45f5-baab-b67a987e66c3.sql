
-- Create a DB trigger function that calls the oh-registration-notify edge function
-- when open_house_registrations status changes to approved or rejected.
CREATE OR REPLACE FUNCTION public.notify_oh_registration_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_id text;
  edge_url text;
  service_role_key text;
BEGIN
  -- Only fire when status actually changes to approved or rejected
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- Build the edge function URL using the project ref
  project_id := current_setting('app.settings.project_ref', true);
  IF project_id IS NULL OR project_id = '' THEN
    -- Fallback: hardcoded project ref (safe — not a secret)
    project_id := 'jglqlaynezspefoovqyc';
  END IF;

  edge_url := 'https://' || project_id || '.supabase.co/functions/v1/oh-registration-notify';

  -- Use pg_net to fire a non-blocking HTTP POST to the edge function
  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '')
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'record', row_to_json(NEW)::jsonb,
      'old_record', row_to_json(OLD)::jsonb
    )
  );

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_oh_registration_notify ON public.open_house_registrations;

CREATE TRIGGER trg_oh_registration_notify
  AFTER UPDATE OF status ON public.open_house_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_oh_registration_status_change();
