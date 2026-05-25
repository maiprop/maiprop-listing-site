import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260525081328_admin_cross_user_workflow_fixes.sql"),
  "utf8",
);

describe("admin cross-user workflow migration", () => {
  it("moves Quick Sale seller and reservation notifications into admin RPCs", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.admin_update_firesale_pipeline_deal");
    expect(migration).toContain("'firesale_pipeline'");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.admin_set_firesale_investor_publication");
    expect(migration).toContain("'Quick Sale reservation cancelled'");
    expect(migration).toContain("status = 'expired'");
  });

  it("notifies admin decisions for POF, professional verification, featured ads, and subscriptions", () => {
    expect(migration).toContain("private.notify_open_house_pof_status_change");
    expect(migration).toContain("trg_open_house_pof_notify");
    expect(migration).toContain("private.notify_professional_verification_change");
    expect(migration).toContain("trg_professional_verification_notify");
    expect(migration).toContain("private.notify_featured_listing_change");
    expect(migration).toContain("trg_featured_listing_notify");
    expect(migration).toContain("private.notify_investor_subscription_status_change");
    expect(migration).toContain("investor_mode = false");
  });

  it("adds admin broadcast and moderation capabilities", () => {
    expect(migration).toContain("public.admin_broadcast_notification");
    expect(migration).toContain("public.admin_suspend_reported_listing");
    expect(migration).toContain("public.admin_ban_reported_content_owner");
    expect(migration).toContain("account_status = 'banned'");
    expect(migration).toContain("profiles_guard_account_moderation");
  });
});
