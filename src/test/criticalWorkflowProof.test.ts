import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ProofArea =
  | "pricing"
  | "role_tier_transition"
  | "ai_quota"
  | "open_house"
  | "firesale";

type ProofKind = "happy_path" | "denial_path" | "unauthorized_access" | "race_or_idempotency";

type ProofRequirement = {
  area: ProofArea;
  kind: ProofKind;
  file: string;
  snippets: readonly string[];
};

const requirements: readonly ProofRequirement[] = [
  {
    area: "pricing",
    kind: "happy_path",
    file: "supabase/functions/stripe-webhook/index.ts",
    snippets: ["checkout.session.completed", "resolveSubscriptionEntitlement", "plan_key: entitlement?.planKey"],
  },
  {
    area: "pricing",
    kind: "denial_path",
    file: "supabase/functions/create-checkout/index.test.ts",
    snippets: [
      "checkout audience gate blocks cross-role public plan purchases",
      "checkout plan keys are allowlisted and investor plans remain invitation-only",
    ],
  },
  {
    area: "pricing",
    kind: "unauthorized_access",
    file: "e2e/payment-checkout.spec.ts",
    snippets: ["create-checkout rejects unauthenticated requests"],
  },
  {
    area: "pricing",
    kind: "race_or_idempotency",
    file: "supabase/functions/create-checkout/index.ts",
    snippets: ["idempotencyKey", ["maiprop-checkout-", "$", "{user.id}", "-", "$", "{checkoutPlan.planKey}"].join("")],
  },
  {
    area: "role_tier_transition",
    kind: "happy_path",
    file: "src/test/roleTierInteractionMatrix.test.ts",
    snippets: ["classifies every role/tier and surface combination", "developer_pro.create_new_building.outcome"],
  },
  {
    area: "role_tier_transition",
    kind: "denial_path",
    file: "src/test/routeGuards.test.tsx",
    snippets: ["blocks a stale developer profile during role switch", "role_switch_in_progress_at"],
  },
  {
    area: "role_tier_transition",
    kind: "unauthorized_access",
    file: "supabase/functions/complete-onboarding-role/index.test.ts",
    snippets: ["self-service onboarding rejects invite-only investor role before RPC"],
  },
  {
    area: "role_tier_transition",
    kind: "race_or_idempotency",
    file: "supabase/functions/log-role-switch/index.ts",
    snippets: ["record_role_switch_audit", "idempotent"],
  },
  {
    area: "ai_quota",
    kind: "happy_path",
    file: "src/test/PropertyValuation.test.tsx",
    snippets: ["runs for non-Pro users because the server enforces the free quota", "property-valuation"],
  },
  {
    area: "ai_quota",
    kind: "denial_path",
    file: "src/test/useListingAI.test.tsx",
    snippets: ["AI quota exhausted", "toastMock.error"],
  },
  {
    area: "ai_quota",
    kind: "unauthorized_access",
    file: "supabase/functions/_shared/aiUsage.test.ts",
    snippets: ["Authorization header is missing", "401"],
  },
  {
    area: "ai_quota",
    kind: "race_or_idempotency",
    file: "supabase/functions/_shared/aiUsage.ts",
    snippets: ["recordAiCall", "reserve_ai_quota"],
  },
  {
    area: "open_house",
    kind: "happy_path",
    file: "src/test/useOpenHouseAssetControl.test.tsx",
    snippets: ["creates a pending registration through the capacity-checked RPC", "submit_open_house_offer"],
  },
  {
    area: "open_house",
    kind: "denial_path",
    file: "src/test/useOpenHouseAssetControl.test.tsx",
    snippets: ["maps server-side capacity errors to visitor-friendly copy", "open_house_timeslot_capacity_reached"],
  },
  {
    area: "open_house",
    kind: "unauthorized_access",
    file: "e2e/live-critical-smoke.spec.ts",
    snippets: ["submit_open_house_offer", "accept_open_house_offer", "401"],
  },
  {
    area: "open_house",
    kind: "race_or_idempotency",
    file: "supabase/migrations/20260515200905_serialize_open_house_registration_capacity.sql",
    snippets: ["pg_advisory_xact_lock", "open_house_total_capacity_reached", "open_house_timeslot_capacity_reached"],
  },
  {
    area: "firesale",
    kind: "happy_path",
    file: "src/test/useFiresaleInterest.test.tsx",
    snippets: ["admin_update_firesale_interest_workflow", "reservationHours"],
  },
  {
    area: "firesale",
    kind: "denial_path",
    file: "src/test/InvestorDashboard.behavior.test.tsx",
    snippets: ["permission denied for policy firesale_requests_investor_feed"],
  },
  {
    area: "firesale",
    kind: "unauthorized_access",
    file: "e2e/live-critical-smoke.spec.ts",
    snippets: ["admin_update_firesale_interest_workflow", "401"],
  },
  {
    area: "firesale",
    kind: "race_or_idempotency",
    file: "supabase/migrations/20260514150000_firesale_interest_reservation_workflow.sql",
    snippets: ["pg_advisory_xact_lock", "active_reservation_exists_for_deal"],
  },
];

const areas: readonly ProofArea[] = ["pricing", "role_tier_transition", "ai_quota", "open_house", "firesale"];
const kinds: readonly ProofKind[] = ["happy_path", "denial_path", "unauthorized_access", "race_or_idempotency"];

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("critical workflow proof coverage", () => {
  it("has an explicit proof requirement for every critical area and risk shape", () => {
    for (const area of areas) {
      for (const kind of kinds) {
        expect(
          requirements.some((requirement) => requirement.area === area && requirement.kind === kind),
          // skipcq - Vitest assertion messages intentionally compose enum values for coverage diagnostics.
          `${area} is missing ${kind} proof`,
        ).toBe(true);
      }
    }
  });

  it("keeps every critical proof anchored to executable tests, migrations, or runtime guards", () => {
    for (const requirement of requirements) {
      const absolutePath = resolve(process.cwd(), requirement.file);
      expect(existsSync(absolutePath), requirement.file).toBe(true);

      const contents = read(requirement.file);
      for (const snippet of requirement.snippets) {
        // skipcq - Vitest assertion messages intentionally compose proof metadata for failure diagnostics.
        expect(contents, `${requirement.area}/${requirement.kind}: ${requirement.file}`).toContain(snippet);
      }
    }
  });
});
