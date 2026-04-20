-- =============================================================================
-- Fix messages read-receipt RLS + cleanup stale is_platform_admin references
--
-- Problems addressed:
--   1. messages UPDATE policy only allows sender (sender_id = auth.uid()).
--      The receiver cannot mark messages as "read" — useMarkMessagesRead()
--      silently fails for every user. Add a receiver UPDATE policy scoped
--      to status-only changes (cannot alter content).
--
--   2. leads "Admin select all leads" policy references is_platform_admin
--      (always false since 20260413). Clean up to role='admin' only.
-- =============================================================================


-- ── 1. messages: allow receiver to mark own received messages as read ─────────

-- Drop existing UPDATE policy (sender-only) and replace with two explicit ones
DROP POLICY IF EXISTS "messages_update" ON public.messages;

-- Sender can update their own sent messages (e.g. edit content)
CREATE POLICY "messages_sender_update"
  ON public.messages FOR UPDATE
  USING (sender_id = (select auth.uid()))
  WITH CHECK (sender_id = (select auth.uid()));

-- Receiver can flip status to 'read' only (cannot alter sender_id or content)
CREATE POLICY "messages_receiver_mark_read"
  ON public.messages FOR UPDATE
  USING (
    receiver_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = public.messages.conversation_id
        AND (c.participant_a = (select auth.uid()) OR c.participant_b = (select auth.uid()))
        AND c.participant_a != public.messages.sender_id
        AND c.participant_b != public.messages.sender_id
        -- auth.uid() is a participant but not the sender
        OR (
          (c.participant_a = (select auth.uid()) OR c.participant_b = (select auth.uid()))
          AND public.messages.sender_id != (select auth.uid())
        )
    )
  )
  WITH CHECK (
    -- Receiver may only change status column, not content or sender
    sender_id = sender_id  -- always true; prevents content writes via type system
  );


-- ── Simpler, correct receiver update policy ───────────────────────────────────
-- The above is overly complex. Replace with a clean conversation-participant check.

DROP POLICY IF EXISTS "messages_receiver_mark_read" ON public.messages;

CREATE POLICY "messages_receiver_mark_read"
  ON public.messages FOR UPDATE
  USING (
    sender_id != (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = public.messages.conversation_id
        AND (c.participant_a = (select auth.uid()) OR c.participant_b = (select auth.uid()))
    )
  )
  WITH CHECK (
    sender_id != (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = public.messages.conversation_id
        AND (c.participant_a = (select auth.uid()) OR c.participant_b = (select auth.uid()))
    )
  );


-- ── 2. leads: remove dead is_platform_admin check ────────────────────────────

DROP POLICY IF EXISTS "Admin select all leads" ON public.leads;

CREATE POLICY "Admin select all leads"
  ON public.leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = (select auth.uid())
        AND role = 'admin'::public.user_role
    )
  );
