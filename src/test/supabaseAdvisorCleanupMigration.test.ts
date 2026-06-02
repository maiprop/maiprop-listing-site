import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const advisorCleanupMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260526152558_restrict_trigger_function_rpc_exposure.sql"),
  "utf8",
);
const agentDataInputsMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260703000000_agent_data_inputs.sql"),
  "utf8",
);
const closingDateTriggerMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260703130000_closing_date_check_to_trigger.sql"),
  "utf8",
);
const savedSearchCronMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707130000_fix_cron_and_open_house_notify_wiring.sql"),
  "utf8",
);
const liveAdvisorSecurityMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);
const mediaOwnerRlsMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707143000_consolidate_public_media_rls.sql"),
  "utf8",
);

describe("Supabase advisor cleanup migration", () => {
  it("revokes trigger-only security definer functions from API roles without touching public RPCs", () => {
    expect(advisorCleanupMigration).toContain("'public.handle_new_user()'");
    expect(advisorCleanupMigration).toContain("'public.guard_open_house_registration_insert()'");
    expect(advisorCleanupMigration).toContain("'public.profiles_guard_account_moderation()'");
    expect(advisorCleanupMigration).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated");
    expect(advisorCleanupMigration).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(advisorCleanupMigration).not.toContain("public.get_open_house_capacity");
    expect(advisorCleanupMigration).not.toContain("public.submit_agent_data_input");
  });

  it("keeps future-applied migrations aligned for fresh database builds", () => {
    expect(advisorCleanupMigration).toContain("ALTER FUNCTION %s SET search_path = public");
    expect(agentDataInputsMigration).toContain(
      "RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path = public AS $$",
    );
    expect(closingDateTriggerMigration).toContain(
      "REVOKE ALL ON FUNCTION public.agent_data_inputs_validate_closing_date() FROM PUBLIC, anon, authenticated",
    );
    expect(savedSearchCronMigration).toContain(
      "REVOKE ALL ON FUNCTION public.invoke_send_saved_search_alerts_cron() FROM PUBLIC, anon, authenticated",
    );
  });

  it("hardens the current live advisor findings after the applied future migration chain", () => {
    expect(liveAdvisorSecurityMigration).toContain("public.agent_data_input_discount_pct_per_input()");
    expect(liveAdvisorSecurityMigration).toContain(
      "'public.handle_new_user()'",
    );
    expect(liveAdvisorSecurityMigration).toContain(
      "'public.admin_review_agent_data_input(uuid,text,text,boolean,uuid)'",
    );
    expect(liveAdvisorSecurityMigration).toContain(
      "REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated",
    );
    expect(liveAdvisorSecurityMigration).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(liveAdvisorSecurityMigration).not.toContain(
      "GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role",
    );
    expect(liveAdvisorSecurityMigration).toContain(
      'DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects',
    );
    expect(liveAdvisorSecurityMigration).toContain(
      'DROP POLICY IF EXISTS "Listing images are publicly accessible" ON storage.objects',
    );
    expect(liveAdvisorSecurityMigration).toContain(
      "(SELECT current_setting('request.jwt.claims', true))",
    );
    expect(liveAdvisorSecurityMigration).not.toContain("intentionally remains anon-callable");
  });

  it("removes duplicate public-read RLS evaluation without removing owner writes", () => {
    expect(mediaOwnerRlsMigration).toContain(
      'DROP POLICY IF EXISTS "listing_images_owner" ON public.listing_images',
    );
    expect(mediaOwnerRlsMigration).toContain('CREATE POLICY "listing_images_owner_insert"');
    expect(mediaOwnerRlsMigration).toContain('CREATE POLICY "listing_images_owner_update"');
    expect(mediaOwnerRlsMigration).toContain('CREATE POLICY "listing_images_owner_delete"');
    expect(mediaOwnerRlsMigration).toContain(
      'DROP POLICY IF EXISTS "project_media_owner" ON public.project_media',
    );
    expect(mediaOwnerRlsMigration).toContain(
      'DROP POLICY IF EXISTS "project_units_owner" ON public.project_units',
    );
    expect(mediaOwnerRlsMigration).toContain(
      'DROP POLICY IF EXISTS "open_house_settings_owner" ON public.open_house_settings',
    );
    expect(mediaOwnerRlsMigration).not.toContain("FOR SELECT");
  });
});
