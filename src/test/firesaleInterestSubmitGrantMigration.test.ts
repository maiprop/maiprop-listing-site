import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serviceRpcMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601151500_add_service_firesale_interest_submit_rpc.sql"),
  "utf8",
);

const participantTypeInterestAccessMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260603053003_allow_participant_type_firesale_interest_access.sql"),
  "utf8",
);

const legacyRevokeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601151512_restrict_legacy_firesale_interest_submit_rpc.sql"),
  "utf8",
);

const firesaleInterestHook = readFileSync(
  resolve(process.cwd(), "src/hooks/useFiresaleInterest.ts"),
  "utf8",
);

const edgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/submit-firesale-interest/index.ts"),
  "utf8",
);

const supabaseConfig = readFileSync(
  resolve(process.cwd(), "supabase/config.toml"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

describe("firesale interest submission RPC grants", () => {
  it("adds a service-role-only explicit-user RPC for investor submissions", () => {
    expect(serviceRpcMigration).toContain("CREATE OR REPLACE FUNCTION public.submit_firesale_interest_for_user");
    expect(serviceRpcMigration).toContain("PERFORM set_config('request.jwt.claim.sub', v_actor::text, TRUE)");
    expect(serviceRpcMigration).toContain("p_proof_of_funds_url NOT LIKE v_actor::text || '/firesale/' || p_deal_id::text || '/%'");
    expect(serviceRpcMigration).toContain("CREATE OR REPLACE FUNCTION public.admin_update_firesale_interest_workflow_for_user");
    expect(serviceRpcMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(serviceRpcMigration).toContain("TO service_role");
    expect(serviceRpcMigration).toContain("service firesale interest RPC must not be browser-callable");
  });

  it("removes browser-role execution from the legacy submit RPC", () => {
    expect(legacyRevokeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.submit_firesale_interest(UUID, TEXT, NUMERIC, TEXT)",
    );
    expect(legacyRevokeMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(legacyRevokeMigration).toContain("legacy firesale interest submit RPC must not remain browser-callable");
  });

  it("routes browser submissions through the protected Edge Function", () => {
    expect(supabaseConfig).toContain("[functions.submit-firesale-interest]");
    expect(supabaseConfig).toContain("verify_jwt = true");
    expect(firesaleInterestHook).toContain('"submit-firesale-interest"');
    expect(firesaleInterestHook).not.toContain('rpc("submit_firesale_interest"');
    expect(edgeFunction).toContain("verifyBearerToken");
    expect(edgeFunction).toContain('"submit_firesale_interest_for_user"');
    expect(edgeFunction).toContain("validateProofPath");
  });

  it("keeps investor interest access aligned with dashboard participant type entitlement", () => {
    expect(participantTypeInterestAccessMigration).toContain("CREATE OR REPLACE FUNCTION public.submit_firesale_interest_for_user");
    expect(participantTypeInterestAccessMigration).toContain("p.participant_type::text IN ('investor', 'institutional')");
    expect(participantTypeInterestAccessMigration).toContain("p.role::text IN ('investor', 'institutional')");
    expect(participantTypeInterestAccessMigration).toContain("s.status IN ('active', 'trial')");
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

    expect(internalGrantBlock).toContain("public.submit_firesale_interest(uuid,text,numeric,text)");
    expect(internalGrantBlock).toContain("public.submit_firesale_interest_for_user(uuid,uuid,text,numeric,text)");
    expect(appFacingGrantBlock).not.toContain("public.submit_firesale_interest");
  });
});
