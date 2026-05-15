import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("critical business invariants", () => {
  it("binds checkout and webhook entitlements to role-specific pricing products", () => {
    const checkout = read("supabase/functions/create-checkout/index.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");
    const hardening = read("supabase/migrations/20260707040000_ai_reports_signed_in_quota.sql");

    expect(checkout).toContain('developer_pro: { audience: "developer", role: "developer" }');
    expect(checkout).toContain("isCheckoutAudienceAllowed");
    expect(checkout).toContain(".eq(\"key\", planKey)");
    expect(checkout).toContain("stripe_product_id");

    expect(webhook).toContain("resolveSubscriptionEntitlement");
    expect(webhook).toContain("matchesProductOrPrice");
    expect(webhook).toContain("candidate.key === metadataPlan");
    expect(webhook).toContain("plan_key: entitlement?.planKey");

    expect(hardening).toContain("CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)");
    expect(hardening).toContain("public.pro_product_ids pp");
    expect(hardening).toContain("ON pp.product_id = p.subscription_product_id");
  });

  it("keeps invite-only investor access out of direct checkout and self-service onboarding", () => {
    const checkout = read("supabase/functions/create-checkout/index.ts");
    const onboarding = read("supabase/functions/complete-onboarding-role/index.ts");
    const invitation = read("supabase/migrations/20260514180443_high_trust_role_invite_activation.sql");
    const activation = read("supabase/migrations/20260514190054_activate_high_trust_profile_roles_from_paid_subscriptions.sql");

    expect(checkout).toContain("INVITE_ONLY_PLAN_KEYS");
    expect(checkout).toContain('"investor_private"');
    expect(checkout).toContain('"investor_institutional"');
    expect(checkout).toContain("blocked invite-only plan checkout attempt");
    expect(checkout).toContain("This plan is invitation-only. Apply for access before checkout.");

    expect(onboarding).toContain("SELF_SERVICE_ROLES");
    expect(onboarding).not.toContain('"investor", "institutional"');

    expect(invitation).toContain("v_subscription_status TEXT := 'pending_payment'");
    expect(activation).toContain("sync_profile_role_from_investor_subscription");
    expect(activation).toContain("NEW.status NOT IN ('active', 'trial')");
  });

  it("enforces signed-in AI quota for costly public AI endpoints", () => {
    for (const path of [
      "supabase/functions/ai-search/index.ts",
      "supabase/functions/smart-filters/index.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("enforceAiQuota(req");
      expect(source).toContain("recordAiCall");
      expect(source).toContain("failClosed: true");
    }

    const translate = read("supabase/functions/ai-translate/index.ts");
    expect(translate).toContain("requireAuthenticatedUser(req");
    expect(translate).toContain("MAX_TRANSLATION_KEYS");
    expect(translate).not.toContain("raw: cleaned.slice");
  });

  it("keeps open-house registration, attendance, and offer state enforced in the database", () => {
    const registration = read("supabase/migrations/20260515092259_open_house_registration_contact_verification.sql");
    const registrationGuard = read("supabase/migrations/20260514185213_harden_open_house_registration_updates.sql");
    const offers = read("supabase/migrations/20260514142236_harden_open_house_offer_workflow.sql");

    expect(registration).toContain("open_house_contact_name_required");
    expect(registration).toContain("open_house_contact_email_required");
    expect(registration).toContain("open_house_contact_phone_required");
    expect(registration).toContain("open_house_id_verification_consent_required");

    expect(registrationGuard).toContain("host_controlled_open_house_fields");
    expect(registrationGuard).toContain("requester_can_only_cancel_registration");

    expect(offers).toContain("idx_open_house_one_accepted_offer_per_listing");
    expect(offers).toContain("submit_open_house_offer");
    expect(offers).toContain("accept_open_house_offer");
    expect(offers).toContain("pg_advisory_xact_lock(hashtext(v_offer.listing_id::text))");
  });

  it("serializes firesale reservations and account erasure covers proof documents", () => {
    const firesale = read("supabase/migrations/20260514150000_firesale_interest_reservation_workflow.sql");
    const deleteAccount = read("supabase/functions/delete-account/index.ts");
    const deleteAccountTest = read("supabase/functions/delete-account/index.test.ts");

    expect(firesale).toContain("pg_advisory_xact_lock(hashtext(NEW.deal_id::text))");
    expect(firesale).toContain("active_reservation_exists_for_deal");
    expect(firesale).toContain("admin_update_firesale_interest_workflow");

    expect(deleteAccount).toContain('"open-house-docs"');
    expect(deleteAccount).toContain("USER_FOLDER_BUCKETS");
    expect(deleteAccount).toContain("removeFolderRecursive");
    expect(deleteAccountTest).toContain("open-house-docs");
  });
});
