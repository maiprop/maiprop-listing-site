CREATE TABLE IF NOT EXISTS public.user_auth_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  session_id text,
  route text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_auth_activity_events_type_check CHECK (
    event_type IN (
      'sign_in',
      'sign_out',
      'session_restored',
      'session_refreshed',
      'token_refreshed',
      'user_updated',
      'password_recovery'
    )
  )
);

ALTER TABLE public.user_auth_activity_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_auth_activity_events FROM anon;
GRANT SELECT, INSERT ON TABLE public.user_auth_activity_events TO authenticated;

DROP POLICY IF EXISTS "user_auth_activity_events_insert_own" ON public.user_auth_activity_events;
CREATE POLICY "user_auth_activity_events_insert_own"
  ON public.user_auth_activity_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_auth_activity_events_admin_select" ON public.user_auth_activity_events;
CREATE POLICY "user_auth_activity_events_admin_select"
  ON public.user_auth_activity_events
  FOR SELECT
  TO authenticated
  USING (private.has_platform_admin((SELECT auth.uid())));

CREATE INDEX IF NOT EXISTS idx_user_auth_activity_events_created_at
  ON public.user_auth_activity_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_auth_activity_events_user_created
  ON public.user_auth_activity_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_auth_activity_events_type_created
  ON public.user_auth_activity_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_auth_activity_events_session_created
  ON public.user_auth_activity_events (user_id, event_type, session_id, created_at DESC);

COMMENT ON TABLE public.user_auth_activity_events IS
  'First-party authenticated app auth/session events for admin activity analytics.';

CREATE OR REPLACE FUNCTION private.record_user_auth_activity_for_current_user(
  p_event_type text,
  p_route text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_session_id text := left(nullif(auth.jwt()->>'session_id', ''), 120);
  v_headers jsonb := '{}'::jsonb;
  v_existing_id uuid;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_event_type NOT IN (
    'sign_in',
    'sign_out',
    'session_restored',
    'session_refreshed',
    'token_refreshed',
    'user_updated',
    'password_recovery'
  ) THEN
    RETURN NULL;
  END IF;

  IF pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 8192 THEN
    RAISE EXCEPTION 'auth activity metadata payload too large'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_headers := '{}'::jsonb;
  END;

  SELECT e.id
  INTO v_existing_id
  FROM public.user_auth_activity_events e
  WHERE e.user_id = v_user_id
    AND e.event_type = v_event_type
    AND coalesce(e.session_id, '') = coalesce(v_session_id, '')
    AND e.created_at >= now() - interval '90 seconds'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.user_auth_activity_events (
    user_id,
    event_type,
    session_id,
    route,
    user_agent,
    metadata
  )
  VALUES (
    v_user_id,
    v_event_type,
    v_session_id,
    left(nullif(trim(coalesce(p_route, '')), ''), 500),
    left(nullif(coalesce(v_headers->>'user-agent', ''), ''), 500),
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION private.record_user_auth_activity_for_current_user(text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_user_auth_activity_for_current_user(text, text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.record_user_auth_activity(
  p_event_type text,
  p_route text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.record_user_auth_activity_for_current_user(p_event_type, p_route, p_metadata);
$$;

REVOKE ALL ON FUNCTION public.record_user_auth_activity(text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_user_auth_activity(text, text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.admin_user_activity_snapshot(
  p_days integer DEFAULT 30,
  p_limit integer DEFAULT 80
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_limit integer := least(greatest(coalesce(p_limit, 80), 1), 200);
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT private.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'admin_user_activity_snapshot is restricted to platform admins'
      USING ERRCODE = '42501';
  END IF;

  WITH
  profile_users AS (
    SELECT
      u.id,
      u.email,
      u.created_at,
      u.confirmed_at,
      u.last_sign_in_at,
      u.banned_until,
      p.display_name,
      p.first_name,
      p.last_name,
      p.role::text AS role
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE u.deleted_at IS NULL
  ),
  session_rollup AS (
    SELECT
      s.user_id,
      count(*) FILTER (WHERE s.created_at >= v_since OR s.updated_at >= v_since) AS sessions_in_range,
      count(*) FILTER (WHERE s.updated_at >= now() - interval '24 hours') AS sessions_24h,
      max(s.updated_at) AS last_session_at
    FROM auth.sessions s
    GROUP BY s.user_id
  ),
  auth_event_rollup AS (
    SELECT
      e.user_id,
      count(*) FILTER (WHERE e.created_at >= v_since) AS auth_events_in_range,
      count(*) FILTER (WHERE e.created_at >= now() - interval '24 hours') AS auth_events_24h,
      count(*) FILTER (WHERE e.event_type = 'sign_in' AND e.created_at >= v_since) AS sign_in_events_in_range,
      count(*) FILTER (WHERE e.event_type = 'sign_out' AND e.created_at >= v_since) AS sign_out_events_in_range,
      max(e.created_at) AS last_auth_event_at,
      (array_agg(e.event_type ORDER BY e.created_at DESC))[1] AS last_auth_event_type
    FROM public.user_auth_activity_events e
    GROUP BY e.user_id
  ),
  search_rollup AS (
    SELECT
      e.user_id,
      count(*) FILTER (WHERE e.created_at >= v_since) AS searches_in_range,
      max(e.created_at) AS last_search_at,
      (array_agg(e.query_text ORDER BY e.created_at DESC))[1] AS last_search_query
    FROM public.user_search_events e
    GROUP BY e.user_id
  ),
  users_json AS (
    SELECT coalesce(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.last_activity_at DESC NULLS LAST, row_data.created_at DESC), '[]'::jsonb) AS data
    FROM (
      SELECT
        pu.id AS user_id,
        pu.email,
        pu.display_name,
        pu.first_name,
        pu.last_name,
        pu.role,
        pu.created_at,
        pu.confirmed_at,
        pu.last_sign_in_at,
        sr.last_session_at,
        coalesce(sr.sessions_in_range, 0) AS session_count,
        coalesce(sr.sessions_24h, 0) AS sessions_24h,
        coalesce(aer.auth_events_in_range, 0) AS auth_event_count,
        coalesce(aer.auth_events_24h, 0) AS auth_events_24h,
        aer.last_auth_event_at,
        aer.last_auth_event_type,
        coalesce(scr.searches_in_range, 0) AS search_count,
        scr.last_search_at,
        scr.last_search_query,
        greatest(
          coalesce(pu.last_sign_in_at, '-infinity'::timestamptz),
          coalesce(sr.last_session_at, '-infinity'::timestamptz),
          coalesce(aer.last_auth_event_at, '-infinity'::timestamptz),
          coalesce(scr.last_search_at, '-infinity'::timestamptz),
          pu.created_at
        ) AS last_activity_at,
        pu.banned_until
      FROM profile_users pu
      LEFT JOIN session_rollup sr ON sr.user_id = pu.id
      LEFT JOIN auth_event_rollup aer ON aer.user_id = pu.id
      LEFT JOIN search_rollup scr ON scr.user_id = pu.id
      ORDER BY last_activity_at DESC NULLS LAST, pu.created_at DESC
      LIMIT v_limit
    ) row_data
  ),
  recent_searches_json AS (
    SELECT coalesce(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC), '[]'::jsonb) AS data
    FROM (
      SELECT
        e.id,
        e.created_at,
        e.surface,
        e.query_text,
        e.normalized_query,
        e.route,
        e.result_count,
        e.filters,
        e.metadata,
        e.user_id,
        u.email,
        p.display_name,
        p.role::text AS role
      FROM public.user_search_events e
      LEFT JOIN auth.users u ON u.id = e.user_id
      LEFT JOIN public.profiles p ON p.user_id = e.user_id
      WHERE e.created_at >= v_since
      ORDER BY e.created_at DESC
      LIMIT v_limit
    ) row_data
  ),
  recent_auth_events_json AS (
    SELECT coalesce(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC), '[]'::jsonb) AS data
    FROM (
      SELECT
        e.id,
        e.created_at,
        e.event_type,
        e.route,
        e.user_agent,
        e.metadata,
        e.user_id,
        u.email,
        p.display_name,
        p.role::text AS role
      FROM public.user_auth_activity_events e
      LEFT JOIN auth.users u ON u.id = e.user_id
      LEFT JOIN public.profiles p ON p.user_id = e.user_id
      WHERE e.created_at >= v_since
      ORDER BY e.created_at DESC
      LIMIT v_limit
    ) row_data
  ),
  auth_events_by_type_json AS (
    SELECT coalesce(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.event_count DESC, row_data.event_type), '[]'::jsonb) AS data
    FROM (
      SELECT
        e.event_type,
        count(*) AS event_count,
        count(DISTINCT e.user_id) AS user_count,
        max(e.created_at) AS last_seen_at
      FROM public.user_auth_activity_events e
      WHERE e.created_at >= v_since
      GROUP BY e.event_type
      ORDER BY count(*) DESC, e.event_type
      LIMIT 20
    ) row_data
  ),
  top_keywords_json AS (
    SELECT coalesce(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.search_count DESC, row_data.keyword), '[]'::jsonb) AS data
    FROM (
      SELECT
        word AS keyword,
        count(*) AS search_count,
        count(DISTINCT e.user_id) AS user_count,
        max(e.created_at) AS last_seen_at
      FROM public.user_search_events e
      CROSS JOIN LATERAL regexp_split_to_table(e.normalized_query, '[^[:alnum:]]+') AS token(word)
      WHERE e.created_at >= v_since
        AND char_length(word) >= 3
        AND word NOT IN (
          'the', 'and', 'for', 'with', 'near', 'under', 'over', 'from',
          'or', 'rent', 'sale', 'listing', 'listings', 'auction', 'auctions'
        )
      GROUP BY word
      ORDER BY count(*) DESC, word
      LIMIT 24
    ) row_data
  ),
  daily_json AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'date', d.day::date,
      'signups', coalesce(signups.count, 0),
      'logins', greatest(coalesce(logins.count, 0), coalesce(auth_logins.count, 0)),
      'sessions', coalesce(sessions.count, 0),
      'auth_events', coalesce(auth_events.count, 0),
      'searches', coalesce(searches.count, 0)
    ) ORDER BY d.day), '[]'::jsonb) AS data
    FROM generate_series((current_date - (v_days - 1))::date, current_date, interval '1 day') AS d(day)
    LEFT JOIN LATERAL (
      SELECT count(*)::integer
      FROM auth.users u
      WHERE u.deleted_at IS NULL AND u.created_at::date = d.day::date
    ) signups ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*)::integer
      FROM auth.users u
      WHERE u.deleted_at IS NULL AND u.last_sign_in_at::date = d.day::date
    ) logins ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*)::integer
      FROM public.user_auth_activity_events e
      WHERE e.event_type = 'sign_in' AND e.created_at::date = d.day::date
    ) auth_logins ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*)::integer
      FROM auth.sessions s
      WHERE s.updated_at::date = d.day::date
    ) sessions ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*)::integer
      FROM public.user_auth_activity_events e
      WHERE e.created_at::date = d.day::date
    ) auth_events ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*)::integer
      FROM public.user_search_events e
      WHERE e.created_at::date = d.day::date
    ) searches ON TRUE
  ),
  audit_actions_json AS (
    SELECT coalesce(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.event_count DESC), '[]'::jsonb) AS data
    FROM (
      SELECT
        coalesce(payload->>'action', payload->>'event', 'unknown') AS action,
        count(*) AS event_count,
        max(created_at) AS last_seen_at
      FROM auth.audit_log_entries
      WHERE created_at >= v_since
      GROUP BY coalesce(payload->>'action', payload->>'event', 'unknown')
      ORDER BY count(*) DESC
      LIMIT 20
    ) row_data
  ),
  summary_json AS (
    SELECT jsonb_build_object(
      'total_users', (SELECT count(*) FROM profile_users),
      'confirmed_users', (SELECT count(*) FROM profile_users WHERE confirmed_at IS NOT NULL),
      'signups_in_range', (SELECT count(*) FROM profile_users WHERE created_at >= v_since),
      'signups_7d', (SELECT count(*) FROM profile_users WHERE created_at >= now() - interval '7 days'),
      'active_users_in_range', (
        SELECT count(*)
        FROM profile_users pu
        WHERE pu.last_sign_in_at >= v_since
           OR EXISTS (
             SELECT 1 FROM public.user_auth_activity_events e
             WHERE e.user_id = pu.id AND e.created_at >= v_since
           )
      ),
      'active_users_7d', (
        SELECT count(*)
        FROM profile_users pu
        WHERE pu.last_sign_in_at >= now() - interval '7 days'
           OR EXISTS (
             SELECT 1 FROM public.user_auth_activity_events e
             WHERE e.user_id = pu.id AND e.created_at >= now() - interval '7 days'
           )
      ),
      'sessions_in_range', (SELECT count(*) FROM auth.sessions s WHERE s.created_at >= v_since OR s.updated_at >= v_since),
      'sessions_24h', (SELECT count(*) FROM auth.sessions s WHERE s.updated_at >= now() - interval '24 hours'),
      'auth_activity_events_in_range', (SELECT count(*) FROM public.user_auth_activity_events e WHERE e.created_at >= v_since),
      'auth_activity_events_24h', (SELECT count(*) FROM public.user_auth_activity_events e WHERE e.created_at >= now() - interval '24 hours'),
      'sign_in_events_in_range', (SELECT count(*) FROM public.user_auth_activity_events e WHERE e.event_type = 'sign_in' AND e.created_at >= v_since),
      'sign_out_events_in_range', (SELECT count(*) FROM public.user_auth_activity_events e WHERE e.event_type = 'sign_out' AND e.created_at >= v_since),
      'app_auth_events_available', (SELECT EXISTS (SELECT 1 FROM public.user_auth_activity_events LIMIT 1)),
      'searches_in_range', (SELECT count(*) FROM public.user_search_events e WHERE e.created_at >= v_since),
      'searches_7d', (SELECT count(*) FROM public.user_search_events e WHERE e.created_at >= now() - interval '7 days'),
      'unique_searchers_in_range', (SELECT count(DISTINCT e.user_id) FROM public.user_search_events e WHERE e.created_at >= v_since),
      'auth_audit_events_in_range', (SELECT count(*) FROM auth.audit_log_entries a WHERE a.created_at >= v_since),
      'auth_audit_logs_available', (SELECT EXISTS (SELECT 1 FROM auth.audit_log_entries LIMIT 1))
    ) AS data
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'days', v_days,
    'summary', summary_json.data,
    'users', users_json.data,
    'recent_searches', recent_searches_json.data,
    'recent_auth_events', recent_auth_events_json.data,
    'auth_events_by_type', auth_events_by_type_json.data,
    'top_keywords', top_keywords_json.data,
    'daily', daily_json.data,
    'audit_actions', audit_actions_json.data
  )
  INTO v_result
  FROM summary_json, users_json, recent_searches_json, recent_auth_events_json, auth_events_by_type_json, top_keywords_json, daily_json, audit_actions_json;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_user_activity_snapshot(
  p_days integer DEFAULT 30,
  p_limit integer DEFAULT 80
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.admin_user_activity_snapshot(p_days, p_limit);
$$;

REVOKE ALL ON FUNCTION public.admin_user_activity_snapshot(integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_activity_snapshot(integer, integer)
  TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_auth_activity_events FROM authenticated;
GRANT SELECT ON TABLE public.user_auth_activity_events TO authenticated;

DROP POLICY IF EXISTS "user_auth_activity_events_insert_own"
  ON public.user_auth_activity_events;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.user_auth_activity_events', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated must record auth activity through public.record_user_auth_activity, not direct INSERT';
  END IF;
END $$;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.user_auth_activity_events', 'SELECT')
     OR has_table_privilege('anon', 'public.user_auth_activity_events', 'INSERT')
     OR has_table_privilege('anon', 'public.user_auth_activity_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.user_auth_activity_events', 'DELETE') THEN
    RAISE EXCEPTION 'anon must not have direct privileges on public.user_auth_activity_events';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_user_activity_snapshot'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'public admin_user_activity_snapshot must remain SECURITY INVOKER';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'record_user_auth_activity'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'public record_user_auth_activity must remain SECURITY INVOKER';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'record_user_auth_activity_for_current_user'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'private auth activity insert helper must remain SECURITY DEFINER';
  END IF;
END;
$$;
