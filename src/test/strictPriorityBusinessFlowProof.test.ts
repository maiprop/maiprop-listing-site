import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Priority = "immediate" | "near_term" | "long_term";

type BusinessFlow =
  | "ai_quota_live_consumption"
  | "professional_action_gates"
  | "listing_create_edit_media_rls"
  | "open_house_registration_host_approval"
  | "firesale_submit_investor_interest"
  | "checkout_webhook_entitlement_activation"
  | "auction_cap_filter_context"
  | "dashboard_billing_addon_purchase"
  | "booking_video_confirmation"
  | "admin_moderation_approval"
  | "role_tier_matrix_fixtures"
  | "race_concurrency_guards"
  | "recurring_staging_cleanup_artifacts";

type ProofArtifact = {
  file: string;
  snippets: readonly string[];
};

type FlowProof = {
  priority: Priority;
  flow: BusinessFlow;
  businessRule: string;
  artifacts: readonly ProofArtifact[];
};

const proof: readonly FlowProof[] = [
  {
    priority: "immediate",
    flow: "ai_quota_live_consumption",
    businessRule: "Signed-in free users consume capped AI quota; Pro users receive higher paid quota; anonymous users cannot consume costly AI modules.",
    artifacts: [
      {
        file: "src/hooks/useAiQuota.ts",
        snippets: ['"ai-quota-status"', "isAiQuotaReached", "getAiQuotaTierLabel"],
      },
      {
        file: "supabase/functions/_shared/aiUsage.ts",
        snippets: ["startsWith(\"bearer \")", '"reserve_ai_quota_for_user"', "fail-closed"],
      },
      {
        file: "src/test/PropertyMiniMap.test.tsx",
        snippets: ["shows the quota counter and upgrade CTA", "property-pois"],
      },
      {
        file: "src/test/NeighbourhoodReport.test.tsx",
        snippets: ["ai-quota-status", "neighbourhood-report"],
      },
    ],
  },
  {
    priority: "immediate",
    flow: "professional_action_gates",
    businessRule: "Anonymous users must sign in before professional actions; free professional profiles expose contact details only; Pro profiles unlock booking, callback, messaging, services, and portfolio tools.",
    artifacts: [
      {
        file: "src/pages/ProfessionalProfile.tsx",
        snippets: ["requireSignedIn", "openProtectedModal", "Contact details only", "professionalIsPro"],
      },
      {
        file: "src/hooks/useConsultations.ts",
        snippets: ['throw new Error("auth_required")', "requester_id: user.id", "meeting_type"],
      },
      {
        file: "src/test/pages.smoke.test.tsx",
        snippets: ["ProfessionalProfile limits free professional profiles to contact details", "book consultation"],
      },
      {
        file: "src/test/useConsultations.test.tsx",
        snippets: ["rejects anonymous professional requests before touching Supabase", "persists video meeting type"],
      },
    ],
  },
  {
    priority: "immediate",
    flow: "listing_create_edit_media_rls",
    businessRule: "Listing creation/editing and project-media uploads stay owner/developer scoped, with storage paths matching RLS folder ownership.",
    artifacts: [
      {
        file: "src/lib/buildingListingUploads.ts",
        snippets: ['storage.from("project-media").upload', "assertAllowedUpload", "${userId}/"],
      },
      {
        file: "supabase/migrations/20260706120000_restore_storage_grants_drift.sql",
        snippets: ["project-media storage policies", "bucket_id = 'project-media'", "storage.foldername(name))[1]"],
      },
      {
        file: "src/test/buildingListingUploads.test.ts",
        snippets: [
          "project-media",
          "register_new_building_storage_upload",
          "user-1/project-1/create/media-",
        ],
      },
      {
        file: "src/test/useCreateBuildingListing.coverage.test.tsx",
        snippets: ["uploadProjectMediaMock", "owner_id"],
      },
    ],
  },
  {
    priority: "immediate",
    flow: "open_house_registration_host_approval",
    businessRule: "Open-house registration must collect verified contact/ID consent, create capacity-checked pending rows, and let hosts approve/reject through owner-scoped controls.",
    artifacts: [
      {
        file: "supabase/migrations/20260515092259_open_house_registration_contact_verification.sql",
        snippets: ["open_house_contact_name_required", "open_house_id_verification_consent_required"],
      },
      {
        file: "supabase/migrations/20260515200905_serialize_open_house_registration_capacity.sql",
        snippets: ["create_open_house_registration", "pg_advisory_xact_lock", "open_house_timeslot_capacity_reached"],
      },
      {
        file: "src/hooks/useOpenHouseAssetControl.ts",
        snippets: ['"open-house-registration"', "useUpdateOpenHouseRegistration", "getOpenHouseApprovalBlockers"],
      },
      {
        file: "src/test/useOpenHouseAssetControl.test.tsx",
        snippets: ["creates a pending registration through the capacity-checked Edge Function", "useUpdateOpenHouseRegistration"],
      },
    ],
  },
  {
    priority: "immediate",
    flow: "firesale_submit_investor_interest",
    businessRule: "Quick Sale public submissions create seller requests; investor interest requires active/trial investor access and uses reservation/interest RPCs, not direct unsafe client writes.",
    artifacts: [
      {
        file: "src/components/firesale/quickSaleSubmission.ts",
        snippets: ['supabase.functions.invoke("submit-firesale-request"', 'action: "rollback"'],
      },
      {
        file: "supabase/functions/submit-firesale-request/index.ts",
        snippets: ['from("firesale_requests")', "verifyBearerToken", "rollbackRequestSchema"],
      },
      {
        file: "supabase/migrations/20260622072139_lock_firesale_request_edge_boundary.sql",
        snippets: ["REVOKE INSERT, DELETE", "GRANT INSERT, DELETE", "submit-firesale-request"],
      },
      {
        file: "supabase/functions/submit-firesale-interest/index.ts",
        snippets: ['"submit_firesale_interest_for_user"', "verifyBearerToken", "SUPABASE_SERVICE_ROLE_KEY"],
      },
      {
        file: "supabase/migrations/20260514150000_firesale_interest_reservation_workflow.sql",
        snippets: ["pg_advisory_xact_lock", "active_reservation_exists_for_deal", "guard_firesale_interest_mutation"],
      },
      {
        file: "supabase/migrations/20260603053003_allow_participant_type_firesale_interest_access.sql",
        snippets: ["CREATE OR REPLACE FUNCTION public.submit_firesale_interest_for_user", "participant_type", "active_interest_is_admin_managed"],
      },
      {
        file: "src/test/useFiresaleInterest.test.tsx",
        snippets: ["submit-firesale-interest", "reservationHours"],
      },
    ],
  },
  {
    priority: "immediate",
    flow: "checkout_webhook_entitlement_activation",
    businessRule: "Checkout is role/audience scoped; invite-only investor approval stays pending payment; Stripe webhooks activate or revoke entitlements.",
    artifacts: [
      {
        file: "supabase/functions/create-checkout/index.ts",
        snippets: ["isCheckoutAudienceAllowed", "isInviteOnlyCheckoutPlan", "subscription_data"],
      },
      {
        file: "supabase/functions/create-checkout/constants.ts",
        snippets: ["INVITE_ONLY_PLAN_KEYS", "investor_private", "investor_institutional"],
      },
      {
        file: "supabase/functions/stripe-webhook/index.ts",
        snippets: ["checkout.session.completed", "resolveSubscriptionEntitlement", "apply_subscription_lapse_controls"],
      },
      {
        file: "supabase/functions/create-checkout/index.test.ts",
        snippets: ["checkout audience gate blocks cross-role public plan purchases", "investor plans remain invitation-only"],
      },
      {
        file: "supabase/functions/stripe-webhook/index.test.ts",
        snippets: ["missing Stripe-Signature header returns 400", "checkout.session.completed"],
      },
      {
        file: "supabase/functions/stripe-webhook/webhook.test.ts",
        snippets: ["accepts a validly signed payload", "rejects a tampered payload"],
      },
      {
        file: "src/test/stripeWebhookAddonInvestorFulfillment.test.ts",
        snippets: ["fulfillAddonCheckoutSession", "investor_payment", "addon_purchases"],
      },
    ],
  },
  {
    priority: "near_term",
    flow: "auction_cap_filter_context",
    businessRule: "Auction result caps and filters must preserve auction context and not fall back into generic listing grids.",
    artifacts: [
      {
        file: "src/hooks/useAuctionsPipeline.ts",
        snippets: ["getPlanLimits", "auctionListingsVisible", "pageSize: AUCTIONS_PAGE_SIZE", "filters: serverFilters"],
      },
      {
        file: "src/pages/Auctions.tsx",
        snippets: ["auction", "setSelected", "AI"],
      },
      {
        file: "src/test/useAuctionsPipeline.test.tsx",
        snippets: ["free-tier auction window", "server-paginated Pro query without hydration", "canonical server query"],
      },
      {
        file: "src/test/InteractionWidgets.behavior.test.tsx",
        snippets: ["routes auction AI searches to the auctions surface", "/auctions?city=", "onFiltersApplied).not.toHaveBeenCalled"],
      },
    ],
  },
  {
    priority: "near_term",
    flow: "dashboard_billing_addon_purchase",
    businessRule: "Dashboard billing must show usage/add-ons relevant to the current user type and initiate Stripe checkout for configured add-ons.",
    artifacts: [
      {
        file: "src/pages/dashboard/BillingTab.tsx",
        snippets: ["BillingUsagePanel", "createAddonCheckoutUrl", "window.location.href"],
      },
      {
        file: "src/components/dashboard/BillingUsagePanel.tsx",
        snippets: ["useAiQuota", "useReportUsage", "useListingPromotionBalance", "promotionActions"],
      },
      {
        file: "src/hooks/useUsageAddons.ts",
        snippets: ["usage_ai_calls", "usage_property_reports"],
      },
      {
        file: "src/hooks/useListingPromotions.ts",
        snippets: ["get_listing_promotion_balance", "activate_listing_promotion", "deactivate_listing_promotion"],
      },
      {
        file: "src/pages/dashboard/billing/checkoutActions.ts",
        snippets: ["createAddonCheckoutUrl", "create-checkout", "addon_key"],
      },
      {
        file: "src/test/BillingTab.checkoutActions.test.ts",
        snippets: ["starts Stripe add-on checkout", "addon_key"],
      },
    ],
  },
  {
    priority: "near_term",
    flow: "booking_video_confirmation",
    businessRule: "Video consultation rooms require signed-in confirmed participants, and booking rows preserve meeting type for room authorization.",
    artifacts: [
      {
        file: "src/hooks/useConsultations.ts",
        snippets: ["meeting_type", "request_type === \"consultation\""],
      },
      {
        file: "src/pages/BrandedVideoRoom.tsx",
        snippets: ["request_type", "consultation", "requester_id"],
      },
      {
        file: "src/test/videoRoomAuthorization.test.ts",
        snippets: ["requires scoped confirmed video consultation participation", "video:consultation:%"],
      },
      {
        file: "src/test/useMaiPropVideoRoom.signaling.test.tsx",
        snippets: [
          "video:consultation:",
          "/api/turn-credentials",
          "short-lived-credential",
          "Professional",
        ],
      },
    ],
  },
  {
    priority: "near_term",
    flow: "admin_moderation_approval",
    businessRule: "Admin approval and moderation actions use platform-admin guards/RPCs and cannot be invoked by ordinary users.",
    artifacts: [
      {
        file: "src/components/AdminProfessionalVerification.tsx",
        snippets: ["useApproveProfessional", "useRejectProfessional"],
      },
      {
        file: "src/hooks/useAdminProfessionals.ts",
        snippets: ["useApproveProfessional", "useRejectProfessional", "verified"],
      },
      {
        file: "supabase/functions/admin-firesale-action/index.ts",
        snippets: ["admin_update_firesale_interest_workflow_for_user", "verifyBearerToken", "SUPABASE_SERVICE_ROLE_KEY"],
      },
      {
        file: "src/test/useAdminProfessionals.test.tsx",
        snippets: ["useRejectProfessional", "useApproveProfessional"],
      },
    ],
  },
  {
    priority: "long_term",
    flow: "role_tier_matrix_fixtures",
    businessRule: "Every user type/tier remains represented in the generated role matrix so changes cannot silently skip a persona.",
    artifacts: [
      {
        file: "src/test/roleTierInteractionMatrix.test.ts",
        snippets: ["classifies every role/tier and surface combination", "investor_institutional_active", "professional_pro"],
      },
    ],
  },
  {
    priority: "long_term",
    flow: "race_concurrency_guards",
    businessRule: "Capacity, accepted offers, firesale reservations, AI quota, and add-on checkout use locking/idempotency where repeated or concurrent operations are possible.",
    artifacts: [
      {
        file: "supabase/migrations/20260515200905_serialize_open_house_registration_capacity.sql",
        snippets: ["pg_advisory_xact_lock", "open_house_total_capacity_reached"],
      },
      {
        file: "supabase/migrations/20260514142236_harden_open_house_offer_workflow.sql",
        snippets: ["idx_open_house_one_accepted_offer_per_listing", "pg_advisory_xact_lock"],
      },
      {
        file: "supabase/migrations/20260707050000_reserve_ai_quota.sql",
        snippets: ["pg_advisory_xact_lock", "monthly_limit_reached", "INSERT INTO public.usage_ai_calls"],
      },
      {
        file: "supabase/functions/create-checkout/index.ts",
        snippets: ["buildIdempotencyKey", "checkout-v2", "checkout-addon-v2"],
      },
    ],
  },
  {
    priority: "long_term",
    flow: "recurring_staging_cleanup_artifacts",
    businessRule: "Release gates must produce artifacts for Supabase advisor/index review and staging cleanup instead of relying on one-off manual checks.",
    artifacts: [
      {
        file: ".github/workflows/supabase-advisor-report.yml",
        snippets: ["supabase-advisor", "supabase-index-stats.json", "upload-artifact"],
      },
      {
        file: ".github/workflows/reusable-supabase-staging.yml",
        snippets: ["supabase-index-stats.json", "check:supabase-advisor"],
      },
      {
        file: "scripts/capture-supabase-index-stats.mjs",
        snippets: ["pg_stat_user_indexes", "supabase db query", "indexrelname"],
      },
    ],
  },
];

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const priorities: readonly Priority[] = ["immediate", "near_term", "long_term"];
const flows: readonly BusinessFlow[] = [
  "ai_quota_live_consumption",
  "professional_action_gates",
  "listing_create_edit_media_rls",
  "open_house_registration_host_approval",
  "firesale_submit_investor_interest",
  "checkout_webhook_entitlement_activation",
  "auction_cap_filter_context",
  "dashboard_billing_addon_purchase",
  "booking_video_confirmation",
  "admin_moderation_approval",
  "role_tier_matrix_fixtures",
  "race_concurrency_guards",
  "recurring_staging_cleanup_artifacts",
];

describe("strict priority business-flow proof", () => {
  it("covers every strict-priority business flow exactly once", () => {
    expect(proof.map((item) => item.flow).sort()).toEqual([...flows].sort());
    for (const flow of flows) {
      expect(proof.filter((item) => item.flow === flow), flow).toHaveLength(1);
    }
  });

  it("keeps every priority horizon represented", () => {
    for (const priority of priorities) {
      expect(proof.some((item) => item.priority === priority), priority).toBe(true);
    }
  });

  it("anchors every flow to concrete code, tests, migrations, or workflow artifacts", () => {
    for (const item of proof) {
      expect(item.businessRule.trim(), item.flow).not.toHaveLength(0);
      expect(item.artifacts.length, item.flow).toBeGreaterThanOrEqual(1);

      for (const artifact of item.artifacts) {
        const absolutePath = resolve(process.cwd(), artifact.file);
        expect(existsSync(absolutePath), `${item.flow}: ${artifact.file}`).toBe(true);

        const contents = read(artifact.file);
        for (const snippet of artifact.snippets) {
          expect(contents, `${item.flow}: ${artifact.file} missing ${snippet}`).toContain(snippet);
        }
      }
    }
  });
});
