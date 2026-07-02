import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707162000_add_admin_user_activity_analytics.sql"),
  "utf8",
).replace(/\s+/g, " ");

const anonLockMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707163000_lock_user_search_events_anon_privileges.sql"),
  "utf8",
).replace(/\s+/g, " ");

const authActivityMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707164000_add_user_auth_activity_events.sql"),
  "utf8",
).replace(/\s+/g, " ");

const syntheticActivityFilterMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260702040225_exclude_synthetic_admin_activity.sql"),
  "utf8",
).replace(/\s+/g, " ");

const authActivityRpcOnlyMigrationName = "20260612070500_harden_auth_activity_rpc_only.sql";

const guardrailsMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707165000_harden_user_search_telemetry_guards.sql"),
  "utf8",
).replace(/\s+/g, " ");

const authActivityRpcOnlyMigration = readFileSync(
  resolve(process.cwd(), `supabase/migrations/${authActivityRpcOnlyMigrationName}`),
  "utf8",
).replace(/\s+/g, " ");

describe("admin user activity analytics migration", () => {
  it("creates own-write search telemetry with admin-only read access", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.user_search_events");
    expect(migration).toContain("ALTER TABLE public.user_search_events ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain('CREATE POLICY "user_search_events_insert_own"');
    expect(migration).toContain("WITH CHECK (user_id = (SELECT auth.uid()))");
    expect(migration).toContain('CREATE POLICY "user_search_events_admin_select"');
    expect(migration).toContain("USING (private.has_platform_admin((SELECT auth.uid())))");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_user_search_events_created_at");
  });

  it("allows authenticated users to record searches through a narrow RPC", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.track_user_search");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.track_user_search");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.track_user_search");
    expect(migration).toContain("TO authenticated");
  });

  it("removes direct anonymous privileges after creating search telemetry", () => {
    expect(anonLockMigration).toContain("REVOKE ALL ON TABLE public.user_search_events FROM anon");
    expect(anonLockMigration).toContain("GRANT SELECT, INSERT ON TABLE public.user_search_events TO authenticated");
    expect(anonLockMigration).toContain("anon must not have direct privileges on public.user_search_events");
  });

  it("creates first-party auth activity telemetry with admin-only read access", () => {
    expect(authActivityMigration).toContain("CREATE TABLE IF NOT EXISTS public.user_auth_activity_events");
    expect(authActivityMigration).toContain("REFERENCES auth.users(id) ON DELETE CASCADE");
    expect(authActivityMigration).toContain("ALTER TABLE public.user_auth_activity_events ENABLE ROW LEVEL SECURITY");
    expect(authActivityMigration).toContain("REVOKE ALL ON TABLE public.user_auth_activity_events FROM anon");
    expect(authActivityMigration).toContain('CREATE POLICY "user_auth_activity_events_insert_own"');
    expect(authActivityMigration).toContain("WITH CHECK (user_id = (SELECT auth.uid()))");
    expect(authActivityMigration).toContain('CREATE POLICY "user_auth_activity_events_admin_select"');
    expect(authActivityMigration).toContain("USING (private.has_platform_admin((SELECT auth.uid())))");
  });

  it("allows authenticated users to record auth activity through a narrow RPC", () => {
    expect(authActivityMigration).toContain("CREATE OR REPLACE FUNCTION private.record_user_auth_activity_for_current_user");
    expect(authActivityMigration).toContain("SECURITY DEFINER");
    expect(authActivityMigration).toContain("auth activity metadata payload too large");
    expect(authActivityMigration).toContain("GRANT EXECUTE ON FUNCTION private.record_user_auth_activity_for_current_user");
    expect(authActivityMigration).toContain("CREATE OR REPLACE FUNCTION public.record_user_auth_activity");
    expect(authActivityMigration).toContain("SECURITY INVOKER");
    expect(authActivityMigration).toContain("SELECT private.record_user_auth_activity_for_current_user");
    expect(authActivityMigration).toContain("v_user_id uuid := auth.uid()");
    expect(authActivityMigration).toContain("REVOKE ALL ON FUNCTION public.record_user_auth_activity");
    expect(authActivityMigration).toContain("FROM PUBLIC, anon");
    expect(authActivityMigration).toContain("GRANT EXECUTE ON FUNCTION public.record_user_auth_activity");
    expect(authActivityMigration).toContain("TO authenticated");
    expect(authActivityMigration).toContain("public record_user_auth_activity must remain SECURITY INVOKER");
    expect(authActivityMigration).toContain("private auth activity insert helper must remain SECURITY DEFINER");
  });

  it("removes direct authenticated writes to auth activity telemetry after the RPC guard exists", () => {
    expect(authActivityRpcOnlyMigration).toContain("to_regclass('public.user_auth_activity_events') IS NULL");
    expect(authActivityRpcOnlyMigration).toContain("REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_auth_activity_events FROM authenticated");
    expect(authActivityRpcOnlyMigration).toContain('DROP POLICY IF EXISTS "user_auth_activity_events_insert_own"');
    expect(authActivityRpcOnlyMigration).toContain("authenticated must record auth activity through public.record_user_auth_activity");
    expect(authActivityRpcOnlyMigration).toContain("GRANT SELECT ON TABLE public.user_auth_activity_events TO authenticated");
    expect(authActivityMigration).toContain("REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_auth_activity_events FROM authenticated");
    expect(authActivityMigration).toContain('DROP POLICY IF EXISTS "user_auth_activity_events_insert_own"');
  });

  it("adds private trigger guardrails against oversized or spammy telemetry rows", () => {
    expect(guardrailsMigration).toContain("CREATE OR REPLACE FUNCTION private.enforce_user_search_event_limits");
    expect(guardrailsMigration).toContain("SECURITY DEFINER");
    expect(guardrailsMigration).toContain("pg_column_size(NEW.filters) > 8192");
    expect(guardrailsMigration).toContain("pg_column_size(NEW.metadata) > 8192");
    expect(guardrailsMigration).toContain("search telemetry payload too large");
    expect(guardrailsMigration).toContain("e.normalized_query = NEW.normalized_query");
    expect(guardrailsMigration).toContain("e.created_at > now() - interval '60 seconds'");
    expect(guardrailsMigration).toContain(">= 30");
    expect(guardrailsMigration).toContain("CREATE TRIGGER user_search_events_guardrails");
    expect(guardrailsMigration).toContain("REVOKE ALL ON FUNCTION private.enforce_user_search_event_limits()");
    expect(guardrailsMigration).not.toContain("CREATE OR REPLACE FUNCTION public.enforce_user_search_event_limits");
  });

  it("keeps auth users and sessions behind a checked private admin snapshot", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION private.admin_user_activity_snapshot");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("NOT private.has_platform_admin(v_actor)");
    expect(migration).toContain("FROM auth.users u");
    expect(migration).toContain("FROM auth.sessions s");
    expect(migration).toContain("FROM auth.audit_log_entries");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.admin_user_activity_snapshot");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("public admin_user_activity_snapshot must remain SECURITY INVOKER");
    expect(migration).not.toContain("GRANT SELECT ON auth.users TO authenticated");
    expect(migration).not.toContain("GRANT SELECT ON auth.sessions TO authenticated");
  });

  it("updates the admin snapshot to include first-party auth event material", () => {
    expect(authActivityMigration).toContain("recent_auth_events_json AS");
    expect(authActivityMigration).toContain("auth_events_by_type_json AS");
    expect(authActivityMigration).toContain("'auth_activity_events_in_range'");
    expect(authActivityMigration).toContain("'app_auth_events_available'");
    expect(authActivityMigration).toContain("'recent_auth_events', recent_auth_events_json.data");
    expect(authActivityMigration).toContain("public admin_user_activity_snapshot must remain SECURITY INVOKER");
  });

  it("filters synthetic demo and test identities out of admin user activity analytics", () => {
    expect(syntheticActivityFilterMigration).toContain("CREATE OR REPLACE FUNCTION private.is_synthetic_admin_activity_identity");
    expect(syntheticActivityFilterMigration).toContain("%@maiprop.demo");
    expect(syntheticActivityFilterMigration).toContain("%@maiprop.test");
    expect(syntheticActivityFilterMigration).toContain("%@maiprop-test.co");
    expect(syntheticActivityFilterMigration).toContain("%@maiprop-e2e.test");
    expect(syntheticActivityFilterMigration).toContain("stripe-%");
    expect(syntheticActivityFilterMigration).toContain("devin-%");
    expect(syntheticActivityFilterMigration).toContain("test_user%");
    expect(syntheticActivityFilterMigration).toContain("trial professional%");
    expect(syntheticActivityFilterMigration).toContain("codex live probe%");
    expect(syntheticActivityFilterMigration).toContain("visible_users AS");
    expect(syntheticActivityFilterMigration).toContain("NOT private.is_synthetic_admin_activity_identity");
    expect(syntheticActivityFilterMigration).toContain("JOIN visible_users vu ON vu.id = e.user_id");
    expect(syntheticActivityFilterMigration).toContain("FROM visible_users u");
  });
});
