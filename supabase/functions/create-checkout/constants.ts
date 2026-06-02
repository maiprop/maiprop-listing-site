import type { BillingCycle, PlanEntitlement } from "./types.ts";

export const INVITE_ONLY_PLAN_KEYS = new Set([
  "investor_private",
  "investor_institutional",
]);

export const PUBLIC_CHECKOUT_PLAN_KEYS = new Set([
  "pro",
  "agent_basic",
  "developer_pro",
  "professional_basic",
]);

export const PLAN_ENTITLEMENT: Record<string, PlanEntitlement> = {
  pro: { audience: "participant", role: "participant" },
  agent_basic: { audience: "agent", role: "agent" },
  developer_pro: { audience: "developer", role: "developer" },
  professional_basic: { audience: "professional", role: "professional" },
  investor_private: { audience: "investor", role: "investor" },
  investor_institutional: { audience: "institutional", role: "institutional" },
};

export const PLAN_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const DEFAULT_CHECKOUT_ORIGIN = "https://portal.maiprop.co";

export const CHECKOUT_ALLOWED_ORIGINS = [
  DEFAULT_CHECKOUT_ORIGIN,
  "https://maiprop.co",
  "https://www.maiprop.co",
  "https://app.maiprop.co",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:8083",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
];

export const CF_PAGES_ORIGIN_RE =
  /^https:\/\/[\w-]+\.maiprop-listing-site\.pages\.dev$/;

export const BILLING_CYCLE_ALIASES: Record<string, BillingCycle> = {
  "": "monthly",
  annual: "annual",
  month: "monthly",
  monthly: "monthly",
  year: "annual",
  yearly: "annual",
};

export const PLAN_PRICE_ENV_ALIASES: Record<
  string,
  Record<BillingCycle, string[]>
> = {
  pro: {
    monthly: ["STRIPE_PRICE_PARTICIPANT_MONTHLY", "STRIPE_PRICE_PRO_MONTHLY"],
    annual: ["STRIPE_PRICE_PARTICIPANT_ANNUAL", "STRIPE_PRICE_PRO_ANNUAL"],
  },
  agent_basic: {
    monthly: ["STRIPE_PRICE_AGENT_MONTHLY"],
    annual: ["STRIPE_PRICE_AGENT_ANNUAL"],
  },
  developer_pro: {
    monthly: ["STRIPE_PRICE_DEVELOPER_MONTHLY"],
    annual: ["STRIPE_PRICE_DEVELOPER_ANNUAL"],
  },
  professional_basic: {
    monthly: ["STRIPE_PRICE_PROFESSIONAL_MONTHLY"],
    annual: ["STRIPE_PRICE_PROFESSIONAL_ANNUAL"],
  },
};

export const SELF_SERVE_ADDON_MODULES = new Set([
  "valuation_reports",
  "adhoc_charges",
  "os_data_products",
]);
