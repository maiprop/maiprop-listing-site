import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260514180443_high_trust_role_invite_activation.sql"),
  "utf8",
);

describe("high-trust role and invite activation migration", () => {
  it("limits self-service onboarding to non-approval-gated roles", () => {
    expect(migration).toContain("p_participant_type NOT IN ('buyer','seller','professional')");
    expect(migration).toContain("'buyer'::public.user_role");
    expect(migration).toContain("'seller'::public.user_role");
    expect(migration).toContain("'professional'::public.user_role");
    expect(migration).not.toContain("'agent'::public.user_role,\n    'developer'::public.user_role");
  });

  it("records approved invite subscriptions as pending payment instead of active", () => {
    expect(migration).toContain("CHECK (status IN ('active', 'cancelled', 'expired', 'trial', 'pending_payment'))");
    expect(migration).toContain("v_subscription_status TEXT := 'pending_payment'");
    expect(migration).not.toContain("status = 'active'");
    expect(migration).not.toContain("VALUES (\n    v_request.user_id,\n    v_tier,\n    'active'");
  });

  it("does not update the profile role during invitation approval", () => {
    const invitationWorkflow = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.admin_review_invitation_request"),
    );
    expect(invitationWorkflow).not.toContain("UPDATE public.profiles");
    expect(invitationWorkflow).toContain("profile_not_found");
  });
});
