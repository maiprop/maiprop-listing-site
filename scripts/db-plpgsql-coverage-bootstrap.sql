-- Local managed starting state layered on the CI Prepare extensions fixture.
-- The public defaults below reproduce the saved Supabase initial-schema blob
-- b32db6b939afc914db36b83bcac245df27f90902 (SHA256
-- 84588fff60ff3cadcd361c820fe502052f4c5fd5aa273740e0690c5ee59ec813).
-- Migration creator is postgres. The application's June 14 migration revokes
-- future defaults; never repair later object ACLs with post-replay grants.
DO $guard$ BEGIN
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'service_role must already have BYPASSRLS';
  END IF;
END $guard$;
CREATE EXTENSION IF NOT EXISTS pgtap;
CREATE EXTENSION IF NOT EXISTS plpgsql_check;
GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
DO $guard$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_default_acl d JOIN pg_roles r ON r.oid = d.defaclrole
    WHERE r.rolname = 'postgres' AND d.defaclnamespace = 'public'::regnamespace
      AND d.defaclobjtype = 'r' AND d.defaclacl::text LIKE '%service_role=arwdDxt%'
  ) THEN RAISE EXCEPTION 'historical public table default privilege missing'; END IF;
END $guard$;

-- Saved managed-object capture grants authenticated SELECT on storage.objects.
-- This bound is only the operation needed by current policy tests, not full
-- managed Storage parity.
GRANT SELECT ON TABLE storage.objects TO authenticated;
DO $guard$ BEGIN
  IF NOT has_table_privilege('authenticated','storage.objects','SELECT') THEN
    RAISE EXCEPTION 'managed storage.objects SELECT baseline missing';
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $auth$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub',true),''),
    NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$auth$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $auth$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$auth$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $auth$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),auth.jwt()->>'role','anon')
$auth$;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS confirmed_at timestamptz GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED;
CREATE TABLE auth.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE auth.audit_log_entries (instance_id uuid, id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payload jsonb, created_at timestamptz DEFAULT now(), ip_address varchar(64) NOT NULL DEFAULT '');
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
CREATE OR REPLACE VIEW vault.decrypted_secrets AS SELECT id, name, description, secret, key_id, nonce, created_at, updated_at, secret AS decrypted_secret FROM vault.secrets;
CREATE TABLE net._http_response (id bigint, status_code integer, content_type text, headers jsonb, content text, timed_out boolean, error_msg text, created timestamptz DEFAULT now());

-- Managed Realtime relation only; no network transport is installed.
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE TABLE realtime.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), topic text, extension text, payload jsonb, event text, private boolean DEFAULT false, inserted_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA realtime TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON realtime.messages TO authenticated;
CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('realtime.topic',true),'') $$;
