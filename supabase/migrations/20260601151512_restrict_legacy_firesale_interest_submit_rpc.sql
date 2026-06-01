-- The browser now submits investor firesale interest through the protected
-- submit-firesale-interest Edge Function, which forwards the verified caller
-- id to submit_firesale_interest_for_user(...).

REVOKE ALL ON FUNCTION public.submit_firesale_interest(UUID, TEXT, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_firesale_interest(UUID, TEXT, NUMERIC, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.submit_firesale_interest(UUID, TEXT, NUMERIC, TEXT) IS
  'Legacy caller-context firesale interest RPC. Browser execution revoked; use submit-firesale-interest Edge Function.';

DO $$
DECLARE
  unexpected_grant RECORD;
BEGIN
  SELECT grantee
  INTO unexpected_grant
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'submit_firesale_interest'
    AND privilege_type = 'EXECUTE'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  LIMIT 1;

  IF unexpected_grant.grantee IS NOT NULL THEN
    RAISE EXCEPTION 'legacy firesale interest submit RPC must not remain browser-callable: %', unexpected_grant.grantee;
  END IF;
END $$;
