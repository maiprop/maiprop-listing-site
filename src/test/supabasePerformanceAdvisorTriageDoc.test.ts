import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const doc = readFileSync("docs/SUPABASE_PERFORMANCE_ADVISOR_TRIAGE.md", "utf8");

describe("Supabase performance advisor triage documentation", () => {
  it("tracks the current remediation chain instead of the historical no-op triage", () => {
    expect(doc).toContain("Last reviewed:** 2026-06-19");
    expect(doc).toContain("Current Repository-Remediated State");
    expect(doc).toContain("20260707143000_consolidate_public_media_rls.sql");
    expect(doc).toContain("20260707150000_reduce_advisor_policy_noise.sql");
    expect(doc).toContain("20260707151000_reduce_remaining_low_risk_policy_noise.sql");
    expect(doc).toContain("20260707152000_consolidate_open_house_advisor_policies.sql");
    expect(doc).toContain("20260707153000_consolidate_firesale_advisor_policies.sql");
    expect(doc).toContain("20260707159000_fix_staging_advisor_drift.sql");
    expect(doc).toContain("20260707168000_cleanup_stale_advisor_indexes.sql");
    expect(doc).not.toContain("No policy consolidation in this PR");
  });

  it("keeps unused-index cleanup telemetry-gated", () => {
    expect(doc).toContain("Do **not** drop indexes from Advisor output alone");
    expect(doc).toContain("npm run capture:supabase-index-stats");
    expect(doc).toContain("pg_stat_statements");
    expect(doc).toContain("protected constraint/unique indexes");
  });

  it("keeps live advisor proof separate from local repository evidence", () => {
    expect(doc).toContain("Direct `pg_policies` inspection returned zero");
    expect(doc).toContain("Performance Advisor returned `unused_index` INFO findings only");
    expect(doc).toContain("SUPABASE_ACCESS_TOKEN");
    expect(doc).toContain("--fail-on-error --fail-on-unknown");
    expect(doc).toContain("zero unknown WARN/INFO lints");
  });
});
