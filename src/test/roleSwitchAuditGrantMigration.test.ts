import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serviceRpcMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602034000_service_role_switch_audit_rpc.sql"),
  "utf8",
);

const edgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/log-role-switch/index.ts"),
  "utf8",
);

const billingHelper = readFileSync(
  resolve(process.cwd(), "supabase/functions/log-role-switch/billing.ts"),
  "utf8",
);

const auditIntegrityMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260812102335_enforce_role_switch_audit_integrity.sql",
  ),
  "utf8",
);

const auditIntegrityFinalizeMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260812102338_finalize_role_switch_audit_integrity.sql",
  ),
  "utf8",
);

const beginEdgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/begin-role-switch/index.ts"),
  "utf8",
);

const completeOnboardingEdgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/complete-onboarding-role/index.ts"),
  "utf8",
);

const reconciliationEdgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/reconcile-role-switch-billing/index.ts"),
  "utf8",
);

const reconciliationWorker = readFileSync(
  resolve(process.cwd(), "supabase/functions/reconcile-role-switch-billing/worker.ts"),
  "utf8",
);

const supabaseConfig = readFileSync(
  resolve(process.cwd(), "supabase/config.toml"),
  "utf8",
);

const auditIntegritySqlTest = readFileSync(
  resolve(process.cwd(), "supabase/tests/role_switch_audit_integrity_test.sql"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

describe("role-switch audit RPC grant hardening", () => {
  it("adds a service-role RPC that takes the verified caller id explicitly", () => {
    expect(serviceRpcMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.record_role_switch_audit_for_user",
    );
    expect(serviceRpcMigration).toContain("_user_id uuid");
    expect(serviceRpcMigration).toContain(
      "REVOKE ALL ON FUNCTION public.record_role_switch_audit_for_user",
    );
    expect(serviceRpcMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(serviceRpcMigration).toContain("TO service_role");
  });

  it("routes the Edge Function through service role after JWT verification", () => {
    expect(edgeFunction).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(edgeFunction).toContain("verifyBearerToken(req, supabase)");
    expect(edgeFunction).toContain("supabase.rpc(");
    expect(edgeFunction).toContain('"record_role_switch_audit_for_user"');
    expect(edgeFunction).toContain("_user_id: user.id");
    expect(edgeFunction).not.toContain('supabase.rpc("record_role_switch_audit"');
  });

  it("supports invite-only switches and finalizes a pre-Stripe audit row", () => {
    expect(auditIntegrityMigration).toContain("invite-only");
    expect(auditIntegrityMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.finalize_role_switch_audit_for_user",
    );
    expect(auditIntegrityMigration).toContain("TO service_role");
    expect(auditIntegrityMigration).toContain("billing_outcome");
    expect(auditIntegrityMigration).toContain("billing_error");
    expect(auditIntegrityMigration).toContain("billing_subscription_count");
    expect(auditIntegrityMigration).toContain("billing_cancelled_count");
    expect(auditIntegrityMigration).toContain("billing_reconciliation_required");
    expect(auditIntegrityMigration).toContain("'pending'");
    expect(auditIntegrityMigration).toContain("'succeeded'");
    expect(auditIntegrityMigration).toContain("'failed'");
    expect(auditIntegrityMigration).toContain("'unknown'");
    expect(auditIntegrityMigration).toContain("_billing_outcome text");
    expect(auditIntegrityMigration).toContain("_had_active_sub boolean");
    expect(auditIntegrityMigration).toContain("billing_finalized_at = CASE");
    expect(auditIntegrityMigration).toContain(
      "WHEN _billing_outcome IN ('pending', 'unknown') THEN NULL",
    );
    expect(auditIntegrityMigration).toContain("ELSE now()");

    const auditIndex = edgeFunction.indexOf('"record_role_switch_audit_for_user"');
    const stripeMutationIndex = edgeFunction.indexOf(
      "billingResult = await reconcileRoleSwitchBilling",
    );
    const finalizeIndex = edgeFunction.indexOf(
      "const finalizationError = await finalizeAudit",
    );
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(stripeMutationIndex).toBeGreaterThan(auditIndex);
    expect(finalizeIndex).toBeGreaterThan(stripeMutationIndex);
    expect(edgeFunction).toContain("resolveAuthoritativeRoleSwitch");
    expect(edgeFunction).toContain("billing_outcome: billingOutcome");
    expect(edgeFunction).toContain("reconciliation_required");
  });

  it("binds one idempotent audit intent through begin and completion", () => {
    expect(auditIntegrityMigration).toContain("_operation_id uuid");
    expect(auditIntegrityMigration).toContain("ON CONFLICT (id)");
    expect(auditIntegrityMigration).toContain("role_switch_audit_id");
    expect(auditIntegrityMigration).toContain("_audit_id uuid");
    expect(auditIntegrityMigration).toContain("role_switch_audit_required");
    expect(auditIntegrityMigration).toContain("role_switch_audit_destination_mismatch");
    expect(auditIntegrityMigration).toContain("billing_reconciliation_required = false");
    expect(beginEdgeFunction).toContain("_audit_id: auditId");
    expect(completeOnboardingEdgeFunction).toContain(
      'supabase.rpc("complete_onboarding_role_for_user"',
    );
  });

  it("rejects direct completion RPC role changes outside a finalized bound audit", () => {
    expect(auditIntegrityMigration).toContain("v_old_participant_type");
    expect(auditIntegrityMigration).toContain("role_switch_audit_required");
    expect(auditIntegrityMigration).toMatch(
      /IF NOT v_was_switching[\s\S]*v_old_participant_type IS NOT NULL[\s\S]*v_old_role IS DISTINCT FROM p_role/,
    );
    expect(auditIntegrityMigration).toMatch(
      /history\.id = v_role_switch_audit_id[\s\S]*history\.to_type = p_participant_type[\s\S]*billing_reconciliation_required = false/,
    );
  });

  it("owns reconciliation server-side with leases, backoff, retry ceilings, and idempotent scheduling", () => {
    expect(auditIntegrityMigration).toContain("billing_reconciliation_attempt_count");
    expect(auditIntegrityMigration).toContain("billing_reconciliation_next_attempt_at");
    expect(auditIntegrityMigration).toContain("billing_reconciliation_lock_token");
    expect(auditIntegrityMigration).toContain("FOR UPDATE SKIP LOCKED");
    expect(auditIntegrityMigration).toContain("billing_reconciliation_locked_at < now() - interval '15 minutes'");
    expect(auditIntegrityMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.release_role_switch_reconciliation_claims",
    );
    expect(auditIntegrityMigration).toMatch(
      /billing_reconciliation_attempt_count =\s*history\.billing_reconciliation_attempt_count \+ 1/,
    );
    expect(auditIntegrityMigration).toMatch(/power\(\s*2::numeric/);
    expect(auditIntegrityMigration).toContain("billing_reconciliation_exhausted_at");
    expect(auditIntegrityMigration).toContain("cron.unschedule('reconcile-role-switch-billing')");
    expect(auditIntegrityMigration).toContain("cron.schedule(");
    expect(auditIntegrityMigration).toContain("cron.alter_job(");
    expect(auditIntegrityMigration).toContain("active := FALSE");
    expect(auditIntegrityMigration).toMatch(
      /DO \$\$\s*DECLARE\s+v_job_id bigint;\s*BEGIN[\s\S]*v_job_id := cron\.schedule\(/,
    );
    expect(auditIntegrityMigration).toContain("vault.decrypted_secrets");
    expect(auditIntegrityMigration).toContain("x-cron-secret");
    expect(auditIntegrityMigration).toContain("/functions/v1/reconcile-role-switch-billing");
    expect(reconciliationEdgeFunction).toContain('Deno.env.get("CRON_SECRET")');
    expect(reconciliationEdgeFunction).toContain('Deno.env.get("STRIPE_SECRET_KEY")');
    expect(reconciliationEdgeFunction).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(reconciliationWorker).toContain("claim_role_switch_reconciliation_batch");
    expect(reconciliationWorker).toContain("release_role_switch_reconciliation_claims");
    expect(reconciliationWorker).toContain("complete_role_switch_reconciliation_attempt");
    expect(reconciliationWorker).toContain("requestDeadlineMs");
    expect(reconciliationWorker).toContain("completionReserveMs");
    expect(reconciliationEdgeFunction).toContain("RECONCILIATION_REQUEST_DEADLINE_MS");
    expect(auditIntegrityMigration).toContain("timeout_milliseconds := 55000");
    expect(supabaseConfig).toMatch(
      /\[functions\.reconcile-role-switch-billing\]\s+verify_jwt = false/,
    );
  });

  it("keeps executable SQL coverage for grants, leases, stale locks, exhaustion, and cron wiring", () => {
    expect(auditIntegritySqlTest).toMatch(/has_function_privilege\(\s*'anon'/);
    expect(auditIntegritySqlTest).toMatch(/has_function_privilege\(\s*'authenticated'/);
    expect(auditIntegritySqlTest).toMatch(/has_function_privilege\(\s*'service_role'/);
    expect(auditIntegritySqlTest).toContain("claim_role_switch_reconciliation_batch");
    expect(auditIntegritySqlTest).toContain("release_role_switch_reconciliation_claims");
    expect(auditIntegritySqlTest).toContain("complete_role_switch_reconciliation_attempt");
    expect(auditIntegritySqlTest).toContain(
      "claiming leases rows without consuming provider attempt budget",
    );
    expect(auditIntegritySqlTest).toContain("interval '16 minutes'");
    expect(auditIntegritySqlTest).toContain("billing_reconciliation_exhausted_at IS NOT NULL");
    expect(auditIntegritySqlTest).toContain("FROM cron.job");
  });

  it("remediates legacy audit facts before validating constraints", () => {
    const remediationIndex = auditIntegrityMigration.indexOf(
      "legacy_invalid_facts",
    );
    const destinationValidationIndex = auditIntegrityMigration.indexOf(
      "VALIDATE CONSTRAINT role_switch_history_to_type_check",
    );
    expect(remediationIndex).toBeGreaterThanOrEqual(0);
    expect(destinationValidationIndex).toBeGreaterThan(remediationIndex);
    expect(auditIntegrityMigration).toContain("jsonb_build_object");
  });

  it("uses a phased, bounded FK and index rollout for production", () => {
    expect(auditIntegrityMigration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(auditIntegrityMigration).toContain("SET LOCAL statement_timeout = '5min'");
    expect(auditIntegrityMigration).toMatch(
      /ADD CONSTRAINT profiles_role_switch_audit_id_fkey[\s\S]*ON DELETE SET NULL\s+NOT VALID;/,
    );
    expect(auditIntegrityMigration).not.toContain(
      "VALIDATE CONSTRAINT profiles_role_switch_audit_id_fkey",
    );
    expect(auditIntegrityMigration).not.toContain(
      "CREATE INDEX IF NOT EXISTS idx_profiles_role_switch_audit_id",
    );
    expect(auditIntegrityMigration).not.toContain(
      "CREATE INDEX IF NOT EXISTS idx_role_switch_history_reconciliation_due",
    );

    expect(auditIntegrityFinalizeMigration).toContain("SET LOCAL lock_timeout = '3s'");
    expect(auditIntegrityFinalizeMigration).toContain(
      "SET LOCAL statement_timeout = '30s'",
    );
    expect(auditIntegrityFinalizeMigration).toContain(
      "pg_relation_size('public.profiles'::regclass)",
    );
    expect(auditIntegrityFinalizeMigration).toContain(
      "LOCK TABLE public.profiles IN SHARE MODE NOWAIT",
    );
    expect(auditIntegrityFinalizeMigration).toContain(
      "LOCK TABLE public.role_switch_history IN SHARE MODE NOWAIT",
    );
    expect(auditIntegrityFinalizeMigration).toContain(
      "v_online_finalization_required := true",
    );
    expect(auditIntegrityFinalizeMigration).not.toContain(
      "MESSAGE = 'role_switch_audit_index_prebuild_required'",
    );
    expect(auditIntegrityFinalizeMigration).toContain(
      "CREATE INDEX CONCURRENTLY",
    );
    expect(auditIntegrityFinalizeMigration).toContain(
      "index_state.indrelid = 'public.profiles'::regclass",
    );
    expect(auditIntegrityFinalizeMigration).toContain(
      "access_method.amname = 'btree'",
    );
    expect(auditIntegrityFinalizeMigration).toContain(
      "index_state.indisunique = false",
    );
    expect(auditIntegrityFinalizeMigration).toContain(
      "pg_get_expr(index_state.indpred, index_state.indrelid, true)",
    );
    expect(auditIntegrityFinalizeMigration).toContain(
      "pg_get_indexdef(index_state.indexrelid, 1, true)",
    );

    const profileIndex = auditIntegrityFinalizeMigration.indexOf(
      "CREATE INDEX idx_profiles_role_switch_audit_id",
    );
    const guardedFkValidation = auditIntegrityFinalizeMigration.indexOf(
      "IF NOT v_online_finalization_required THEN",
    );
    const fkValidation = auditIntegrityFinalizeMigration.indexOf(
      "VALIDATE CONSTRAINT profiles_role_switch_audit_id_fkey",
    );
    expect(profileIndex).toBeGreaterThanOrEqual(0);
    expect(guardedFkValidation).toBeGreaterThan(profileIndex);
    expect(fkValidation).toBeGreaterThan(profileIndex);
  });

  it("preserves unknown and partial Stripe facts for reconciliation", () => {
    expect(auditIntegrityMigration).toContain(
      "ALTER COLUMN had_active_sub DROP NOT NULL",
    );
    expect(auditIntegrityMigration).toContain(
      "ALTER COLUMN billing_subscription_count DROP NOT NULL",
    );
    expect(auditIntegrityMigration).toContain(
      "ALTER COLUMN billing_cancelled_count DROP NOT NULL",
    );
    expect(edgeFunction).toContain("number | null");
    expect(edgeFunction).toContain("billing_reconciliation_required");
  });

  it("scopes durable Stripe ownership to the active runtime", () => {
    expect(edgeFunction).toContain('.eq("runtime_mode", runtimeMode)');
    expect(edgeFunction).toContain('.eq("livemode", livemode)');
    expect(billingHelper).toContain('stripeKey.startsWith("sk_live_")');
    expect(billingHelper).toContain('stripeKey.startsWith("sk_test_")');
    expect(reconciliationEdgeFunction).toContain('.eq("runtime_mode", runtime.runtimeMode)');
    expect(reconciliationEdgeFunction).toContain('.eq("livemode", runtime.livemode)');
  });

  it("cancels Stripe subscriptions using app-owned customer metadata before durable billing fallback", () => {
    const metadataSearchIndex = billingHelper.indexOf("stripe.customers.search");
    const durableFallbackIndex = billingHelper.indexOf(
      "lookupDurableCustomerId",
      metadataSearchIndex,
    );
    const customerResolutionIndex = billingHelper.indexOf(
      "const customer = await resolveOwnedStripeCustomer",
    );
    const subscriptionListIndex = billingHelper.indexOf(
      "const subscriptions = await listCoreBillableSubscriptions",
      customerResolutionIndex,
    );

    expect(edgeFunction).toContain("reconcileRoleSwitchBilling");
    expect(billingHelper).toContain("resolveOwnedStripeCustomer");
    expect(billingHelper).toContain("metadata['user_id']");
    expect(metadataSearchIndex).toBeGreaterThanOrEqual(0);
    expect(durableFallbackIndex).toBeGreaterThan(metadataSearchIndex);
    expect(customerResolutionIndex).toBeGreaterThanOrEqual(0);
    expect(subscriptionListIndex).toBeGreaterThan(customerResolutionIndex);
    expect(billingHelper).not.toContain("stripe.customers.list");
    expect(billingHelper).toContain("listCoreBillableSubscriptions(");
    expect(billingHelper).toContain("customer.id");
  });

  it("removes browser execution from the legacy caller-context RPC", () => {
    expect(serviceRpcMigration).toContain(
      "to_regprocedure('public.record_role_switch_audit(text,text,text,boolean,boolean)')",
    );
    expect(serviceRpcMigration).toContain(
      "REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated",
    );
    expect(serviceRpcMigration).toContain(
      "legacy role-switch audit RPC must not be browser-executable",
    );
  });

  it("keeps the future advisor-hardening migration aligned for fresh database builds", () => {
    expect(futureAdvisorHardeningMigration).toContain(
      "public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean)",
    );
    expect(futureAdvisorHardeningMigration).toContain(
      "public.record_role_switch_audit(text,text,text,boolean,boolean)",
    );
    const appFacingGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
      futureAdvisorHardeningMigration.indexOf("-- 4. Public buckets"),
    );
    expect(appFacingGrantBlock).not.toContain("public.record_role_switch_audit");
  });
});
