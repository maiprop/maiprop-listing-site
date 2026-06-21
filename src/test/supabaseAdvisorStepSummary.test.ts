import { describe, expect, it } from "vitest";
import { buildAdvisorStepSummary } from "../../scripts/supabase-advisor-summary.mjs";

describe("Supabase advisor step summary", () => {
  it("separates actionable failures from known accepted and review debt", () => {
    const summary = buildAdvisorStepSummary({
      projectRef: "test-project-ref",
      results: [
        { category: "security", lint_count: 1 },
        { category: "performance", lint_count: 1 },
      ],
      failingLintCount: 0,
      advisorDebt: {
        accepted_count: 1,
        review_count: 1,
        unknown_count: 0,
      },
      unusedIndexReview: {
        totals: {
          unused_index_lints: 1,
          mapped_to_stats: 1,
          with_scans: 0,
          zero_scan_candidates: 1,
          managed_schema_indexes: 0,
          protected_indexes: 0,
          write_path_candidates: 1,
          needs_stats_snapshot: 0,
          needs_manual_mapping: 0,
        },
      },
      transientAdvisorUnavailable: [],
    });

    expect(summary).toContain("Actionable advisor items: 0");
    expect(summary).toContain("Known review/accepted advisor debt: 2");
    expect(summary).toContain("The release gate is clear");
    expect(summary).toContain("| Accepted | 1 |");
    expect(summary).toContain("| Needs review | 1 |");
    expect(summary).toContain("| Unknown | 0 |");
  });
});
