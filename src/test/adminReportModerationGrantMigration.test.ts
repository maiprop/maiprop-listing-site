import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serviceRpcMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601144500_add_service_admin_report_moderation_rpcs.sql"),
  "utf8",
);

const legacyRevokeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601144512_restrict_legacy_admin_report_moderation_rpcs.sql"),
  "utf8",
);

const moderationGuardMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601144524_allow_service_admin_report_moderation_guard.sql"),
  "utf8",
);

const adminReports = readFileSync(
  resolve(process.cwd(), "src/components/AdminReports.tsx"),
  "utf8",
);

const edgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/admin-content-report-action/index.ts"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

describe("admin report moderation RPC grants", () => {
  it("adds service-role-only explicit-admin RPCs for report moderation", () => {
    expect(serviceRpcMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_resolve_listing_report_for_user",
    );
    expect(serviceRpcMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_suspend_reported_listing_for_user",
    );
    expect(serviceRpcMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_ban_reported_content_owner_for_user",
    );
    expect(serviceRpcMigration).toContain("NOT public.has_platform_admin(_admin_user_id)");
    expect(serviceRpcMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(serviceRpcMigration).toContain("TO service_role");
    expect(serviceRpcMigration).toContain("must not be browser-callable");
  });

  it("removes browser-role execution from legacy AdminReports moderation RPCs", () => {
    expect(legacyRevokeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.admin_resolve_listing_report(UUID)",
    );
    expect(legacyRevokeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.admin_suspend_reported_listing(UUID, TEXT)",
    );
    expect(legacyRevokeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.admin_ban_reported_content_owner(UUID, TEXT)",
    );
    expect(legacyRevokeMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(legacyRevokeMigration).toContain(
      "legacy admin report moderation RPC % must not remain browser-callable",
    );
  });

  it("routes AdminReports browser actions through the protected Edge Function", () => {
    expect(adminReports).toContain('"admin-content-report-action"');
    expect(adminReports).not.toContain('rpc("admin_resolve_listing_report"');
    expect(adminReports).not.toContain('rpc("admin_suspend_reported_listing"');
    expect(adminReports).not.toContain('rpc("admin_ban_reported_content_owner"');
    expect(edgeFunction).toContain("verifyBearerToken");
    expect(edgeFunction).toContain('"admin_resolve_listing_report_for_user"');
    expect(edgeFunction).toContain('"admin_suspend_reported_listing_for_user"');
    expect(edgeFunction).toContain('"admin_ban_reported_content_owner_for_user"');
  });

  it("lets the service ban RPC pass the profile moderation guard only with a verified admin actor", () => {
    expect(moderationGuardMigration).toContain("maiprop.admin_report_moderation_actor");
    expect(moderationGuardMigration).toContain("v_service_actor_is_admin := public.has_platform_admin(v_service_actor)");
    expect(moderationGuardMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_ban_reported_content_owner_for_user",
    );
    expect(moderationGuardMigration).toContain("PERFORM set_config(");
    expect(moderationGuardMigration).toContain("admin_ban_reported_content_owner_for_user must not be browser-callable");
  });

  it("keeps the future advisor-hardening migration aligned for fresh database builds", () => {
    const internalGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 2. Trigger/cron/internal"),
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
    );
    const appFacingGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
      futureAdvisorHardeningMigration.indexOf("-- 4. Public buckets"),
    );

    expect(internalGrantBlock).toContain("public.admin_resolve_listing_report(uuid)");
    expect(internalGrantBlock).toContain("public.admin_resolve_listing_report_for_user(uuid,uuid)");
    expect(internalGrantBlock).toContain("public.admin_suspend_reported_listing(uuid,text)");
    expect(internalGrantBlock).toContain("public.admin_suspend_reported_listing_for_user(uuid,uuid,text)");
    expect(internalGrantBlock).toContain("public.admin_ban_reported_content_owner(uuid,text)");
    expect(internalGrantBlock).toContain("public.admin_ban_reported_content_owner_for_user(uuid,uuid,text)");
    expect(appFacingGrantBlock).not.toContain("public.admin_resolve_listing_report");
    expect(appFacingGrantBlock).not.toContain("public.admin_suspend_reported_listing");
    expect(appFacingGrantBlock).not.toContain("public.admin_ban_reported_content_owner");
  });
});
