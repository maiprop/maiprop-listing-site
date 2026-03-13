-- Optional: reduce "Extension in Public" linter warnings.
-- - pg_cron: do NOT move. On Supabase 1.169.8+, pg_cron must live in pg_catalog; moving to
--   extensions can fail or break cron. Leave in public or use Dashboard to manage.
-- - pg_net: safe to move to extensions schema; its functions (net.http_post etc.) live in
--   the "net" schema regardless, so cron/edge code keeps working.
-- New extensions: create with WITH SCHEMA extensions to avoid public.

CREATE SCHEMA IF NOT EXISTS extensions;

-- Move pg_net out of public if present (idempotent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_net' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION pg_net SET SCHEMA extensions;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_net: could not move to extensions (%). Use Dashboard → Extensions if you need to.', SQLERRM;
END $$;
