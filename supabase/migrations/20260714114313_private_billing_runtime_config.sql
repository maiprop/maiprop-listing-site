-- Supabase does not permit project operators to set arbitrary PostgreSQL GUCs.
-- Keep the active Stripe runtime in a private, service-managed singleton
-- instead. A missing row fails closed to live; staging is explicitly switched
-- to test as part of its environment bootstrap.
CREATE TABLE IF NOT EXISTS private.billing_runtime_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  runtime_mode text NOT NULL CHECK (runtime_mode IN ('test', 'live')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO private.billing_runtime_config (singleton, runtime_mode)
VALUES (true, 'live')
ON CONFLICT (singleton) DO NOTHING;

REVOKE ALL ON private.billing_runtime_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON private.billing_runtime_config TO service_role;

CREATE OR REPLACE FUNCTION public.current_billing_runtime_mode()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT COALESCE(
    (
      SELECT runtime_mode
      FROM private.billing_runtime_config
      WHERE singleton
    ),
    'live'
  )
$$;

REVOKE ALL ON FUNCTION public.current_billing_runtime_mode()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_billing_runtime_mode() TO service_role;

COMMENT ON TABLE private.billing_runtime_config IS
  'Service-managed active Stripe runtime. Missing configuration fails closed to live.';
