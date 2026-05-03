/**
 * rolePlanMap — Layer-A pricing: one role → one fallback plan.
 *
 * This is the canonical reference used by:
 *   - RoleSwitchModal   (upgrade/downgrade warnings)
 *   - Pricing.tsx       (audience tab default plan)
 *   - Onboarding.tsx    (post-onboarding upsell)
 *   - DashboardPlanCard (current plan display)
 *   - BillingTab        (plan summary)
 *
 * ─────────────────────────────────────────────────────────────────────
 * Pricing has TWO layers:
 *
 *   Layer A — this file. Hardcoded fallback plans, one per audience.
 *             Drives role-switching UX and display when the DB is
 *             unavailable.
 *
 *   Layer B — `usePricingConfigs.ts` + `pricing_configs` table. Fine-
 *             grained DB-driven keys editable by admins at runtime,
 *             including add-on tiers (`agent_plus`, `professional_premium`,
 *             `valuation_*`) that don't appear here.
 *
 * The actual amount charged is determined by the Stripe Price ID resolved
 * by `create-checkout` (env override → DB lookup → fallback). The numbers
 * in this file are display fallbacks only.
 *
 * If you change anything here, update:
 *   1. docs/PLATFORM_REFERENCE.md §3 Layer A table
 *   2. src/test/rolePlanMap.test.ts canonical pricing snapshot
 * ─────────────────────────────────────────────────────────────────────
 */

import type { ParticipantId, PricingAudienceId } from "@/lib/participantConfig";

export interface RolePlan {
  /** Stripe plan key sent to create-checkout edge function */
  planKey: string;
  /** Human-readable plan name */
  planName: string;
  /** Pricing audience tab on /pricing */
  audienceId: PricingAudienceId;
  /** Monthly price in EUR (0 = free tier available) */
  monthlyPrice: number;
  /** Annual price in EUR */
  annualPrice: number;
  /** When true the role has no free tier — paid plan is mandatory */
  proOnly: boolean;
  /** Stripe Price ID for monthly billing (from env) */
  stripePriceMonthly: string | null;
  /** Stripe Price ID for annual billing (from env) */
  stripePriceAnnual: string | null;
}

// ── Env-backed Stripe price IDs ───────────────────────────────────────────────
// Set these in .env / Supabase secrets. Fallback strings are placeholders —
// checkout will fail gracefully if they are not real Stripe Price IDs.

const E = import.meta.env;

const PRICE_IDS = {
  participant_monthly:  E.VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY  ?? null,
  participant_annual:   E.VITE_STRIPE_PRICE_PARTICIPANT_ANNUAL   ?? null,
  agent_monthly:        E.VITE_STRIPE_PRICE_AGENT_MONTHLY        ?? null,
  agent_annual:         E.VITE_STRIPE_PRICE_AGENT_ANNUAL         ?? null,
  developer_monthly:    E.VITE_STRIPE_PRICE_DEVELOPER_MONTHLY    ?? null,
  developer_annual:     E.VITE_STRIPE_PRICE_DEVELOPER_ANNUAL     ?? null,
  professional_monthly: E.VITE_STRIPE_PRICE_PROFESSIONAL_MONTHLY ?? null,
  professional_annual:  E.VITE_STRIPE_PRICE_PROFESSIONAL_ANNUAL  ?? null,
} as const;

// ── Plan definitions ──────────────────────────────────────────────────────────

export const ROLE_PLAN_MAP: Record<PricingAudienceId, RolePlan> = {
  participant: {
    planKey: "pro",
    planName: "Pro Plan",
    audienceId: "participant",
    monthlyPrice: 29,
    annualPrice: 290,
    proOnly: false,
    stripePriceMonthly: PRICE_IDS.participant_monthly,
    stripePriceAnnual:  PRICE_IDS.participant_annual,
  },
  agent: {
    planKey: "agent_basic",
    planName: "Agent Pro",
    audienceId: "agent",
    monthlyPrice: 149,
    annualPrice: 1490,
    proOnly: false,
    stripePriceMonthly: PRICE_IDS.agent_monthly,
    stripePriceAnnual:  PRICE_IDS.agent_annual,
  },
  developer: {
    planKey: "developer_pro",
    planName: "Developer Pro",
    audienceId: "developer",
    monthlyPrice: 129,
    annualPrice: 1290,
    proOnly: true,
    stripePriceMonthly: PRICE_IDS.developer_monthly,
    stripePriceAnnual:  PRICE_IDS.developer_annual,
  },
  professional: {
    planKey: "professional_basic",
    planName: "Professional Pro",
    audienceId: "professional",
    monthlyPrice: 69,
    annualPrice: 690,
    proOnly: false,
    stripePriceMonthly: PRICE_IDS.professional_monthly,
    stripePriceAnnual:  PRICE_IDS.professional_annual,
  },
  // Investor & Institutional are invitation-only.
  // Pricing is bespoke per application — a one-off Stripe payment link is
  // generated and emailed after the application is approved. The 0/0 values
  // here mean "no public price"; the canonical figure is the per-application
  // payment link's amount, not these display fallbacks.
  investor: {
    planKey: "investor_private",
    planName: "Investor Plan",
    audienceId: "investor",
    monthlyPrice: 0,
    annualPrice: 0,
    proOnly: true,
    stripePriceMonthly: null,
    stripePriceAnnual:  null,
  },
  institutional: {
    planKey: "investor_institutional",
    planName: "Institutional Plan",
    audienceId: "institutional",
    monthlyPrice: 0,
    annualPrice: 0,
    proOnly: true,
    stripePriceMonthly: null,
    stripePriceAnnual:  null,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map any participant type to its pricing audience (buyer+seller → participant) */
export function participantToPricingAudience(pt: ParticipantId): PricingAudienceId {
  if (pt === "buyer" || pt === "seller") return "participant";
  if (pt === "agent")         return "agent";
  if (pt === "developer")     return "developer";
  if (pt === "professional")  return "professional";
  if (pt === "investor")      return "investor";
  if (pt === "institutional") return "institutional";
  return "participant";
}

/** Get the plan definition for a given participant type */
export function getPlanForParticipant(pt: ParticipantId): RolePlan {
  return ROLE_PLAN_MAP[participantToPricingAudience(pt)];
}

export type SwitchKind = "same-tier" | "upgrade" | "downgrade" | "proonly";

/**
 * Classify a role switch from → to.
 *
 * same-tier  — same monthly price (e.g. buyer ↔ seller, both €29)
 * upgrade    — new role costs more per month
 * downgrade  — new role costs less per month
 * proonly    — new role has no free tier (developer)
 */
export function classifySwitch(from: ParticipantId, to: ParticipantId): SwitchKind {
  const fromPlan = getPlanForParticipant(from);
  const toPlan   = getPlanForParticipant(to);
  if (toPlan.proOnly) return "proonly";
  if (fromPlan.audienceId === toPlan.audienceId) return "same-tier";
  if (toPlan.monthlyPrice > fromPlan.monthlyPrice) return "upgrade";
  return "downgrade";
}
