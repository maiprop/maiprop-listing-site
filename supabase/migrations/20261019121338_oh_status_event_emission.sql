-- Phase B: apply ONLY after A, compatible handler deployment, and verified old-handler
-- drain/routing fence. Local tests cannot prove that hosted gate. Never reset/replay
-- unexpected pre-cutover events. Retain A and its tombstones during rollback.
CREATE OR REPLACE FUNCTION public.notify_oh_registration_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id uuid;
  v_edge_url text := NULL;
  v_supabase_url text := NULL;
  v_webhook_secret text := NULL;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.oh_registration_status_events(old_status,new_status,registration_id,requester_id,listing_id,rejection_reason,timeslot_index)
  VALUES(OLD.status,NEW.status,NEW.id,NEW.requester_id,NEW.listing_id,
    CASE WHEN NEW.status='rejected' THEN NEW.rejection_reason ELSE NULL END,NEW.timeslot_index)
  RETURNING event_id INTO v_event_id;

  BEGIN
    SELECT decrypted_secret
    INTO v_webhook_secret
    FROM vault.decrypted_secrets
    WHERE name = 'WEBHOOK_SECRET'
    LIMIT 1;
  EXCEPTION
    WHEN invalid_schema_name OR undefined_table THEN
      RAISE NOTICE 'Vault decrypted secrets are not available while notifying open-house registration status.';
  END;

  v_webhook_secret := COALESCE(
    NULLIF(v_webhook_secret, ''),
    NULLIF(current_setting('app.settings.webhook_secret', TRUE), '')
  );

  IF v_webhook_secret IS NULL OR v_webhook_secret = '' THEN
    RAISE WARNING 'oh_webhook_configuration_missing';
    RETURN NEW;
  END IF;

  v_supabase_url := NULLIF(current_setting('app.settings.supabase_url', TRUE), '');
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    BEGIN
      SELECT decrypted_secret
      INTO v_supabase_url
      FROM vault.decrypted_secrets
      WHERE name IN ('SUPABASE_URL', 'supabase_url', 'saved_search_alerts_project_url')
      LIMIT 1;
    EXCEPTION
      WHEN invalid_schema_name OR undefined_table THEN
        RAISE NOTICE 'Vault decrypted secrets are not available while resolving Supabase URL.';
    END;
  END IF;

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    RAISE WARNING 'oh_webhook_configuration_missing';
    RETURN NEW;
  END IF;

  v_edge_url := rtrim(v_supabase_url, '/') || '/functions/v1/oh-registration-notify';

  PERFORM net.http_post(
    url := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'event_id', v_event_id,
      'event_version', 1,
      'record', jsonb_build_object('id',NEW.id,'requester_id',NEW.requester_id,'listing_id',NEW.listing_id,'status',NEW.status,
        'rejection_reason',CASE WHEN NEW.status='rejected' THEN NEW.rejection_reason ELSE NULL END,'timeslot_index',NEW.timeslot_index),
      'old_record', jsonb_build_object('id',OLD.id,'requester_id',OLD.requester_id,'listing_id',OLD.listing_id,'status',OLD.status)
    )
  );

  RETURN NEW;
END;
$$;

