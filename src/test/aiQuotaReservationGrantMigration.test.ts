import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serviceRpcMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602039000_add_service_ai_quota_reservation_rpc.sql"),
  "utf8",
);

const legacyGrantMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602040000_restrict_legacy_reserve_ai_quota_rpc.sql"),
  "utf8",
);

const aiUsageHelper = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/aiUsage.ts"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

describe("AI quota reservation RPC grant hardening", () => {
  it("adds a service-role RPC that receives the verified user id explicitly", () => {
    expect(serviceRpcMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.reserve_ai_quota_for_user",
    );
    expect(serviceRpcMigration).toContain("_user_id UUID");
    expect(serviceRpcMigration).toContain(
      "REVOKE ALL ON FUNCTION public.reserve_ai_quota_for_user",
    );
    expect(serviceRpcMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(serviceRpcMigration).toContain("TO service_role");
  });

  it("routes Edge quota reservation through the service-role RPC", () => {
    expect(aiUsageHelper).toContain('"reserve_ai_quota_for_user"');
    expect(aiUsageHelper).toContain("_user_id: userId");
    expect(aiUsageHelper).not.toContain('"reserve_ai_quota",');
  });

  it("removes browser execution from the legacy caller-context RPC in phase two", () => {
    expect(legacyGrantMigration).toContain(
      "REVOKE ALL ON FUNCTION public.reserve_ai_quota(TEXT)",
    );
    expect(legacyGrantMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(legacyGrantMigration).toContain("TO service_role");
    expect(legacyGrantMigration).toContain(
      "legacy AI quota reservation RPC must not be browser-executable",
    );
  });

  it("keeps the future advisor-hardening migration aligned for fresh database builds", () => {
    expect(futureAdvisorHardeningMigration).toContain(
      "public.reserve_ai_quota_for_user(uuid,text)",
    );
    const appFacingGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
      futureAdvisorHardeningMigration.indexOf("-- 4. Public buckets"),
    );
    expect(appFacingGrantBlock).not.toContain("public.reserve_ai_quota(text)");
  });
});
