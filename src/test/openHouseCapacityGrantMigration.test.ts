import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const capacityGrantMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602030000_restrict_open_house_capacity_rpc.sql"),
  "utf8",
);

const serviceOpenHouseMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601140611_add_service_open_house_edge_rpcs.sql"),
  "utf8",
);

const legacyOpenHouseRevokeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601140627_restrict_legacy_open_house_edge_rpcs.sql"),
  "utf8",
);

const openHouseHook = readFileSync(
  resolve(process.cwd(), "src/hooks/useOpenHouseAssetControl.ts"),
  "utf8",
);

const capacityFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/open-house-capacity/index.ts"),
  "utf8",
);

const registrationFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/open-house-registration/index.ts"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

const legacyOnboardingGrantMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602031000_restrict_legacy_onboarding_role_rpcs.sql"),
  "utf8",
);

describe("open house capacity and registration RPC grants", () => {
  it("initially removed anonymous capacity execution while preserving the signed-in RPC flow", () => {
    expect(capacityGrantMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_open_house_capacity(UUID)",
    );
    expect(capacityGrantMigration).toContain("FROM PUBLIC, anon");
    expect(capacityGrantMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_open_house_capacity(UUID)",
    );
    expect(capacityGrantMigration).toContain("TO authenticated, service_role");
    expect(capacityGrantMigration).toContain(
      "anon must not execute public.get_open_house_capacity(uuid)",
    );
    expect(capacityGrantMigration).toContain(
      "authenticated must execute public.get_open_house_capacity(uuid)",
    );
  });

  it("adds service-role-only explicit-user open-house RPCs for Edge Functions", () => {
    expect(serviceOpenHouseMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_open_house_capacity_for_user",
    );
    expect(serviceOpenHouseMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.create_open_house_registration_for_user",
    );
    expect(serviceOpenHouseMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_open_house_capacity_for_user(UUID, UUID)",
    );
    expect(serviceOpenHouseMigration).toContain(
      "REVOKE ALL ON FUNCTION public.create_open_house_registration_for_user",
    );
    expect(serviceOpenHouseMigration).toContain(
      "public.get_open_house_capacity_for_user(uuid,uuid) must not be browser-callable",
    );
    expect(serviceOpenHouseMigration).toContain(
      "public.create_open_house_registration_for_user(...) must not be browser-callable",
    );
  });

  it("removes browser-role execution from the legacy open-house RPCs", () => {
    expect(legacyOpenHouseRevokeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_open_house_capacity(UUID)",
    );
    expect(legacyOpenHouseRevokeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.create_open_house_registration(",
    );
    expect(legacyOpenHouseRevokeMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(legacyOpenHouseRevokeMigration).toContain(
      "legacy open-house RPC must not remain browser-callable",
    );
  });

  it("routes browser capacity and registration through authenticated Edge Functions", () => {
    expect(openHouseHook).toContain('"open-house-capacity"');
    expect(openHouseHook).toContain('"open-house-registration"');
    expect(openHouseHook).not.toContain('rpc("get_open_house_capacity"');
    expect(openHouseHook).not.toContain('rpc("create_open_house_registration"');
    expect(capacityFunction).toContain("verifyBearerToken");
    expect(capacityFunction).toContain('"get_open_house_capacity_for_user"');
    expect(registrationFunction).toContain("verifyBearerToken");
    expect(registrationFunction).toContain('"create_open_house_registration_for_user"');
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

    expect(internalGrantBlock).toContain("public.get_open_house_capacity(uuid)");
    expect(internalGrantBlock).toContain("public.get_open_house_capacity_for_user(uuid,uuid)");
    expect(internalGrantBlock).toContain(
      "public.create_open_house_registration(uuid,integer,text,text,text,text,text,boolean,boolean,boolean)",
    );
    expect(internalGrantBlock).toContain(
      "public.create_open_house_registration_for_user(uuid,uuid,integer,text,text,text,text,text,boolean,boolean,boolean)",
    );
    expect(appFacingGrantBlock).not.toContain("public.get_open_house_capacity(uuid)");
    expect(appFacingGrantBlock).not.toContain("public.create_open_house_registration");
    expect(futureAdvisorHardeningMigration).not.toContain(
      "must remain callable for signed-in registration flow",
    );
  });

  it("restricts legacy onboarding role RPCs that are no longer client-facing", () => {
    expect(legacyOnboardingGrantMigration).toContain(
      "REVOKE ALL ON FUNCTION public.complete_onboarding_role(public.user_role, TEXT, TEXT, TEXT, TEXT)",
    );
    expect(legacyOnboardingGrantMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(legacyOnboardingGrantMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.complete_onboarding_role(public.user_role, TEXT, TEXT, TEXT, TEXT)",
    );
    expect(legacyOnboardingGrantMigration).toContain("REVOKE ALL ON FUNCTION public.get_my_role()");
    expect(legacyOnboardingGrantMigration).toContain("GRANT EXECUTE ON FUNCTION public.get_my_role()");
    expect(legacyOnboardingGrantMigration).toContain(
      "authenticated must not execute public.complete_onboarding_role(...)",
    );
    expect(legacyOnboardingGrantMigration).toContain(
      "authenticated must not execute public.get_my_role()",
    );
  });
});
