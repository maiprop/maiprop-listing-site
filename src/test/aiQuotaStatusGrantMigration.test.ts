import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serviceStatusMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602041000_add_service_ai_quota_status_rpc.sql"),
  "utf8",
);

const legacyRevokeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602042000_restrict_legacy_check_ai_quota_rpc.sql"),
  "utf8",
);

const quotaStatusFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/ai-quota-status/index.ts"),
  "utf8",
);

const useAiQuotaHook = readFileSync(
  resolve(process.cwd(), "src/hooks/useAiQuota.ts"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

describe("AI quota status grant hardening", () => {
  it("adds a service-role-only explicit-user quota status RPC", () => {
    expect(serviceStatusMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.check_ai_quota_for_user",
    );
    expect(serviceStatusMigration).toContain("_user_id UUID");
    expect(serviceStatusMigration).toContain(
      "REVOKE ALL ON FUNCTION public.check_ai_quota_for_user(UUID, TEXT)",
    );
    expect(serviceStatusMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.check_ai_quota_for_user(UUID, TEXT)",
    );
    expect(serviceStatusMigration).toContain(
      "public.check_ai_quota_for_user(uuid,text) must not be browser-callable",
    );
  });

  it("removes browser-role execution from the legacy caller-context quota RPC", () => {
    expect(legacyRevokeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.check_ai_quota(TEXT)",
    );
    expect(legacyRevokeMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.check_ai_quota(TEXT)",
    );
    expect(legacyRevokeMigration).toContain(
      "public.check_ai_quota(text) must not remain browser-callable",
    );
  });

  it("routes browser quota checks through the authenticated Edge Function", () => {
    expect(useAiQuotaHook).toContain('"ai-quota-status"');
    expect(useAiQuotaHook).not.toContain('rpc("check_ai_quota"');
    expect(quotaStatusFunction).toContain("verifyBearerToken");
    expect(quotaStatusFunction).toContain('"check_ai_quota_for_user"');
    expect(quotaStatusFunction).toContain("_user_id: user.id");
  });

  it("keeps future fresh builds aligned with the live hardening", () => {
    const internalGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 2. Trigger/cron/internal"),
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
    );
    const appFacingGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
      futureAdvisorHardeningMigration.indexOf("-- 4. Public buckets"),
    );

    expect(internalGrantBlock).toContain("public.check_ai_quota(text)");
    expect(internalGrantBlock).toContain("public.check_ai_quota_for_user(uuid,text)");
    expect(appFacingGrantBlock).not.toContain("public.check_ai_quota(text)");
  });
});
