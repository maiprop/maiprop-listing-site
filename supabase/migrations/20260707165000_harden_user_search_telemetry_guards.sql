CREATE OR REPLACE FUNCTION private.enforce_user_search_event_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF pg_column_size(NEW.filters) > 8192 OR pg_column_size(NEW.metadata) > 8192 THEN
    RAISE EXCEPTION 'search telemetry payload too large'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_search_events e
    WHERE e.user_id = NEW.user_id
      AND e.surface = NEW.surface
      AND e.normalized_query = NEW.normalized_query
      AND coalesce(e.route, '') = coalesce(NEW.route, '')
      AND e.created_at > now() - interval '60 seconds'
    LIMIT 1
  ) THEN
    RETURN NULL;
  END IF;

  IF (
    SELECT count(*)
    FROM public.user_search_events e
    WHERE e.user_id = NEW.user_id
      AND e.created_at > now() - interval '1 minute'
  ) >= 30 THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_user_search_event_limits()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_search_events_guardrails ON public.user_search_events;
CREATE TRIGGER user_search_events_guardrails
  BEFORE INSERT ON public.user_search_events
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_user_search_event_limits();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'user_search_events'
      AND t.tgname = 'user_search_events_guardrails'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'user_search_events_guardrails trigger must exist';
  END IF;
END;
$$;
