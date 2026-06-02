import { describe, expect, it } from "vitest";
import { classifyAdvisorDebt, flattenAdvisorLints } from "./supabase-advisor-debt.mjs";

const policy = {
  accepted: [
    {
      match: { name: "auth_leaked_password_protection" },
      owner: "platform/security",
      reason: "Plan gated",
      next_action: "Upgrade Supabase plan",
    },
  ],
  review: [
    {
      match: { name: "unused_index" },
      owner: "data/platform",
      reason: "Needs telemetry",
      next_action: "Review pg_stat_user_indexes",
    },
  ],
};

describe("supabase advisor debt classification", () => {
  it("flattens advisor lints with category context", () => {
    const lints = flattenAdvisorLints([
      {
        category: "security",
        lints: [{ name: "auth_leaked_password_protection", title: "Leaked Password Protection Disabled", level: "WARN" }],
      },
    ]);

    expect(lints).toEqual([
      expect.objectContaining({
        category: "security",
        name: "auth_leaked_password_protection",
        level: "WARN",
      }),
    ]);
  });

  it("classifies accepted, review, and unknown advisor warnings", () => {
    const debt = classifyAdvisorDebt(
      {
        results: [
          {
            category: "security",
            lints: [{ name: "auth_leaked_password_protection", title: "Leaked Password Protection Disabled", level: "WARN" }],
          },
          {
            category: "performance",
            lints: [
              { name: "unused_index", title: "Unused Index", level: "INFO" },
              { name: "surprising_new_lint", title: "New Advisor", level: "WARN" },
            ],
          },
        ],
      },
      policy,
    );

    expect(debt.by_status).toEqual({ accepted: 1, review: 1, unknown: 1 });
    expect(debt.items.accepted[0].policy.next_action).toContain("Upgrade");
    expect(debt.items.review[0].policy.reason).toBe("Needs telemetry");
    expect(debt.items.unknown[0].name).toBe("surprising_new_lint");
  });
});
