-- =============================================================================
-- Audit security fixes — 2026-04-18
-- Addresses all P1/P2/P3 findings from the 2026-04-18 Supabase audit.
--
-- 1. [P1]  REVOKE seed_grant_role / seed_grant_agent_role from PUBLIC
-- 2. [P2]  messages: BEFORE UPDATE trigger restricts receivers to status/read_at
-- 3. [P3]  contact_submissions SELECT policy: replace unreachable service_role
--          check with has_platform_admin so admin panel can read submissions
-- 4. [P3]  listing_type enum: add 'new_build' value (non-transactional)
-- 5. [P3]  profiles: drop duplicate title-case INSERT policy from 20260608
-- =============================================================================


-- ── 1. Revoke seed functions from PUBLIC ─────────────────────────────────────
-- seed_grant_role and seed_grant_agent_role are SECURITY DEFINER functions that
-- bypass the profiles_guard_admin_and_role trigger. Any authenticated user could
-- call them via PostgREST RPC to self-promote to 'admin'. Restrict to service_role.

REVOKE EXECUTE ON FUNCTION public.seed_grant_role(uuid[], text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_grant_agent_role(uuid[]) FROM PUBLIC;

-- service_role still needs to call these during seeding scripts
GRANT EXECUTE ON FUNCTION public.seed_grant_role(uuid[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_grant_agent_role(uuid[]) TO service_role;


-- ── 2. Messages: restrict non-sender updates to status/read_at only ───────────
-- The messages_receiver_mark_read RLS policy allows a conversation participant
-- who is not the sender to UPDATE any column (the WITH CHECK only guards the
-- conversation membership, not which columns change). This trigger enforces
-- column-level restrictions for receiver-side updates.

CREATE OR REPLACE FUNCTION public.guard_message_receiver_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only restrict when the caller is NOT the original sender
  IF (SELECT auth.uid()) IS DISTINCT FROM OLD.sender_id THEN
    IF (OLD.content          IS DISTINCT FROM NEW.content)
    OR (OLD.sender_id        IS DISTINCT FROM NEW.sender_id)
    OR (OLD.conversation_id  IS DISTINCT FROM NEW.conversation_id)
    THEN
      RAISE EXCEPTION 'permission_denied: non-senders may only update status and read_at on messages';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_message_receiver_update ON public.messages;
CREATE TRIGGER guard_message_receiver_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_receiver_update();


-- ── 3. contact_submissions: fix unreachable SELECT policy ────────────────────
-- The original policy USING (auth.role() = 'service_role') is never matched for
-- JS client requests: service_role bypasses RLS entirely, so this policy fires
-- for nobody. Replace with a standard platform-admin check.

DROP POLICY IF EXISTS "Service role can read submissions" ON public.contact_submissions;

CREATE POLICY "Platform admin can read submissions"
  ON public.contact_submissions FOR SELECT
  USING (public.has_platform_admin((SELECT auth.uid())));


-- ── 4. listing_type enum: add 'new_build' value ───────────────────────────────
-- 'new_build' is used by the sitemap function, the NewBuildDetail page, and
-- referenced in the frontend route /new-build/:id. The DB enum was missing it.
-- ALTER TYPE ADD VALUE cannot run inside a transaction block.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.listing_type'::regtype
      AND enumlabel  = 'new_build'
  ) THEN
    ALTER TYPE public.listing_type ADD VALUE 'new_build';
  END IF;
END;
$$;


-- ── 5. profiles: drop duplicate permissive INSERT policy ─────────────────────
-- Migration 20260608 created "Users can insert their own profile" (title-case).
-- Migration 20260615 created a new snake_case "profiles_insert" but did NOT
-- drop the 20260608 title-case one. Having two permissive INSERT policies on
-- the same table is a Supabase linter warning and creates ambiguity.

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
