import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serviceRoleSwitchMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602043000_add_service_begin_role_switch_rpc.sql"),
  "utf8",
);

const legacyRevokeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602044000_restrict_legacy_begin_role_switch_rpc.sql"),
  "utf8",
);

const roleSwitchPreflightMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260629142237_add_role_switch_preflight_rpc.sql"),
  "utf8",
);

const beginRoleSwitchFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/begin-role-switch/index.ts"),
  "utf8",
);

const settingsSection = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/SettingsSection.tsx"),
  "utf8",
);

const onboardingPage = readFileSync(
  resolve(process.cwd(), "src/pages/Onboarding.tsx"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

describe("begin role switch grant hardening", () => {
  it("adds a service-role-only explicit-user begin role switch RPC", () => {
    expect(serviceRoleSwitchMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.begin_role_switch_for_user",
    );
    expect(serviceRoleSwitchMigration).toContain("_user_id UUID");
    expect(serviceRoleSwitchMigration).toContain(
      "REVOKE ALL ON FUNCTION public.begin_role_switch_for_user(UUID)",
    );
    expect(serviceRoleSwitchMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.begin_role_switch_for_user(UUID)",
    );
    expect(serviceRoleSwitchMigration).toContain(
      "public.begin_role_switch_for_user(uuid) must not be browser-callable",
    );
  });

  it("removes browser-role execution from the legacy caller-context role switch RPC", () => {
    expect(legacyRevokeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.begin_role_switch()",
    );
    expect(legacyRevokeMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.begin_role_switch()",
    );
    expect(legacyRevokeMigration).toContain(
      "public.begin_role_switch() must not remain browser-callable",
    );
  });

  it("routes browser role switches through the authenticated Edge Function", () => {
    expect(settingsSection).not.toContain('"begin-role-switch"');
    expect(settingsSection).not.toContain('"log-role-switch"');
    expect(onboardingPage).toContain('"begin-role-switch"');
    expect(onboardingPage).toContain('"log-role-switch"');
    expect(settingsSection).not.toContain('rpc("begin_role_switch"');
    expect(beginRoleSwitchFunction).toContain("verifyBearerToken");
    expect(beginRoleSwitchFunction).toContain('"validate_role_switch_for_user"');
    expect(beginRoleSwitchFunction).toContain('"begin_role_switch_for_user"');
    expect(beginRoleSwitchFunction).toContain("_user_id: user.id");
  });

  it("adds a service-role-only preflight RPC before Stripe cancellation", () => {
    expect(roleSwitchPreflightMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.validate_role_switch_for_user",
    );
    expect(roleSwitchPreflightMigration).toContain(
      "active_firesale_commitment_blocks_role_switch",
    );
    expect(roleSwitchPreflightMigration).toContain(
      "accepted_open_house_offer_blocks_role_switch",
    );
    expect(roleSwitchPreflightMigration).not.toContain(
      "public.release_expired_firesale_reservations(NULL)",
    );
    expect(roleSwitchPreflightMigration).toContain(
      "REVOKE ALL ON FUNCTION public.validate_role_switch_for_user(UUID)",
    );
    expect(roleSwitchPreflightMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.validate_role_switch_for_user(UUID)",
    );
    expect(onboardingPage).toContain("validate_only: true");
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

    expect(internalGrantBlock).toContain("public.begin_role_switch()");
    expect(internalGrantBlock).toContain("public.begin_role_switch_for_user(uuid)");
    expect(appFacingGrantBlock).not.toContain("public.begin_role_switch()");
  });
});
