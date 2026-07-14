-- Keep the browser-facing RPC surface invoker-safe. The privileged
-- implementations remain private and continue to enforce auth.uid(), listing
-- ownership, plan/add-on entitlements, and request idempotency themselves.

ALTER FUNCTION public.activate_listing_promotion(uuid, text, text)
  SET SCHEMA private;
ALTER FUNCTION public.deactivate_listing_promotion(uuid, text)
  SET SCHEMA private;
ALTER FUNCTION public.get_listing_promotion_balance()
  SET SCHEMA private;

CREATE OR REPLACE FUNCTION public.activate_listing_promotion(
  p_listing_id uuid,
  p_promotion_type text,
  p_request_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.activate_listing_promotion(
    p_listing_id,
    p_promotion_type,
    p_request_key
  );
$$;

CREATE OR REPLACE FUNCTION public.deactivate_listing_promotion(
  p_listing_id uuid,
  p_promotion_type text
)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.deactivate_listing_promotion(
    p_listing_id,
    p_promotion_type
  );
$$;

CREATE OR REPLACE FUNCTION public.get_listing_promotion_balance()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.get_listing_promotion_balance();
$$;

REVOKE ALL ON FUNCTION private.activate_listing_promotion(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.deactivate_listing_promotion(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_listing_promotion_balance()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.activate_listing_promotion(uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.deactivate_listing_promotion(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_listing_promotion_balance()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.activate_listing_promotion(uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_listing_promotion(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_listing_promotion_balance()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.activate_listing_promotion(uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_listing_promotion(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_listing_promotion_balance()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.activate_listing_promotion(uuid, text, text) IS
  'Invoker-safe API wrapper for the private, server-owned listing promotion allocator.';
COMMENT ON FUNCTION public.deactivate_listing_promotion(uuid, text) IS
  'Invoker-safe API wrapper for revoking an owned listing promotion.';
COMMENT ON FUNCTION public.get_listing_promotion_balance() IS
  'Invoker-safe API wrapper for the signed-in user promotion balance.';
