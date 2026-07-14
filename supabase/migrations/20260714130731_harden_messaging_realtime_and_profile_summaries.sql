-- Keep the browser-facing profile projection deliberately narrow while
-- preserving the coarse owner classification required by public listing cards.

ALTER TABLE public.profiles_public
  ADD COLUMN IF NOT EXISTS owner_participant_type text;

ALTER TABLE public.profiles_public
  DROP CONSTRAINT IF EXISTS profiles_public_owner_participant_type_check;
ALTER TABLE public.profiles_public
  ADD CONSTRAINT profiles_public_owner_participant_type_check
  CHECK (owner_participant_type IS NULL OR owner_participant_type IN ('agent', 'seller'))
  NOT VALID;

CREATE OR REPLACE FUNCTION public.sync_profiles_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  projected_owner_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.profiles_public WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  projected_owner_type := CASE
    WHEN NEW.is_platform_admin
      OR NEW.role::text IN ('agent', 'developer', 'admin')
      THEN 'agent'
    WHEN NEW.role::text = 'seller' THEN 'seller'
    ELSE NULL
  END;

  INSERT INTO public.profiles_public (
    user_id,
    display_name,
    avatar_url,
    first_name,
    last_name,
    role,
    owner_participant_type
  )
  VALUES (
    NEW.user_id,
    NEW.display_name,
    NEW.avatar_url,
    NEW.first_name,
    NEW.last_name,
    NEW.role,
    projected_owner_type
  )
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    owner_participant_type = EXCLUDED.owner_participant_type;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_profiles_public() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profiles_public() TO service_role;

DROP TRIGGER IF EXISTS trg_sync_profiles_public ON public.profiles;
CREATE TRIGGER trg_sync_profiles_public
  AFTER INSERT
    OR UPDATE OF display_name, avatar_url, first_name, last_name, role, is_platform_admin
    OR DELETE
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profiles_public();

INSERT INTO public.profiles_public (
  user_id,
  display_name,
  avatar_url,
  first_name,
  last_name,
  role,
  owner_participant_type
)
SELECT
  profile.user_id,
  profile.display_name,
  profile.avatar_url,
  profile.first_name,
  profile.last_name,
  profile.role,
  CASE
    WHEN profile.is_platform_admin
      OR profile.role::text IN ('agent', 'developer', 'admin')
      THEN 'agent'
    WHEN profile.role::text = 'seller' THEN 'seller'
    ELSE NULL
  END
FROM public.profiles AS profile
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  avatar_url = EXCLUDED.avatar_url,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role,
  owner_participant_type = EXCLUDED.owner_participant_type;

ALTER TABLE public.profiles_public
  VALIDATE CONSTRAINT profiles_public_owner_participant_type_check;
ALTER TABLE public.profiles_public ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_public_select" ON public.profiles_public;
CREATE POLICY "profiles_public_select"
  ON public.profiles_public
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL PRIVILEGES ON TABLE public.profiles_public FROM PUBLIC, anon, authenticated;
REVOKE SELECT (user_id, display_name, avatar_url, first_name, last_name, role, owner_participant_type)
  ON TABLE public.profiles_public FROM PUBLIC, anon, authenticated;
REVOKE INSERT (user_id, display_name, avatar_url, first_name, last_name, role, owner_participant_type)
  ON TABLE public.profiles_public FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (user_id, display_name, avatar_url, first_name, last_name, role, owner_participant_type)
  ON TABLE public.profiles_public FROM PUBLIC, anon, authenticated;
REVOKE REFERENCES (user_id, display_name, avatar_url, first_name, last_name, role, owner_participant_type)
  ON TABLE public.profiles_public FROM PUBLIC, anon, authenticated;

GRANT SELECT (user_id, display_name, avatar_url, owner_participant_type)
  ON TABLE public.profiles_public
  TO anon, authenticated;

COMMENT ON COLUMN public.profiles_public.owner_participant_type IS
  'Coarse public listing-owner classification. Exact account roles remain private.';

CREATE OR REPLACE FUNCTION public.get_public_profile_summaries(p_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  owner_participant_type text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    profile.user_id,
    profile.display_name,
    profile.avatar_url,
    profile.owner_participant_type
  FROM public.profiles_public AS profile
  WHERE profile.user_id = ANY(COALESCE(p_user_ids, ARRAY[]::uuid[]));
$function$;

REVOKE ALL ON FUNCTION public.get_public_profile_summaries(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_summaries(uuid[])
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_profile_summaries(uuid[]) IS
  'Invoker-safe public profile projection for listing owner cards. Returns display fields and a coarse owner type only.';

-- Supabase protocol topics may arrive bare or with realtime/private prefixes.
-- Video-room and typing policies share this parser so both authorize the exact
-- same normalized topic forms without unsafe UUID casts.

CREATE OR REPLACE FUNCTION public.uuid_from_realtime_topic(p_topic text, p_prefix text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
DECLARE
  normalized_topic text := p_topic;
  expected_prefix text;
  candidate text;
BEGIN
  IF normalized_topic IS NULL OR p_prefix IS NULL OR p_prefix = '' THEN
    RETURN NULL;
  END IF;

  IF left(normalized_topic, char_length('realtime:')) = 'realtime:' THEN
    normalized_topic := substr(normalized_topic, char_length('realtime:') + 1);
  END IF;

  IF left(normalized_topic, char_length('private:')) = 'private:' THEN
    normalized_topic := substr(normalized_topic, char_length('private:') + 1);
  END IF;

  expected_prefix := p_prefix || ':';
  IF left(normalized_topic, char_length(expected_prefix)) <> expected_prefix THEN
    RETURN NULL;
  END IF;

  candidate := substr(normalized_topic, char_length(expected_prefix) + 1);
  IF candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN candidate::uuid;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.uuid_from_realtime_topic(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uuid_from_realtime_topic(text, text)
  TO authenticated, service_role;

DO $block$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "typing_channel_participant_select" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "typing_channel_participant_insert" ON realtime.messages';

    EXECUTE $policy$
      CREATE POLICY "typing_channel_participant_select"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
          realtime.messages.extension = 'presence'
          AND EXISTS (
            SELECT 1
            FROM public.conversations AS conversation
            WHERE conversation.id = public.uuid_from_realtime_topic(
              (SELECT realtime.topic()),
              'typing'
            )
              AND (
                conversation.participant_a = (SELECT auth.uid())
                OR conversation.participant_b = (SELECT auth.uid())
              )
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "typing_channel_participant_insert"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
          realtime.messages.extension = 'presence'
          AND EXISTS (
            SELECT 1
            FROM public.conversations AS conversation
            WHERE conversation.id = public.uuid_from_realtime_topic(
              (SELECT realtime.topic()),
              'typing'
            )
              AND (
                conversation.participant_a = (SELECT auth.uid())
                OR conversation.participant_b = (SELECT auth.uid())
              )
          )
        )
    $policy$;
  ELSE
    RAISE NOTICE 'realtime.messages not present - skipping typing channel policies';
  END IF;
END;
$block$;
