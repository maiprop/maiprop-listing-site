import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSuffix = "_ecas_no_upgrade_hardening.sql";

function migrationSql(): string {
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const matches = readdirSync(migrationsDir).filter((name) => name.endsWith(migrationSuffix));

  expect(matches, `expected exactly one migration ending ${migrationSuffix}`).toHaveLength(1);

  return readFileSync(resolve(migrationsDir, matches[0]), "utf8");
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function statement(sql: string, pattern: RegExp, description: string): string {
  const match = sql.match(pattern);
  expect(match, `missing ${description}`).not.toBeNull();
  return normalize(match![0]);
}

describe("ECAS no-upgrade hardening migration", () => {
  it("recreates an append-only role audit trail with least-privilege access", () => {
    const sql = migrationSql();
    const normalized = normalize(sql);

    expect(normalized).toContain("CREATE TABLE IF NOT EXISTS public.admin_audit_log");
    expect(normalized).toContain("ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY");
    expect(normalized).toContain("CREATE POLICY admin_audit_log_select");
    expect(normalized).toContain("USING (private.has_platform_admin((SELECT auth.uid())))");
    expect(normalized).toContain(
      "REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated, service_role",
    );
    expect(normalized).toContain("GRANT SELECT ON TABLE public.admin_audit_log TO authenticated");
    expect(normalized).toContain(
      "GRANT SELECT, INSERT ON TABLE public.admin_audit_log TO service_role",
    );

    expect(normalized).toContain("CREATE OR REPLACE FUNCTION public.log_user_role_change()");
    expect(normalized).toContain("SET search_path = public, pg_temp");
    expect(normalized).toContain("TG_OP = 'INSERT'");
    expect(normalized).toContain("TG_OP = 'UPDATE'");
    expect(normalized).toContain("TG_OP = 'DELETE'");
    expect(normalized).toContain("DROP TRIGGER IF EXISTS trg_user_roles_audit ON public.user_roles");
    expect(normalized).toContain(
      "AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW",
    );
    expect(normalized).toContain(
      "REVOKE ALL ON FUNCTION public.log_user_role_change() FROM PUBLIC, anon, authenticated",
    );
    expect(normalized).toContain(
      "GRANT EXECUTE ON FUNCTION public.log_user_role_change() TO service_role",
    );

    expect(normalized).toContain(
      "CREATE OR REPLACE FUNCTION private.guard_admin_audit_log_append_only()",
    );
    expect(normalized).toContain("TG_OP = 'UPDATE'");
    expect(normalized).toContain("OLD.actor_id IS NOT NULL");
    expect(normalized).toContain("NEW.actor_id IS NULL");
    expect(normalized).toContain(
      "to_jsonb(NEW) - 'actor_id' = to_jsonb(OLD) - 'actor_id'",
    );
    expect(normalized).toContain(
      "DROP TRIGGER IF EXISTS trg_admin_audit_log_append_only ON public.admin_audit_log",
    );
    expect(normalized).toContain("BEFORE UPDATE OR DELETE ON public.admin_audit_log");
    expect(normalized).not.toMatch(
      /GRANT\s+(?:[^;]*,\s*)?(?:UPDATE|DELETE)(?:\s*,[^;]*)?\s+ON TABLE public\.admin_audit_log\s+TO\s+(?:anon|authenticated|service_role)/i,
    );
  });

  it("makes viewing identities immutable and authorizes transitions by actor", () => {
    const sql = migrationSql();
    const normalized = normalize(sql);
    const insertPolicy = statement(
      sql,
      /CREATE POLICY viewings_insert[\s\S]*?;/i,
      "viewings_insert policy",
    );
    const updatePolicy = statement(
      sql,
      /CREATE POLICY viewings_update[\s\S]*?;/i,
      "viewings_update policy",
    );

    expect(normalized).toContain("CREATE OR REPLACE FUNCTION public.guard_viewing_status_transitions()");
    expect(normalized).toContain("v_actor IS NULL OR private.has_platform_admin(v_actor)");
    expect(normalized).toContain("NEW.owner_id IS DISTINCT FROM OLD.owner_id");
    expect(normalized).toContain("NEW.requester_id IS DISTINCT FROM OLD.requester_id");
    expect(normalized).toContain("NEW.listing_id IS DISTINCT FROM OLD.listing_id");
    expect(normalized).toContain("NEW.created_at IS DISTINCT FROM OLD.created_at");
    expect(normalized).toContain("v_actor = OLD.owner_id");
    expect(normalized).toContain(
      "OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled')",
    );
    expect(normalized).toContain(
      "OLD.status = 'confirmed' AND NEW.status IN ('completed', 'cancelled')",
    );
    expect(normalized).toContain("v_actor = OLD.requester_id");
    expect(normalized).toContain("OLD.status IN ('pending', 'confirmed')");
    expect(normalized).toContain("NEW.status = 'cancelled'");
    expect(normalized).toContain("NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at");
    expect(normalized).toContain("NEW.viewing_type IS DISTINCT FROM OLD.viewing_type");
    expect(normalized).toContain("NEW.video_link IS DISTINCT FROM OLD.video_link");

    expect(insertPolicy).toContain("FOR INSERT TO authenticated");
    expect(insertPolicy).toContain("WITH CHECK (");
    expect(insertPolicy).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(insertPolicy).toContain("requester_id = (SELECT auth.uid())");
    expect(insertPolicy).toContain("status = 'pending'");
    expect(insertPolicy).toContain("FROM public.listings listing");
    expect(insertPolicy).toContain("listing.id = viewings.listing_id");
    expect(insertPolicy).toContain("listing.owner_id = viewings.owner_id");

    expect(updatePolicy).toContain("FOR UPDATE TO authenticated");
    expect(updatePolicy).toContain("USING (");
    expect(updatePolicy).toContain("WITH CHECK (");
    expect(updatePolicy).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(updatePolicy.match(/\(SELECT auth\.uid\(\)\) = (?:owner_id|requester_id)/g)).toHaveLength(4);
    expect(normalized).toContain(
      "REVOKE ALL ON FUNCTION public.guard_viewing_status_transitions() FROM PUBLIC, anon, authenticated",
    );
  });

  it("lets owners manage co-owners while keeping admins away from owner memberships", () => {
    const sql = migrationSql();
    const insertPolicy = statement(
      sql,
      /CREATE POLICY organization_memberships_manage_insert[\s\S]*?;/i,
      "organization membership insert policy",
    );
    const updatePolicy = statement(
      sql,
      /CREATE POLICY organization_memberships_manage_update[\s\S]*?;/i,
      "organization membership update policy",
    );

    expect(insertPolicy).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(insertPolicy).toMatch(
      /private\.has_org_role\(\s*organization_id,\s*ARRAY\['owner'\],\s*\(SELECT auth\.uid\(\)\)\s*\)/,
    );
    expect(insertPolicy).toContain("role <> 'owner'");
    expect(insertPolicy).toMatch(
      /private\.has_org_role\(\s*organization_id,\s*ARRAY\['admin'\],\s*\(SELECT auth\.uid\(\)\)\s*\)/,
    );
    expect(insertPolicy).not.toContain("ARRAY['owner', 'admin']");

    expect(updatePolicy).toContain("USING (");
    expect(updatePolicy).toContain("WITH CHECK (");
    expect(updatePolicy.match(/role <> 'owner'/g)).toHaveLength(2);
    expect(updatePolicy.match(/ARRAY\['owner'\]/g)).toHaveLength(2);
    expect(updatePolicy.match(/ARRAY\['admin'\]/g)).toHaveLength(2);
    expect(updatePolicy.match(/private\.has_platform_admin/g)).toHaveLength(2);
    expect(updatePolicy).not.toContain("ARRAY['owner', 'admin']");
  });

  it("blocks browser changes to tenant governance and SSO enforcement fields", () => {
    const sql = migrationSql();
    const normalized = normalize(sql);
    const organizationGuard = statement(
      sql,
      /CREATE OR REPLACE FUNCTION private\.guard_organization_governance_fields\(\)[\s\S]*?\$\$;/i,
      "organization governance guard",
    );
    const ssoGuard = statement(
      sql,
      /CREATE OR REPLACE FUNCTION private\.guard_organization_sso_enforcement\(\)[\s\S]*?\$\$;/i,
      "organization SSO enforcement guard",
    );

    expect(organizationGuard).toContain("v_actor IS NULL OR private.has_platform_admin(v_actor)");
    expect(organizationGuard).toContain("TG_OP = 'INSERT'");
    expect(organizationGuard).toContain("NEW.plan <> 'free'");
    expect(organizationGuard).toContain("NEW.procurement_status <> 'not_started'");
    expect(organizationGuard).toContain("NEW.security_review_status <> 'not_started'");
    expect(organizationGuard).toContain("NEW.plan IS DISTINCT FROM OLD.plan");
    expect(organizationGuard).toContain(
      "NEW.procurement_status IS DISTINCT FROM OLD.procurement_status",
    );
    expect(organizationGuard).toContain(
      "NEW.security_review_status IS DISTINCT FROM OLD.security_review_status",
    );
    expect(organizationGuard).not.toMatch(/NEW\.(?:name|slug|settings)\b/);

    expect(ssoGuard).toContain("v_actor IS NULL OR private.has_platform_admin(v_actor)");
    expect(ssoGuard).toContain("TG_OP = 'INSERT' AND NEW.sso_required");
    expect(ssoGuard).toContain("NEW.sso_required IS DISTINCT FROM OLD.sso_required");
    expect(normalized).toContain(
      "BEFORE INSERT OR UPDATE ON public.organizations FOR EACH ROW",
    );
    expect(normalized).toContain(
      "BEFORE INSERT OR UPDATE ON public.organization_domains FOR EACH ROW",
    );
    expect(normalized).toContain(
      "REVOKE ALL ON FUNCTION private.guard_organization_governance_fields() FROM PUBLIC, anon, authenticated",
    );
    expect(normalized).toContain(
      "REVOKE ALL ON FUNCTION private.guard_organization_sso_enforcement() FROM PUBLIC, anon, authenticated",
    );
  });

  it("limits anonymous public profiles to card and messaging identity columns", () => {
    const sql = migrationSql();
    const normalized = normalize(sql);
    const anonGrant = statement(
      sql,
      /GRANT SELECT\s*\([\s\S]*?\)\s*ON TABLE public\.profiles_public\s+TO anon\s*;/i,
      "anonymous profiles_public column grant",
    );

    expect(normalized).toContain("REVOKE ALL ON TABLE public.profiles_public FROM PUBLIC, anon");
    expect(anonGrant).toBe(
      "GRANT SELECT (user_id, display_name, avatar_url) ON TABLE public.profiles_public TO anon;",
    );
    expect(anonGrant).not.toMatch(/\b(?:first_name|last_name|role)\b/);
    expect(normalized).toContain("GRANT SELECT ON TABLE public.profiles_public TO authenticated");
    expect(normalized).not.toMatch(
      /GRANT SELECT ON (?:TABLE )?public\.profiles_public TO anon\b/i,
    );
  });

  it("does not alter MaiProp profile roles, pricing, or entitlement behavior", () => {
    const sql = migrationSql();

    expect(sql).not.toMatch(/ALTER TYPE\s+public\.user_role/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.profiles\b/i);
    expect(sql).not.toMatch(/\bpricing_configs\b/i);
    expect(sql).not.toMatch(/\binvestor_subscriptions\b/i);
    expect(sql).not.toMatch(/\bsubscription_tier\b/i);
    expect(sql).not.toMatch(/\bplan_limits\b/i);
  });
});
