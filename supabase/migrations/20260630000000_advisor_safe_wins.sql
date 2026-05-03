-- =============================================================================
-- 20260630000000_advisor_safe_wins.sql
-- =============================================================================
-- Address two of the lowest-risk findings from the live Supabase advisor:
--
--   1. function_search_path_mutable on public.get_listing_limit(text, boolean)
--      The overloaded UUID variant in 20260615000000 already has
--      `SET search_path = public`, but the original (text, boolean) variant
--      defined in 20260612000002 was created without one. Pin it here.
--
--   2. rls_enabled_no_policy on public.rate_limit_counters
--      Migration 20260623120000 enabled RLS and revoked all client grants by
--      design — the table is service-role-only and clients should never see
--      it. The advisor flags "RLS on, no policies" because Postgres treats
--      that combination ambiguously. Add an explicit deny-all policy so the
--      lockdown intent is explicit and the advisor stops warning about it.
--
-- Other advisor findings (56 SECURITY DEFINER functions executable to
-- anon/authenticated, 4 public buckets allowing listing, pg_net in public,
-- contact_submissions WITH CHECK true, leaked-password protection) are NOT
-- addressed here. Each carries a higher behavioural risk and is documented
-- separately in docs/SUPABASE_ADVISOR_REMEDIATION.md.
-- =============================================================================

-- 1. Pin search_path on get_listing_limit(text, boolean) ---------------------
--
-- ALTER FUNCTION ... SET preserves the existing function body and only
-- adjusts the function-level configuration setting, so this is a no-op
-- behaviourally for callers — the function still returns the same value.
-- After this, advisor function_search_path_mutable should report 0 instead
-- of 1.

ALTER FUNCTION public.get_listing_limit(text, boolean)
  SET search_path = public, pg_temp;


-- 2. Explicit deny-all policy on rate_limit_counters -------------------------
--
-- Migration 20260623120000 already revoked all grants from anon/authenticated
-- and enabled RLS, so client traffic is denied. Service-role bypasses RLS
-- and continues to read/write counters. Adding the explicit USING (false) /
-- WITH CHECK (false) policy makes the deny intent literal in the table
-- definition rather than relying on "no policy = no access" semantics, and
-- silences advisor rls_enabled_no_policy.

DROP POLICY IF EXISTS "rate_limit_counters_no_client_access"
  ON public.rate_limit_counters;

CREATE POLICY "rate_limit_counters_no_client_access"
  ON public.rate_limit_counters
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY "rate_limit_counters_no_client_access"
  ON public.rate_limit_counters IS
  'Explicit deny-all for anon/authenticated. The edge functions use the '
  'service-role key, which bypasses RLS, so this does not affect them. '
  'Added in 20260630000000 to silence advisor rls_enabled_no_policy.';
