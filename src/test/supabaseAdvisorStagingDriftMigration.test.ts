import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260707159000_fix_staging_advisor_drift.sql",
  "utf8",
);

const advisorPolicy = JSON.parse(
  readFileSync("scripts/supabase-advisor-debt-policy.json", "utf8"),
) as {
  review: Array<{
    match?: {
      name?: string;
      cache_key_contains?: string;
    };
    owner?: string;
    reason?: string;
    next_action?: string;
    review_cadence?: string;
  }>;
};

const appliedFutureMigrations = JSON.parse(
  readFileSync("scripts/applied-future-migrations.json", "utf8"),
) as Array<{ version: string }>;

const appliedFutureMigrationVersions = appliedFutureMigrations.map((entry) => entry.version);

describe("staging Supabase advisor drift hardening", () => {
  it("indexes the marketing_leads owner foreign key added for clean replays", () => {
    expect(migration).toContain("idx_marketing_leads_owner_id");
    expect(migration).toContain("ON public.marketing_leads (owner_id)");
    expect(migration).toContain("marketing_leads.owner_id foreign key must have a supporting index");
  });

  it("removes browser execute grants from internal no-arg security-definer helpers", () => {
    const assertionBlock = migration
      .match(/DO \$\$[\s\S]*?log_user_role_change must not be browser-executable[\s\S]*?END \$\$;/)
      ?.at(0);

    expect(migration).toContain("public.log_user_role_change()");
    expect(migration).toContain("public.rls_auto_enable()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("log_user_role_change must not be browser-executable");
    expect(migration).toContain("rls_auto_enable must not be browser-executable");
    expect(assertionBlock).toContain("DECLARE");
    expect(assertionBlock).toContain("log_user_role_change_fn regprocedure");
    expect(assertionBlock).toContain("rls_auto_enable_fn regprocedure");
    expect(assertionBlock).toContain(
      "has_function_privilege('anon', log_user_role_change_fn, 'EXECUTE')",
    );
    expect(assertionBlock).toContain(
      "has_function_privilege('anon', rls_auto_enable_fn, 'EXECUTE')",
    );
  });

  it("recreates simple user-owned policies with cached auth lookups", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Users can view their own roles"');
    expect(migration).toContain("USING (user_id = (SELECT auth.uid()))");
    expect(migration).toContain('DROP POLICY IF EXISTS "Users manage own private owner alerts"');
    expect(migration).toContain("WITH CHECK (user_id = (SELECT auth.uid()))");
    expect(migration).toContain("AND (SELECT private.check_listing_quota())");
  });

  it("classifies only the known app-facing advisor items with owners and review cadence", () => {
    const expectedCacheKeySnippets = [
      "public_get_open_house_capacity",
      "public_submit_agent_data_input",
      "realtime_messages_video_room_channel",
      "public_listings_listing_insert_quota",
    ];

    for (const snippet of expectedCacheKeySnippets) {
      const entry = advisorPolicy.review.find(
        (item) => item.match?.cache_key_contains === snippet,
      );
      expect(entry, snippet).toBeTruthy();
      expect(entry?.owner).toBeTruthy();
      expect(entry?.reason).toBeTruthy();
      expect(entry?.next_action).toBeTruthy();
      expect(entry?.review_cadence).toBeTruthy();
    }
  });

  it("keeps the migration ordered after the existing applied future-dated hardening chain", () => {
    expect(appliedFutureMigrationVersions).toContain("20260707159000");
    expect(appliedFutureMigrationVersions).toContain("20260707170000");
    expect(appliedFutureMigrationVersions).toContain("20260707172000");
    expect(
      appliedFutureMigrationVersions.indexOf("20260707159000"),
    ).toBeGreaterThan(appliedFutureMigrationVersions.indexOf("20260707158000"));
    expect(
      appliedFutureMigrationVersions.indexOf("20260707170000"),
    ).toBeGreaterThan(appliedFutureMigrationVersions.indexOf("20260707169000"));
    expect(
      appliedFutureMigrationVersions.indexOf("20260707172000"),
    ).toBeGreaterThan(appliedFutureMigrationVersions.indexOf("20260707170000"));
  });
});
