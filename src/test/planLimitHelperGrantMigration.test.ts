import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const helperGrantMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602033000_restrict_plan_limit_helper_rpcs.sql"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

const helperSignatures = [
  "public.get_agent_monthly_input_count(uuid)",
  "public.get_ai_call_monthly_limit(uuid,text)",
  "public.get_auction_alert_limit(uuid)",
  "public.get_auction_listing_visible_limit(uuid)",
  "public.get_contact_monthly_limit(uuid)",
  "public.get_listing_limit(uuid)",
  "public.get_open_house_rsvp_monthly_limit(uuid)",
  "public.get_priority_ad_monthly_limit(uuid)",
  "public.get_professionals_per_category_limit(uuid)",
  "public.get_report_monthly_limit(uuid)",
  "public.get_saved_search_limit(uuid)",
  "public.get_search_alert_limit(uuid)",
  "public.get_valuation_monthly_limit(uuid)",
  "public.get_viewing_limit(uuid,boolean)",
];

describe("plan/quota helper RPC grant hardening", () => {
  it("removes browser-role execution from helper-only plan limit functions", () => {
    for (const signature of helperSignatures) {
      expect(helperGrantMigration).toContain(signature);
    }

    expect(helperGrantMigration).toContain(
      "REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated",
    );
    expect(helperGrantMigration).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(helperGrantMigration).toContain(
      "plan/quota helper RPC remains browser-executable",
    );
    expect(helperGrantMigration).toContain(
      "plan/quota helper RPC must remain service-callable",
    );
  });

  it("keeps only the listing quota wrapper callable for remaining browser flows", () => {
    expect(helperGrantMigration).toContain("public.check_listing_quota()");
    expect(helperGrantMigration).toContain(
      "app-facing quota wrapper must remain authenticated-callable",
    );
  });

  it("keeps the future advisor-hardening migration aligned for fresh database builds", () => {
    for (const signature of helperSignatures) {
      expect(futureAdvisorHardeningMigration).toContain(signature);
    }

    expect(futureAdvisorHardeningMigration).toContain(
      "internal SECURITY DEFINER function remains API-executable",
    );
    const appFacingGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
      futureAdvisorHardeningMigration.indexOf("-- 4. Public buckets"),
    );
    expect(appFacingGrantBlock).not.toContain("public.get_ai_call_monthly_limit(uuid,text)");
    expect(appFacingGrantBlock).not.toContain("public.check_ai_quota(text)");
    expect(appFacingGrantBlock).not.toContain("public.get_listing_limit(uuid)");
  });
});
