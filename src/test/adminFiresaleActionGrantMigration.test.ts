import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serviceRpcMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601150500_add_service_admin_firesale_rpcs.sql"),
  "utf8",
);

const legacyRevokeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601150512_restrict_legacy_admin_firesale_rpcs.sql"),
  "utf8",
);

const adminPipeline = readFileSync(
  resolve(process.cwd(), "src/components/AdminFiresalePipeline.tsx"),
  "utf8",
);

const adminScreening = readFileSync(
  resolve(process.cwd(), "src/components/AdminInvestorScreening.tsx"),
  "utf8",
);

const firesaleInterestHook = readFileSync(
  resolve(process.cwd(), "src/hooks/useFiresaleInterest.ts"),
  "utf8",
);

const edgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/admin-firesale-action/index.ts"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

describe("admin firesale action RPC grants", () => {
  it("adds service-role-only explicit-admin RPCs for firesale admin workflows", () => {
    expect(serviceRpcMigration).toContain("CREATE OR REPLACE FUNCTION public.admin_update_firesale_pipeline_deal_for_user");
    expect(serviceRpcMigration).toContain("CREATE OR REPLACE FUNCTION public.admin_set_firesale_investor_publication_for_user");
    expect(serviceRpcMigration).toContain("CREATE OR REPLACE FUNCTION public.admin_update_firesale_interest_workflow_for_user");
    expect(serviceRpcMigration).toContain("NOT public.has_platform_admin(v_actor)");
    expect(serviceRpcMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(serviceRpcMigration).toContain("TO service_role");
    expect(serviceRpcMigration).toContain("service firesale admin RPC must not be browser-callable");
  });

  it("removes browser-role execution from the legacy firesale admin RPCs", () => {
    expect(legacyRevokeMigration).toContain(
      "public.admin_update_firesale_pipeline_deal(uuid,text,text,numeric,text,numeric)",
    );
    expect(legacyRevokeMigration).toContain("public.admin_set_firesale_investor_publication(uuid,boolean)");
    expect(legacyRevokeMigration).toContain(
      "public.admin_update_firesale_interest_workflow(uuid,text,integer,boolean,text,numeric)",
    );
    expect(legacyRevokeMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(legacyRevokeMigration).toContain("legacy firesale admin RPC must not remain browser-callable");
  });

  it("routes browser firesale admin actions through the protected Edge Function", () => {
    expect(adminPipeline).toContain('"admin-firesale-action"');
    expect(adminScreening).toContain('"admin-firesale-action"');
    expect(firesaleInterestHook).toContain('"admin-firesale-action"');
    expect(adminPipeline).not.toContain('rpc("admin_update_firesale_pipeline_deal"');
    expect(adminScreening).not.toContain('rpc("admin_set_firesale_investor_publication"');
    expect(firesaleInterestHook).not.toContain('rpc("admin_update_firesale_interest_workflow"');
    expect(edgeFunction).toContain("verifyBearerToken");
    expect(edgeFunction).toContain('"admin_update_firesale_pipeline_deal_for_user"');
    expect(edgeFunction).toContain('"admin_set_firesale_investor_publication_for_user"');
    expect(edgeFunction).toContain('"admin_update_firesale_interest_workflow_for_user"');
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

    expect(internalGrantBlock).toContain("public.admin_update_firesale_pipeline_deal(uuid,text,text,numeric,text,numeric)");
    expect(internalGrantBlock).toContain("public.admin_update_firesale_pipeline_deal_for_user(uuid,uuid,text,text,numeric,text,numeric)");
    expect(internalGrantBlock).toContain("public.admin_set_firesale_investor_publication(uuid,boolean)");
    expect(internalGrantBlock).toContain("public.admin_set_firesale_investor_publication_for_user(uuid,uuid,boolean)");
    expect(internalGrantBlock).toContain("public.admin_update_firesale_interest_workflow(uuid,text,integer,boolean,text,numeric)");
    expect(internalGrantBlock).toContain("public.admin_update_firesale_interest_workflow_for_user(uuid,uuid,text,integer,boolean,text,numeric)");
    expect(appFacingGrantBlock).not.toContain("public.admin_update_firesale_pipeline_deal");
    expect(appFacingGrantBlock).not.toContain("public.admin_set_firesale_investor_publication");
    expect(appFacingGrantBlock).not.toContain("public.admin_update_firesale_interest_workflow");
  });
});
