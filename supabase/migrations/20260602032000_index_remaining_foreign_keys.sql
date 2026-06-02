-- Resolve Supabase Advisor "unindexed foreign keys" INFO findings.
-- These indexes keep deletes/updates on referenced auth/profile/firesale rows from
-- scanning the child tables and make moderation/audit lookups cheaper.

CREATE INDEX IF NOT EXISTS idx_conversations_closed_by
  ON public.conversations (closed_by);

CREATE INDEX IF NOT EXISTS idx_firesale_interest_proof_of_funds_verified_by
  ON public.firesale_interest (proof_of_funds_verified_by);

CREATE INDEX IF NOT EXISTS idx_firesale_interest_reserved_by
  ON public.firesale_interest (reserved_by);

CREATE INDEX IF NOT EXISTS idx_firesale_interest_audit_log_actor_id
  ON public.firesale_interest_audit_log (actor_id);

CREATE INDEX IF NOT EXISTS idx_firesale_interest_audit_log_deal_id
  ON public.firesale_interest_audit_log (deal_id);

CREATE INDEX IF NOT EXISTS idx_professional_review_responses_responder_id
  ON public.professional_review_responses (responder_id);

CREATE INDEX IF NOT EXISTS idx_profiles_account_moderated_by
  ON public.profiles (account_moderated_by);

DO $$
DECLARE
  missing_index TEXT;
BEGIN
  FOREACH missing_index IN ARRAY ARRAY[
    'idx_conversations_closed_by',
    'idx_firesale_interest_proof_of_funds_verified_by',
    'idx_firesale_interest_reserved_by',
    'idx_firesale_interest_audit_log_actor_id',
    'idx_firesale_interest_audit_log_deal_id',
    'idx_professional_review_responses_responder_id',
    'idx_profiles_account_moderated_by'
  ]
  LOOP
    IF to_regclass('public.' || missing_index) IS NULL THEN
      RAISE EXCEPTION 'Expected foreign-key support index % to exist', missing_index;
    END IF;
  END LOOP;
END $$;
