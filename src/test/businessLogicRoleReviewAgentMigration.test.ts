import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const roleReviewMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260525082517_business_logic_role_review_agent_fixes.sql"),
  "utf8",
);
const professionalReviewMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260605120000_professional_reviews.sql"),
  "utf8",
);
const rlsPerformanceMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260604120000_performance_rls_initplan_and_dedup.sql"),
  "utf8",
);
const agentBaseMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260703000000_agent_data_inputs.sql"),
  "utf8",
);
const agentReviewMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260703120000_agent_data_inputs.sql"),
  "utf8",
);
const agentQuotaMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707020000_serialize_agent_data_input_quota.sql"),
  "utf8",
);

describe("business logic role/review/agent hardening migration", () => {
  it("cleans up role-switch dependencies and blocks live commitments", () => {
    expect(roleReviewMigration).toContain("active_firesale_commitment_blocks_role_switch");
    expect(roleReviewMigration).toContain("accepted_open_house_offer_blocks_role_switch");
    expect(roleReviewMigration).toContain("public.release_expired_firesale_reservations(NULL)");
    expect(roleReviewMigration).toContain("status = 'paused'::public.listing_status");
    expect(roleReviewMigration).toContain("closed_reason = 'role_switch'");
    expect(rlsPerformanceMigration).toContain("c.closed_at IS NULL");
    expect(roleReviewMigration).toContain("public.open_house_registrations");
    expect(roleReviewMigration).toContain("public.viewings");
    expect(roleReviewMigration).toContain("public.leads");
    expect(roleReviewMigration).toContain("public.contacts");
  });

  it("gates professional reviews, enables moderation, notifications, and responses", () => {
    expect(professionalReviewMigration).toContain("CREATE OR REPLACE FUNCTION public.can_review_professional");
    expect(professionalReviewMigration).toContain("cr.status = 'completed'");
    expect(professionalReviewMigration).toContain("reviewer_must_match_authenticated_user");
    expect(professionalReviewMigration).toContain("reviews_admin_delete");
    expect(professionalReviewMigration).toContain("private.notify_professional_review_created");
    expect(professionalReviewMigration).toContain("CREATE TABLE IF NOT EXISTS public.professional_review_responses");
    expect(professionalReviewMigration).toContain("RETURN COALESCE(NEW, OLD)");
  });

  it("keeps agent data input semantics consistent across client and admin RPCs", () => {
    expect(agentBaseMigration).toContain("discount_pct");
    expect(agentBaseMigration).toContain("p_lifetime_ban BOOLEAN DEFAULT FALSE");
    expect(agentReviewMigration).toContain("reject_and_ban");
    expect(agentQuotaMigration).toContain("p_agent_side TEXT DEFAULT 'seller'");
    expect(agentQuotaMigration).toContain("public.agent_data_input_discount_pct_per_input()");
  });
});
