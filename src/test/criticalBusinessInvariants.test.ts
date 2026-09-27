import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const readCheckoutSource = () =>
  [
    "supabase/functions/create-checkout/index.ts",
    "supabase/functions/create-checkout/constants.ts",
    "supabase/functions/create-checkout/pricing.ts",
    "supabase/functions/create-checkout/stripeCustomers.ts",
  ].map(read).join("\n");

describe("critical business invariants", () => {
  it("binds checkout and webhook entitlements to role-specific pricing products", () => {
    const checkout = readCheckoutSource();
    const webhook = read("supabase/functions/stripe-webhook/index.ts");
    const hardening = read("supabase/migrations/20260707070000_audience_scoped_pro_entitlements.sql");
    const lifecycle = read("supabase/migrations/20260525171000_subscription_lifecycle_grace_and_lapse.sql");
    const grants = read("supabase/migrations/20260707060000_explicit_data_api_grants.sql");
    const authContext = read("src/contexts/AuthContext.tsx");
    const authSourceSurface = [
      authContext,
      read("src/contexts/authContextSupport.ts"),
    ].join("\n");

    expect(checkout).toContain('developer_pro: { audience: "developer", role: "developer" }');
    expect(checkout).toContain("isCheckoutAudienceAllowed");
    expect(checkout).toContain(".eq(\"key\", planKey)");
    expect(checkout).toContain("stripe_product_id");

    expect(webhook).toContain("resolveSubscriptionEntitlement");
    expect(webhook).toContain("matchesProductOrPrice");
    expect(webhook).toContain("candidate.key === metadataPlan");
    expect(webhook).toContain("plan_key: entitlement?.planKey");

    expect(hardening).toContain("CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)");
    expect(hardening).toContain("SELECT p.force_pro_access");
    expect(hardening).toContain("public.has_audience_scoped_pro_entitlement(p_user_id)");
    expect(hardening).toContain("pc.audience = public.profile_pricing_audience");
    expect(hardening).toContain("pc.key = ANY (ARRAY['pro', 'agent_basic', 'developer_pro', 'professional_basic'])");
    expect(hardening).toContain(
      "pc.module = ANY (ARRAY['user_subscription', 'agent_subscription', 'developer_subscription', 'professional_subscription'])",
    );
    expect(hardening).toContain("pc.metadata->>'stripe_product_id' = p.subscription_product_id");
    expect(hardening).not.toContain("JOIN public.pro_product_ids pp");
    expect(lifecycle).toContain("SELECT p.force_pro_access");
    expect(lifecycle).toContain("public.apply_subscription_lapse_controls");

    expect(grants).toContain("authenticated must not update public.profiles.force_pro_access");
    expect(authSourceSurface).toContain("force_pro_access");
    expect(authContext).toContain("const ALLOWED_FIELDS");
    expect(authContext).toContain("Privileged account fields");
    expect(authContext).not.toContain('"force_pro_access",');
    expect(authContext).not.toContain('"subscription_product_id",');
    expect(authContext).not.toContain('"is_platform_admin",');
  });

  it("keeps invite-only investor access out of direct checkout and self-service onboarding", () => {
    const checkout = readCheckoutSource();
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

  it("does not claim mock checkout creates a live paid entitlement", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const billing = read("src/pages/dashboard/BillingTab.tsx");
    const checkout = read("supabase/functions/create-checkout/index.ts");

    expect(checkout).toContain("withMockBillingParams");
    expect(checkout).toContain('mode: "mock"');
    expect(pricing).toContain('const billingMode = searchParams.get("billing_mode")');
    expect(pricing).toContain('billingMode === "mock"');
    expect(pricing).toContain("Mock checkout completed. No live payment or subscription entitlement was created.");
    expect(billing).toContain('searchParams.get("billing_mode") === "mock"');
    expect(billing).toContain("Mock add-on checkout completed. No live payment or add-on entitlement was created.");
  });

  it("keeps Stripe payment recovery from revoking Pro before terminal lapse", () => {
    const webhook = read("supabase/functions/stripe-webhook/index.ts");
    const checkSubscription = read("supabase/functions/check-subscription/index.ts");
    const statusPolicy = read("supabase/functions/_shared/subscriptionStatus.ts");

    expect(statusPolicy).toContain('"past_due"');
    expect(statusPolicy).toContain("PROVISIONED_ACCESS_STATUSES");
    expect(webhook).toContain('case "invoice.payment_failed"');
    expect(webhook).toContain('"invoice.payment_failed"');
    expect(webhook).toContain("syncInvoiceSubscription(");
    expect(webhook).toContain("hasProvisionedSubscriptionAccess(sub.status)");
    expect(webhook).toContain("shouldRevokeSubscriptionAccess(sub.status)");
    expect(webhook).toContain("apply_subscription_lapse_controls");
    expect(checkSubscription).toContain("hasProvisionedSubscriptionAccess(status)");
  });

  it("enforces signed-in AI quota for costly public AI endpoints", () => {
    for (const path of [
      "supabase/functions/ai-search/index.ts",
      "supabase/functions/smart-filters/index.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("enforceAiQuota(req");
      expect(source).toContain("if (quota.errorResponse) return quota.errorResponse");
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
    const registrationCapacity = read("supabase/migrations/20260515200905_serialize_open_house_registration_capacity.sql");
    const offers = read("supabase/migrations/20260514142236_harden_open_house_offer_workflow.sql");
    const wiring = read("supabase/migrations/20260707130000_fix_cron_and_open_house_notify_wiring.sql");

    expect(registration).toContain("open_house_contact_name_required");
    expect(registration).toContain("open_house_contact_email_required");
    expect(registration).toContain("open_house_contact_phone_required");
    expect(registration).toContain("open_house_id_verification_consent_required");

    expect(registrationGuard).toContain("host_controlled_open_house_fields");
    expect(registrationGuard).toContain("requester_can_only_cancel_registration");

    expect(registrationCapacity).toContain("create_open_house_registration");
    expect(registrationCapacity).toContain("pg_advisory_xact_lock");
    expect(registrationCapacity).toContain("open_house_total_capacity_reached");
    expect(registrationCapacity).toContain("open_house_timeslot_capacity_reached");
    expect(registrationCapacity).toContain("guard_open_house_registration_insert");
    expect(registrationCapacity).toContain("use_create_open_house_registration_rpc");

    expect(offers).toContain("idx_open_house_one_accepted_offer_per_listing");
    expect(offers).toContain("submit_open_house_offer");
    expect(offers).toContain("accept_open_house_offer");
    expect(offers).toContain("pg_advisory_xact_lock(hashtext(v_offer.listing_id::text))");

    expect(wiring).toContain("WEBHOOK_SECRET");
    expect(wiring).toContain("CREATE OR REPLACE FUNCTION public.notify_oh_registration_status_change()");
    expect(wiring).toContain("DROP TRIGGER IF EXISTS trg_oh_registration_notify");
    expect(wiring).toContain("CREATE TRIGGER trg_oh_registration_notify");
    expect(wiring).toContain("AFTER UPDATE OF status ON public.open_house_registrations");
    expect(wiring).toContain("'Authorization', 'Bearer ' || v_webhook_secret");
    expect(wiring).toContain("v_supabase_url");
    expect(wiring).toContain("rtrim(v_supabase_url, '/') || '/functions/v1/oh-registration-notify'");
    expect(wiring).not.toContain("qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/oh-registration-notify");
  });

  it("keeps remaining plan limits and listing lifecycle effects enforced server-side", () => {
    const enforcement = read("supabase/migrations/20260525071300_enforce_remaining_plan_limits_and_listing_lifecycle.sql");

    expect(enforcement).toContain("CREATE OR REPLACE FUNCTION public.get_contact_monthly_limit");
    expect(enforcement).toContain("NULLIF(p.participant_type::TEXT, '')");
    expect(enforcement).toContain("CREATE OR REPLACE FUNCTION private.count_monthly_property_contact_threads");
    expect(enforcement).toContain("first_message.sender_id = p_user_id");
    expect(enforcement).toContain("hashtextextended('contact_limit:'");
    expect(enforcement).toContain("CREATE TRIGGER trg_check_conversation_contact_monthly_limit");
    expect(enforcement).toContain("CREATE TRIGGER trg_check_message_contact_monthly_limit");
    expect(enforcement).toContain("contact_limit_reached");

    expect(enforcement).toContain("CREATE OR REPLACE FUNCTION public.get_open_house_rsvp_monthly_limit");
    expect(enforcement).toContain("CREATE TRIGGER trg_check_open_house_rsvp_monthly_limit");
    expect(enforcement).toContain("hashtextextended('open_house_rsvp:'");
    expect(enforcement).toContain("open_house_rsvp_limit_reached");

    expect(enforcement).toContain("CREATE OR REPLACE FUNCTION private.notify_favorite_price_drop");
    expect(enforcement).toContain("CREATE TRIGGER listing_price_drop_notify_favorites");
    expect(enforcement).toContain("'price_alert'");
    expect(enforcement).toContain("WHEN NEW.listing_type = 'auction' THEN '/auction/' || NEW.id::TEXT");

    expect(enforcement).toContain("CREATE OR REPLACE FUNCTION private.handle_listing_terminal_status");
    expect(enforcement).toContain("CREATE TRIGGER listing_terminal_status_lifecycle");
    expect(enforcement).toContain("UPDATE public.viewings v");
    expect(enforcement).toContain("UPDATE public.open_house_registrations r");
    expect(enforcement).toContain("Saved listing update");
  });

  it("keeps scheduled saved-search alerts authenticated or unscheduled", () => {
    const wiring = read("supabase/migrations/20260707130000_fix_cron_and_open_house_notify_wiring.sql");
    const edgeFunction = read("supabase/functions/send-saved-search-alerts/index.ts");

    expect(edgeFunction).toContain("verifyCronSecret");
    expect(edgeFunction).toContain("Authorization");
    expect(edgeFunction).toContain("CRON_SECRET not configured, rejecting request");

    expect(wiring).toContain("CRON_SECRET");
    expect(wiring).toContain("CREATE OR REPLACE FUNCTION public.invoke_send_saved_search_alerts_cron()");
    expect(wiring).toContain("cron.unschedule('send-saved-search-alerts')");
    expect(wiring).toContain("skipping saved-search alert cron invocation");
    expect(wiring).toContain("cron.schedule(");
    expect(wiring).toContain("SELECT public.invoke_send_saved_search_alerts_cron();");
    expect(wiring).toContain("'Authorization', 'Bearer ' || v_cron_secret");
    expect(wiring).toContain("v_supabase_url");
    expect(wiring).toContain("rtrim(v_supabase_url, '/') || '/functions/v1/send-saved-search-alerts'");
    expect(wiring).not.toContain("qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/send-saved-search-alerts");
    expect(wiring).not.toContain("scheduled WITHOUT auth header");
  });

  it("keeps the daily OS auction cron private and bearer-authenticated", () => {
    const wiring = read("supabase/migrations/20260603174928_standardize_daily_auction_pool_sync.sql");
    const timeoutHardening = read("supabase/migrations/20260603201131_increase_poll_os_auctions_cron_timeout.sql");
    const edgeFunction = read("supabase/functions/poll-os-auctions/index.ts");

    expect(edgeFunction).toContain("isCronBearerRequest");
    expect(edgeFunction).toContain('req.method !== "POST"');
    expect(edgeFunction).toContain("getBearerToken(req)");
    expect(edgeFunction).toContain("getActiveDailyPoolCount");
    expect(edgeFunction).toContain("pruneUnselectedDailyPoolRows");
    expect(edgeFunction).toContain("trimDailyPoolToLatest");
    expect(edgeFunction).not.toContain("x-maiprop-cron");
    expect(edgeFunction).not.toContain("x-forwarded-for\")?.split");

    expect(wiring).toContain("CREATE SCHEMA IF NOT EXISTS private");
    expect(wiring).toContain("DROP FUNCTION IF EXISTS public.invoke_poll_os_auctions_cron()");
    expect(wiring).toContain("CREATE OR REPLACE FUNCTION private.invoke_poll_os_auctions_cron()");
    expect(wiring).toContain("REVOKE ALL ON FUNCTION private.invoke_poll_os_auctions_cron() FROM PUBLIC, anon, authenticated");
    expect(wiring).toContain("SELECT private.invoke_poll_os_auctions_cron();");
    expect(wiring).toContain("'Authorization', 'Bearer ' || v_cron_secret");
    expect(wiring).not.toContain("SELECT public.invoke_poll_os_auctions_cron();");
    expect(wiring).not.toContain("scheduled WITHOUT auth header");

    expect(timeoutHardening).toContain("CREATE OR REPLACE FUNCTION private.invoke_poll_os_auctions_cron()");
    expect(timeoutHardening).toContain("timeout_milliseconds := 120000");
    expect(timeoutHardening).toContain("REVOKE ALL ON FUNCTION private.invoke_poll_os_auctions_cron() FROM PUBLIC, anon, authenticated");
  });

  it("serializes firesale reservations and account erasure covers proof documents", () => {
    const firesale = read("supabase/migrations/20260514150000_firesale_interest_reservation_workflow.sql");
    const firesaleVisibility = read("supabase/migrations/20260518000000_quick_sale_eligible_buyers_only.sql");
    const deleteAccount = read("supabase/functions/delete-account/index.ts");
    const deleteAccountTest = read("supabase/functions/delete-account/index.test.ts");

    expect(firesale).toContain("pg_advisory_xact_lock(hashtext(NEW.deal_id::text))");
    expect(firesale).toContain("active_reservation_exists_for_deal");
    expect(firesale).toContain("admin_update_firesale_interest_workflow");
    expect(firesale).toContain("investor_cannot_change_admin_managed_fields");
    expect(firesale).toContain("invalid_investor_status_transition");

    expect(firesaleVisibility).toContain("Eligible buyers view published Quick Sale deals");
    expect(firesaleVisibility).toContain("published_to_investors = true");
    expect(firesaleVisibility).toContain("public.investor_subscriptions");
    expect(firesaleVisibility).toContain("status IN ('active', 'trial')");

    expect(deleteAccount).toContain('"open-house-docs"');
    expect(deleteAccount).toContain('"firesale-proof-docs"');
    expect(deleteAccount).toContain("USER_FOLDER_BUCKETS");
    expect(deleteAccount).toContain("removeFolderRecursive");
    expect(deleteAccountTest).toContain("open-house-docs");
    expect(deleteAccountTest).toContain("firesale-proof-docs");
  });

  it("keeps account deletion UX, privacy terms, and lifecycle coverage aligned", () => {
    const settings = read("src/components/dashboard/SettingsSection.tsx");
    const privacy = read("src/pages/PrivacyPolicy.tsx");
    const terms = read("src/pages/TermsOfService.tsx");
    const deleteAccount = read("supabase/functions/delete-account/index.ts");
    const gdprE2E = read("e2e/gdpr-delete-account.spec.ts");

    expect(settings).toContain("account-controlled platform data");
    expect(settings).toContain("Privacy Policy");
    expect(settings).toContain("legally required");

    expect(privacy).toContain("Right to Erasure");
    expect(privacy).toContain("overriding legal basis");
    expect(privacy).toContain("Data Retention");

    expect(terms).toContain("You may delete your account at any time");
    expect(terms).toContain("Data retained for legal reasons will be handled as described in our Privacy Policy");

    expect(deleteAccount).toContain("HARD DELETE listings");
    expect(deleteAccount).toContain("stripe.subscriptions.cancel");
    expect(deleteAccount).toContain("auth.admin.deleteUser");

    expect(gdprE2E).toContain("blocks old sign-in");
    expect(gdprE2E).toContain("same email should be reusable after deletion");
    expect(gdprE2E).toContain("recreated auth user should be a fresh account");
    expect(gdprE2E).toContain("waitForURL(/\\/dashboard|\\/onboarding/");
  });

  it("keeps account deletion jobs durable, minimal, and browser read-only", () => {
    const sql = read("supabase/migrations/20260711181306_account_deletion_jobs.sql");

    expect(sql).toMatch(/user_id uuid (?:NOT NULL )?PRIMARY KEY/i);
    expect(sql).not.toMatch(/REFERENCES\s+(?:auth\.users|public\.profiles)/i);
    expect(sql).toContain("stage text NOT NULL");
    expect(sql).toContain("status text NOT NULL");
    expect(sql).toContain("attempt_id uuid NOT NULL");
    expect(sql).toContain("attempts integer NOT NULL");
    expect(sql).toContain("last_error text");
    expect(sql).toContain("requested_at timestamptz NOT NULL");
    expect(sql).toContain("leased_until timestamptz NOT NULL");
    expect(sql).toContain("completed_at timestamptz");
    expect(sql).toContain("ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("GRANT SELECT ON public.account_deletion_jobs TO authenticated");
    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_deletion_jobs TO service_role",
    );
    expect(sql).toContain("FOR SELECT");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("(SELECT auth.uid()) = user_id");
    expect(sql).toContain("attempts = public.account_deletion_jobs.attempts + 1");
    expect(sql).toContain("WHERE public.account_deletion_jobs.status <> 'in_progress'");
    expect(sql).toContain("OR public.account_deletion_jobs.leased_until < now()");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.begin_account_deletion_job(uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.begin_account_deletion_job(uuid) TO service_role",
    );
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.set_account_deletion_job_stage");
    expect(sql).toContain("AND attempt_id = p_attempt_id");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.complete_account_deletion_from_auth_delete()");
    expect(sql).toContain("AFTER DELETE ON auth.users");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.is_account_deletion_active(p_user_id uuid)");
    expect(sql).toContain("DROP TRIGGER IF EXISTS trg_guard_deleted_account_listing_write ON public.listings");
    expect(sql).toContain("DROP TRIGGER IF EXISTS trg_guard_deleted_account_storage_write ON storage.objects");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_account_deletion_storage_objects(p_user_id uuid)");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_account_deletion_storage_objects(uuid)");
    expect(sql).not.toContain("account_deletion_jobs_update");
    expect(sql).not.toContain("account_deletion_jobs_delete");
  });
});
