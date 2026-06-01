-- Remove browser-role execution from the legacy caller-context open-house
-- capacity and registration RPCs now that the browser uses protected Edge
-- Functions backed by explicit-user service RPCs.

REVOKE ALL ON FUNCTION public.get_open_house_capacity(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_house_capacity(UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.create_open_house_registration(
  UUID,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_open_house_registration(
  UUID,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN
) TO service_role;

COMMENT ON FUNCTION public.get_open_house_capacity(UUID) IS
  'Legacy caller-context open-house capacity RPC retained for service-role compatibility; browser callers use open-house-capacity.';

COMMENT ON FUNCTION public.create_open_house_registration(
  UUID,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN
) IS
  'Legacy caller-context open-house registration RPC retained for service-role compatibility; browser callers use open-house-registration.';

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_open_house_capacity(uuid)',
    'public.create_open_house_registration(uuid,integer,text,text,text,text,text,boolean,boolean,boolean)'
  ] LOOP
    IF has_function_privilege('anon', sig, 'EXECUTE')
       OR has_function_privilege('authenticated', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'legacy open-house RPC must not remain browser-callable: %', sig;
    END IF;

    IF NOT has_function_privilege('service_role', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role must execute legacy open-house RPC: %', sig;
    END IF;
  END LOOP;
END $$;
