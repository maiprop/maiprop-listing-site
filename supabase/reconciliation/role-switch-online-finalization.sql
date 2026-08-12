\set ON_ERROR_STOP on

SET lock_timeout = '5s';
SET statement_timeout = '30min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_role_switch_audit_id
  ON public.profiles USING btree (role_switch_audit_id)
  WHERE (role_switch_audit_id IS NOT NULL);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_role_switch_history_reconciliation_due
  ON public.role_switch_history USING btree (
    billing_reconciliation_next_attempt_at,
    billing_reconciliation_attempt_count,
    switched_at
  )
  WHERE (billing_reconciliation_required = true);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_data_inputs_user_discount_invoice
  ON public.agent_data_inputs USING btree (user_id, discount_invoice_id)
  WHERE (discount_invoice_id IS NOT NULL);

SET statement_timeout = '5min';

ALTER TABLE public.profiles
  VALIDATE CONSTRAINT profiles_role_switch_audit_id_fkey;
