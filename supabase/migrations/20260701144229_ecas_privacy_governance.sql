-- ECAS privacy governance foundation.
-- Adds DSAR export request tracking and a redacted privacy/security audit
-- ledger. The ledger intentionally has no browser write policies; Edge
-- Functions using service-role credentials write privacy events after
-- sanitizing metadata.

CREATE TABLE IF NOT EXISTS public.privacy_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'processing', 'completed', 'failed', 'expired')),
  completed_at timestamptz,
  expires_at timestamptz,
  export_storage_path text,
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_privacy_export_requests_user_requested
  ON public.privacy_export_requests (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_export_requests_status_requested
  ON public.privacy_export_requests (status, requested_at DESC);

ALTER TABLE public.privacy_export_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "privacy_export_requests_select_own_or_admin"
  ON public.privacy_export_requests;
CREATE POLICY "privacy_export_requests_select_own_or_admin"
  ON public.privacy_export_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "privacy_export_requests_insert_own"
  ON public.privacy_export_requests;
CREATE POLICY "privacy_export_requests_insert_own"
  ON public.privacy_export_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "privacy_export_requests_update_admin"
  ON public.privacy_export_requests;
CREATE POLICY "privacy_export_requests_update_admin"
  ON public.privacy_export_requests
  FOR UPDATE
  TO authenticated
  USING (public.has_platform_admin(auth.uid()))
  WITH CHECK (public.has_platform_admin(auth.uid()));

GRANT SELECT, INSERT ON TABLE public.privacy_export_requests TO authenticated;
GRANT UPDATE (
  status,
  completed_at,
  expires_at,
  export_storage_path,
  error_code,
  metadata
) ON TABLE public.privacy_export_requests TO authenticated;

COMMENT ON TABLE public.privacy_export_requests IS
  'Tracks authenticated data export requests. Users can create and read their own rows; platform admins process status updates.';
COMMENT ON COLUMN public.privacy_export_requests.metadata IS
  'Redacted request metadata only. Do not store raw PII, prompt text, addresses, phone numbers, emails, or provider payloads.';

CREATE TABLE IF NOT EXISTS public.privacy_audit_log (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id uuid REFERENCES public.privacy_export_requests(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_privacy_audit_log_target_occurred
  ON public.privacy_audit_log (target_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_log_actor_occurred
  ON public.privacy_audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_log_event_occurred
  ON public.privacy_audit_log (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_log_request
  ON public.privacy_audit_log (request_id);

ALTER TABLE public.privacy_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "privacy_audit_log_select_admin"
  ON public.privacy_audit_log;
CREATE POLICY "privacy_audit_log_select_admin"
  ON public.privacy_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_platform_admin(auth.uid()));

GRANT SELECT ON TABLE public.privacy_audit_log TO authenticated;

-- No INSERT/UPDATE/DELETE policies on privacy_audit_log. Browser clients cannot
-- write or mutate privacy audit entries; only trusted service-role code may
-- insert sanitized events.

COMMENT ON TABLE public.privacy_audit_log IS
  'Append-only redacted privacy/security/billing event ledger. Written by trusted service-role code; readable only by platform admins.';
COMMENT ON COLUMN public.privacy_audit_log.metadata IS
  'Redacted event metadata only. Do not store raw PII, prompt text, addresses, phone numbers, emails, or provider payloads.';

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM anon;
REVOKE CREATE ON SCHEMA public FROM authenticated;

DO $$
BEGIN
  IF has_schema_privilege('anon', 'public', 'CREATE')
    OR has_schema_privilege('authenticated', 'public', 'CREATE')
    OR has_schema_privilege('PUBLIC', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'public schema CREATE must remain revoked from client roles';
  END IF;
END $$;
